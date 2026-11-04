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
  /** Meal time kept free: an hour that floats inside each range (never booked, just never crowded out). */
  meals?: Meals;
  /** Days ("YYYY-MM-DD") that also keep breakfast free, when breakfast is off by default. */
  breakfastDays?: string[];
  /** One day's changes to its non-negotiables (meals by key, timed habits as "h:<id>"): kept at a time, or left out that day. */
  essentialDays?: Record<string, Record<string, DayHold>>;
};

/** A non-negotiable on one day: kept at `at` (minutes after midnight, for `minutes`), or `off` for that day. */
export type DayHold = { at?: number; minutes?: number; off?: boolean };

/** Daily essentials kept free: meals, the wind-down, the after-dinner tidy. */
export type MealKey = "breakfast" | "lunch" | "dinner" | "winddown" | "tidy";
/** `ideal` (minutes after midnight): where it would best go; the hold leans toward it. */
export type Meal = { on: boolean; from: number; to: number; minutes: number; ideal?: number };
export type Meals = Record<MealKey, Meal>;
export const MEAL_DEFAULTS: Meals = {
  breakfast: { on: true, from: 7 * 60, to: 10 * 60, minutes: 30, ideal: 8 * 60 },
  lunch: { on: true, from: 11 * 60, to: 15 * 60, minutes: 60, ideal: 12 * 60 },
  winddown: { on: true, from: 14 * 60 + 30, to: 18 * 60, minutes: 25, ideal: 16 * 60 },
  dinner: { on: true, from: 17 * 60, to: 20 * 60, minutes: 60, ideal: 18 * 60 },
  tidy: { on: true, from: 18 * 60, to: 22 * 60, minutes: 30, ideal: 19 * 60 + 30 },
};
export const MEAL_NAMES: Record<MealKey, string> = { breakfast: "Breakfast", lunch: "Lunch", winddown: "Wind-down", dinner: "Dinner", tidy: "Clean up & breakfast prep" };
export const MEAL_ICONS: Record<MealKey, string> = { breakfast: "🍳", lunch: "🍽", winddown: "🕯", dinner: "🍲", tidy: "🧽" };
const pad2 = (n: number) => String(n).padStart(2, "0");
export const localDayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The meals kept free on a day: each one's range on that day, in ms. */
export function mealsOn(day: Date, s: SchedulerSettings): { key: MealKey; from: number; to: number; minutes: number; ideal: number | null; kept?: boolean }[] {
  const saved = (s.meals ?? {}) as Partial<Meals>;
  const k = localDayKey(day);
  const today = s.essentialDays?.[k] ?? {};
  return (Object.keys(MEAL_DEFAULTS) as MealKey[])
    .map((key) => [key, { ...MEAL_DEFAULTS[key], ...(saved[key] ?? {}) }] as const)
    .filter(([key, m]) => (m.on || (key === "breakfast" && (s.breakfastDays ?? []).includes(k))) && !today[key]?.off)
    .map(([key, m]) => {
      const o = today[key];
      const minutes = Math.max(15, o?.minutes ?? m.minutes);
      // Kept by hand at a time that day: it holds exactly there.
      if (o?.at != null) {
        const from = at(day, o.at).getTime();
        return { key, from, to: from + minutes * 60_000, minutes, ideal: from, kept: true };
      }
      return { key, from: at(day, m.from).getTime(), to: at(day, m.to).getTime(), minutes, ideal: m.ideal != null ? at(day, m.ideal).getTime() : null };
    });
}

/** Where a hold would sit: the free stretch closest to its ideal time (or the first one), or null when crowded out. */
export function holdAt(from: number, to: number, minutes: number, busy: Busy[], ideal: number | null): number | null {
  if (ideal === null) return freeStretch(from, to, minutes, busy);
  const need = minutes * 60_000;
  let best: number | null = null;
  for (let a = from; a + need <= to; a += STEP * 60_000) {
    if (busy.some((b) => b.start < a + need && b.end > a)) continue;
    if (best === null || Math.abs(a - ideal) < Math.abs(best - ideal)) best = a;
  }
  return best;
}

/** The first free stretch of `minutes` inside [from, to], or null when the range is crowded out. */
export function freeStretch(from: number, to: number, minutes: number, busy: Busy[]): number | null {
  const need = minutes * 60_000;
  const inside = busy.filter((b) => b.start < to && b.end > from).sort((a, b) => a.start - b.start);
  let cursor = from;
  for (const b of inside) {
    if (b.start - cursor >= need) return cursor;
    cursor = Math.max(cursor, b.end);
  }
  return to - cursor >= need ? cursor : null;
}

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
  /** Plan it by then (from "Plan it within…"): a soft deadline. */
  planBy?: string | null;
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

/** Times a quest shouldn't go ("Another time"), by quest id. */
export type Avoid = Record<string, Busy[]>;

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
export function planSchedule(items: PlanItem[], busyIn: Busy[], settings: SchedulerSettings, now = new Date(), avoid: Avoid = {}): PlanResult {
  const s = { ...SCHEDULER_DEFAULTS, ...settings };
  // Look far enough ahead to reach the latest "plan it by".
  const furthest = Math.max(0, ...items.map((i) => (i.planBy ? Math.ceil((Date.parse(i.planBy) - now.getTime()) / 86_400_000) : 0)));
  s.horizon = Math.min(62, Math.max(s.horizon, furthest + 1));
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
  const deadline = (i: PlanItem) => {
    const d = [i.dueAt, i.planBy].filter(Boolean).map((x) => Date.parse(x!)).filter(Number.isFinite);
    return d.length ? new Date(Math.min(...d)).toISOString() : null;
  };
  const dueSoon = (i: PlanItem) => {
    const d = deadline(i);
    return d ? new Date(d).getTime() <= horizonEnd : false;
  };
  const ordered = [...items.filter(dueSoon).sort((a, b) => byDue({ due_at: deadline(a) }, { due_at: deadline(b) })), ...items.filter((i) => !dueSoon(i))];
  // A quest may not crowd out a meal: each meal's range keeps a free stretch.
  const mealsFine = (a: number, b: number) => {
    const day = new Date(a);
    const trial = [...busy, { start: a, end: b }];
    return mealsOn(day, s).every((m) => m.to <= a || m.from >= b || freeStretch(m.from, m.to, m.minutes, trial) !== null);
  };

  for (const item of ordered) {
    const want = Math.max(STEP, Math.ceil((item.minutes ?? 30) / STEP) * STEP);
    const minutes = Math.min(want, MAX_SITTING);
    const pref = s.prefs[item.id] ?? "any";
    // Hard quests, with no preference, look in the morning first.
    const tries: TimeOfDay[] = pref === "any" && (item.effort ?? 0) >= 4 ? ["morning", "any"] : [pref];
    const dl = deadline(item);
    const due = dl ? new Date(dl).getTime() : null;
    const notHere = avoid[item.id] ?? [];

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
            if (!free(a, b) || !mealsFine(a, b) || notHere.some((x) => x.start < b && x.end > a)) continue;
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
      unplaced.push({ id: item.id, title: item.title, why: s.horizon === 1 ? (pref === "any" ? "No room left that day" : `No free ${pref} that day`) : pref === "any" ? `No free time in the next ${s.horizon} days` : `No free ${pref} in the next ${s.horizon} days` });
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
