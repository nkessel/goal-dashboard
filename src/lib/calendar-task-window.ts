import type { Task } from "@/lib/data/types";

/**
 * Where a quest sits on the calendar: its scheduled slot, or (unscheduled)
 * half an hour at its completion time. Shared by server and client views.
 */
export function getTaskDisplayWindow(task: Task): { start: Date; end: Date } {
  if (task.scheduled_start && task.scheduled_end) {
    return { start: new Date(task.scheduled_start), end: new Date(task.scheduled_end) };
  }
  const completed = task.completed_at ? new Date(task.completed_at) : new Date();
  return { start: completed, end: new Date(completed.getTime() + 30 * 60_000) };
}
