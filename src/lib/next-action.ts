/**
 * A project's next action: the one quest to do next on a board. You can
 * choose it; otherwise:
 *  - most boards: what's past due comes first (the oldest first), then what's
 *    due soonest, then the board's own order;
 *  - courses (owner, Oct 31): the one due next comes first (the soonest
 *    upcoming deadline), then the most recently missed. A chosen step that's
 *    past due gives way to one that's still coming up.
 * Priority views show this one step instead of the whole project, so you
 * focus on what's next rather than everything at once. (Owner wants to keep
 * iterating on this; a per-board choice may come later.)
 */
import { byDuePriority } from "./due-soon";

type T = { id: string; title?: string; board_id?: string | null; due_at?: string | null; sort_order?: number | null; created_at?: string; status?: string; needs_review?: boolean };
type B = { id: string; title?: string | null; next_task_id?: string | null; matrix_state?: string | null };

/** A board that reads like a course: named so, or holding several "Week 3"-style quests. */
export function isCourseBoard(board: B, open: T[]): boolean {
  if (board.title && /\b(course|class|academy|curriculum|module)\b/i.test(board.title)) return true;
  return open.filter((t) => t.title && /\b(week|module|lesson|session|unit)\s*\d+/i.test(t.title)).length >= 3;
}

export function nextActionOf<X extends T>(board: B, tasks: X[]): X | null {
  const open = tasks.filter((t) => t.board_id === board.id && t.status !== "completed" && !t.needs_review);
  if (!open.length) return null;
  const now = Date.now();
  const ms = (t: X) => Date.parse(t.due_at!);
  const dated = open.filter((t) => t.due_at && !Number.isNaN(ms(t)));
  const past = dated.filter((t) => ms(t) < now);
  const coming = dated.filter((t) => ms(t) >= now).sort((a, b) => ms(a) - ms(b));
  const course = isCourseBoard(board, open);
  const chosen = board.next_task_id ? open.find((t) => t.id === board.next_task_id) : undefined;
  if (chosen && !(course && coming[0] && chosen.due_at && ms(chosen) < now)) return chosen;
  if (course) {
    if (coming[0]) return coming[0];
    const recent = [...past].sort((a, b) => ms(b) - ms(a))[0];
    if (recent) return recent;
  } else {
    const oldest = [...past].sort((a, b) => ms(a) - ms(b))[0];
    if (oldest) return oldest;
    const due = dated.sort(byDuePriority(now));
    if (due[0]) return due[0];
  }
  return [...open].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
}

/** Boards treated as projects in priority views: the ones you've put on the matrix. */
export const isProject = (b: B) => !!b.matrix_state;

/** Keep only each project's next action (other quests pass through). */
export function oneStepPerProject<X extends T>(tasks: X[], boards: B[], all: T[] = tasks): X[] {
  const next = new Map<string, string | null>();
  for (const b of boards) if (isProject(b)) next.set(b.id, nextActionOf(b, all)?.id ?? null);
  return tasks.filter((t) => !t.board_id || !next.has(t.board_id) || next.get(t.board_id) === t.id);
}

/** Finishing a dated quest at least two days early earns half its XP again, unless you set its early bonus yourself. */
type EarlyBird = { due_at?: string | null; xp_value: number; early_bonus_xp?: number | null; early_bonus_coins?: number | null; early_bonus_per_day?: number | null };
/** Full days left before it's due (0 on its last day). */
const daysEarly = (due: string, now: number) => Math.max(0, Math.floor((Date.parse(due) - now) / 86_400_000));
export function earlyBirdBonus(t: EarlyBird, now = Date.now()): number {
  if (!t.due_at) return 0;
  // Your own early bonus: paid for finishing any time before it's due, plus any extra for each full day early.
  if (t.early_bonus_xp != null) return Date.parse(t.due_at) > now ? Math.max(0, t.early_bonus_xp) + Math.max(0, t.early_bonus_per_day ?? 0) * daysEarly(t.due_at, now) : 0;
  if (Date.parse(t.due_at) - now < 2 * 86_400_000) return 0;
  return Math.max(5, Math.round(t.xp_value * 0.5));
}

/** Coins for finishing early, with your own early bonus (none with the automatic one). */
export function earlyBirdCoins(t: EarlyBird, now = Date.now()): number {
  if (!t.due_at || t.early_bonus_xp == null || Date.parse(t.due_at) <= now) return 0;
  return Math.max(0, t.early_bonus_coins ?? 0);
}
/** More than a day before it's due: time enough for an early bonus to mean something. */
export function roomToFinishEarly(t: { due_at?: string | null }, now = Date.now()): boolean {
  return !!t.due_at && Date.parse(t.due_at) - now > 86_400_000;
}
