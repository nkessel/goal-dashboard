/**
 * What "due soon" means everywhere: the quests due next come first (soonest
 * first), and the ones already past due go to the back (most recently missed
 * first). Due soon on Today reaches as far ahead as you choose (24 hrs to a
 * custom number of days), plus anything missed this past week.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How far back a missed quest still shows in Due soon. */
export const MISSED_DAYS = 7;

/** The ready-made reaches for Due soon, in hours. */
export const DUE_WINDOWS = [24, 48, 72, 120, 168];
export const DEFAULT_DUE_HOURS = 72;
export const MAX_DUE_DAYS = 365;

/** Due soon's reach lives in a cookie, so the server can fill Today with it. */
export const DUE_HOURS_COOKIE = "due-soon-hours";

/** A cookie value (or anything else) as a reach in hours, kept sensible. */
export function parseDueHours(v: string | number | null | undefined): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DUE_HOURS;
  return Math.min(n, MAX_DUE_DAYS * 24);
}

/** "24 hrs", "48 hrs", "3 days", "10 days"… */
export function dueWindowLabel(hours: number): string {
  if (hours < 72 || hours % 24) return `${hours} hrs`;
  return `${hours / 24} days`;
}

/** Read the reach in the browser (Due soon's own choice). */
export function readDueHours(): number {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${DUE_HOURS_COOKIE}=(\\d+)`));
    return parseDueHours(m?.[1]);
  } catch {
    return DEFAULT_DUE_HOURS;
  }
}

export function saveDueHours(hours: number) {
  try {
    document.cookie = `${DUE_HOURS_COOKIE}=${parseDueHours(hours)}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

/** Due within the next `hours`, or missed this past week. */
export function inDueWindow(dueAt: string | null | undefined, now: number, hours = DEFAULT_DUE_HOURS): boolean {
  if (!dueAt) return false;
  const ms = Date.parse(dueAt);
  if (Number.isNaN(ms)) return false;
  return ms > now - MISSED_DAYS * DAY && ms <= now + hours * HOUR;
}

/**
 * Sort by due date the way priorities go: what's due next first, past due
 * last. Quests without a date keep their place after both.
 */
export function byDuePriority(now: number) {
  return (a: { due_at?: string | null }, b: { due_at?: string | null }) => {
    const x = a.due_at ? Date.parse(a.due_at) : NaN;
    const y = b.due_at ? Date.parse(b.due_at) : NaN;
    const rank = (ms: number) => (Number.isNaN(ms) ? 2 : ms < now ? 1 : 0);
    const r = rank(x) - rank(y);
    if (r) return r;
    if (Number.isNaN(x)) return 0;
    return rank(x) === 0 ? x - y : y - x;
  };
}
