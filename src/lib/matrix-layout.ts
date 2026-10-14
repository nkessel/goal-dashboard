export type MatrixPoint<T> = {
  item: T;
  key: string;
  /** Horizontal value, 0–5. */
  x: number;
  /** Vertical value, 0–5. */
  y: number;
};

export type Plotted<T> = {
  item: T;
  key: string;
  xPct: number; // 0-100 (0 = left)
  yPct: number; // 0-100 (0 = bottom)
};

/**
 * Maps each point's two 0–5 values onto a 10%-90% plot area, spreading
 * points that land in the same cell so they don't fully overlap.
 * Deterministic (no randomness) so re-renders don't jump around.
 */
export function layoutMatrix<T>(points: MatrixPoint<T>[]): Plotted<T>[] {
  const groups = new Map<string, MatrixPoint<T>[]>();
  for (const p of points) {
    const k = `${p.x}-${p.y}`;
    const g = groups.get(k);
    if (g) g.push(p);
    else groups.set(k, [p]);
  }

  const plotted: Plotted<T>[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.key.localeCompare(b.key)); // stable order
    const n = group.length;
    // Short rows (at most 6), centered; extra rows stack away from the edge
    // so a crowd never runs off the map.
    const perRow = 6;
    const rows = Math.ceil(n / perRow);
    group.forEach((p, i) => {
      const baseX = 10 + (p.x / 5) * 80;
      const baseY = 10 + (p.y / 5) * 80;
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const col = i % perRow;
      const jitter = (col - (inRow - 1) / 2) * 4.5;
      const lift = (row - (rows - 1) / 2) * 6 * (baseY > 50 ? -1 : 1);
      plotted.push({ item: p.item, key: p.key, xPct: clamp(baseX + jitter, 7, 93), yPct: clamp(baseY + lift, 7, 93) });
    });
  }
  return plotted;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
