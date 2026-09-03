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
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list goals: ${error.message}`);
  return data ?? [];
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
