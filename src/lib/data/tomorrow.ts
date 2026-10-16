import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

const TZ = process.env.APP_TIMEZONE || "America/New_York";
/** The app's day turns over at 5:30am, like the evening routine's clock. */
const ROLLOVER_MINUTES = 5 * 60 + 30;
/** A sensible ceiling for one day's plan. */
const MAX_PLANNED = 20;

/** Today's key (YYYY-MM-DD) in the app's time zone, with the 5:30am rollover. */
export function appDayKey(now = new Date()): string {
  const shifted = new Date(now.getTime() - ROLLOVER_MINUTES * 60_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(shifted);
}

export function nextDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Quests queued for tomorrow, in slot order; null before the migration. */
export async function listTomorrowQueue(ownerId: string): Promise<Task[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .gt("queued_for", appDayKey())
    .order("queue_rank", { ascending: true });
  // Before migration 0032 there's no queue_seq; the rank order stands in for it.
  if (error) return null;
  return (data ?? []) as Task[];
}

/**
 * Replace tomorrow's plan: `rankIds` by importance, `seqIds` in the order
 * they'll be done (defaults to the importance order).
 */
export async function setTomorrowQueue(ownerId: string, rankIds: string[], seqIds?: string[]): Promise<void> {
  const db = supabaseAdmin();
  const tomorrow = nextDayKey(appDayKey());
  const keep = rankIds.slice(0, MAX_PLANNED);
  const seq = (seqIds ?? keep).filter((id) => keep.includes(id));
  for (const id of keep) if (!seq.includes(id)) seq.push(id);
  const { data: current, error } = await db.from("tasks").select("id").eq("owner_id", ownerId).gte("queued_for", tomorrow);
  if (error) throw new Error("Tomorrow's Quests need a quick database update first.");
  const drop = (current ?? []).map((r) => r.id as string).filter((id) => !keep.includes(id));
  if (drop.length) await db.from("tasks").update({ queued_for: null, queue_rank: null, queue_seq: null }).eq("owner_id", ownerId).in("id", drop);
  const results = await Promise.all(
    keep.map((id, i) => db.from("tasks").update({ queued_for: tomorrow, queue_rank: i, queue_seq: seq.indexOf(id) }).eq("owner_id", ownerId).eq("id", id))
  );
  if (results.some((r) => r.error && /queue_seq/.test(r.error.message))) {
    // Before migration 0032: importance order only.
    await Promise.all(keep.map((id, i) => db.from("tasks").update({ queued_for: tomorrow, queue_rank: i }).eq("owner_id", ownerId).eq("id", id)));
  }
}

/**
 * Once the day turns over, the quests planned for it move into Today's
 * Quests (in their planned order), keeping any of yesterday's still-open
 * picks only while there's room. Cheap no-op when nothing is queued.
 */
export async function promoteQueuedQuests(ownerId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const today = appDayKey();
  const { data: queued, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .not("queued_for", "is", null)
    .lte("queued_for", today)
    .order("queued_for", { ascending: false })
    .order("queue_rank", { ascending: true });
  if (error || !queued || queued.length === 0) return false;
  // Today's Quests follow the planned order of doing; importance rides along as a badge.
  const latest = queued[0].queued_for as string;
  const order = (q: { queue_seq?: number | null; queue_rank?: number | null }) => q.queue_seq ?? q.queue_rank ?? 99;
  queued.sort((a, b) => (a.queued_for === b.queued_for ? order(a) - order(b) : a.queued_for === latest ? -1 : 1));

  const { data: pinned } = await db
    .from("tasks")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .eq("is_manual_priority", true)
    .order("sort_order", { ascending: true });
  const { data: openQueued } = await db.from("tasks").select("id").eq("status", "open").in("id", queued.map((q) => q.id));
  const openIds = new Set((openQueued ?? []).map((r) => r.id as string));
  const queuedIds = queued.map((q) => q.id as string).filter((id) => openIds.has(id));
  // Planned quests go on top; whatever was already in Today's Quests stays below them.
  const next = [...new Set([...queuedIds, ...(pinned ?? []).map((r) => r.id as string)])];
  // Planned quests also return to the Today screen if they were snoozed off it.
  await Promise.all(
    next.map((id, i) => db.from("tasks").update({ is_manual_priority: true, sort_order: i, ...(queuedIds.includes(id) ? { in_additional: true } : {}) }).eq("owner_id", ownerId).eq("id", id))
  );
  // Older importance badges give way to today's plan.
  const stale = (pinned ?? []).map((r) => r.id as string).filter((id) => !queuedIds.includes(id));
  if (stale.length) await db.from("tasks").update({ queue_rank: null }).eq("owner_id", ownerId).in("id", stale);
  const done = queued.map((q) => q.id as string);
  const { error: clearErr } = await db.from("tasks").update({ queued_for: null, queue_seq: null }).eq("owner_id", ownerId).in("id", done);
  if (clearErr) await db.from("tasks").update({ queued_for: null }).eq("owner_id", ownerId).in("id", done);
  return true;
}

/** What a quest looked like before it was snoozed (to put it back on Undo). */
export type SnoozePrev = {
  is_manual_priority: boolean;
  in_additional: boolean | null;
  sort_order: number | null;
  queued_for: string | null;
  queue_rank: number | null;
  queue_seq: number | null;
  reschedule_count: number;
};

/**
 * Snooze: take a quest off today and put it at the end of tomorrow's plan
 * (it comes back into Today's Quests when the day turns over). Counts as a
 * reschedule. Returns what it was, for Undo.
 */
export async function snoozeToTomorrow(ownerId: string, taskId: string): Promise<SnoozePrev> {
  const db = supabaseAdmin();
  const { data: t, error } = await db
    .from("tasks")
    .select("is_manual_priority, in_additional, sort_order, queued_for, queue_rank, queue_seq, reschedule_count, status")
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(/queue_seq|queued_for/.test(error.message) ? "Snoozing needs a quick database update first." : `Couldn't snooze: ${error.message}`);
  if (!t || t.status !== "open") throw new Error("That quest isn't open anymore.");
  const tomorrow = nextDayKey(appDayKey());
  const already = t.queued_for === tomorrow;
  let rank = t.queue_rank as number | null;
  let seq = t.queue_seq as number | null;
  if (!already) {
    const { data: planned } = await db.from("tasks").select("queue_rank, queue_seq").eq("owner_id", ownerId).eq("status", "open").eq("queued_for", tomorrow);
    const rows = planned ?? [];
    if (rows.length >= MAX_PLANNED) throw new Error(`Tomorrow's plan is full (${MAX_PLANNED} quests).`);
    rank = Math.max(-1, ...rows.map((r) => (r.queue_rank as number | null) ?? -1)) + 1;
    seq = Math.max(-1, ...rows.map((r) => (r.queue_seq as number | null) ?? (r.queue_rank as number | null) ?? -1)) + 1;
  }
  const { error: upErr } = await db
    .from("tasks")
    .update({ is_manual_priority: false, in_additional: false, queued_for: tomorrow, queue_rank: rank, queue_seq: seq, reschedule_count: (t.reschedule_count ?? 0) + 1 })
    .eq("id", taskId)
    .eq("owner_id", ownerId);
  if (upErr) throw new Error(`Couldn't snooze: ${upErr.message}`);
  return {
    is_manual_priority: !!t.is_manual_priority,
    in_additional: (t.in_additional as boolean | null) ?? null,
    sort_order: (t.sort_order as number | null) ?? null,
    queued_for: (t.queued_for as string | null) ?? null,
    queue_rank: (t.queue_rank as number | null) ?? null,
    queue_seq: (t.queue_seq as number | null) ?? null,
    reschedule_count: (t.reschedule_count as number) ?? 0,
  };
}

/** Undo a snooze: put the quest back exactly as it was. */
export async function undoSnooze(ownerId: string, taskId: string, prev: SnoozePrev): Promise<void> {
  const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null);
  const day = typeof prev.queued_for === "string" && /^\d{4}-\d{2}-\d{2}$/.test(prev.queued_for) ? prev.queued_for : null;
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({
      is_manual_priority: prev.is_manual_priority === true,
      in_additional: typeof prev.in_additional === "boolean" ? prev.in_additional : true,
      sort_order: int(prev.sort_order) ?? 0,
      queued_for: day,
      queue_rank: day ? int(prev.queue_rank) : null,
      queue_seq: day ? int(prev.queue_seq) : null,
      reschedule_count: Math.max(0, int(prev.reschedule_count) ?? 0),
    })
    .eq("id", taskId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't undo: ${error.message}`);
}
