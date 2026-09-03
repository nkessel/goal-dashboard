"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import * as boardsData from "@/lib/data/boards";
import * as goalsData from "@/lib/data/goals";
import * as tasksData from "@/lib/data/tasks";

async function requireProfileId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------
export async function createBoardAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Board title is required");

  await boardsData.createBoard(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    color: String(formData.get("color") || "").trim() || undefined,
  });

  revalidatePath("/boards");
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
export async function createGoalAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const boardId = String(formData.get("boardId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!boardId || !title) throw new Error("Board and goal title are required");

  await goalsData.createGoal(ownerId, boardId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
  });

  revalidatePath(`/boards/${boardId}`);
}

export async function updateGoalProgressAction(
  goalId: string,
  boardId: string,
  progress: number
) {
  const ownerId = await requireProfileId();
  await goalsData.updateGoalProgress(goalId, ownerId, progress);
  revalidatePath(`/boards/${boardId}`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function createTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Task title is required");

  const goalId = String(formData.get("goalId") || "") || null;

  await tasksData.createTask(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    importance: Number(formData.get("importance") || 3),
    urgency: Number(formData.get("urgency") || 3),
    xpValue: Number(formData.get("xpValue") || 0),
    goalId,
  });

  revalidatePath("/");
  if (goalId) {
    const goal = await goalsData.getGoal(goalId, ownerId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
}

export async function toggleManualPriorityAction(
  taskId: string,
  nextValue: boolean
) {
  const ownerId = await requireProfileId();
  await tasksData.setManualPriority(taskId, ownerId, nextValue);
  revalidatePath("/");
}

export async function completeTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const taskId = String(formData.get("taskId") || "");
  const completedAtRaw = String(formData.get("completedAt") || "");
  const completedAt = completedAtRaw
    ? new Date(completedAtRaw).toISOString()
    : undefined;

  await tasksData.completeTask(taskId, ownerId, completedAt);
  revalidatePath("/");
}

export async function reopenTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  await tasksData.reopenTask(taskId, ownerId);
  revalidatePath("/");
}
