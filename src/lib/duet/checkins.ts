import "server-only";
// Check-ins from Duet: energy and the other tracked metrics (Mood, Focus…), the notes and #tags
// logged beside them, and taking an entry back out. Same data functions as the check-in screens.
import { revalidatePath } from "next/cache";
import * as energyData from "@/lib/data/energy";
import { supabaseAdmin } from "@/lib/supabase/server";
import { appDayKey } from "@/lib/data/tomorrow";
import { readExtrasOf } from "@/lib/data/quest-ops";
import { DuetError, isDay, nyToIso, parseDue } from "./pure";
import type { Args, Out } from "./types";

const NYC = "America/New_York";
const nyTime = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: NYC, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** 1–10 in tenths, as the check-in sliders and `logEnergy` clamp it. */
function level(v: unknown, what: string): number {
  const n = Number(v);
  if (v === null || v === "" || !Number.isFinite(n) || n < 1 || n > 10) throw new DuetError(`${what} must be a number from 1 to 10.`);
  return Math.round(n * 10) / 10;
}

/** When a check-in happened: now, or a past moment up to three months back (as the chart's back-dating allows). */
function atOf(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const iso = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? nyToIso(v.trim(), "12:00") : parseDue(v);
  if (!iso) return null;
  const t = Date.parse(iso);
  if (t > Date.now() + 60_000) throw new DuetError("A check-in can't be for a moment that hasn't happened yet.");
  if (t < Date.now() - 90 * 86_400_000) throw new DuetError("Check-ins go back three months at most.");
  return iso;
}

type NoteIn = { text: string; details?: string | null; tone?: number | null };
function notesOf(v: unknown): NoteIn[] {
  if (v === undefined || v === null) return [];
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((n): NoteIn => {
      if (typeof n === "string") return { text: n };
      const o = (n ?? {}) as { text?: unknown; details?: unknown; tone?: unknown };
      const tone = o.tone === undefined || o.tone === null ? null : Number(o.tone);
      if (tone !== null && !(Number.isInteger(tone) && tone >= -2 && tone <= 2)) throw new DuetError("A note's tone must be a whole number from -2 to 2.");
      return { text: String(o.text ?? ""), details: typeof o.details === "string" ? o.details : null, tone };
    })
    .filter((n) => n.text.trim())
    .slice(0, 20);
}

/**
 * `check_in {energy?, metrics?, notes?, at?}`: `metrics` is `{"Mood": 7, "Focus": 6}` (or a list of
 * `{metric, level}`), names among the metrics he tracks; `notes` a line or a list of lines (with #tags).
 */
export async function checkIn(ownerId: string, a: Args): Promise<Out> {
  const tracked = await energyData.getCheckMetrics(ownerId);
  const byLow = new Map(tracked.map((m) => [m.toLowerCase(), m]));
  let energy = a.energy === undefined || a.energy === null ? null : level(a.energy, "energy");
  const raw: [string, unknown][] =
    a.metrics === undefined || a.metrics === null
      ? []
      : Array.isArray(a.metrics)
        ? a.metrics.map((m) => [String((m as { metric?: unknown })?.metric ?? ""), (m as { level?: unknown })?.level])
        : typeof a.metrics === "object"
          ? Object.entries(a.metrics as Record<string, unknown>)
          : (() => {
              throw new DuetError('metrics must look like {"Mood": 7, "Focus": 6}.');
            })();
  const metrics: { metric: string; level: number }[] = [];
  for (const [name, v] of raw) {
    const low = name.trim().toLowerCase();
    if (low === "energy") {
      energy = level(v, "energy");
      continue;
    }
    const label = byLow.get(low);
    if (!label) throw new DuetError(`"${name}" isn't one of the check-in metrics he tracks (${["Energy", ...tracked].join(", ")}). Starting to track a new one is done in the app.`);
    if (metrics.some((m) => m.metric === label)) throw new DuetError(`${label} is given twice.`);
    metrics.push({ metric: label, level: level(v, label) });
  }
  const notes = notesOf(a.notes);
  if (energy === null && !metrics.length && !notes.length) throw new DuetError("Nothing to check in: give energy, metrics or notes.");
  const at = atOf(a.at);
  const e = energy === null ? null : await energyData.logEnergy(ownerId, energy, at);
  const m = metrics.length ? await energyData.logCheckIns(ownerId, metrics, at) : [];
  const n: energyData.CheckNote[] = [];
  for (const x of notes) n.push(await energyData.addCheckNote(ownerId, x.text, at, false, { details: x.details ?? null, tone: x.tone ?? null }));
  revalidatePath("/");
  revalidatePath("/insights");
  const ids = [...(e ? [`e:${e.id}`] : []), ...m.map((r) => `c:${r.id}`), ...n.map((r) => `n:${r.id}`)];
  const parts = [...(e ? [`Energy ${e.level}`] : []), ...m.map((r) => `${r.metric} ${r.level}`), ...(n.length ? [`${n.length} note${n.length === 1 ? "" : "s"}`] : [])];
  return {
    summary: `Checked in${at ? ` for ${nyTime(at)}` : ""}: ${parts.join(", ")}.`,
    data: { ids },
    change: { kind: "checkin", id: null, before: null, after: { ids } },
  };
}

type Entry = { key: string; kind: "energy" | "metric" | "note"; at: string; at_ny: string; metric?: string; level?: number; text?: string; tags?: string[]; archived?: boolean };

