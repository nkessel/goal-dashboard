import type { Task } from "@/lib/data/types";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { TaskActions } from "./TaskActions";

export function TaskRow({ task }: { task: Task }) {
  const tint = rescheduleRedness(task.reschedule_count);

  return (
    <li
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between"
      style={{ backgroundColor: tint ?? task.color ?? undefined }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
          {task.title}
        </p>
        {task.description && (
          <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
            {task.description}
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
          <span>Importance {task.importance}</span>
          <span>Urgency {task.urgency}</span>
          {task.xp_value > 0 && <span>{task.xp_value} XP</span>}
          {task.reschedule_count > 0 && (
            <span>Rescheduled {task.reschedule_count}×</span>
          )}
        </div>
      </div>

      <TaskActions task={task} />
    </li>
  );
}
