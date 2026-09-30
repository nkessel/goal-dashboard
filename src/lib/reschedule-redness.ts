/**
 * Reschedule count -> a subtle-to-intense red background tint.
 * Spec: "subtle red tint at 1 reschedule, scaling to fully intense red at
 * 8+ reschedules". Returns undefined at 0 (no tint, task's own color wins).
 */
export function rescheduleRedness(count: number): string | undefined {
  if (count <= 0) return undefined;
  const intensity = Math.min(count, 8) / 8; // 0.125 .. 1
  const alpha = 0.08 + intensity * 0.42; // 0.125 -> ~0.13, 8+ -> 0.5
  return `rgba(220, 38, 38, ${alpha.toFixed(2)})`;
}
