/**
 * The Wheel of Time: getting to bed on time. Each morning's first check-in
 * records last night's bedtime and this morning's wake time, plus which
 * Right Effort (what helps) and Hindrances (what turns the wheel backwards)
 * were part of yesterday. Insights then shows which ones move bedtime.
 * Pure, shared by the server and the browser.
 */

export type Hindrance = { name: string; at?: string | null };
/** One night, keyed by the morning (app day) it was logged for. */
export type NightLog = { bed: string | null; wake: string | null; effort: string[]; hindrances: Hindrance[]; at: string };
export type WheelSettings = { effort: string[]; hindrances: string[]; target: string | null };
export type WheelState = WheelSettings & { log: Record<string, NightLog> };

export const DEFAULT_EFFORT = [
  "Morning light within an hour of waking",
  "Exercise",
  "No caffeine/cannabis after 12:33pm",
  "Dinner done 2-3 hours before bed",
  "Wind-down routine started before 7:30pm",
  "No cannabis after 3pm",
];
export const DEFAULT_HINDRANCES = ["Cannabis after 3pm", "Late night movie with partner", "Late night working"];

const MAX_ITEMS = 12;
const MAX_NIGHTS = 400;
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const label = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "");
function list(v: unknown, fallback: string[]) {
  if (!Array.isArray(v)) return fallback;
  const out: string[] = [];
  for (const x of v) {
    const l = label(x);
    if (l && !out.some((o) => o.toLowerCase() === l.toLowerCase())) out.push(l);
  }
  return out.slice(0, MAX_ITEMS);
}

export function cleanNight(v: unknown): NightLog | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const bed = isTime(o.bed) ? o.bed : null;
  const wake = isTime(o.wake) ? o.wake : null;
  const effort = list(o.effort, []);
  const hindrances = (Array.isArray(o.hindrances) ? o.hindrances : [])
    .map((h) => {
      const r = (typeof h === "string" ? { name: h } : (h ?? {})) as Record<string, unknown>;
      const name = label(r.name);
      return name ? { name, at: isTime(r.at) ? r.at : null } : null;
    })
    .filter((h): h is { name: string; at: string | null } => !!h)
    .slice(0, MAX_ITEMS);
  if (!bed && !wake && !effort.length && !hindrances.length) return null;
  return { bed, wake, effort, hindrances, at: typeof o.at === "string" ? o.at : new Date().toISOString() };
}

export function cleanWheel(raw: unknown): WheelState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const log: Record<string, NightLog> = {};
  const entries = Object.entries((r.log ?? {}) as Record<string, unknown>)
    .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-MAX_NIGHTS);
  for (const [k, v] of entries) {
    const n = cleanNight(v);
    if (n) log[k] = n;
  }
  return { effort: list(r.effort, DEFAULT_EFFORT), hindrances: list(r.hindrances, DEFAULT_HINDRANCES), target: isTime(r.target) ? r.target : null, log };
}

/**
 * Minutes on a night's clock, so times after midnight sort after the evening:
 * noon is 0, 11pm is 660, 1am is 780. (Bedtimes from noon to noon.)
 */
export function nightMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (((h - 12 + 24) % 24) * 60 + m) % 1440;
}
/** Back from night minutes to a readable clock time ("11:40pm"). */
export function clockFromNight(min: number) {
  const total = (Math.round(min) + 12 * 60 + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
/** "23:40" → "11:40pm". */
export const prettyTime = (t: string) => clockFromNight(nightMinutes(t));

/** How long the night was, in minutes (bed to wake). */
export function sleptMinutes(n: NightLog) {
  if (!n.bed || !n.wake) return null;
  const [bh, bm] = n.bed.split(":").map(Number);
  const [wh, wm] = n.wake.split(":").map(Number);
  const d = (wh * 60 + wm - (bh * 60 + bm) + 1440) % 1440;
  return d > 0 && d < 16 * 60 ? d : null;
}

export const minutesLabel = (m: number) => {
  const a = Math.round(Math.abs(m));
  return a >= 60 ? `${Math.floor(a / 60)}h ${String(a % 60).padStart(2, "0")}m` : `${a} min`;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * How each Right Effort and Hindrance moves bedtime: the average bedtime on
 * nights with it, against nights without. Positive = later. Needs at least
 * two nights each way before it says anything.
 */
export function turnings(state: WheelState) {
  const nights = Object.values(state.log).filter((n) => n.bed);
  const one = (kind: "effort" | "hindrance", name: string) => {
    const has = (n: NightLog) => (kind === "effort" ? n.effort.includes(name) : n.hindrances.some((h) => h.name === name));
    const withIt = nights.filter(has).map((n) => nightMinutes(n.bed!));
    const without = nights.filter((n) => !has(n)).map((n) => nightMinutes(n.bed!));
    const a = avg(withIt);
    const b = avg(without);
    return { kind, name, nights: withIt.length, shift: withIt.length >= 2 && without.length >= 2 && a !== null && b !== null ? a - b : null };
  };
  return [...state.effort.map((n) => one("effort", n)), ...state.hindrances.map((n) => one("hindrance", n))];
}

/** Average bedtime and sleep over the last `days` logged nights. */
export function recentAverages(state: WheelState, days = 7) {
  const nights = Object.entries(state.log)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, days)
    .map(([, n]) => n);
  const bed = avg(nights.filter((n) => n.bed).map((n) => nightMinutes(n.bed!)));
  const slept = avg(nights.map(sleptMinutes).filter((m): m is number => m !== null));
  const onTime = state.target ? nights.filter((n) => n.bed && nightMinutes(n.bed) <= nightMinutes(state.target!)).length : null;
  return { nights: nights.length, bed, slept, onTime, logged: nights.filter((n) => n.bed).length };
}
