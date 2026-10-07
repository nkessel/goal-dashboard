import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logGoalCompletedActivity } from "./activity";
import type { Goal } from "./types";

export async function listGoalsForBoard(boardId: string): Promise<Goal[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("goals")
    .select("*")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list goals: ${error.message}`);
  return data ?? [];
}

/** Every goal you own, labelled with its board — for the quest editor's Goal picker. */
export async function listGoalOptionsForOwner(
  ownerId: string
): Promise<{ id: string; title: string; boardTitle: string }[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("goals")
    .select("id, title, sort_order, boards!inner(title, owner_id, sort_order)")
    .eq("boards.owner_id", ownerId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to list goals: ${error.message}`);
  type Row = { id: string; title: string; boards: { title: string; sort_order: number } };
  return ((data ?? []) as unknown as Row[])
    .sort((a, b) => (a.boards.sort_order ?? 0) - (b.boards.sort_order ?? 0) || a.boards.title.localeCompare(b.boards.title))
    .map((g) => ({ id: g.id, title: g.title, boardTitle: g.boards.title }));
}

/**
 * Persists a new drag-and-drop order for a board's goals: `orderedIds` is
 * the full list of that board's goal ids in their new display order, each
 * getting its `sort_order` set to its index. Scoped by both board_id and
 * owner_id as a safety check.
 */
export async function updateGoalOrder(boardId: string, ownerId: string, orderedIds: string[]): Promise<void> {
  const db = supabaseAdmin();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("goals").update({ sort_order: index }).eq("id", id).eq("board_id", boardId).eq("owner_id", ownerId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Failed to reorder goals: ${failed.error.message}`);
}

export async function getGoal(
  goalId: string,
  ownerId: string
): Promise<Goal | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("goals")
    .select("*")
    .eq("id", goalId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load goal: ${error.message}`);
  return data;
}

export async function createGoal(
  ownerId: string,
  boardId: string,
  input: { title: string; description?: string; isPrivate?: boolean }
): Promise<Goal> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("goals")
    .insert({
      owner_id: ownerId,
      board_id: boardId,
      title: input.title,
      description: input.description || null,
      is_private: input.isPrivate ?? false,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create goal: ${error.message}`);
  return data;
}

export async function updateGoalProgress(
  goalId: string,
  ownerId: string,
  progress: number
): Promise<Goal> {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const db = supabaseAdmin();

  const before = await db
    .from("goals")
    .select("completed_at")
    .eq("id", goalId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const wasAlreadyComplete = Boolean(before.data?.completed_at);

  const { data, error } = await db
    .from("goals")
    .update({
      progress: clamped,
      completed_at: clamped >= 100 ? new Date().toISOString() : null,
    })
    .eq("id", goalId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update goal progress: ${error.message}`);

  // Only log a feed event the moment a goal *crosses into* 100%, not every
  // subsequent nudge of an already-complete goal.
  if (clamped >= 100 && !wasAlreadyComplete) {
    await logGoalCompletedActivity(ownerId, {
      id: data.id,
      is_private: data.is_private,
      board_id: data.board_id,
    });
  }

  return data;
}
