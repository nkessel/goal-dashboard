/**
 * Quest Drop (owner, Nov 18: "make a game out of the scheduler"): the pure rules.
 * One quest falls at a time down a day of the calendar; where it lands is found by
 * the auto-scheduler's own rules (`planSchedule`: free time, the buffer, meals kept free),
 * so a game placement is the same as an Auto-schedule placement.
 */

import { byDuePriority } from "./due-soon";
import { planSchedule, type Busy, type SchedulerSettings } from "./auto-schedule";

export const DROP_STEP = 15; // minutes per fall step and per ↓
const MAX_SITTING = 180;

export type DropQuest = {
  id: string;
  title: string;
  minutes: number | null;
  dueAt: string | null;
  planBy: string | null;
  icon: string | null;
  iconIsImage: boolean;
};

export type DropSettings = {
  /** 1 (slow) … 10 (fast). */
  startSpeed: number;
  /** Speed levels added per quest placed: 0 (stays the same) … 2. */
  ramp: number;
  /** "tune": the game's own loop and sounds; "sounds": just the little sounds; "off": silent, so your own music keeps playing. */
  sound: "tune" | "sounds" | "off";
  /** Your own song or playlist link (owner, Nov 18): opened in your music app when a game starts; the game's tune stays quiet. */
  musicLink: string;
};

export const DROP_DEFAULTS: DropSettings = { startSpeed: 2, ramp: 0.5, sound: "tune", musicLink: "" };

/** A link that's safe to open: http(s) only (Spotify, YouTube, Apple Music…). */
export function cleanMusicLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z]+:/i.test(t) ? t : `https://${t}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
export const RAMPS: { v: number; label: string }[] = [
  { v: 0, label: "Stays the same" },
  { v: 0.25, label: "A little" },
  { v: 0.5, label: "Some" },
  { v: 1, label: "A lot" },
];

/** Milliseconds per fall step at a speed level (1 ≈ a minute for a whole day, 10 ≈ 7 seconds). */
export function stepMs(level: number) {
  const l = Math.max(1, Math.min(12, level));
  return Math.round(1250 * Math.pow(0.79, l - 1));
}

/** Minutes the quest's block takes (the planner's rounding: 15-minute steps, one sitting at most). */
export function blockMinutes(q: Pick<DropQuest, "minutes">) {
  const want = Math.max(DROP_STEP, Math.ceil((q.minutes ?? 30) / DROP_STEP) * DROP_STEP);
  return Math.min(want, MAX_SITTING);
}

/**
 * The order quests come down: like Auto-schedule, urgent first. Fixed dates (a due date) first,
 * soonest first and past due after; then flexible ones ("plan it by"), soonest first; then the rest
 * in the scheduling list's own order.
 */
export function dropOrder<T extends Pick<DropQuest, "dueAt" | "planBy">>(list: T[], now = Date.now()): T[] {
  const fixed = list.filter((q) => q.dueAt);
  const flexible = list.filter((q) => !q.dueAt && q.planBy);
  const rest = list.filter((q) => !q.dueAt && !q.planBy);
  const byDue = byDuePriority(now);
  fixed.sort((a, b) => byDue({ due_at: a.dueAt }, { due_at: b.dueAt }));
  flexible.sort((a, b) => Date.parse(a.planBy!) - Date.parse(b.planBy!));
  return [...fixed, ...flexible, ...rest];
}

/** Put the current quest back in line: after `n` more quests, or at the end (n = Infinity). */
export function deferIn<T>(queue: T[], n: number): T[] {
  if (!queue.length) return queue;
  const [head, ...rest] = queue;
  const at = Math.max(0, Math.min(rest.length, Number.isFinite(n) ? Math.floor(n) : rest.length));
  return [...rest.slice(0, at), head, ...rest.slice(at)];
}

const atMinutes = (day: Date, m: number) => {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(m);
  return d;
};

/**
 * Where the quest lands if dropped now: the first free stretch on `day` at or after `fromMinute`,
 * by the planner's rules. Null when nothing fits on the rest of that day.
 */
export function landingFrom(q: DropQuest, day: Date, fromMinute: number, busy: Busy[], s: SchedulerSettings, now = new Date()): { start: Date; end: Date } | null {
  const minutes = blockMinutes(q);
  // planSchedule keeps 15 minutes from its `now`; start it a step early so the block's own time counts.
  const from = new Date(Math.max(atMinutes(day, fromMinute).getTime() - DROP_STEP * 60_000, now.getTime()));
  if (from.toDateString() !== day.toDateString() && from.getTime() > atMinutes(day, 0).getTime()) return null;
  const eff: SchedulerSettings = { ...s, horizon: 1, maxPerDay: 24 * 60, skipWeekends: false, prefs: {} };
  const plan = planSchedule([{ id: q.id, title: q.title, minutes, effort: null, dueAt: null, planBy: null }], busy, eff, from);
  const p = plan.placed[0];
  if (!p || p.start.toDateString() !== day.toDateString()) return null;
  return { start: p.start, end: p.end };
}

/** Where it lands when it reaches the bottom of the day: the latest free stretch (it stacks, as falling blocks do). */
export function landingAtBottom(q: DropQuest, day: Date, busy: Busy[], s: SchedulerSettings, now = new Date()) {
  const minutes = blockMinutes(q);
  for (let m = s.dayEnd - minutes; m >= s.dayStart; m -= DROP_STEP) {
    const spot = landingFrom(q, day, m, busy, s, now);
    if (spot && spot.start.getTime() === atMinutes(day, m).getTime()) return spot;
  }
  return null;
}

/** "By Fri" for a fixed date, "Around Fri" for a flexible one (the due plan's words). */
export function whenTag(q: Pick<DropQuest, "dueAt" | "planBy">, now = Date.now()): { words: string; fixed: boolean; late: boolean } | null {
  const iso = q.dueAt ?? q.planBy;
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 && days < 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (q.dueAt) return days < 0 ? { words: "Overdue", fixed: true, late: true } : { words: days === 0 ? "Due today" : `By ${day}`, fixed: true, late: days === 0 };
  return { words: days < 0 ? "Flexible" : `Around ${day}`, fixed: false, late: false };
}

/** A song or playlist for Quest Drop (owner, Nov 19: saved to your account, plus one list everyone can add to). */
export type DropSong = { url: string; name: string; by?: string | null; byName?: string | null };

/** A song as typed in: a safe link and a short name (the site's name when none is given). */
export function cleanSong(raw: { url?: unknown; name?: unknown }): DropSong | null {
  const url = typeof raw.url === "string" ? cleanMusicLink(raw.url) : null;
  if (!url) return null;
  const typed = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return { url, name: typed || songSite(url) };
}

/** "Spotify", "YouTube", "Apple Music"… from a link. */
export function songSite(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\.|^music\./, "");
    if (/spotify/.test(h)) return "Spotify";
    if (/youtu/.test(h)) return url.includes("music.youtube") ? "YouTube Music" : "YouTube";
    if (/apple/.test(h)) return "Apple Music";
    if (/soundcloud/.test(h)) return "SoundCloud";
    if (/pandora/.test(h)) return "Pandora";
    return h;
  } catch {
    return "Song";
  }
}
