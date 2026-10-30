/**
 * The mess check-in for the daily cleaning habit: how messy each space is,
 * how full the laundry bin is, and the chore deck. Together they pick what
 * today's 20 minutes go to. Kept in `profiles.life_wheel.cleaning`.
 *
 * Dates are app day keys ("2026-10-30"), so nothing here needs the clock.
 */

export type MessLevel = 0 | 1 | 2;
export type MessStyle = "weather" | "jars" | "garden" | "critters" | "piles";

export type Space = {
  id: string;
  name: string;
  icon: string;
  level: MessLevel;
  /** The day it was last rated (or tidied). */
  ratedOn: string | null;
  /** Gets one step messier on its own every this many days (bathroom, kitchen); null = only when you say. */
  driftDays: number | null;
};

export type Chore = {
  id: string;
  name: string;
  icon: string;
  everyDays: number;
  /** Repeats on this weekday instead (0 Sunday … 6 Saturday), e.g. trash night. */
  weekday?: number | null;
  lastDone: string | null;
  snoozedUntil: string | null;
};

/** Bin fill in quarters: 0 empty … 4 full. */
export type Laundry = { readings: { on: string; fill: number }[]; loads: string[] };

export type Cleaning = {
  style: MessStyle;
  spaces: Space[];
  chores: Chore[];
  laundry: Laundry;
  /** The habit the check-in sits under; null = the first habit with "clean" in its name. */
  habitId: string | null;
};

export const MESS_STYLES: { key: MessStyle; label: string; mark: string; glyphs: [string, string, string]; words: [string, string, string] }[] = [
  { key: "weather", mark: "⛅", label: "Weather", glyphs: ["✨☀️", "⛅", "⛈️"], words: ["Fresh and clear", "Cloudy", "Stormy"] },
  { key: "jars", mark: "🫙", label: "Jars & bottles", glyphs: ["✨🫙", "🫙🍶🧴", "🫙🍶🧴🍾🥫🫙"], words: ["Spotless shelf", "A few bottles", "A crowded shelf"] },
  { key: "garden", mark: "🌿", label: "Garden", glyphs: ["🌱✨", "🌿🌾", "🌳🌿🍃🌾"], words: ["Neat and tidy", "Overgrown", "Jungle"] },
  { key: "critters", mark: "👺", label: "Critters", glyphs: ["🫧✨", "👺", "🐉"], words: ["Squeaky clean", "Grumpy gremlin", "Mess dragon"] },
  { key: "piles", mark: "📚", label: "Piles", glyphs: ["✨📕", "📚", "📚📚📦"], words: ["All put away", "A stack", "A teetering tower"] },
];

export const styleOf = (k: MessStyle) => MESS_STYLES.find((s) => s.key === k) ?? MESS_STYLES[0];

export const SPACE_ICONS = ["🍳", "🛁", "🖥️", "🎨", "🛏️", "🛋️", "🚪", "🧺", "🪴", "🚗", "📦", "🧸", "👕", "🍽️", "🧹", "✨"];
export const CHORE_ICONS = ["🧹", "🛏️", "🧊", "🪶", "♻️", "🗑️", "🧽", "🪟", "🌿", "🐾", "🚿", "🧴", "🍽️", "🔥", "✨"];

const DEFAULT_SPACES: Omit<Space, "id">[] = [
  { name: "Kitchen", icon: "🍳", level: 1, ratedOn: null, driftDays: 2 },
  { name: "Bathroom", icon: "🛁", level: 1, ratedOn: null, driftDays: 3 },
  { name: "Desk", icon: "🖥️", level: 1, ratedOn: null, driftDays: null },
  { name: "Bedroom", icon: "🛏️", level: 1, ratedOn: null, driftDays: null },
];

