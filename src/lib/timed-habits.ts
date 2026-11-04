import { occurrenceOn, type Repeat } from "./habit-repeat";
import { freeStretch, type DayHold } from "./auto-schedule";

/** A daily habit with a set time (like Gym at 7 AM): it holds that time on the calendar. */
export type TimedHabit = { id: string; title: string; days: number[] | null; due_time: string; /** End of its window ("10:00"): it floats from due_time to here. */ window_to?: string | null; minutes: number; repeat: Repeat | null; icon_key?: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** True when the habit falls on this (local) day. */
export function habitOnDay(h: Pick<TimedHabit, "days" | "repeat">, day: Date): boolean {
  if (h.repeat) return occurrenceOn(h.repeat, keyOf(day)) === keyOf(day);
  return !h.days || h.days.length === 0 || h.days.includes(day.getDay());
}

/** Each timed habit's block on this day: start and end in ms. A habit with a window
 * (Gym 7–10) takes the first free stretch inside it, around `busy`; else its start. */
export function habitBlocksOn(habits: TimedHabit[], day: Date, busy: { start: number; end: number }[] = [], /** That day's changes by hand ("h:<id>"): kept at a time, or off. */ holds: Record<string, DayHold> = {}): { habit: TimedHabit; start: number; end: number; crowded?: boolean; kept?: boolean }[] {
  type Block = { habit: TimedHabit; start: number; end: number; crowded?: boolean; kept?: boolean };
  return habits.flatMap((h): Block[] => {
    const m = /^(\d{1,2}):(\d{2})/.exec(h.due_time);
    if (!m || !habitOnDay(h, day)) return [];
    const o = holds[`h:${h.id}`];
    if (o?.off) return [];
    const need = Math.max(15, o?.minutes ?? h.minutes) * 60_000;
    if (o?.at != null) {
      const k = new Date(day);
      k.setHours(0, o.at, 0, 0);
      return [{ habit: h, start: k.getTime(), end: k.getTime() + need, kept: true }];
    }
    const s = new Date(day);
    s.setHours(Number(m[1]), Number(m[2]), 0, 0);
    let start = s.getTime();
    let crowded = false;
    const w = h.window_to ? /^(\d{1,2}):(\d{2})/.exec(h.window_to) : null;
    if (w) {
      const e = new Date(day);
      e.setHours(Number(w[1]), Number(w[2]), 0, 0);
      const free = freeStretch(s.getTime(), e.getTime(), need / 60_000, busy);
      // No room left in its window: it stays at its start, marked crowded (shown in a muted red).
      crowded = free === null;
      start = free ?? start;
    }
    return [{ habit: h, start, end: start + need, crowded }];
  });
}

/** Rows from the rites table to timed habits (day habits with a time only). */
export function timedHabitsFrom(rows: { id: string; title: string; slot?: string | null; days?: number[] | null; due_time?: string | null; window_to?: string | null; estimate_minutes?: number | null; repeat?: unknown; icon_key?: string | null; icon_source?: string | null }[], clean: (r: unknown) => Repeat | null): TimedHabit[] {
  return rows
    .filter((r) => r.slot === "day" && r.due_time)
    .map((r) => ({ id: r.id, title: r.title, days: r.days ?? null, due_time: r.due_time!, window_to: r.window_to ?? null, minutes: r.estimate_minutes ?? 60, repeat: clean(r.repeat), icon_key: r.icon_source ? r.icon_key : null }));
}
