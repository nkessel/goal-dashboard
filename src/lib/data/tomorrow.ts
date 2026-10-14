import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

const TZ = process.env.APP_TIMEZONE || "America/New_York";
/** The app's day turns over at 5:30am, like the evening routine's clock. */
const ROLLOVER_MINUTES = 5 * 60 + 30;
const MAX_TODAY = 3;

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
  if (error) return null;
  return (data ?? []) as Task[];
}

/** Replace tomorrow's queue with these quests (in order, at most three). */
export async function setTomorrowQueue(ownerId: string, ids: string[]): Promise<void> {
  const db = supabaseAdmin();
  const tomorrow = nextDayKey(appDayKey());
  const keep = ids.slice(0, MAX_TODAY);
  const { data: current, error } = await db.from("tasks").select("id").eq("owner_id", ownerId).gte("queued_for", tomorrow);
  if (error) throw new Error("Tomorrow's Quests need a quick database update first.");
  const drop = (current ?? []).map((r) => r.id as string).filter((id) => !keep.includes(id));
  if (drop.length) await db.from("tasks").update({ queued_for: null, queue_rank: null }).eq("owner_id", ownerId).in("id", drop);
  await Promise.all(keep.map((id, i) => db.from("tasks").update({ queued_for: tomorrow, queue_rank: i }).eq("owner_id", ownerId).eq("id", id)));
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
    .select("id, queued_for, queue_rank")
    .eq("owner_id", ownerId)
    .not("queued_for", "is", null)
    .lte("queued_for", today)
    .order("queued_for", { ascending: false })
    .order("queue_rank", { ascending: true });
  if (error || !queued || queued.length === 0) return false;

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
  const next = [...new Set([...queuedIds, ...(pinned ?? []).map((r) => r.id as string)])].slice(0, MAX_TODAY);
  const unpin = (pinned ?? []).map((r) => r.id as string).filter((id) => !next.includes(id));

  if (unpin.length) await db.from("tasks").update({ is_manual_priority: false }).eq("owner_id", ownerId).in("id", unpin);
  await Promise.all(next.map((id, i) => db.from("tasks").update({ is_manual_priority: true, sort_order: i }).eq("owner_id", ownerId).eq("id", id)));
  await db.from("tasks").update({ queued_for: null, queue_rank: null }).eq("owner_id", ownerId).in("id", queued.map((q) => q.id as string));
  return true;
}
