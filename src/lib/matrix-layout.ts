import type { TaskWithBoard } from "@/lib/data/tasks";

export type PlottedTask = {
  task: TaskWithBoard;
  xPct: number; // urgency axis, 0-100
  yPct: number; // importance axis, 0-100 (0 = bottom)
};

/**
 * Maps each task's (importance, urgency) — both 0-5 — onto a 10%-90% plot
 * area, jittering tasks that land in the same cell so they don't fully
 * overlap. Deterministic (no randomness) so re-renders don't jump around.
 */
export function computeMatrixLayout(tasks: TaskWithBoard[]): PlottedTask[] {
  const groups = new Map<string, TaskWithBoard[]>();
  for (const task of tasks) {
    const key = `${task.importance}-${task.urgency}`;
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }

  const plotted: PlottedTask[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id)); // stable order
    const n = group.length;
    group.forEach((task, i) => {
      const baseX = 10 + (task.urgency / 5) * 80;
      const baseY = 10 + (task.importance / 5) * 80;
      // Spread same-cell points along a short horizontal line, centered.
      const spacing = 4; // percentage points
      const jitter = (i - (n - 1) / 2) * spacing;
      plotted.push({
        task,
        xPct: clamp(baseX + jitter, 4, 96),
        yPct: clamp(baseY, 4, 96),
      });
    });
  }
  return plotted;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