const DEFAULT_CHORES: { name: string; icon: string; everyDays: number; weekday?: number }[] = [
  { name: "Vacuum", icon: "🧹", everyDays: 7 },
  { name: "Change the sheets", icon: "🛏️", everyDays: 14 },
  { name: "Clean out the fridge", icon: "🧊", everyDays: 14 },
  { name: "Dust", icon: "🪶", everyDays: 14 },
  { name: "Take out trash and recycling", icon: "♻️", everyDays: 7, weekday: 2 },
];

/** A first deck for someone new: chores come due one at a time over the next days, not all at once. */
export function defaultCleaning(today: string): Cleaning {
  return {
    style: "weather",
    spaces: DEFAULT_SPACES.map((s, i) => ({ ...s, id: `s${i + 1}`, ratedOn: today })),
    chores: DEFAULT_CHORES.map((c, i) => ({ ...c, id: `c${i + 1}`, lastDone: addDays(today, -(c.everyDays - 1 - i)), snoozedUntil: null })),
    laundry: { readings: [], loads: [] },
    habitId: null,
  };
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const level = (v: unknown): MessLevel => (v === 0 || v === 1 || v === 2 ? v : 1);

export function normalizeCleaning(raw: unknown): Cleaning | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Cleaning>;
  const spaces = (Array.isArray(r.spaces) ? r.spaces : [])
    .filter((s) => s && typeof s.id === "string" && text(s.name, 40))
    .slice(0, 24)
    .map((s) => ({
      id: s.id.slice(0, 40),
      name: text(s.name, 40),
      icon: text(s.icon, 16) || "✨",
      level: level(s.level),
      ratedOn: isDay(s.ratedOn) ? s.ratedOn : null,
      driftDays: Number(s.driftDays) >= 1 ? Math.min(60, Math.round(Number(s.driftDays))) : null,
    }));
  const chores = (Array.isArray(r.chores) ? r.chores : [])
    .filter((c) => c && typeof c.id === "string" && text(c.name, 48))
    .slice(0, 40)
    .map((c) => ({
      id: c.id.slice(0, 40),
      name: text(c.name, 48),
      icon: text(c.icon, 16) || "✨",
      everyDays: Math.max(1, Math.min(366, Math.round(Number(c.everyDays) || 7))),
      weekday: Number.isInteger(c.weekday) && c.weekday! >= 0 && c.weekday! <= 6 ? c.weekday! : null,
      lastDone: isDay(c.lastDone) ? c.lastDone : null,
      snoozedUntil: isDay(c.snoozedUntil) ? c.snoozedUntil : null,
    }));
  const l = (r.laundry ?? {}) as Partial<Laundry>;
  const laundry: Laundry = {
    readings: (Array.isArray(l.readings) ? l.readings : [])
      .filter((x) => x && isDay(x.on))
      .map((x) => ({ on: x.on, fill: Math.max(0, Math.min(4, Math.round(Number(x.fill) || 0))) }))
      .slice(-30),
    loads: (Array.isArray(l.loads) ? l.loads : []).filter(isDay).slice(-20),
  };
  return {
    style: MESS_STYLES.some((s) => s.key === r.style) ? (r.style as MessStyle) : "weather",
    spaces,
    chores,
    laundry,
    habitId: typeof r.habitId === "string" ? r.habitId.slice(0, 40) : null,
  };
}

// ---------------------------------------------------------------------------
// Day arithmetic on day keys

const toUTC = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Whole days from a to b (b later = positive). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

