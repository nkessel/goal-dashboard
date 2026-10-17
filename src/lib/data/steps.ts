import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

export type QuestStep = {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  sort_order: number;
  /** XP paid when the step is done (0 = none). */
  xp?: number;
  /** Percent of the quest this step is worth; null = an equal share. */
  weight?: number | null;
  /** How far along the step is, 0–100 (100 once done). */
  progress?: number;
  /** Seconds spent on it in focus mode. */
  seconds_spent?: number;
  /** XP this step has paid so far. */
  xp_paid?: number;
};

export type StepInput = { id?: string; title: string; done: boolean; xp?: number; weight?: number | null; progress?: number; seconds?: number };

/** True when the error just means the quest_steps table hasn't been created yet. */
function missingTable(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /quest_steps/.test(error.message));
}

/** A quest's steps in order; null when steps aren't available yet. */
export async function listStepsForTask(taskId: string, ownerId: string): Promise<QuestStep[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("quest_steps")
    .select("*")
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
  steps: StepInput[]
): Promise<QuestStep[]> {
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
    const extra = {
      ...(s.xp !== undefined ? { xp: Math.max(0, Math.min(1000, Math.round(s.xp))) } : {}),
      ...(s.weight !== undefined ? { weight: s.weight === null ? null : Math.max(1, Math.min(100, Math.round(s.weight))) } : {}),
      ...(s.progress !== undefined || s.done ? { progress: s.done ? 100 : Math.max(0, Math.min(99, Math.round(s.progress ?? 0))) } : {}),
      ...(s.seconds !== undefined ? { seconds_spent: Math.max(0, Math.round(s.seconds)) } : {}),
    };
    if (prev) {
      const same =
        prev.title === title &&
        prev.done === s.done &&
        prev.sort_order === i &&
        (extra.xp === undefined || extra.xp === (prev.xp ?? 0)) &&
        (extra.weight === undefined || extra.weight === (prev.weight ?? null)) &&
        (extra.progress === undefined || extra.progress === (prev.progress ?? 0)) &&
        (extra.seconds_spent === undefined || extra.seconds_spent === (prev.seconds_spent ?? 0));
      if (same) continue;
      const { error } = await db
        .from("quest_steps")
        .update({ title, done: s.done, sort_order: i, ...extra, ...(prev.done !== s.done ? { done_at: s.done ? now : null } : {}) })
        .eq("id", prev.id)
        .eq("owner_id", ownerId);
      if (error) throw new Error(`Failed to save a step: ${error.message}`);
    } else {
      const { error } = await db
        .from("quest_steps")
        .insert({ owner_id: ownerId, task_id: taskId, title, done: s.done, done_at: s.done ? now : null, sort_order: i, ...extra });
      if (error) throw new Error(`Failed to add a step: ${error.message}`);
    }
  }
  return (await listStepsForTask(taskId, ownerId)) ?? [];
}

/** Step counts plus the next step still to do, for each quest (unchanged when steps aren't available). */
export async function attachNextSteps<T extends Task>(tasks: T[], ownerId: string): Promise<(T & { next_step?: string | null })[]> {
  if (tasks.length === 0) return tasks;
  const { data, error } = await supabaseAdmin()
    .from("quest_steps")
    .select("task_id, title, done, sort_order, created_at")
    .eq("owner_id", ownerId)
    .in("task_id", tasks.map((t) => t.id))
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return tasks;
  const info = new Map<string, { total: number; done: number; next: string | null }>();
  for (const s of data ?? []) {
    const c = info.get(s.task_id as string) ?? { total: 0, done: 0, next: null };
    c.total += 1;
    if (s.done) c.done += 1;
    else if (!c.next) c.next = s.title as string;
    info.set(s.task_id as string, c);
  }
  return tasks.map((t) => {
    const c = info.get(t.id);
    return c ? { ...t, steps_total: c.total, steps_done: c.done, next_step: c.next } : t;
  });
}

/** Record what a step has paid. */
export async function setStepPaid(stepId: string, ownerId: string, xpPaid: number): Promise<void> {
  await supabaseAdmin().from("quest_steps").update({ xp_paid: xpPaid }).eq("id", stepId).eq("owner_id", ownerId);
}
