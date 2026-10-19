/** Smooth trail curves shared by the mountain path and the quest map. */

export type Pt = { x: number; y: number };

/**
 * A smooth curve through points as cubic Béziers. At each point the trail
 * runs along the line between its neighbours, with enough momentum that a
 * turn becomes a round hairpin (as switchbacks are) instead of a sharp
 * corner, however close the points sit. No loops: the pull at each point is
 * capped by the stretches on either side.
 */
export function bezierPieces(pts: Pt[]): [Pt, Pt, Pt, Pt][] {
  const n = pts.length;
  const out: [Pt, Pt, Pt, Pt][] = [];
  if (n < 2) return out;
  const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  const tan: Pt[] = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const before = i > 0 ? len(pts[i - 1], p) : Infinity;
    const after = i < n - 1 ? len(p, pts[i + 1]) : Infinity;
    const near = Math.min(before, after);
    // Ends: carry straight on. Turns: momentum from the shorter neighbouring stretch.
    const mag = i === 0 || i === n - 1 ? near : Math.max(d / 2, near * 0.8);
    return { x: (dx / d) * mag, y: (dy / d) * mag };
  });
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    out.push([p1, { x: p1.x + tan[i].x / 3, y: p1.y + tan[i].y / 3 }, { x: p2.x - tan[i + 1].x / 3, y: p2.y - tan[i + 1].y / 3 }, p2]);
  }
  return out;
}

/** Points along a smooth curve, spaced by a gap that may vary with height. */
export function sampleCurve(pts: Pt[], gapAt: (y: number) => number) {
  const out: Pt[] = [];
  if (pts.length < 2) return out;
  let carry = 0;
  for (const [p1, c1, c2, p2] of bezierPieces(pts)) {
    let prev = p1;
    for (let k = 1; k <= 40; k++) {
      const t = k / 40;
      const u = 1 - t;
      const q = {
        x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
        y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
      };
      carry += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
      if (carry >= gapAt(q.y)) {
        out.push(q);
        carry = 0;
      }
    }
  }
  return out;
}

/** A smooth curve through points, split per segment (each can have its own width). */
export function segments(pts: Pt[]) {
  if (pts.length < 2) return [];
  const f = (v: number) => v.toFixed(1);
  return bezierPieces(pts).map(([p1, c1, c2, p2]) => `M${f(p1.x)} ${f(p1.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`);
}

