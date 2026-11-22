// Pure helpers for the Duet route: no imports, so scripts/test-duet.mjs can load this file as it is.
// (The app's own numbering is kept: weekdays are 0 = Sunday … 6 = Saturday, as in Date#getDay and the `days` column.)

export class DuetError extends Error {
  candidates?: Candidate[];
  constructor(message: string, candidates?: Candidate[]) {
    super(message);
    this.candidates = candidates;
  }
}

export type Candidate = { id: string; title: string; board?: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): boolean => typeof s === "string" && UUID.test(s.trim());

export type Resolved<T> = { ok: true; item: T } | { ok: false; error: string; candidates: Candidate[] };

/**
 * A uuid or a name. A name matches exactly (case-insensitive) first; failing that, by a substring that only one
 * item contains. Several matches or none come back as `ok: false` with up to five candidates: never a guess.
 */
export function resolveRef<T extends { id: string; title: string }>(
  items: T[],
  ref: unknown,
  what: string,
  label: (item: T) => Candidate = (i) => ({ id: i.id, title: i.title })
): Resolved<T> {
  const q = typeof ref === "string" ? ref.trim() : "";
  if (!q) return { ok: false, error: `Say which ${what}.`, candidates: [] };
  if (isUuid(q)) {
    const hit = items.find((i) => i.id.toLowerCase() === q.toLowerCase());
    return hit ? { ok: true, item: hit } : { ok: false, error: `No ${what} with that id.`, candidates: [] };
  }
  const low = q.toLowerCase();
  const exact = items.filter((i) => i.title.trim().toLowerCase() === low);
  if (exact.length === 1) return { ok: true, item: exact[0] };
  if (exact.length > 1) return { ok: false, error: `More than one ${what} is called "${q}". Which one?`, candidates: exact.slice(0, 5).map(label) };
  const part = items.filter((i) => i.title.toLowerCase().includes(low));
  if (part.length === 1) return { ok: true, item: part[0] };
  if (part.length > 1) return { ok: false, error: `"${q}" matches ${part.length} ${what}s. Which one?`, candidates: part.slice(0, 5).map(label) };
  // Nothing contains it: offer the few that share a word with it, so the caller can ask.
  const words = low.split(/\s+/).filter((w) => w.length > 2);
  const near = words.length ? items.filter((i) => words.some((w) => i.title.toLowerCase().includes(w))) : [];
  return { ok: false, error: `No ${what} matches "${q}".`, candidates: near.slice(0, 5).map(label) };
}

/** 0–5 in tenths, as the quest editor and `updateTask` clamp importance and urgency. */
export function clampScore(n: unknown, what = "That"): number {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new DuetError(`${what} must be a number from 0 to 5.`);
  return Math.max(0, Math.min(5, Math.round(v * 10) / 10));
}

/** A whole number in a range (rounded, then kept inside it). */
export function clampInt(n: unknown, min: number, max: number, what = "That"): number {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new DuetError(`${what} must be a number.`);
  return Math.max(min, Math.min(max, Math.round(v)));
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0, mon: 1, monday: 1, mondays: 1, tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5, sat: 6, saturday: 6, saturdays: 6,
};

/**
 * Weekdays as the app stores them (sorted, 0 = Sunday), from names ("Mon", "thursdays"), numbers 0-6, or one of
 * "weekdays" / "weekends" / "daily". Empty or null means every day. Returns null for every day (the app stores
 * `days` only when fewer than seven are picked, so seven days is also null).
 */
export function parseDays(v: unknown): number[] | null {
  if (v === null || v === undefined) return null;
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/).filter(Boolean) : [v];
  const out = new Set<number>();
  for (const raw of list) {
    if (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw.trim()))) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 6) throw new DuetError(`Weekday numbers run 0 (Sunday) to 6 (Saturday); got ${raw}.`);
      out.add(n);
      continue;
    }
    const k = String(raw).trim().toLowerCase();
    if (k === "weekdays" || k === "weekday") [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (k === "weekends" || k === "weekend") [0, 6].forEach((d) => out.add(d));
    else if (k === "daily" || k === "everyday" || k === "every day" || k === "all") [0, 1, 2, 3, 4, 5, 6].forEach((d) => out.add(d));
    else if (k in DAY_NAMES) out.add(DAY_NAMES[k]);
    else throw new DuetError(`"${raw}" isn't a weekday. Use names like "Mon" or numbers 0 (Sunday) to 6 (Saturday).`);
  }
  if (out.size === 0 || out.size === 7) return null;
  return [...out].sort((a, b) => a - b);
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dayNames = (days: number[] | null | undefined) => (days && days.length && days.length < 7 ? days.map((d) => WD[d]).join(", ") : "every day");

/** "7am", "7:30 pm", "17:30", "07:05" → "HH:MM"; empty or null clears (null). */
export function parseClock(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(String(v));
  if (!m) throw new DuetError(`"${v}" isn't a time. Use something like "07:30", "7:30am" or "17:00".`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (ap) {
    if (h < 1 || h > 12) throw new DuetError(`"${v}" isn't a time.`);
    h = (h % 12) + (ap === "pm" ? 12 : 0);
  }
  if (h > 23 || min > 59) throw new DuetError(`"${v}" isn't a time.`);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const NY = "America/New_York";

/** The offset (ms, NY minus UTC) in force at this instant. */
function nyOffset(ms: number): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: NY, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ms / 1000) * 1000;
}

/** A New York wall-clock date and time as an ISO instant (the quest editor does this in the browser: date + "23:59"). */
export function nyToIso(date: string, time = "23:59"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t || !isDay(date) || +t[1] > 23 || +t[2] > 59) throw new DuetError(`"${date} ${time}" isn't a date and time.`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  let guess = wall - nyOffset(wall);
  guess = wall - nyOffset(guess);
  const d = new Date(guess);
  if (Number.isNaN(d.getTime())) throw new DuetError(`"${date}" isn't a date.`);
  return d.toISOString();
}

/** A due date: "2026-11-27" (end of that day, New York), "2026-11-27T15:00" (New York time), or a full ISO instant. */
export function parseDue(v: unknown): string | null {
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw new DuetError("Due must be a date like 2026-11-27 (or a date and time), or null to clear it.");
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return nyToIso(s);
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
  if (local) return nyToIso(local[1], local[2]);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  throw new DuetError(`"${v}" isn't a date. Use 2026-11-27 or 2026-11-27T15:00.`);
}

export const isDay = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Weekday (0 = Sunday) of a YYYY-MM-DD day. */
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** `ids` with `id` taken out and put just above or below `anchor`. */
export function moveAround(ids: string[], id: string, anchor: string, where: "above" | "below"): string[] {
  if (id === anchor) throw new DuetError("Can't move something relative to itself.");
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(anchor);
  if (at === -1) throw new DuetError("The other item isn't in that list.");
  rest.splice(where === "above" ? at : at + 1, 0, id);
  return rest;
}

/** Which of above / below was asked for (exactly one). */
export function anchorOf(args: Record<string, unknown>): { ref: unknown; where: "above" | "below" } {
  const hasA = args.above !== undefined && args.above !== null && args.above !== "";
  const hasB = args.below !== undefined && args.below !== null && args.below !== "";
  if (hasA === hasB) throw new DuetError("Give exactly one of above or below.");
  return hasA ? { ref: args.above, where: "above" } : { ref: args.below, where: "below" };
}
