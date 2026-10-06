/**
 * Shared (client + server) helpers for flexible tasks: floating "do by"
 * windows, place/context tags for batching errands, gap fillers and daily
 * upkeep. Pure functions only — no data access — so client components can
 * import this directly.
 */
import type { Task, TaskContext } from "@/lib/data/types";

export const CONTEXT_OPTIONS: {
  key: TaskContext;
  emoji: string;
  calmLabel: string;
  adventureLabel: string;
}[] = [
  { key: "out", emoji: "🚗", calmLabel: "Out & about", adventureLabel: "On the road" },
  { key: "home", emoji: "🏠", calmLabel: "At home", adventureLabel: "At the keep" },
  { key: "computer", emoji: "💻", calmLabel: "At a computer", adventureLabel: "At the scrying desk" },
  { key: "phone", emoji: "📱", calmLabel: "On the phone", adventureLabel: "Sending ravens" },
];

export function contextLabel(key: TaskContext, isAdventure: boolean) {
  const opt = CONTEXT_OPTIONS.find((o) => o.key === key);
  if (!opt) return key;
  return `${opt.emoji} ${isAdventure ? opt.adventureLabel : opt.calmLabel}`;
}

/** Tasks this short (in minutes) count as gap fillers. */
export const GAP_FILLER_MAX_MINUTES = 20;

/** Today's date as YYYY-MM-DD in the viewer's local time zone. */
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD for `days` from today (local). */
export function dateKeyInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

/** Whole days from today until a YYYY-MM-DD date (negative = overdue). */
export function daysUntil(dateKey: string, today = localDateKey()) {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = dateKey.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

/** "Overdue 2d", "Today", "Tomorrow", "3 days left", "by Fri, Oct 16". */
export function windowLabel(dateKey: string) {
  const n = daysUntil(dateKey);
  if (n < 0) return `Overdue ${-n}d`;
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  if (n <= 6) return `${n} days left`;
  const [y, m, d] = dateKey.split("-").map(Number);
  return `by ${new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
}

/**
 * How pressing a floating window is: 0 (plenty of time) to 1 (due today or
 * overdue). Drives the chip colour, so a task "turns into a priority" as
 * its window closes without the stored urgency score changing.
 */
export function windowPressure(dateKey: string) {
  const n = daysUntil(dateKey);
  if (n <= 0) return 1;
  if (n >= 7) return 0;
  return (7 - n) / 7;
}

/** Floating tasks: open, not on the calendar, with a do-by window — soonest first. */
export function floatingTasks<T extends Task>(tasks: T[]) {
  return tasks
    .filter((t) => t.status === "open" && !t.is_on_calendar && t.due_by)
    .sort((a, b) => (a.due_by! < b.due_by! ? -1 : a.due_by! > b.due_by! ? 1 : 0));
}

/** Gap fillers: open, unscheduled, short tasks — quickest first. */
export function gapFillers<T extends Task>(tasks: T[]) {
  return tasks
    .filter(
      (t) =>
        t.status === "open" &&
        !t.is_on_calendar &&
        t.estimate_minutes != null &&
        t.estimate_minutes > 0 &&
        t.estimate_minutes <= GAP_FILLER_MAX_MINUTES
    )
    .sort((a, b) => a.estimate_minutes! - b.estimate_minutes!);
}

/**
 * Open upkeep tasks in the order Today should offer them: the one whose
 * window closes soonest first, then the oldest. The first is "today's
 * upkeep"; the card lets the user swap to the next.
 */
export function upkeepQueue<T extends Task>(tasks: T[]) {
  return tasks
    .filter((t) => t.status === "open" && t.is_upkeep)
    .sort((a, b) => {
      if (a.due_by && b.due_by && a.due_by !== b.due_by) return a.due_by < b.due_by ? -1 : 1;
      if (a.due_by && !b.due_by) return -1;
      if (!a.due_by && b.due_by) return 1;
      return a.created_at < b.created_at ? -1 : 1;
    });
}
