import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

export type QuestStep = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  sort_order: number;
};

/** True when the error just means the quest_steps table hasn't been created yet. */
function missingTable(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /quest_steps/.test(error.message));
}

/** A quest's steps in order; null when steps aren't available yet. */
export async function listStepsForTask(taskId: string, ownerId: string): Promise<QuestStep[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("quest_steps")
    .select("id, task_id, title, done, sort_order")
    .eq("owner_id", ownerId)
    .eq("task_id", taskId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (missingTable(error)) return null;
  if (error) throw new Error(`Failed to load steps: ${error.message}`);
  return (data ?? []) as QuestStep[];
}

/** Adds steps_total / steps_done to each quest (left unset when steps aren't available). */
export async function attachStepCounts<T extends Task>(tasks: T[], ownerId: string): Promise<T[]> {
  if (tasks.length === 0) return tasks;
  const { data, error } = await supabaseAdmin()
    .from("quest_steps")
    .select("task_id, done")
    .eq("owner_id", ownerId)
    .in("task_id", tasks.map((t) => t.id));
  if (error) return tasks;
  const counts = new Map<string, { total: number; done: number }>();
  for (const s of data ?? []) {
    const c = counts.get(s.task_id as string) ?? { total: 0, done: 0 };
    c.total += 1;
    if (s.done) c.done += 1;
    counts.set(s.task_id as string, c);
  }
  return tasks.map((t) => {
    const c = counts.get(t.id);
    return c ? { ...t, steps_total: c.total, steps_done: c.done } : t;
  });
}

/**
 * Saves a quest's whole step list as edited: updates the steps that are
 * kept (by id), adds the new ones, and removes the rest.
 */
export async function replaceSteps(
  taskId: string,
  ownerId: string,
  steps: { id?: string; title: string; done: boolean }[]
): Promise<void> {
  const db = supabaseAdmin();
  const existing = await listStepsForTask(taskId, ownerId);
  if (existing === null) throw new Error("Quest steps need a quick database update first.");
  const keep = new Set(steps.map((s) => s.id).filter(Boolean) as string[]);
  const removed = existing.filter((s) => !keep.has(s.id)).map((s) => s.id);
  if (removed.length > 0) {
    const { error } = await db.from("quest_steps").delete().eq("owner_id", ownerId).in("id", removed);
    if (error) throw new Error(`Failed to remove steps: ${error.message}`);
  }
  const before = new Map(existing.map((s) => [s.id, s]));
  const now = new Date().toISOString();
  for (const [i, s] of steps.entries()) {
    const title = s.title.trim();
    if (!title) continue;
    const prev = s.id ? before.get(s.id) : undefined;
    if (prev) {
      if (prev.title === title && prev.done === s.done && prev.sort_order === i) continue;
      const { error } = await db
        .from("quest_steps")
        .update({ title, done: s.done, sort_order: i, ...(prev.done !== s.done ? { done_at: s.done ? now : null } : {}) })
        .eq("id", prev.id)
        .eq("owner_id", ownerId);
      if (error) throw new Error(`Failed to save a step: ${error.message}`);
    } else {
      const { error } = await db
        .from("quest_steps")
        .insert({ owner_id: ownerId, task_id: taskId, title, done: s.done, done_at: s.done ? now : null, sort_order: i });
      if (error) throw new Error(`Failed to add a step: ${error.message}`);
    }
  }
}
