import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { awardXp, currentWeekStart } from "./xp";
import type { Task } from "./types";

export type PlanKind = "week" | "month" | "pair";
export const PLAN_XP: Record<PlanKind, number> = { week: 30, month: 60, pair: 40 };

/** Which week (its Monday) or month ("2026-10") a ritual belongs to. */
export function periodKey(kind: PlanKind, d = new Date()): string {
  if (kind === "week" || kind === "pair") return currentWeekStart();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type PlanSession = { kind: PlanKind; period_key: string; data: Record<string, unknown>; completed_at: string | null };

export async function getPlanSession(ownerId: string, kind: PlanKind, key = periodKey(kind)): Promise<PlanSession | null> {
  const { data } = await supabaseAdmin().from("planning_sessions").select("kind, period_key, data, completed_at").eq("owner_id", ownerId).eq("kind", kind).eq("period_key", key).maybeSingle<PlanSession>();
  return data ?? null;
}

/** Keep the ritual's progress so it can be finished later. */
export async function savePlanDraft(ownerId: string, kind: PlanKind, data: Record<string, unknown>) {
  const key = periodKey(kind);
  const { error } = await supabaseAdmin()
    .from("planning_sessions")
    .upsert({ owner_id: ownerId, kind, period_key: key, data, updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,period_key" });
  if (error && /planning_sessions/.test(error.message)) throw new Error("Planning needs a quick database update first.");
  if (error) throw new Error(`Couldn't save your progress: ${error.message}`);
}

/** Seal the ritual. XP is paid once per week or month. */
export async function completePlan(ownerId: string, kind: PlanKind, data: Record<string, unknown>): Promise<{ xp: number; totalXp: number | null }> {
  const key = periodKey(kind);
  const before = await getPlanSession(ownerId, kind, key);
  await supabaseAdmin()
    .from("planning_sessions")
    .upsert({ owner_id: ownerId, kind, period_key: key, data, completed_at: before?.completed_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,period_key" });
  if (before?.completed_at) return { xp: 0, totalXp: null };
  const res = await awardXp(ownerId, PLAN_XP[kind], "planning_ritual");
  return { xp: PLAN_XP[kind], totalXp: res.totalXp ?? null };
}

/** What happened over the last week or month, for the look back. */
export async function lookBack(ownerId: string, kind: PlanKind) {
  const days = kind === "month" ? 30 : 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = supabaseAdmin();
  const [done, xp, energy] = await Promise.all([
    db.from("tasks").select("id, title, xp_value, completed_at").eq("owner_id", ownerId).eq("status", "completed").gte("completed_at", since).order("completed_at", { ascending: false }).limit(60),
    db.from("xp_events").select("amount").eq("owner_id", ownerId).gte("created_at", since),
    db.from("energy_log").select("level").eq("owner_id", ownerId).gte("created_at", since),
  ]);
  const xpTotal = (xp.data ?? []).reduce((n, r) => n + Number(r.amount ?? 0), 0);
  const levels = (energy.data ?? []).map((r) => Number(r.level)).filter((n) => Number.isFinite(n));
  return {
    days,
    completed: (done.data ?? []) as { id: string; title: string; xp_value: number; completed_at: string }[],
    xpTotal,
    energyAvg: levels.length ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10 : null,
  };
}

/** Open quests worth a look: overdue, or sitting untouched for weeks. */
export function questsToReview<T extends Task>(open: T[]) {
  const now = Date.now();
  const overdue = open.filter((t) => t.due_at && Date.parse(t.due_at) < now);
  const stale = open.filter((t) => !overdue.includes(t) && now - Date.parse(t.updated_at ?? t.created_at) > 21 * 86_400_000 && !t.is_manual_priority);
  return { overdue, stale: stale.slice(0, 30) };
}

/** A board by title (made if it doesn't exist yet) — for Someday / Maybe and Waiting For. */
export async function boardNamed(ownerId: string, title: string): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db.from("boards").select("id").eq("owner_id", ownerId).ilike("title", title).limit(1);
  if (data?.[0]?.id) return data[0].id as string;
  const { createBoard } = await import("./boards");
  const b = await createBoard(ownerId, { title, isPrivate: false });
  return b.id;
}

export type FocusPlan = { area: string; from: number | null; target: number; quests: { id: string; title: string }[] };

/**
 * Last week's (or month's) focus areas, for the look back: where each area
 * started, where you aimed it, and which of its quests got done.
 */
export async function focusFollowUp(ownerId: string, kind: PlanKind): Promise<{ periodKey: string; items: (Omit<FocusPlan, "quests"> & { quests: { id: string; title: string; done: boolean }[] })[] } | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("planning_sessions")
    .select("period_key, data")
    .eq("owner_id", ownerId)
    .eq("kind", kind)
    .lt("period_key", periodKey(kind))
    .order("period_key", { ascending: false })
    .limit(1);
  const row = data?.[0] as { period_key: string; data: { focus?: FocusPlan[] } } | undefined;
  const focus = (row?.data?.focus ?? []).filter((f) => f && f.area);
  if (!row || !focus.length) return null;
  const ids = focus.flatMap((f) => (f.quests ?? []).map((q) => q.id));
  const done = new Set<string>();
  if (ids.length) {
    const { data: rows } = await db.from("tasks").select("id, status").in("id", ids);
    for (const r of rows ?? []) if ((r as { status: string }).status === "completed") done.add((r as { id: string }).id);
  }
  return { periodKey: row.period_key, items: focus.map((f) => ({ ...f, quests: (f.quests ?? []).map((q) => ({ ...q, done: done.has(q.id) })) })) };
}

/** The last finished check-in with your partner before this week (for what you picked last time). */
export async function lastPairSession(ownerId: string): Promise<{ periodKey: string; data: Record<string, unknown>; completedAt: string } | null> {
  const { data } = await supabaseAdmin()
    .from("planning_sessions")
    .select("period_key, data, completed_at")
    .eq("owner_id", ownerId)
    .eq("kind", "pair")
    .lt("period_key", periodKey("pair"))
    .not("completed_at", "is", null)
    .order("period_key", { ascending: false })
    .limit(1);
  const r = data?.[0] as { period_key: string; data: Record<string, unknown>; completed_at: string } | undefined;
  return r ? { periodKey: r.period_key, data: r.data ?? {}, completedAt: r.completed_at } : null;
}

export type ChapterBeat = { id: string; title: string; done: boolean; icon: string | null; scheduledAt: string | null; dueAt: string | null };
export type WeekChapter = { number: number; title: string | null; weekOf: string; beats: ChapterBeat[] };

/**
 * This week as a chapter of the story: the big rocks chosen in the weekly
 * ritual, and how far along each is. Null when no rocks were chosen.
 */
export async function getWeekChapter(ownerId: string, profileCreatedAt?: string | null): Promise<WeekChapter | null> {
  const s = await getPlanSession(ownerId, "week");
  const data = (s?.data ?? {}) as { rocks?: string[]; chapterTitle?: string | null };
  const ids = (data.rocks ?? []).slice(0, 3);
  if (!ids.length) return null;
  const { data: rows } = await supabaseAdmin()
    .from("tasks")
    .select("id, title, status, icon_key, icon_source, scheduled_start, is_on_calendar, due_at")
    .eq("owner_id", ownerId)
    .in("id", ids);
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const beats = ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r) => ({
      id: r!.id as string,
      title: r!.title as string,
      done: r!.status === "completed",
      icon: (r!.icon_source === "ai" || r!.icon_source === "library") && r!.icon_key ? (r!.icon_key as string) : null,
      scheduledAt: r!.is_on_calendar ? ((r!.scheduled_start as string | null) ?? null) : null,
      dueAt: (r!.due_at as string | null) ?? null,
    }));
  if (!beats.length) return null;
  const weekOf = s!.period_key;
  const start = profileCreatedAt ? Date.parse(profileCreatedAt) : Date.parse(weekOf);
  const number = Math.max(1, Math.floor((Date.parse(weekOf) - start) / (7 * 86_400_000)) + 1);
  return { number, title: data.chapterTitle ?? null, weekOf, beats };
}

/** Name this week's chapter (kept with the week's plan). */
export async function setChapterTitle(ownerId: string, title: string | null) {
  const s = await getPlanSession(ownerId, "week");
  const data = { ...((s?.data ?? {}) as Record<string, unknown>), chapterTitle: title };
  const { error } = await supabaseAdmin()
    .from("planning_sessions")
    .upsert({ owner_id: ownerId, kind: "week", period_key: periodKey("week"), data, updated_at: new Date().toISOString() }, { onConflict: "owner_id,kind,period_key" });
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}
