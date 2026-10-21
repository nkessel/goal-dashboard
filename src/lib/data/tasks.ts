import "server-only";
import { attachStepCounts } from "./steps";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logTaskCompletedActivity } from "./activity";
import type { Task } from "./types";


export async function listOpenTasksForOwner(ownerId: string): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .eq("is_aspiration", false)
    // Secret-mission steps stay hidden until sent to Today.
    .or("mission_id.is.null,is_manual_priority.eq.true,in_additional.eq.true")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  const { applyStandIns } = await import("./standins");
  return applyStandIns(ownerId, (data ?? []) as Task[]);
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
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .eq("is_aspiration", false)
    // Secret-mission steps stay hidden until sent to Today.
    .or("mission_id.is.null,is_manual_priority.eq.true,in_additional.eq.true")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  const tasks = (data ?? []) as Task[];

  // Board titles are looked up separately: an embedded boards(...) select is
  // ambiguous to PostgREST because other tables also link tasks and boards.
  const boardIds = [...new Set(tasks.map((t) => t.board_id).filter((id): id is string => !!id))];
  const titles = new Map<string, string>();
  if (boardIds.length > 0) {
    const { data: boards } = await db.from("boards").select("id, title").in("id", boardIds);
    for (const b of boards ?? []) titles.set(b.id as string, b.title as string);
  }
  const { applyStandIns } = await import("./standins");
  return attachStepCounts(
    await applyStandIns(
      ownerId,
      tasks.map((task) => ({
        ...task,
        categoryLabel: task.board_id ? titles.get(task.board_id) ?? null : null,
      }))
    ),
    ownerId
  );
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

export type MatrixState = "unplotted" | "later" | "hidden" | null;

const MATRIX_MIGRATION_MSG = "The matrix lots need a quick database update first.";

/** Where a quest sits on the matrix screen (see migration 0026). */
export async function setTaskMatrixState(taskIds: string[], ownerId: string, state: MatrixState): Promise<void> {
  if (!taskIds.length) return;
  const db = supabaseAdmin();
  const { error } = await db.from("tasks").update({ matrix_state: state }).in("id", taskIds).eq("owner_id", ownerId);
  if (error) throw new Error(/matrix_state/.test(error.message) ? MATRIX_MIGRATION_MSG : `Failed to move quest: ${error.message}`);
}

/** Drop a quest on the map: set the plotted values and take it out of any lot. */
export async function placeTaskOnMatrix(
  taskId: string,
  ownerId: string,
  values: { importance: number; urgency?: number; effort?: number }
): Promise<void> {
  const r = (n: number) => Math.max(0, Math.min(5, Math.round(n * 10) / 10));
  const patch: Record<string, unknown> = { importance: r(values.importance), matrix_state: null };
  if (values.urgency !== undefined) patch.urgency = r(values.urgency);
  if (values.effort !== undefined) patch.effort = r(values.effort);
  const db = supabaseAdmin();
  let { error } = await db.from("tasks").update(patch).eq("id", taskId).eq("owner_id", ownerId);
  if (error && /matrix_state/.test(error.message)) {
    delete patch.matrix_state;
    ({ error } = await db.from("tasks").update(patch).eq("id", taskId).eq("owner_id", ownerId));
  }
  if (error) throw new Error(`Failed to plot quest: ${error.message}`);
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
    /** Undefined leaves the board untouched; null takes it off its board. */
    boardId?: string | null;
    effort?: number;
    /** 0–5 energy it gives back when done. */
    energyGain?: number;
    isAspiration?: boolean;
    /** Undefined leaves these untouched; null clears them. */
    dueAt?: string | null;
    chunkMinutes?: number | null;
    coinValue?: number | null;
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
      ...(input.boardId !== undefined ? { board_id: input.boardId } : {}),
      ...(input.effort !== undefined ? { effort: Math.max(0, Math.min(5, Math.round(input.effort))) } : {}),
      ...(input.energyGain !== undefined ? { energy_gain: Math.max(0, Math.min(5, Math.round(input.energyGain))) } : {}),
      ...(input.isAspiration !== undefined ? { is_aspiration: input.isAspiration } : {}),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}),
      ...(input.chunkMinutes !== undefined ? { chunk_minutes: input.chunkMinutes === null ? null : Math.max(1, Math.round(input.chunkMinutes)) } : {}),
      ...(input.coinValue !== undefined ? { coin_value: input.coinValue === null ? null : Math.max(0, Math.round(input.coinValue)) } : {}),
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
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .eq("is_aspiration", false)
    .or("mission_id.is.null,is_manual_priority.eq.true,in_additional.eq.true")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  const { applyStandIns } = await import("./standins");
  return applyStandIns(ownerId, ((data ?? []) as Task[]).map((t) => ({ ...t, board_id: t.board_id ?? null })));
}

