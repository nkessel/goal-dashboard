/**
 * Reschedule count -> a subtle-to-intense red background tint.
 * Reddens gradually: a faint tint at 1 reschedule, fully red at 12+ (half
 * again as slow as the first 8-step ramp). A deep brick red rather than a
 * bright one, so over parchment it reads as red, not pink. Returns undefined
 * at 0 (no tint, task's own color wins).
 */
export function rescheduleRedness(count: number): string | undefined {
  if (count <= 0) return undefined;
  const intensity = Math.min(count, 12) / 12; // ~0.08 .. 1
  const alpha = 0.08 + intensity * 0.47; // 1 -> ~0.12, 12+ -> 0.55
  return `rgba(168, 22, 18, ${alpha.toFixed(2)})`;
}
