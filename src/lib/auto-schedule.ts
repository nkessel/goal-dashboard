/**
 * The auto-scheduler: takes the scheduling list in order and finds each quest
 * a place in free time, one by one. Pure and time-zone local (it runs in the
 * browser, so "9 AM" means the viewer's 9 AM).
 */

import { byDuePriority } from "./due-soon";

export type TimeOfDay = "any" | "morning" | "afternoon" | "evening";

export type SchedulerSettings = {
  /** Minutes after midnight the planning day starts and ends. */
  dayStart: number;
  dayEnd: number;
  /** At most this many minutes of auto-placed quests on one day. */
  maxPerDay: number;
  /** Breathing room kept around everything, in minutes. */
  buffer: number;
  /** How many days ahead to look. */
  horizon: number;
  /** Leave Saturdays and Sundays free. */
  skipWeekends: boolean;
  /** Each quest's preferred time of day (missing = any). */
  prefs: Record<string, TimeOfDay>;
  /** Calendars whose events don't block time ("just so you know"). Unset = the ones you can't edit. */
  fyi?: string[];
};

export const SCHEDULER_DEFAULTS: SchedulerSettings = {
  dayStart: 9 * 60,
  dayEnd: 21 * 60,
  maxPerDay: 180,
  buffer: 10,
  horizon: 14,
  skipWeekends: false,
  prefs: {},
};

export type PlanItem = {
  id: string;
  title: string;
  minutes: number | null;
  /** 0–5: how much it takes out of you (hard quests go early in the day). */
  effort?: number | null;
  dueAt?: string | null;
};

export type Busy = { start: number; end: number; cal?: string };

export type Placement = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  /** Couldn't fit before its due date, so it's the first time after. */
  late?: boolean;
  /** Longer than one sitting: this is its first session. */
  split?: boolean;
};

export type PlanResult = { placed: Placement[]; unplaced: { id: string; title: string; why: string }[] };

const STEP = 15;
const MAX_SITTING = 180;

function windowFor(pref: TimeOfDay, s: SchedulerSettings): [number, number] {
  const noon = 12 * 60;
  const five = 17 * 60;
  if (pref === "morning") return [s.dayStart, Math.max(s.dayStart + 60, Math.min(noon, s.dayEnd))];
  if (pref === "afternoon") return [Math.max(s.dayStart, noon), Math.min(s.dayEnd, five)];
  if (pref === "evening") return [Math.max(s.dayStart, five), s.dayEnd];
  return [s.dayStart, s.dayEnd];
}

const at = (day: Date, minutes: number) => {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
};

/**
 * Place each item into the first free stretch that suits it.
 * `now` is when planning starts; nothing lands in the past.
 */
export function planSchedule(items: PlanItem[], busyIn: Busy[], settings: SchedulerSettings, now = new Date()): PlanResult {
  const s = { ...SCHEDULER_DEFAULTS, ...settings };
  const busy: Busy[] = busyIn.map((b) => ({ start: b.start - s.buffer * 60_000, end: b.end + s.buffer * 60_000 }));
  const used = new Map<string, number>(); // day key -> minutes placed
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const earliest = Math.ceil((now.getTime() + 15 * 60_000) / (STEP * 60_000)) * STEP * 60_000;
  const free = (a: number, b: number) => !busy.some((x) => x.start < b && x.end > a);

  const placed: Placement[] = [];
  const unplaced: PlanResult["unplaced"] = [];

  // Deadlines first (due next first, past due after), then the rest in the list's order.
  const horizonEnd = now.getTime() + s.horizon * 86_400_000;
  const byDue = byDuePriority(now.getTime());
  const dueSoon = (i: PlanItem) => (i.dueAt ? new Date(i.dueAt).getTime() <= horizonEnd : false);
  const ordered = [...items.filter(dueSoon).sort((a, b) => byDue({ due_at: a.dueAt }, { due_at: b.dueAt })), ...items.filter((i) => !dueSoon(i))];

  for (const item of ordered) {
    const want = Math.max(STEP, Math.ceil((item.minutes ?? 30) / STEP) * STEP);
    const minutes = Math.min(want, MAX_SITTING);
    const pref = s.prefs[item.id] ?? "any";
    // Hard quests, with no preference, look in the morning first.
    const tries: TimeOfDay[] = pref === "any" && (item.effort ?? 0) >= 4 ? ["morning", "any"] : [pref];
    const due = item.dueAt ? new Date(item.dueAt).getTime() : null;

    const search = (beforeDue: boolean, capped = true): Placement | null => {
      for (const p of tries) {
        const [w0, w1] = windowFor(p, s);
        for (let d = 0; d < s.horizon; d++) {
          const day = new Date(now);
          day.setDate(day.getDate() + d);
          const dow = day.getDay();
          if (s.skipWeekends && (dow === 0 || dow === 6)) continue;
          const k = dayKey(day);
          if (capped && (used.get(k) ?? 0) + minutes > s.maxPerDay) continue;
          for (let m = w0; m + minutes <= w1; m += STEP) {
            const a = at(day, m).getTime();
            const b = a + minutes * 60_000;
            if (a < earliest) continue;
            if (beforeDue && due !== null && b > due) return null;
            if (!free(a, b)) continue;
            return { id: item.id, title: item.title, start: new Date(a), end: new Date(b), split: want > MAX_SITTING || undefined };
          }
        }
      }
      return null;
    };

    let spot = search(true);
    // Meeting a deadline beats the daily limit.
    if (!spot && due !== null) spot = search(true, false);
    if (!spot && due !== null) {
      spot = search(false);
      if (spot) spot.late = true;
    }
    if (!spot) {
      unplaced.push({ id: item.id, title: item.title, why: pref === "any" ? "No free time in the next two weeks" : `No free ${pref} in the next two weeks` });
      continue;
    }
    placed.push(spot);
    busy.push({ start: spot.start.getTime() - s.buffer * 60_000, end: spot.end.getTime() + s.buffer * 60_000 });
    const k = dayKey(spot.start);
    used.set(k, (used.get(k) ?? 0) + minutes);
  }
  return { placed, unplaced };
}

/** "9 AM", "9:30 PM" from minutes after midnight. */
export function clockOf(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}