/** `check_ins {day?}`: that New York day's readings and notes, oldest first, each with the key remove_check_in takes. */
export async function checkIns(ownerId: string, a: Args): Promise<Out> {
  if (a.day !== undefined && a.day !== null && !isDay(a.day)) throw new DuetError("day must look like 2026-11-27.");
  const day = isDay(a.day) ? a.day : appDayKey();
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const since = nyToIso(day, "00:00");
  const until = Date.parse(nyToIso(next, "00:00"));
  const [energy, metrics, notes, extras, tracked] = await Promise.all([
    energyData.listEnergySince(ownerId, since),
    energyData.listCheckInsSince(ownerId, since),
    energyData.listCheckNotesSince(ownerId, since),
    readExtrasOf(ownerId),
    energyData.getCheckMetrics(ownerId),
  ]);
  const archived = new Set(((extras.checkInMarks as { archived?: string[] } | undefined)?.archived ?? []).filter((k) => typeof k === "string"));
  const inDay = (iso: string) => Date.parse(iso) < until;
  const list: Entry[] = [
    ...energy.filter((r) => inDay(r.created_at)).map((r): Entry => ({ key: `e:${r.id}`, kind: "energy", at: r.created_at, at_ny: nyTime(r.created_at), metric: "Energy", level: r.level })),
    ...metrics.filter((r) => inDay(r.created_at)).map((r): Entry => ({ key: `c:${r.id}`, kind: "metric", at: r.created_at, at_ny: nyTime(r.created_at), metric: r.metric, level: r.level })),
    ...notes.filter((r) => inDay(r.created_at)).map((r): Entry => ({ key: `n:${r.id}`, kind: "note", at: r.created_at, at_ny: nyTime(r.created_at), text: r.body, tags: r.tags })),
  ]
    .map((x) => (archived.has(x.key) ? { ...x, archived: true } : x))
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
  const nr = list.filter((x) => x.kind !== "note").length;
  const nn = list.length - nr;
  return { summary: `${day}: ${nr} reading${nr === 1 ? "" : "s"} and ${nn} note${nn === 1 ? "" : "s"}.`, data: { day, tracked: ["Energy", ...tracked], entries: list } };
}

const KEY = /^([ecn]):([0-9a-f-]{36})$/i;
type Saved = { table: "energy_log" | "check_ins" | "check_in_notes"; row: Record<string, unknown> };
const TABLE = { e: "energy_log", c: "check_ins", n: "check_in_notes" } as const;
const COLS = { energy_log: "id, level, created_at", check_ins: "id, metric, level, created_at", check_in_notes: "id, body, tags, created_at, details, tone, all_day" } as const;

/** `remove_check_in {ids}`: deletes readings or notes for good (keys from check_ins or a check_in result). undo puts them back. */
export async function removeCheckIn(ownerId: string, a: Args): Promise<Out> {
  const given = Array.isArray(a.ids) ? a.ids : a.id !== undefined ? [a.id] : [];
  if (!given.length) throw new DuetError("Give ids: the keys from check_ins (like e:…, c:…, n:…).");
  if (given.length > 12) throw new DuetError("Twelve at most at once.");
  const db = supabaseAdmin();
  const saved: Saved[] = [];
  for (const k of given) {
    const m = KEY.exec(String(k ?? "").trim());
    if (!m) throw new DuetError(`"${k}" isn't a check-in key. Use the keys check_ins lists (e:…, c:…, n:…).`);
    const table = TABLE[m[1].toLowerCase() as "e" | "c" | "n"];
    const { data } = await db.from(table).select(COLS[table]).eq("owner_id", ownerId).eq("id", m[2]).maybeSingle();
    if (!data) throw new DuetError(`No check-in entry ${k}.`);
    saved.push({ table, row: data as unknown as Record<string, unknown> });
  }
  for (const s of saved) {
    const { error } = await db.from(s.table).delete().eq("owner_id", ownerId).eq("id", s.row.id as string);
    if (error) throw new DuetError(`Couldn't remove that: ${error.message}`);
  }
  revalidatePath("/");
  revalidatePath("/insights");
  const what = saved.map((s) => (s.table === "check_in_notes" ? `note "${String(s.row.body).slice(0, 40)}"` : `${s.table === "energy_log" ? "Energy" : s.row.metric} ${s.row.level}`));
  return { summary: `Removed ${what.join(", ")}.`, change: { kind: "checkin", id: null, before: { rows: saved }, after: null } };
}

/** Undo for the two writes above. */
export async function undoCheckIn(ownerId: string, action: string, before: unknown, after: unknown): Promise<string> {
  const db = supabaseAdmin();
  if (action === "check_in") {
    const ids = ((after as { ids?: string[] } | null)?.ids ?? []).map((k) => KEY.exec(k)).filter((m): m is RegExpExecArray => !!m);
    for (const m of ids) await db.from(TABLE[m[1].toLowerCase() as "e" | "c" | "n"]).delete().eq("owner_id", ownerId).eq("id", m[2]);
    revalidatePath("/");
    revalidatePath("/insights");
    return "Took that check-in back out.";
  }
  const rows = ((before as { rows?: Saved[] } | null)?.rows ?? []);
  for (const s of rows) {
    const { error } = await db.from(s.table).insert({ ...s.row, owner_id: ownerId });
    if (error && error.code !== "23505") throw new DuetError(`Couldn't put it back: ${error.message}`);
  }
  revalidatePath("/");
  revalidatePath("/insights");
  return `Put back ${rows.length} check-in entr${rows.length === 1 ? "y" : "ies"}.`;
}
