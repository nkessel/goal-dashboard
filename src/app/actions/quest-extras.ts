"use server";

import { writeExtra } from "@/lib/data/extras";
import { listQuestExtras, setQuestPlace, setQuestCardLook, setQuestProgressUnit } from "@/lib/data/tasks";
import { mirrorQuestDrive } from "@/lib/data/calendar-planner";
import { revalidatePath } from "next/cache";
import { readEventQuestSettings as readEventQuestSettingsOf } from "@/lib/data/event-quests";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireProfileId, readExtras, QUEST_ID, type LookTask, lookOf } from "./_shared";
import type { CalCardLook } from "./evening";

/** Quests counted in something other than percent ("12 of 32 pages"), by quest id. */
export async function progressUnitsAction() {
  const ownerId = await requireProfileId();
  const { cleanUnits } = await import("@/lib/progress-units");
  const map: Record<string, unknown> = {};
  for (const r of await listQuestExtras(ownerId)) if (r.progress_unit) map[r.id] = r.progress_unit;
  return cleanUnits(map);
}

/** Count a quest's progress in pages (or anything), or back in percent (null). */
export async function setProgressUnitAction(taskId: string, unit: import("@/lib/progress-units").ProgressUnit | null) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("Unknown quest.");
  const { cleanUnit, cleanUnits } = await import("@/lib/progress-units");
  const extras = await readExtras(ownerId);
  const all = cleanUnits(extras.progressUnits);
  const u = unit ? cleanUnit(unit) : null;
  if (u) all[taskId] = u;
  else delete all[taskId];
  await setQuestProgressUnit(ownerId, taskId, u); // the column is read; the old key is kept current for this release (D3)
  const { error } = await writeExtra(ownerId, "progressUnits", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return u;
}

/** Where quests happen ("📍 Natick library"), by quest id. */
export async function questPlacesAction(): Promise<Record<string, string>> {
  const ownerId = await requireProfileId();
  const out: Record<string, string> = {};
  for (const r of await listQuestExtras(ownerId)) if (typeof r.place === "string" && r.place.trim()) out[r.id] = r.place.slice(0, 80);
  return out;
}

export async function setQuestPlaceAction(taskId: string, place: string | null) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.questPlaces as Record<string, string> | undefined) ?? {}) };
  const p = place?.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  if (p) all[taskId] = p;
  else delete all[taskId];
  await setQuestPlace(ownerId, taskId, p); // the column is read; the old key is kept current for this release (D3)
  const { error } = await writeExtra(ownerId, "questPlaces", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return p;
}

function cleanLook(v: unknown): CalCardLook | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const color = typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : undefined;
  const image = typeof r.image === "string" && (r.image === "portrait" || /^https:\/\/[^\s"']{8,600}$/.test(r.image)) ? r.image : undefined;
  return color || image ? { ...(color ? { color } : {}), ...(image ? { image } : {}) } : null;
}

/** Driving time to each quest's place (minutes each way) and each quest's calendar card look, by quest id. */
/** A quest's own time range ("09:00"–"14:00"; either end alone works), for the auto-scheduler. */
export type QuestWindow = { from?: string; to?: string };

const HHMM = /^[0-2][0-9]:[0-5][0-9]$/;

function cleanWindow(v: unknown): QuestWindow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const from = typeof o.from === "string" && HHMM.test(o.from) ? o.from : undefined;
  const to = typeof o.to === "string" && HHMM.test(o.to) ? o.to : undefined;
  if (from && to && from >= to) return { from };
  return from || to ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : null;
}

export async function setQuestWindowAction(taskId: string, win: QuestWindow | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.questWindows as Record<string, QuestWindow> | undefined) ?? {}) };
  const w = cleanWindow(win);
  if (w) all[taskId] = w;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "questWindows", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return w;
}

export async function questCalExtrasAction(): Promise<{ drives: Record<string, number>; looks: Record<string, CalCardLook>; windows: Record<string, QuestWindow> }> {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const drives: Record<string, number> = {};
  const looks: Record<string, CalCardLook> = {};
  for (const [k, v] of Object.entries((extras.questDrives as Record<string, unknown> | undefined) ?? {})) if (QUEST_ID.test(k) && typeof v === "number" && v > 0) drives[k] = Math.min(600, Math.round(v));
  for (const r of await listQuestExtras(ownerId)) {
    const l = r.card_look ? cleanLook(r.card_look) : null;
    if (l) looks[r.id] = l;
  }
  const windows: Record<string, QuestWindow> = {};
  for (const [k, v] of Object.entries((extras.questWindows as Record<string, unknown> | undefined) ?? {})) {
    const w = QUEST_ID.test(k) ? cleanWindow(v) : null;
    if (w) windows[k] = w;
  }
  return { drives, looks, windows };
}

export async function setQuestDriveAction(taskId: string, minutes: number | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.questDrives as Record<string, number> | undefined) ?? {}) };
  const m = minutes && minutes > 0 ? Math.min(600, Math.round(minutes)) : null;
  if (m) all[taskId] = m;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "questDrives", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  await mirrorQuestDrive(ownerId, taskId, m); // planner step 3: the new columns follow until readers switch over
  revalidatePath("/calendar");
  return m;
}

