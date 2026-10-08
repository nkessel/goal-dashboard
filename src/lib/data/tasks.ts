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
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  return data ?? [];
}

export type TaskWithCategory = Task & {
  /** The title of the board the task's goal belongs to — the "category
   * pill" on the quest/task card (HANDOFF.md §4). Null for a standalone
   * task with no goal. */
  categoryLabel: string | null;
};

/**
 * Same as listOpenTasksForOwner, but also resolves each task's category
 * pill: the title of the board its goal lives on (task -> goal -> board).
 * Used on the Today view, where tasks from many different boards sit in
 * one list, so each card needs to say which board it came from.
 */
export async function listOpenTasksForOwnerWithCategory(ownerId: string): Promise<TaskWithCategory[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*, goals(boards(title))")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);

  return (data ?? []).map((row) => {
    const { goals, ...task } = row as Task & {
      goals: { boards: { title: string } | null } | null;
    };
    return { ...task, categoryLabel: goals?.boards?.title ?? null };
  });
}

/**
 * Persists a new drag-and-drop order for a set of the owner's open tasks
 * (the Today view's pinned-priority list and "other tasks" list reorder
 * independently, so each calls this with just its own ids). Scoped by
 * owner_id as a safety check.
 */
export async function updateTaskOrder(ownerId: string, orderedIds: string[]): Promise<void> {
  const db = supabaseAdmin();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("tasks").update({ sort_order: index }).eq("id", id).eq("owner_id", ownerId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Failed to reorder tasks: ${failed.error.message}`);
}

/**
 * Sets a task's importance/urgency directly (1-5 each, one decimal place)
 * — used by the draggable Priority Matrix, where dropping a task's dot at
 * a new position maps back to a quadrant coordinate.
 */
export async function updateTaskPriority(
  taskId: string,
  ownerId: string,
  input: { importance: number; urgency: number }
): Promise<Task> {
  const importance = Math.max(0, Math.min(5, Math.round(input.importance * 10) / 10));
  const urgency = Math.max(0, Math.min(5, Math.round(input.urgency * 10) / 10));
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .update({ importance, urgency })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update task priority: ${error.message}`);
  return data;
}

/**
 * Full edit of a task's own fields (title/description/importance/urgency/xp)
 * — used by the click-to-edit dialog on a quest card. Does not touch status,
 * scheduling, or icon fields; those have their own dedicated flows.
 */
export async function updateTask(
  taskId: string,
  ownerId: string,
  input: {
    title: string;
    description: string | null;
    importance: number;
    urgency: number;
    xpValue: number;
    /** Undefined leaves the existing estimate untouched; null clears it. */
    estimateMinutes?: number | null;
    /** Undefined leaves the goal untouched; null detaches it. */
    goalId?: string | null;
  }
): Promise<Task> {
  const importance = Math.max(0, Math.min(5, Math.round(input.importance * 10) / 10));
  const urgency = Math.max(0, Math.min(5, Math.round(input.urgency * 10) / 10));
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .update({
      title: input.title,
      description: input.description,
      importance,
      urgency,
      xp_value: Math.max(0, Math.round(input.xpValue)),
      ...(input.estimateMinutes !== undefined
        ? { estimate_minutes: input.estimateMinutes === null ? null : Math.max(0, Math.round(input.estimateMinutes)) }
        : {}),
      ...(input.goalId !== undefined ? { goal_id: input.goalId } : {}),
    })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return data;
}

export async function deleteTask(taskId: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("tasks").delete().eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to delete task: ${error.message}`);
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

/**
 * Lifetime count of completed tasks — the "Quests Complete" stat on the
 * Today's Quest header. All-time, unlike listCompletedTasksForOwner's
 * recent/limited list (used for the "Victories Today" section).
 */
export async function countCompletedTasksForOwner(ownerId: string): Promise<number> {
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "completed");

  if (error) throw new Error(`Failed to count completed tasks: ${error.message}`);
  return count ?? 0;
}

export async function setTaskIcon(
  taskId: string,
  ownerId: string,
  input: { iconKey: string | null; iconSource: "monster" | "library" | "ai" }
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("tasks")
    .update({ icon_key: input.iconKey, icon_source: input.iconSource })
    .eq("id", taskId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update task icon: ${error.message}`);
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
    estimateMinutes?: number | null;
    iconKey?: string | null;
    iconSource?: "monster" | "library" | "ai";
  }
): Promise<Task> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .insert({
      ...(input.iconKey ? { icon_key: input.iconKey, icon_source: input.iconSource ?? "library" } : {}),
      owner_id: ownerId,
      goal_id: input.goalId || null,
      title: input.title,
      description: input.description || null,
      importance: input.importance ?? 3,
      urgency: input.urgency ?? 3,
      xp_value: input.xpValue ?? 0,
      color: input.color || null,
      estimate_minutes:
        input.estimateMinutes === undefined || input.estimateMinutes === null
          ? null
          : Math.max(0, Math.round(input.estimateMinutes)),
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

/** Records quest progress and XP already paid out (needs migration 0014). */
export async function setTaskPayout(
  taskId: string,
  ownerId: string,
  input: { progress?: number; xpAwarded?: number }
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("tasks")
    .update({
      ...(input.progress !== undefined ? { progress: Math.max(0, Math.min(100, Math.round(input.progress))) } : {}),
      ...(input.xpAwarded !== undefined ? { xp_awarded: Math.max(0, Math.round(input.xpAwarded)) } : {}),
    })
    .eq("id", taskId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to save quest progress: ${error.message}`);
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

/**
 * Tasks to show on the Calendar view for a given date range: anything
 * scheduled onto the calendar whose [scheduled_start, scheduled_end) window
 * overlaps the range, plus anything completed within the range (even if it
 * was never pulled onto the calendar) — per spec, completed tasks show
 * inline "at their scheduled (or completed) time". De-duped by id since a
 * task can satisfy both conditions.
 */
export async function listCalendarTasksForOwner(
  ownerId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<Task[]> {
  const db = supabaseAdmin();
  const startIso = rangeStart.toISOString();
  const endIso = rangeEnd.toISOString();

  const [scheduledRes, completedRes] = await Promise.all([
    db
      .from("tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("is_on_calendar", true)
      .lt("scheduled_start", endIso)
      .gt("scheduled_end", startIso),
    db
      .from("tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("status", "completed")
      .gte("completed_at", startIso)
      .lt("completed_at", endIso),
  ]);

  if (scheduledRes.error) throw new Error(`Failed to list scheduled tasks: ${scheduledRes.error.message}`);
  if (completedRes.error) throw new Error(`Failed to list completed tasks: ${completedRes.error.message}`);

  const byId = new Map<string, Task>();
  for (const t of scheduledRes.data ?? []) byId.set(t.id, t);
  for (const t of completedRes.data ?? []) byId.set(t.id, t);
  return [...byId.values()];
}

export async function markReminderSent(taskId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("tasks")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to mark reminder sent: ${error.message}`);
}

export async function setTaskGrantsReward(taskId: string, ownerId: string, grantsReward: boolean): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("tasks").update({ grants_reward: grantsReward }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update quest: ${error.message}`);
}
