/**
 * How soon a quest needs a time (owner, Nov 6: "segment the rest of the list based on how soon it
 * needs to be scheduled: this week, next week, in 2 weeks … in 1 month, in 2 months"). A quest's
 * date is its plan-by (the label you gave it when importing or by dragging it into a group),
 * else its due date. Weeks run Monday to Sunday, in local time.
 */

export type HorizonKey = "w0" | "w1" | "w2" | "w3" | "w4" | "m2" | "m3" | "later" | "none";

export const HORIZON_LABELS: Record<HorizonKey, string> = {
  w0: "This week",
  w1: "Next week",
  w2: "In 2 weeks",
  w3: "In 3 weeks",
  w4: "In 4 weeks",
  m2: "In 1–2 months",
  m3: "In 2–3 months",
  later: "Later",
  none: "No date yet",
};

export const HORIZON_ORDER: HorizonKey[] = ["w0", "w1", "w2", "w3", "w4", "m2", "m3", "later", "none"];

function endOfWeek(now: Date, plusWeeks: number): Date {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  const toSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + toSunday + plusWeeks * 7);
  return d;
}
function plusMonths(now: Date, n: number): Date {
  const d = new Date(now);
  d.setHours(23, 59, 0, 0);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** The last moment each group covers (Later and No date have none). */
export function horizonEnds(now = new Date()): Partial<Record<HorizonKey, Date>> {
  return { w0: endOfWeek(now, 0), w1: endOfWeek(now, 1), w2: endOfWeek(now, 2), w3: endOfWeek(now, 3), w4: endOfWeek(now, 4), m2: plusMonths(now, 2), m3: plusMonths(now, 3) };
}

/** The date a quest is grouped by: its plan-by when you set one, else its due date. */
export function horizonDate(t: { plan_by?: string | null; due_at?: string | null }): number | null {
  const v = t.plan_by || t.due_at;
  const ms = v ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Which group a quest falls in. Past dates count as this week. */
export function horizonOf(t: { plan_by?: string | null; due_at?: string | null }, now = new Date()): HorizonKey {
  const ms = horizonDate(t);
  if (ms === null) return "none";
  const ends = horizonEnds(now);
  for (const k of ["w0", "w1", "w2", "w3", "w4", "m2", "m3"] as const) if (ms <= ends[k]!.getTime()) return k;
  return "later";
}

/** The plan-by a quest gets when it's put in a group (null: no date). */
export function planByFor(key: HorizonKey, now = new Date()): string | null {
  if (key === "none") return null;
  if (key === "later") return plusMonths(now, 6).toISOString();
  return horizonEnds(now)[key]!.toISOString();
}

/** Quick picks when sorting imports (owner, Nov 6: "This week, next week, within 2 weeks, one month, custom"): days from today. */
export function quickPlanDays(now = new Date()): { label: string; days: number }[] {
  const toSunday = (7 - now.getDay()) % 7;
  return [
    { label: "This week", days: toSunday },
    { label: "Next week", days: toSunday + 7 },
    { label: "Within 2 weeks", days: 14 },
    { label: "One month", days: 30 },
  ];
}