/** A quest board's own quests (open first, then finished). */
export async function listTasksForBoard(boardId: string, ownerId: string): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list board quests: ${error.message}`);
  // Quests that live on another board but are linked here too.
  let linked: Task[] = [];
  const res = await db.from("tasks").select("*").eq("owner_id", ownerId).contains("also_on", [boardId]).neq("board_id", boardId);
  if (!res.error && res.data?.length) {
    const homes = [...new Set((res.data as Task[]).map((t) => t.board_id).filter(Boolean))] as string[];
    const { data: hb } = await db.from("boards").select("id, title").in("id", homes);
    const title = new Map((hb ?? []).map((b) => [b.id as string, b.title as string]));
    linked = (res.data as Task[]).map((t) => ({ ...t, home_board_title: t.board_id ? (title.get(t.board_id) ?? null) : null }));
  }
  return attachStepCounts([...((data ?? []) as Task[]), ...linked], ownerId);
}

/** Queue a quest for a background-painted portrait (see PortraitPainter). */
export async function queuePortrait(taskId: string, ownerId: string, prompt: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("tasks")
    .update({ icon_prompt: prompt.slice(0, 400) })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .is("icon_key", null);
  if (error) throw new Error(`Failed to queue a portrait: ${error.message}`);
}

/** Quests on no board — the stand-in "Uncategorized" board. */
export async function listUnboardedTasks(ownerId: string): Promise<Task[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .is("board_id", null)
    .is("reward_id", null)
    .is("mission_id", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list uncategorized quests: ${error.message}`);
  return attachStepCounts((data ?? []) as Task[], ownerId);
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
    boardId?: string | null;
    effort?: number;
    energyGain?: number;
    color?: string;
    estimateMinutes?: number | null;
    iconKey?: string | null;
    iconSource?: "monster" | "library" | "ai";
    /** Straight into Today's Battle (skips the 3-quest cap — used for reward stacks). */
    isManualPriority?: boolean;
    rewardId?: string | null;
    lockedByTaskId?: string | null;
    isPowerUp?: boolean;
    dueAt?: string | null;
    chunkMinutes?: number | null;
    coinValue?: number | null;
  }
): Promise<Task> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .insert({
      ...(input.isManualPriority ? { is_manual_priority: true } : {}),
      ...(input.rewardId ? { reward_id: input.rewardId } : {}),
      ...(input.lockedByTaskId ? { locked_by_task_id: input.lockedByTaskId } : {}),
      ...(input.isPowerUp ? { is_power_up: true } : {}),
      ...(input.dueAt ? { due_at: input.dueAt } : {}),
      ...(input.chunkMinutes ? { chunk_minutes: Math.max(1, Math.round(input.chunkMinutes)) } : {}),
      ...(input.coinValue != null ? { coin_value: Math.max(0, Math.round(input.coinValue)) } : {}),
      ...(input.iconKey ? { icon_key: input.iconKey, icon_source: input.iconSource ?? "library" } : {}),
      owner_id: ownerId,
      goal_id: input.goalId || null,
      ...(input.boardId ? { board_id: input.boardId } : {}),
      ...(input.effort ? { effort: Math.max(0, Math.min(5, Math.round(input.effort))) } : {}),
      ...(input.energyGain ? { energy_gain: Math.max(0, Math.min(5, Math.round(input.energyGain))) } : {}),
      title: input.title,
      description: input.description || null,
      importance: input.importance ?? 0,
      urgency: input.urgency ?? 0,
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
  // Joining Today's Quests puts it at the bottom of the list.
  let sortOrder: number | undefined;
  if (value) {
    const { data: last } = await db
      .from("tasks")
      .select("sort_order")
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .eq("is_manual_priority", true)
      .neq("id", taskId)
      .order("sort_order", { ascending: false })
      .limit(1);
    sortOrder = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1;
  }

  const { data, error } = await db
    .from("tasks")
    .update({ is_manual_priority: value, ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}) })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update task priority: ${error.message}`);
  return data;
}

/** Put a quest at the very top of Today's Quests, even past the usual three. */
export async function pinToTopOfToday(taskId: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: top } = await db
    .from("tasks")
    .select("sort_order")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("sort_order", { ascending: true })
    .limit(1);
  const first = (top?.[0]?.sort_order as number | undefined) ?? 0;
  const patch: Record<string, unknown> = { is_manual_priority: true, sort_order: first - 1, in_additional: true };
  let { error } = await db.from("tasks").update(patch).eq("id", taskId).eq("owner_id", ownerId);
  if (error && /in_additional/.test(error.message)) {
    delete patch.in_additional;
    ({ error } = await db.from("tasks").update(patch).eq("id", taskId).eq("owner_id", ownerId));
  }
  if (error) throw new Error(`Couldn't add it to today: ${error.message}`);
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
      // When it was recorded (and paid): a quest finished yesterday but logged today counts among today's victories.
      logged_at: new Date().toISOString(),
      is_manual_priority: false, // clears it off the top-3 list once done
    })
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to complete task: ${error.message}`);

  // Log an activity event for the friend feed, respecting the owning
  // goal/board's privacy (or the profile default for standalone tasks).
  await logTaskCompletedActivity(ownerId, { id: taskId, goal_id: data.goal_id, board_id: data.board_id ?? null });

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
  googleCalendarEventId?: string,
  /** False while planning a day: moving a quest around a plan isn't a reschedule. */
  countAsReschedule = true
): Promise<Task> {
  const db = supabaseAdmin();
  const { data: current, error: fetchError } = await db
    .from("tasks")
    .select("reschedule_count, is_on_calendar")
    .eq("id", taskId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchError) throw new Error(`Failed to load task: ${fetchError.message}`);

  const nextCount = current.is_on_calendar && countAsReschedule
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

/** Take a quest back off the calendar; returns its Google event id, if it had one. */
export async function unscheduleTask(taskId: string, ownerId: string): Promise<string | null> {
  const db = supabaseAdmin();
  const { data: current } = await db.from("tasks").select("google_calendar_event_id").eq("id", taskId).eq("owner_id", ownerId).maybeSingle();
  const { error } = await db
    .from("tasks")
    .update({ is_on_calendar: false, scheduled_start: null, scheduled_end: null, google_calendar_event_id: null })
    .eq("id", taskId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to take it off the calendar: ${error.message}`);
  return (current?.google_calendar_event_id as string | null) ?? null;
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

