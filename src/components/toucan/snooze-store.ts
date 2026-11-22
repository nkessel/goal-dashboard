import type { PlanTarget } from "./talk";

/** An invitation put off with Snooze, and what it offers when it comes back. */
export type SnoozeNote = { text: string; until: number; taskId?: string; plan?: PlanTarget; begin?: string; talk?: string; talkLabel?: string; promiseId?: string; quiz?: boolean };
export const SNOOZE_KEY = "toucan-snoozed";
export function readSnoozed(): SnoozeNote[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) || "[]") as SnoozeNote[];
    // Anything snoozed more than a day ago has had its moment.
    return Array.isArray(v) ? v.filter((n) => n && typeof n.text === "string" && n.until > Date.now() - 86_400_000) : [];
  } catch {
    return [];
  }
}
export function writeSnoozed(list: SnoozeNote[]) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(list.slice(-20)));
  } catch {}
}

/** The check-ins the toucan started itself today: how many, and which (a part of the day, the gym…). */
export function readCheckins(day: string): { count: number; slots: string[] } {
  try {
    const v = JSON.parse(window.localStorage.getItem("toucan-checkins") || "null") as { day?: string; count?: number; slots?: string[] } | null;
    if (v?.day === day) return { count: v.count ?? 0, slots: v.slots ?? [] };
  } catch {}
  return { count: 0, slots: [] };
}
export function writeCheckins(day: string, v: { count: number; slots: string[] }) {
  try {
    window.localStorage.setItem("toucan-checkins", JSON.stringify({ day, ...v }));
  } catch {}
}
export const todayKey = () => new Date().toDateString();

/** 9am tomorrow: when a "tomorrow" snooze comes back. */
export function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}
