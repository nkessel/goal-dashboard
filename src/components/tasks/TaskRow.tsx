import type { Task } from "@/lib/data/types";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { TaskActions } from "./TaskActions";
import { TaskScheduleControl } from "./TaskScheduleControl";
import { IconPicker } from "./IconPicker";
import { MONSTER_ICONS } from "@/lib/monster-icons";

export function TaskRow({ task, theme = "calm" }: { task: Task; theme?: "calm" | "adventure" }) {
  const tint = rescheduleRedness(task.reschedule_count);
  const isAdventure = theme === "adventure";
  const monsterEmoji =
    task.icon_key &&
    (task.icon_source === "monster"
      ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji
      : task.icon_key);

  return (
    <li
      className={`flex flex-col gap-2 rounded-xl border p-3 transition-transform ${
        isAdventure
          ? "border-amber-200 hover:scale-[1.01] dark:border-red-950"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
      style={{ backgroundColor: tint ?? task.color ?? undefined }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {isAdventure && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl leading-none">{monsterEmoji || "❔"}</span>
              <IconPicker taskId={task.id} currentIcon={task.icon_key} currentSource={task.icon_source} />
            </div>
          )}
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
              {task.is_on_calendar && task.scheduled_start && (
                <span>
                  📅{" "}
                  {new Date(task.scheduled_start).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <TaskActions task={task} theme={theme} />
        </div>
      </div>

      <TaskScheduleControl task={task} />
    </li>
  );
}
