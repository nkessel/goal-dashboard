/**
 * Habits that repeat on an interval (every week, every 3 months, every year…)
 * rather than on chosen weekdays. Each occurrence comes up on its day and
 * stays up until it's done or skipped, or until the next one comes round.
 */
export type RepeatUnit = "day" | "week" | "month" | "year";
export type Repeat = { every: number; unit: RepeatUnit; from: string };

const DAY = 86_400_000;
const parse = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

/** A clean repeat, or null. */
export function cleanRepeat(raw: unknown): Repeat | null {
  const r = (raw ?? null) as Partial<Repeat> | null;
  if (!r || typeof r !== "object") return null;
  const every = Math.round(Number(r.every));
  if (!Number.isFinite(every) || every < 1 || every > 999) return null;
  if (!["day", "week", "month", "year"].includes(r.unit as string)) return null;
  if (typeof r.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.from)) return null;
  return { every, unit: r.unit as RepeatUnit, from: r.from };
}

/** The date `n` periods after the start (months clamp to the month's last day). */
function nth(r: Repeat, n: number): string {
  const start = parse(r.from);
  if (r.unit === "day" || r.unit === "week") return fmt(start + n * r.every * (r.unit === "week" ? 7 : 1) * DAY);
  const d = new Date(start);
  const months = n * r.every * (r.unit === "year" ? 12 : 1);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}

/** The latest occurrence on or before `day` (null before it starts). */
export function occurrenceOn(r: Repeat, day: string): string | null {
  if (day < r.from) return null;
  // Estimate, then step to the exact one.
  const t = parse(day) - parse(r.from);
  const span = r.unit === "day" ? r.every * DAY : r.unit === "week" ? r.every * 7 * DAY : r.unit === "month" ? r.every * 30.44 * DAY : r.every * 365.25 * DAY;
  let n = Math.max(0, Math.floor(t / span) - 1);
  while (nth(r, n + 1) <= day) n++;
  while (n > 0 && nth(r, n) > day) n--;
  return nth(r, n);
}

/** The next occurrence after `day`. */
export function nextOccurrence(r: Repeat, day: string): string {
  const cur = occurrenceOn(r, day);
  if (!cur) return r.from;
  let n = 0;
  while (nth(r, n) <= cur) n++;
  return nth(r, n);
}

/**
 * Is it up today? Yes from its occurrence until it's done or skipped (and
 * still shown, ticked, on the day it was done).
 */
export function repeatIsUp(r: Repeat, day: string, done: string[], skipped: string[]): boolean {
  const occ = occurrenceOn(r, day);
  if (!occ) return false;
  if (done.includes(day)) return true;
  return !done.some((d) => d >= occ && d <= day) && !skipped.some((d) => d >= occ && d <= day);
}

export function repeatLabel(r: Repeat): string {
  const unit = r.every === 1 ? r.unit : `${r.unit}s`;
  if (r.every === 1) return r.unit === "day" ? "Every day" : `Every ${unit}`;
  return `Every ${r.every} ${unit}`;
}
