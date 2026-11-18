// UI check, snapshot mode only: the same "now" and the same random numbers in every run,
// so two runs on the same code draw the same page (S1, split plan).
//
// Loaded into the check's own process (run.mjs) and, through NODE_OPTIONS=--require, into
// `next start`. Does nothing unless UI_CHECK_CLOCK_AT is set.
//   UI_CHECK_CLOCK_AT     the fixed "now" (ms since 1970). Date.now() and new Date() always
//                         return it: a clock that moved on would put the calendar's now-line,
//                         "in 2 hours" and seeded due times a minute apart between two runs.
//                         Timers (setTimeout, performance.now) still run normally.
//   UI_CHECK_SEED         seed for Math.random (default 1).
"use strict";
const at = Number(process.env.UI_CHECK_CLOCK_AT);
if (process.env.UI_CHECK_CLOCK_AT && Number.isFinite(at) && !globalThis.__uiCheckFrozen) {
  globalThis.__uiCheckFrozen = true;
  const Real = Date;
  const now = () => at;
  function FrozenDate(...a) {
    if (!new.target) return new Real(now()).toString();
    return a.length ? new Real(...a) : new Real(now());
  }
  FrozenDate.prototype = Real.prototype;
  FrozenDate.now = now;
  FrozenDate.parse = Real.parse;
  FrozenDate.UTC = Real.UTC;
  Object.defineProperty(Real.prototype, "constructor", { value: FrozenDate, writable: true, configurable: true });
  globalThis.Date = FrozenDate;

  let s = Number(process.env.UI_CHECK_SEED || 1) >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