export function addDays(d: string, n: number): string {
  return new Date(toUTC(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** "today", "tomorrow", "Sunday", "Nov 12". */
export function dayLabel(d: string, today: string): string {
  const n = daysBetween(today, d);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  const date = new Date(toUTC(d));
  if (n < 7) return date.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Where things stand

/** How messy a space is now: the last rating, plus any drift since. */
export function levelNow(s: Space, today: string): MessLevel {
  if (!s.driftDays || !s.ratedOn) return s.level;
  const steps = Math.floor(Math.max(0, daysBetween(s.ratedOn, today)) / s.driftDays);
  return Math.min(2, s.level + steps) as MessLevel;
}

/** Laundry: how full the bin likely is now, and the day the next load is due. */
export function laundryNow(l: Laundry, today: string): { fill: number | null; dueOn: string | null; daysLeft: number | null } {
  const lastLoad = l.loads.at(-1) ?? null;
  const since = l.readings.filter((r) => !lastLoad || r.on >= lastLoad);
  const last = since.at(-1) ?? null;
  if (!last && !lastLoad) return { fill: null, dueOn: null, daysLeft: null };
  // Quarters a day: from your readings since the last load, else from how often loads come round.
  let rate: number | null = null;
  const start = lastLoad ? { on: lastLoad, fill: 0 } : since[0];
  if (last && start && daysBetween(start.on, last.on) >= 1 && last.fill > start.fill) rate = (last.fill - start.fill) / daysBetween(start.on, last.on);
  if (rate === null && l.loads.length >= 2) {
    const gaps = l.loads.slice(1).map((d, i) => daysBetween(l.loads[i], d)).filter((g) => g > 0);
    if (gaps.length) rate = 4 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }
  rate ??= 4 / 7;
  const from = last ?? { on: lastLoad!, fill: 0 };
  const fill = Math.min(4, from.fill + rate * Math.max(0, daysBetween(from.on, today)));
  const dueOn = from.fill >= 4 ? from.on : addDays(from.on, Math.max(0, Math.ceil((4 - from.fill) / rate - 0.25)));
  return { fill, dueOn, daysLeft: daysBetween(today, dueOn) };
}

/** The day a chore next wants doing (a snooze pushes it on). */
/** The first day on or after `from` that falls on this weekday. */
function nextWeekday(from: string, weekday: number): string {
  const dow = new Date(toUTC(from)).getUTCDay();
  return addDays(from, (weekday - dow + 7) % 7);
}

export function choreDueOn(c: Chore, today: string): string {
  // On a weekday: the first one after it was last done (or the next one from today).
  const base = c.weekday != null ? nextWeekday(c.lastDone ? addDays(c.lastDone, 1) : today, c.weekday) : c.lastDone ? addDays(c.lastDone, c.everyDays) : today;
  return c.snoozedUntil && c.snoozedUntil > base ? c.snoozedUntil : base;
}

export const choreIsDue = (c: Chore, today: string) => choreDueOn(c, today) <= today;

export type Pick = { kind: "space" | "laundry" | "chore"; id: string; name: string; icon: string; why: string };

/** What today's cleaning minutes go to, best first. */
export function todaysPicks(c: Cleaning, today: string): Pick[] {
  const style = styleOf(c.style);
  const scored: (Pick & { score: number })[] = [];
  for (const s of c.spaces) {
    const lv = levelNow(s, today);
    if (lv === 0) continue;
    const age = s.ratedOn ? daysBetween(s.ratedOn, today) : 30;
    scored.push({ kind: "space", id: s.id, name: s.name, icon: s.icon, why: style.words[lv], score: (lv === 2 ? 3 : 1.5) + Math.min(age, 30) / 100 });
  }
  const l = laundryNow(c.laundry, today);
  if (l.daysLeft !== null && l.daysLeft <= 1) scored.push({ kind: "laundry", id: "laundry", name: "Laundry", icon: "🧺", why: l.daysLeft <= 0 ? "a load is due" : "due tomorrow", score: l.daysLeft <= 0 ? 3.5 : 1.8 });
  for (const ch of c.chores) {
    if (!choreIsDue(ch, today)) continue;
    const over = daysBetween(choreDueOn(ch, today), today);
    scored.push({ kind: "chore", id: ch.id, name: ch.name, icon: ch.icon, why: over > 0 ? `${over} day${over === 1 ? "" : "s"} past due` : "due today", score: 2 + Math.min(1, over / ch.everyDays) });
  }
  return scored.sort((a, b) => b.score - a.score).map((p) => ({ kind: p.kind, id: p.id, name: p.name, icon: p.icon, why: p.why }));
}
