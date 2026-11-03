import type { Task } from "@/lib/data/types";

/**
 * Where a quest sits on the calendar: its scheduled slot; a mini-quest with a
 * time, at that time for its length (15 minutes if it has none); or, once done,
 * half an hour at its completion time. Shared by server and client views.
 */
export function getTaskDisplayWindow(task: Task): { start: Date; end: Date } {
  if (task.scheduled_start && task.scheduled_end) {
    return { start: new Date(task.scheduled_start), end: new Date(task.scheduled_end) };
  }
  const timed = timedMiniQuest(task);
  if (timed) return timed;
  const completed = task.completed_at ? new Date(task.completed_at) : new Date();
  return { start: completed, end: new Date(completed.getTime() + 30 * 60_000) };
}

/** A mini-quest due at a real time of day (not "by the end of the day"), as a slot on the calendar. */
export function timedMiniQuest(task: Task): { start: Date; end: Date } | null {
  if (!task.is_tiny || task.status === "completed" || !task.due_at || task.scheduled_start) return null;
  const start = new Date(task.due_at);
  const m = start.getHours() * 60 + start.getMinutes();
  if (m === 0 || m >= 23 * 60 + 59) return null;
  return { start, end: new Date(start.getTime() + Math.max(5, task.estimate_minutes ?? 15) * 60_000) };
}

/** Does this quest belong on the calendar grid at all? (An open mini-quest with only an end-of-day deadline doesn't.) */
export function showsOnCalendar(task: Task): boolean {
  if (task.scheduled_start && task.scheduled_end) return true;
  if (task.status === "completed") return true;
  return timedMiniQuest(task) !== null;
}
