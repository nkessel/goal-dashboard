// Pure date-math helpers for the Calendar page's Day/Week/Month views.
// Everything here runs against plain local-time `Date` objects — this app
// runs its dev/prod server on the same machine the user browses from, so
// local server time and the user's wall-clock time are the same, and we
// don't need any timezone conversion.

export const HOUR_START = 7; // 7 AM
export const HOUR_END = 21; // 9 PM (last displayed hour row)

export const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(out.getDate() + 1);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(1); // avoid month-length overflow (e.g. Jan 31 + 1mo)
  out.setMonth(out.getMonth() + n);
  return out;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Monday-based start of week containing `d`. */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const jsDay = out.getDay(); // 0 = Sun .. 6 = Sat
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  out.setDate(out.getDate() + mondayOffset);
  return out;
}

export function startOfMonth(d: Date): Date {
  const out = startOfDay(d);
  out.setDate(1);
  return out;
}

/** Monday-based 6-row (42-day) grid covering the month containing `d`. */
export function getMonthGridWeeks(d: Date): Date[][] {
  const firstOfMonth = startOfMonth(d);
  const gridStart = startOfWeek(firstOfMonth);
  const weeks: Date[][] = [];
  let cursor = gridStart;
  for (let week = 0; week < 6; week++) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day++) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(days);
  }
  return weeks;
}

export function parseDateParam(param: string | undefined): Date {
  if (param) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
    if (match) {
      const [, y, m, day] = match;
      const parsed = new Date(Number(y), Number(m) - 1, Number(day));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return startOfDay(new Date());
}

export function formatDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDayHeading(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function formatMonthHeading(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWeekRangeHeading(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startLabel = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = weekEnd.toLocaleDateString(
    undefined,
    sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" }
  );
  return `${startLabel} – ${endLabel}`;
}

/** Hour label like "9 AM" / "12 PM" for a 24-hour integer hour. */
export function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

export function formatTimeRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** `day` (any time-of-day) at a given hour, minutes/seconds zeroed. Inverse
 * of `hourRowSpan`'s row numbering — used to turn a drag-selected row range
 * back into real start/end Dates for the calendar drag-to-add-quest flow. */
export function dateAtHour(day: Date, hour: number): Date {
  const out = startOfDay(day);
  out.setHours(hour, 0, 0, 0);
  return out;
}

/** Clamped [startRow, endRowExclusive) within the HOUR_START..HOUR_END grid. */
export function hourRowSpan(start: Date, end: Date): { startRow: number; endRow: number } {
  const clamp = (h: number) => Math.min(Math.max(h, HOUR_START), HOUR_END + 1);
  const startHour = clamp(start.getHours());
  // Round the end up to the next hour so a sub-hour task still gets a full row.
  const rawEndHour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
  const endHour = clamp(Math.max(rawEndHour, startHour + 1));
  return { startRow: startHour - HOUR_START, endRow: endHour - HOUR_START };
}

/** Google-Calendar-style time: "9am", "9:30am". */
export function formatShortTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

/** Google-Calendar-style range: "9 – 10am", "9:30 – 11am", "11am – 1pm". */
export function formatShortTimeRange(start: Date, end: Date): string {
  const a = formatShortTime(start);
  const b = formatShortTime(end);
  const sameHalf = start.getHours() < 12 === end.getHours() < 12;
  return `${sameHalf ? a.replace(/(am|pm)$/, "") : a} – ${b}`;
}
