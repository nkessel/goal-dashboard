/**
 * Getting up to date on coursework, in the order that keeps you afloat:
 *   1. what's coming up soon (get ahead of it, soonest first),
 *   2. then what was missed, from the beginning,
 *   3. then what's further out, and anything without a date.
 * Pure and time-zone local (it runs in the browser).
 */

export type CourseItem = {
  id: string;
  title: string;
  due_at: string | null;
  estimate_minutes: number | null;
  board: string | null;
  board_id: string | null;
  /** Imported (from a syllabus, say) and not yet sorted. */
  needs_review?: boolean;
};

export type CatchUp<T extends CourseItem = CourseItem> = { ahead: T[]; behind: T[]; later: T[]; undated: T[] };

/** How far ahead "coming up" reaches. */
export const AHEAD_DAYS = 14;

export function catchUpPlan<T extends CourseItem>(items: T[], now = new Date(), aheadDays = AHEAD_DAYS): CatchUp<T> {
  const t = now.getTime();
  const horizon = t + aheadDays * 86_400_000;
  const byDue = (a: T, b: T) => Date.parse(a.due_at!) - Date.parse(b.due_at!);
  const dated = items.filter((i) => i.due_at && !Number.isNaN(Date.parse(i.due_at)));
  return {
    ahead: dated.filter((i) => Date.parse(i.due_at!) >= t && Date.parse(i.due_at!) <= horizon).sort(byDue),
    behind: dated.filter((i) => Date.parse(i.due_at!) < t).sort(byDue),
    later: dated.filter((i) => Date.parse(i.due_at!) > horizon).sort(byDue),
    undated: items.filter((i) => !i.due_at || Number.isNaN(Date.parse(i.due_at))),
  };
}

export function catchUpOrder<T extends CourseItem>(plan: CatchUp<T>): T[] {
  return [...plan.ahead, ...plan.behind, ...plan.later, ...plan.undated];
}

/**
 * "Next" in a course: the one due next (the soonest upcoming due date, however
 * far off), then the most recently missed, then undated ones.
 */
export function dueNextOrder<T extends CourseItem>(items: T[], now = new Date()): T[] {
  const t = now.getTime();
  const ms = (i: T) => (i.due_at ? Date.parse(i.due_at) : NaN);
  const dated = items.filter((i) => !Number.isNaN(ms(i)));
  return [
    ...dated.filter((i) => ms(i) >= t).sort((a, b) => ms(a) - ms(b)),
    ...dated.filter((i) => ms(i) < t).sort((a, b) => ms(b) - ms(a)),
    ...items.filter((i) => Number.isNaN(ms(i))),
  ];
}

/** A board looks like a course when it holds several dated quests. */
export function looksLikeCourse(dated: number) {
  return dated >= 3;
}
