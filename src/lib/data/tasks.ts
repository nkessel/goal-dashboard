import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logTaskCompletedActivity } from "./activity";
import type { Task } from "./types";

const MAX_MANUAL_PRIORITIES = 3;

export async function listOpenTasksForOwner(ownerId: string): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  return data ?? [];
}

export async function listCompletedTasksForOwner(
  ownerId: string,
  limit = 15
): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list completed tasks: ${error.message}`);
  return data ?? [];
}

export async function setTaskXpValue(taskId: string, ownerId: string, xpValue: number): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("tasks")
    .update({ xp_value: xpValue })
    .eq("id", taskId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update task XP: ${error.message}`);
}

export type TaskWithBoard = Task & { board_id: string | null };

/**
 * Open tasks with their resolved board id, for the Priority Matrix's
 * board filter. A task's board comes from its goal (goals.board_id) when
 * it has one; standalone tasks (no goal) resolve to board_id: null and
 * show up only under "All boards".
 */
export async function listOpenTasksWithBoardForOwner(
  ownerId: string
): Promise<TaskWithBoard[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*, goals(board_id)")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);

  return (data ?? []).map((row) => {
    const { goals, ...task } = row as Task & {
      goals: { board_id: string } | null;
    };
    return { ...task, board_id: goals?.board_id ?? null };
  });
}

export async function listTasksForGoal(goalId: string): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list goal subtasks: ${error.message}`);
  return data ?? [];
}

export async function createTask(
  ownerId: string,
  input: {
    title: string;
    description?: string;
    importance?: number;
    urgency?: number;
    xpValue?: number;
    goalId?: string | null;
    color?: string;
  }
): Promise<Task> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .insert({
      owner_id: ownerId,
      goal_id: input.goalId || null,
      title: input.title,
      description: input.description || null,
      importance: input.importance ?? 3,
      urgency: input.urgency ?? 3,
      xp_value: input.xpValue ?? 0,
      color: input.color || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data;
}

/**
 * Toggle whether a task sits in the manually curated top-1-to-3 list.
 * Enforces the 3-item cap when turning it on. Throws if already full.
 */
export async function setManualPriority(
  taskId: string,
  ownerId: string,
  value: boolean
): Promise<Task> {
  const db = supabaseAdmin();

  if (value) {
    const { count, error: countError } = await db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("is_manual_priority", true)
      .eq("status", "open");

    if (countError) {
      throw new Error(`Failed to check top-priority count: ${countError.message}`);
    }
    if ((count ?? 0) >= MAX_MANUAL_PRIORITIES) {
      throw new Error(
        `You can only have ${MAX_MANUAL_PRIORITIES} tasks in Today's Priorities at a time. Remove one first.`
      );
    }
  }

  const { data, error } = await db
    .from("tasks")
    .update({ is_manual_priority: value })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update task priority: ${error.message}`);
  return data;
}

/**
 * Mark a task complete, optionally backdated (retroactive completion).
 * Defaults to "now" when no completedAt is supplied.
 */
export async function completeTask(
  taskId: string,
  ownerId: string,
  completedAt?: string
): Promise<Task> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .update({
      status: "completed",
      completed_at: completedAt || new Date().toISOString(),
      is_manual_priority: false, // clears it off the top-3 list once done
    })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to complete task: ${error.message}`);

  // Log an activity event for the friend feed, respecting the owning
  // goal/board's privacy (or the profile default for standalone tasks).
  await logTaskCompletedActivity(ownerId, { id: taskId, goal_id: data.goal_id });

  return data;
}

export async function reopenTask(taskId: string, ownerId: string): Promise<Task> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .update({ status: "open", completed_at: null })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to reopen task: ${error.message}`);
  return data;
}

/**
 * Reschedule a task's calendar slot, incrementing its reschedule_count
 * (drives the redness-gradient UI). Priority #4 wires this up to real
 * Google Calendar slot suggestions; for now this just records the change.
 */
export async function rescheduleTask(
  taskId: string,
  ownerId: string,
  scheduledStart: string,
  scheduledEnd: string,
  googleCalendarEventId?: string
): Promise<Task> {
  const db = supabaseAdmin();
  const { data: current, error: fetchError } = await db
    .from("tasks")
    .select("reschedule_count, is_on_calendar")
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchError) throw new Error(`Failed to load task: ${fetchError.message}`);

  const nextCount = current.is_on_calendar
    ? current.reschedule_count + 1
    : current.reschedule_count;

  const { data, error } = await db
    .from("tasks")
    .update({
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      is_on_calendar: true,
      reschedule_count: nextCount,
      ...(googleCalendarEventId ? { google_calendar_event_id: googleCalendarEventId } : {}),
    })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to reschedule task: ${error.message}`);
  return data;
}

export async function getTask(taskId: string, ownerId: string): Promise<Task | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load task: ${error.message}`);
  return data;
}

/**
 * Open, calendar-scheduled tasks starting within the next `windowMinutes`
 * that haven't gotten a reminder yet — feeds the reschedule-reminder cron
 * route (Priority #9).
 */
export async function listUpcomingTasksNeedingReminder(windowMinutes: number): Promise<Task[]> {
  const db = supabaseAdmin();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("status", "open")
    .eq("is_on_calendar", true)
    .is("reminder_sent_at", null)
    .gte("scheduled_start", now.toISOString())
    .lte("scheduled_start", windowEnd.toISOString());

  if (error) throw new Error(`Failed to list tasks needing reminders: ${error.message}`);
  return data ?? [];
}

export async function markReminderSent(taskId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("tasks")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to mark reminder sent: ${error.message}`);
}
