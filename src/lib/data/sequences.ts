import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

/**
 * Quest sequences: a quest can wait behind another (tasks.locked_by_task_id,
 * the same link a reward uses for its prerequisite). Only the front quest of a
 * sequence is shown; the ones waiting behind it ride along as a stack.
 * Completing the front quest releases the next one.
 */
export type Behind = { id: string; title: string; estimate_minutes: number | null; icon_key: string | null; board_id: string | null };

type Row = Behind & { locked_by_task_id: string | null };

async function waitingRows(ownerId: string): Promise<Row[]> {
  const { data } = await supabaseAdmin()
    .from("tasks")
    .select("id, title, estimate_minutes, icon_key, board_id, locked_by_task_id")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .is("reward_id", null)
    .not("locked_by_task_id", "is", null);
  return (data ?? []) as Row[];
}

/** Quests open and waiting for `id`, in sequence order (a chain, or a little tree read breadth-first). */
function chainAfter(id: string, rows: Row[]): Behind[] {
  const out: Behind[] = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of rows) {
      if (r.locked_by_task_id === cur && !seen.has(r.id)) {
        seen.add(r.id);
        out.push({ id: r.id, title: r.title, estimate_minutes: r.estimate_minutes, icon_key: r.icon_key, board_id: r.board_id });
        queue.push(r.id);
      }
    }
  }
  return out;
}

/**
 * Hide quests that are waiting behind an open quest, and give each front quest
 * the list of quests stacked behind it.
 */
export async function attachSequences<T extends Task>(ownerId: string, tasks: T[]): Promise<(T & { behind?: Behind[] })[]> {
  const rows = await waitingRows(ownerId);
  if (!rows.length) return tasks;
  const waitingIds = new Set(rows.map((r) => r.id));
  // Is the quest each one waits for still open? (Anything not open releases it.)
  const lockers = [...new Set(rows.map((r) => r.locked_by_task_id!))];
  const { data: open } = await supabaseAdmin().from("tasks").select("id").eq("owner_id", ownerId).eq("status", "open").in("id", lockers);
  const openLockers = new Set((open ?? []).map((o) => o.id as string));
  const live = rows.filter((r) => openLockers.has(r.locked_by_task_id!));
  const hidden = new Set(live.map((r) => r.id));
  return tasks
    .filter((t) => !(waitingIds.has(t.id) && hidden.has(t.id)))
    .map((t) => {
      const behind = chainAfter(t.id, live);
      return behind.length ? { ...t, behind } : t;
    });
}

export type SequenceItem = { id: string; title: string; status: "open" | "completed"; board_id: string | null; reward: boolean };

/** The whole sequence a quest belongs to, front to back (finished ones first). */
export async function sequenceOf(ownerId: string, taskId: string): Promise<SequenceItem[]> {
  const db = supabaseAdmin();
  const get = async (id: string) => {
    const { data } = await db.from("tasks").select("id, title, status, board_id, reward_id, locked_by_task_id").eq("owner_id", ownerId).eq("id", id).maybeSingle();
    return data as (SequenceItem & { reward_id: string | null; locked_by_task_id: string | null }) | null;
  };
  const me = await get(taskId);
  if (!me) return [];
  // Walk back to the start.
  const before: SequenceItem[] = [];
  const seen = new Set([taskId]);
  let cur = me.locked_by_task_id;
  while (cur && !seen.has(cur) && before.length < 30) {
    seen.add(cur);
    const t = await get(cur);
    if (!t) break;
    before.unshift({ id: t.id, title: t.title, status: t.status, board_id: t.board_id, reward: !!t.reward_id });
    cur = t.locked_by_task_id;
  }
  // And forward through everything waiting (open or finished).
  const { data: all } = await db.from("tasks").select("id, title, status, board_id, reward_id, locked_by_task_id").eq("owner_id", ownerId).not("locked_by_task_id", "is", null);
  const rows = (all ?? []) as (SequenceItem & { reward_id: string | null; locked_by_task_id: string | null })[];
  const after: SequenceItem[] = [];
  const queue = [taskId];
  while (queue.length && after.length < 30) {
    const id = queue.shift()!;
    for (const r of rows) if (r.locked_by_task_id === id && !seen.has(r.id)) {
      seen.add(r.id);
      after.push({ id: r.id, title: r.title, status: r.status, board_id: r.board_id, reward: !!r.reward_id });
      queue.push(r.id);
    }
  }
  return [...before, { id: me.id, title: me.title, status: me.status, board_id: me.board_id, reward: !!me.reward_id }, ...after];
}

async function lockerOf(ownerId: string, id: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("tasks").select("locked_by_task_id").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  return (data?.locked_by_task_id as string | null) ?? null;
}

/** Take a quest out of its sequence; the quests behind it close the gap. */
export async function detachFromSequence(ownerId: string, id: string): Promise<void> {
  const db = supabaseAdmin();
  const prev = await lockerOf(ownerId, id);
  await db.from("tasks").update({ locked_by_task_id: prev }).eq("owner_id", ownerId).eq("locked_by_task_id", id).is("reward_id", null).neq("id", id);
  await db.from("tasks").update({ locked_by_task_id: null }).eq("owner_id", ownerId).eq("id", id);
}

/** Put `id` right after `anchor` (it waits for anchor; whatever waited for anchor now waits for it). */
export async function placeAfter(ownerId: string, id: string, anchor: string): Promise<void> {
  if (id === anchor) return;
  const db = supabaseAdmin();
  await detachFromSequence(ownerId, id);
  await db.from("tasks").update({ locked_by_task_id: id }).eq("owner_id", ownerId).eq("locked_by_task_id", anchor).is("reward_id", null).neq("id", id);
  await db.from("tasks").update({ locked_by_task_id: anchor }).eq("owner_id", ownerId).eq("id", id);
}

/** Put `id` right before `anchor`. */
export async function placeBefore(ownerId: string, id: string, anchor: string): Promise<void> {
  if (id === anchor) return;
  const db = supabaseAdmin();
  await detachFromSequence(ownerId, id);
  let prev = await lockerOf(ownerId, anchor);
  if (prev) {
    const { data } = await db.from("tasks").select("status").eq("owner_id", ownerId).eq("id", prev).maybeSingle();
    if (data?.status !== "open") prev = null;
  }
  await db.from("tasks").update({ locked_by_task_id: prev && prev !== id ? prev : null }).eq("owner_id", ownerId).eq("id", id);
  await db.from("tasks").update({ locked_by_task_id: id }).eq("owner_id", ownerId).eq("id", anchor);
}

/** A quest is done: the next ones in its sequence are free (rewards keep their link). */
export async function releaseFollowers(ownerId: string, id: string): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .from("tasks")
    .update({ locked_by_task_id: null })
    .eq("owner_id", ownerId)
    .eq("locked_by_task_id", id)
    .eq("status", "open")
    .is("reward_id", null)
    .select("id");
  return (data ?? []).map((d) => d.id as string);
}
