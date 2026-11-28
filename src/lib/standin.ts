// Hand-off between a tab's stand-in (its loading.tsx) and the real screen that replaces it,
// so the entrance slide plays once, on the stand-in, and the real screen carries on from
// the same point instead of sliding in a second time.
let enterStart = 0;
let swappedAt = 0;

/** The screen-change entrance has just started (ViewTransitionProvider). */
export function markEnterStart() {
  enterStart = performance.now();
}
export function msSinceEnterStart() {
  return Math.max(0, performance.now() - enterStart);
}
/** A stand-in has just been replaced by the real screen. */
export function markStandInSwap() {
  swappedAt = performance.now();
}
/** True once, right after a stand-in was replaced. */
export function takeStandInSwap() {
  const was = swappedAt > 0 && performance.now() - swappedAt < 3000;
  swappedAt = 0;
  return was;
}