export async function setCalCardLookAction(taskId: string, look: CalCardLook | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.calCardLooks as Record<string, CalCardLook> | undefined) ?? {}) };
  const l = cleanLook(look);
  if (l) all[taskId] = l;
  else delete all[taskId];
  await setQuestCardLook(ownerId, taskId, l); // the column is read; the old key is kept current for this release (D3)
  const { error } = await writeExtra(ownerId, "calCardLooks", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return l;
}

// Calendar events as quests (owner, Nov 18; XP by the event's length, Nov 19), and one look for a repeating event's quests (owner, Nov 18)
/** Whether upcoming calendar events become quests by themselves. */
export async function eventQuestsSettingAction(): Promise<{ on: boolean }> {
  const ownerId = await requireProfileId();
  return { on: readEventQuestSettingsOf(await readExtras(ownerId)).on };
}

export async function setEventQuestsAction(on: boolean) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const cur = readEventQuestSettingsOf(extras);
  // Turning it on starts from now: events already past stay as they are.
  const next = { ...cur, on, ...(on && !cur.on ? { since: new Date().toISOString() } : {}) };
  const { error } = await writeExtra(ownerId, "eventQuests", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { on };
}

/** "Make it a quest" on an event: remember it (never made again, its event kept on removal) and its series. */
export async function recordEventQuestAction(taskId: string, eventId: string, recurringEventId?: string | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId) || !eventId || eventId.length > 300) return;
  const extras = await readExtras(ownerId);
  const cur = readEventQuestSettingsOf(extras);
  const series = { ...((extras.questSeries as Record<string, string> | undefined) ?? {}) };
  if (recurringEventId && recurringEventId.length < 300) series[taskId] = `g:${recurringEventId}`;
  await writeExtra(ownerId, "eventQuests", { ...cur, made: { ...(cur.made ?? {}), [eventId]: taskId } });
  if (recurringEventId) await writeExtra(ownerId, "questSeries", series);
}

const dayKeyOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "");

/**
 * After a quest of a repeating event is edited: does its look differ from the series' (so it's worth
 * asking "Just this one · This and later · All")? Null when it isn't part of a series or nothing differs.
 */
export async function seriesAskAction(taskId: string): Promise<{ title: string; others: number } | null> {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) return null;
  const extras = await readExtras(ownerId);
  const key = (extras.questSeries as Record<string, string> | undefined)?.[taskId];
  if (!key) return null;
  const { lookFor, sameLook } = await import("@/lib/series-look");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<LookTask>();
  if (!t) return null;
  const card = cleanLook((extras.calCardLooks as Record<string, unknown> | undefined)?.[taskId]);
  const mine = lookOf(t, card);
  // Kept as it is for this one only: don't ask again until it changes once more.
  const kept = (extras.seriesKept as Record<string, string> | undefined)?.[taskId];
  if (kept && kept === JSON.stringify(mine)) return null;
  const siblings = Object.entries((extras.questSeries as Record<string, string>) ?? {}).filter(([id, k]) => k === key && id !== taskId).map(([id]) => id);
  if (!siblings.length) return null;
  const saved = lookFor((extras.seriesLooks as Record<string, import("@/lib/series-look").SeriesEntry[]> | undefined)?.[key], dayKeyOf(t.scheduled_start));
  if (saved) return sameLook(saved, mine) ? null : { title: t.title, others: siblings.length };
  // No look saved yet: ask when this one differs from another of the series.
  const { data: other } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("owner_id", ownerId).in("id", siblings.slice(0, 50)).limit(1).maybeSingle<LookTask>();
  if (!other) return null;
  const otherCard = cleanLook((extras.calCardLooks as Record<string, unknown> | undefined)?.[other.id]);
  return sameLook(lookOf(other, otherCard), mine) ? null : { title: t.title, others: siblings.length };
}