/** The open quest that is this reward itself, if the reward was accepted with one. */
export async function findOpenRewardTask(rewardId: string, ownerId: string): Promise<Task | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("reward_id", rewardId)
    .eq("status", "open")
    .limit(1);
  if (error) return null;
  return (data?.[0] as Task) ?? null;
}

/** Remove a reward's still-open quests (and its open prerequisite) when it's put back. */
export async function deleteOpenRewardTasks(rewardId: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("tasks")
    .select("id, locked_by_task_id")
    .eq("owner_id", ownerId)
    .eq("reward_id", rewardId)
    .eq("status", "open");
  if (error || !data?.length) return;
  const ids = new Set<string>();
  for (const t of data as { id: string; locked_by_task_id: string | null }[]) {
    ids.add(t.id);
    if (t.locked_by_task_id) ids.add(t.locked_by_task_id);
  }
  await db.from("tasks").delete().eq("owner_id", ownerId).eq("status", "open").in("id", Array.from(ids));
}

export async function setPowerUp(taskId: string, ownerId: string, isPowerUp: boolean): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("tasks").update({ is_power_up: isPowerUp }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update power-up: ${error.message}`);
}

/** Power-ups: any quest that takes 15 minutes or less — open ones, plus ones finished since `sinceISO`. */
export const POWER_UP_MAX_MINUTES = 15;
export async function listPowerUps(ownerId: string, sinceISO: string): Promise<{ open: Task[]; done: Task[] }> {
  const db = supabaseAdmin();
  const quick = () =>
    db.from("tasks").select("*").eq("owner_id", ownerId).not("estimate_minutes", "is", null).lte("estimate_minutes", POWER_UP_MAX_MINUTES);
  const [open, done] = await Promise.all([
    quick().eq("status", "open").eq("is_aspiration", false).order("estimate_minutes").order("created_at"),
    quick().eq("status", "completed").gte("completed_at", sinceISO).order("completed_at", { ascending: false }),
  ]);
  if (open.error) return { open: [], done: [] };
  return { open: (open.data ?? []) as Task[], done: (done.data ?? []) as Task[] };
}

export async function countOpenPowerUps(ownerId: string): Promise<number> {
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .not("estimate_minutes", "is", null)
    .lte("estimate_minutes", POWER_UP_MAX_MINUTES)
    .eq("status", "open")
    .eq("is_aspiration", false);
  return error ? 0 : (count ?? 0);
}

/** File a quest on another board (null = no board). */
export async function setTaskBoard(taskId: string, ownerId: string, boardId: string | null): Promise<void> {
  const { error } = await supabaseAdmin().from("tasks").update({ board_id: boardId }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to move the quest: ${error.message}`);
}

/** Whether a quest is listed in Additional Quests (false = only on its board). */
export async function setTaskInAdditional(taskId: string, ownerId: string, value: boolean): Promise<void> {
  const { error } = await supabaseAdmin().from("tasks").update({ in_additional: value }).eq("id", taskId).eq("owner_id", ownerId);
  if (error && /in_additional/.test(error.message)) throw new Error("Taking quests off the Today screen needs a quick database update first.");
  if (error) throw new Error(`Failed to update the quest: ${error.message}`);
}
