import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

/** Where a quest joins the scheduling list. */
export type SchedulePlace = "top" | "unordered" | "bottom";

/** The numbered slots at the head of the list; the rest are unnumbered. */
export const NUMBERED = 3;

/** Open quests waiting to be scheduled, in order (empty before migration 0041). */
export async function listSchedulingList(ownerId: string): Promise<Task[]> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .not("schedule_rank", "is", null)
    .order("schedule_rank", { ascending: true });
  if (error) return [];
  return (data ?? []) as Task[];
}

/** Save the whole order. Anything left out comes off the list. */
export async function setSchedulingOrder(ownerId: string, ids: string[]): Promise<void> {
  const db = supabaseAdmin();
  const current = await listSchedulingList(ownerId);
  const drop = current.map((t) => t.id).filter((id) => !ids.includes(id));
  if (drop.length) await db.from("tasks").update({ schedule_rank: null }).eq("owner_id", ownerId).in("id", drop);
  const results = await Promise.all(ids.map((id, i) => db.from("tasks").update({ schedule_rank: i }).eq("owner_id", ownerId).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(/schedule_rank/.test(failed.error.message) ? "The scheduling list needs a quick database update first." : `Couldn't save the list: ${failed.error.message}`);
}

/** Put a quest on the list: at the very top, at the top of the unnumbered part, or at the bottom. */
export async function addToSchedulingList(ownerId: string, taskId: string, place: SchedulePlace): Promise<void> {
  const ids = (await listSchedulingList(ownerId)).map((t) => t.id).filter((id) => id !== taskId);
  const at = place === "top" ? 0 : place === "unordered" ? Math.min(NUMBERED, ids.length) : ids.length;
  ids.splice(at, 0, taskId);
  await setSchedulingOrder(ownerId, ids);
}

export async function removeFromSchedulingList(ownerId: string, taskId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("tasks").update({ schedule_rank: null }).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't take it off the list: ${error.message}`);
}