/** Save a quest's look for its whole series ("all"), from its day on ("following"), or keep it to itself ("one"). */
export async function applySeriesLookAction(taskId: string, scope: import("@/lib/series-look").SeriesScope) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const key = (extras.questSeries as Record<string, string> | undefined)?.[taskId];
  if (!key) throw new Error("That quest isn't part of a repeating event.");
  const { withLook } = await import("@/lib/series-look");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<LookTask>();
  if (!t) throw new Error("Unknown quest.");
  const card = cleanLook((extras.calCardLooks as Record<string, unknown> | undefined)?.[taskId]);
  const look = lookOf(t, card);
  if (scope === "one") {
    const kept = { ...((extras.seriesKept as Record<string, string> | undefined) ?? {}), [taskId]: JSON.stringify(look) };
    await writeExtra(ownerId, "seriesKept", kept);
    return { changed: 0 };
  }
  const day = dayKeyOf(t.scheduled_start);
  const siblings = Object.entries((extras.questSeries as Record<string, string>) ?? {}).filter(([id, k]) => k === key && id !== taskId).map(([id]) => id);
  let targets: LookTask[] = [];
  if (siblings.length) {
    const { data } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("owner_id", ownerId).in("id", siblings);
    targets = ((data ?? []) as LookTask[]).filter((x) => scope === "all" || (x.scheduled_start && dayKeyOf(x.scheduled_start) >= day));
  }
  // The picture and colours go on every one; XP, coins and board only on ones not finished yet (what a
  // finished quest paid stays as it was).
  const open = targets.filter((x) => x.status === "open").map((x) => x.id);
  const all = targets.map((x) => x.id);
  if (all.length) {
    await db.from("tasks").update({ icon_key: look.iconKey ?? null, icon_source: look.iconSource ?? "library", color: look.color ?? null }).eq("owner_id", ownerId).in("id", all);
  }
  if (open.length) {
    await db.from("tasks").update({ xp_value: look.xp ?? 15, coin_value: look.coins ?? null, board_id: look.boardId ?? null }).eq("owner_id", ownerId).in("id", open);
  }
  const cards = { ...((extras.calCardLooks as Record<string, CalCardLook> | undefined) ?? {}) };
  for (const id of all) {
    if (card) cards[id] = card;
    else delete cards[id];
  }
  const looks = { ...((extras.seriesLooks as Record<string, import("@/lib/series-look").SeriesEntry[]> | undefined) ?? {}) };
  looks[key] = withLook(looks[key], look, scope, day);
  const { error } = await writeExtra(ownerId, "seriesLooks", looks);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  for (const id of all) await setQuestCardLook(ownerId, id, cards[id] ?? null); // columns are read; the old key is kept current (D3)
  const { error: cardErr } = await writeExtra(ownerId, "calCardLooks", cards);
  if (cardErr) throw new Error(`Couldn't save: ${cardErr.message}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { changed: all.length };
}

/** The gem each reward wears on its tag (a diamond unless chosen), kept on the account by reward id. */
export async function rewardGemsAction(): Promise<Record<string, "diamond" | "ruby" | "emerald" | "ink">> {
  const ownerId = await requireProfileId();
  const raw = (await readExtras(ownerId)).rewardGems;
  const ok = ["diamond", "ruby", "emerald", "ink"];
  const out: Record<string, "diamond" | "ruby" | "emerald" | "ink"> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (/^[0-9a-f-]{36}$/i.test(k) && typeof v === "string" && ok.includes(v)) out[k] = v as "diamond";
  return out;
}

export async function setRewardGemAction(rewardId: string, kind: string) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(rewardId)) throw new Error("Unknown reward.");
  if (!["diamond", "ruby", "emerald", "ink"].includes(kind)) throw new Error("Unknown gem.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.rewardGems as Record<string, string> | undefined) ?? {}) };
  if (kind === "diamond") delete all[rewardId];
  else all[rewardId] = kind;
  const { error } = await writeExtra(ownerId, "rewardGems", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

/** A board shown whole (no mist over all but its next step), or misty again. Kept on the account. */
export async function setBoardMistAction(boardId: string, mist: boolean) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) throw new Error("Unknown board.");
  const extras = await readExtras(ownerId);
  const list = (Array.isArray(extras.clearBoards) ? (extras.clearBoards as unknown[]) : []).filter((x): x is string => typeof x === "string" && x !== boardId);
  const next = mist ? list : [...list, boardId].slice(-200);
  const { error } = await writeExtra(ownerId, "clearBoards", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath(`/boards/${boardId}`);
}

/** How a board's quests are listed: your own drag order, or by due date, newest, XP or name (kept per board on the account). */
export async function saveBoardOrderAction(boardId: string, order: { by: string; ids?: string[] }) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) throw new Error("Unknown board.");
  const { normalizeBoardOrder } = await import("@/lib/board-order");
  const extras = await readExtras(ownerId);
  const all = (extras.boardOrders && typeof extras.boardOrders === "object" ? (extras.boardOrders as Record<string, unknown>) : {}) as Record<string, unknown>;
  const next = { ...all, [boardId]: normalizeBoardOrder(order) };
  // Keep the newest 200 boards' choices.
  const keys = Object.keys(next);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete next[k];
  const { error } = await writeExtra(ownerId, "boardOrders", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

export async function listQuestTemplatesAction() {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  return normalizeTemplates((await readExtras(ownerId)).templates);
}

/** Add a template, or replace the one with the same id. */
export async function saveQuestTemplateAction(tpl: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  const [clean] = normalizeTemplates([tpl]);
  if (!clean) throw new Error("That template needs a title.");
  const extras = await readExtras(ownerId);
  const list = normalizeTemplates(extras.templates).filter((t) => t.id !== clean.id);
  const next = [...list, clean].sort((a, b) => a.name.localeCompare(b.name));
  const { error } = await writeExtra(ownerId, "templates", next);
  if (error) throw new Error(`Couldn't save the template: ${error.message}`);
  return next;
}

export async function deleteQuestTemplateAction(id: string) {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  const extras = await readExtras(ownerId);
  const next = normalizeTemplates(extras.templates).filter((t) => t.id !== id);
  await writeExtra(ownerId, "templates", next);
  return next;
}
