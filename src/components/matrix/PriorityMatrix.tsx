import type { TaskWithBoard } from "@/lib/data/tasks";
import { computeMatrixLayout } from "@/lib/matrix-layout";
import { rescheduleRedness } from "@/lib/reschedule-redness";

const GRID_LINES = [20, 40, 60, 80];

export function PriorityMatrix({ tasks }: { tasks: TaskWithBoard[] }) {
  const plotted = computeMatrixLayout(tasks);

  return (
    <div className="flex gap-2">
      {/* Y axis label */}
      <div className="flex w-6 shrink-0 items-center justify-center">
        <span className="-rotate-90 whitespace-nowrap text-xs font-medium text-zinc-500">
          Importance →
        </span>
      </div>

      <div className="flex-1">
        <div className="relative aspect-square w-full rounded-xl border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
          {/* Grid lines */}
          {GRID_LINES.map((pct) => (
            <div
              key={`h-${pct}`}
              className="absolute left-0 right-0 border-t border-dashed border-zinc-200 dark:border-zinc-800"
              style={{ bottom: `${pct}%` }}
            />
          ))}
          {GRID_LINES.map((pct) => (
            <div
              key={`v-${pct}`}
              className="absolute bottom-0 top-0 border-l border-dashed border-zinc-200 dark:border-zinc-800"
              style={{ left: `${pct}%` }}
            />
          ))}

          {/* Quadrant labels */}
          <span className="absolute right-2 top-2 text-[10px] uppercase tracking-wide text-zinc-400">
            Do first
          </span>
          <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-wide text-zinc-400">
            Quick wins
          </span>
          <span className="absolute left-2 top-2 text-[10px] uppercase tracking-wide text-zinc-400">
            Schedule
          </span>
          <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wide text-zinc-400">
            Reconsider
          </span>

          {/* Points */}
          {plotted.map(({ task, xPct, yPct }) => {
            const tint = rescheduleRedness(task.reschedule_count);
            return (
              <div
                key={task.id}
                className="group absolute -translate-x-1/2 translate-y-1/2"
                style={{ left: `${xPct}%`, bottom: `${yPct}%` }}
              >
                <div
                  className="h-3.5 w-3.5 cursor-default rounded-full border-2 border-white shadow dark:border-zinc-950"
                  style={{ backgroundColor: tint ?? task.color ?? "#4f46e5" }}
                />
                <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 hidden w-48 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow-lg group-hover:block dark:border-zinc-700 dark:bg-zinc-900">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="mt-0.5 text-zinc-500">{task.description}</p>
                  )}
                  <p className="mt-1 text-zinc-400">
                    Importance {task.importance} · Urgency {task.urgency}
                    {task.xp_value > 0 && ` · ${task.xp_value} XP`}
                  </p>
                </div>
              </div>
            );
          })}

          {plotted.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
              No open tasks to plot yet.
            </p>
          )}
        </div>

        <div className="mt-1 flex justify-between text-xs text-zinc-500">
          <span>1</span>
          <span>Urgency →</span>
          <span>5</span>
        </div>
      </div>
    </div>
  );
}
