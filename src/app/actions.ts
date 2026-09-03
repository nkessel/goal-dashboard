"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import * as boardsData from "@/lib/data/boards";
import * as goalsData from "@/lib/data/goals";
import * as tasksData from "@/lib/data/tasks";
import { findOpenSlots, type Interval } from "@/lib/scheduling";
import {
  listBusyIntervals,
  createCalendarEvent,
  updateCalendarEvent,
} from "@/lib/google-calendar";

async function requireProfileId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

async function requireSessionWithGoogle() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (!session.googleAccessToken) {
    throw new Error(
      "No Google Calendar access token on this session — sign out and back in to grant Calendar access."
    );
  }
  return { profileId: session.user.id, accessToken: session.googleAccessToken };
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

// ---------------------------------------------------------------------------
// Pull-to-calendar (Priority #4)
// ---------------------------------------------------------------------------

/**
 * Suggests the next 3 open Google Calendar slots for a task, per the spec's
 * "v1 logic: treat all open gaps as available" rule. Purely a suggestion —
 * nothing is written until scheduleTaskAction is called with a chosen slot.
 */
export async function suggestSlotsAction(
  durationMinutes = 30
): Promise<{ start: string; end: string }[]> {
  const { accessToken } = await requireSessionWithGoogle();

  const from = new Date();
  const horizonEnd = new Date(from.getTime() + 14 * 86_400_000);
  const busy = await listBusyIntervals(accessToken, from, horizonEnd);

  const slots = findOpenSlots(busy, { from, durationMinutes, horizonDays: 14, maxSlots: 3 });
  return slots.map((s: Interval) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));
}

/**
 * Pulls a task onto the calendar at the given start/end — either one of the
 * suggested slots or a manually chosen time. Creates a real Google Calendar
 * event (or moves the existing one if the task was already scheduled) and
 * bumps reschedule_count via rescheduleTask when it's a re-pull.
 */
export async function scheduleTaskAction(
  taskId: string,
  startISO: string,
  endISO: string
) {
  const { profileId, accessToken } = await requireSessionWithGoogle();

  const task = await tasksData.getTask(taskId, profileId);
  if (!task) throw new Error("Task not found");

  const start = new Date(startISO);
  const end = new Date(endISO);

  let eventId = task.google_calendar_event_id ?? undefined;
  if (eventId) {
    await updateCalendarEvent(accessToken, eventId, { start, end });
  } else {
    eventId = await createCalendarEvent(accessToken, {
      title: task.title,
      description: task.description ?? undefined,
      start,
      end,
    });
  }

  await tasksData.rescheduleTask(taskId, profileId, start.toISOString(), end.toISOString(), eventId);
  revalidatePath("/");
}
