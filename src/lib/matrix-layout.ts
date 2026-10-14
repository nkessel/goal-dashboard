import type { TaskWithBoard } from "@/lib/data/tasks";

export type PlottedTask = {
  task: TaskWithBoard;
  xPct: number; // importance axis, 0-100 (0 = left)
  yPct: number; // urgency axis, 0-100 (0 = bottom)
};

/**
 * Maps each task's (importance, urgency) — both 0-5 — onto a 10%-90% plot
 * area (importance along X, urgency along Y), jittering tasks that land in the same cell so they don't fully
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
    // Spread same-cell points along short rows (at most 6 to a row), centered,
    // stacking extra rows upward so a crowd never runs off the map.
    const perRow = 6;
    const rows = Math.ceil(n / perRow);
    group.forEach((task, i) => {
      const baseX = 10 + (task.importance / 5) * 80;
      const baseY = 10 + (task.urgency / 5) * 80;
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const col = i % perRow;
      const spacing = 4.5; // percentage points
      const jitter = (col - (inRow - 1) / 2) * spacing;
      const lift = (row - (rows - 1) / 2) * 6 * (baseY > 50 ? -1 : 1);
      plotted.push({
        task,
        xPct: clamp(baseX + jitter, 7, 93),
        yPct: clamp(baseY + lift, 7, 93),
      });
    });
  }
  return plotted;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
