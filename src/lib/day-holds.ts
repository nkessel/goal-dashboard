"use client";

import { saveSchedulerSettingsAction } from "@/app/actions";
import { localDayKey, type DayHold, type Meal } from "@/lib/auto-schedule";

// The scheduler settings as last saved from here (the page's copy is stale until it refreshes).
let savedSettings: Record<string, unknown> | null = null;
export const getSavedSettings = () => savedSettings;
const listeners = new Set<() => void>();
/** For useSyncExternalStore: redraw when settings are saved from here. */
export function subscribeSavedSettings(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function keep(next: Record<string, unknown>) {
  savedSettings = next;
  for (const fn of listeners) fn();
}

/** Change a daily event (meal, wind-down, or one of your own "e:<id>") for every day. */
export async function saveDailyEvent(base: Record<string, unknown> | null, key: string, patch: Partial<Meal>) {
  const cur = { ...(savedSettings ?? base ?? {}) } as Record<string, unknown> & { meals?: Record<string, Partial<Meal>> };
  const meals = { ...(cur.meals ?? {}) };
  meals[key] = { ...(meals[key] ?? {}), ...patch };
  const next = { ...cur, meals };
  keep(next);
  try {
    const local = JSON.parse(window.localStorage.getItem("auto-schedule") || "{}");
    window.localStorage.setItem("auto-schedule", JSON.stringify({ ...local, meals }));
  } catch {
    /* storage unavailable */
  }
  await saveSchedulerSettingsAction(next);
}

/** Keep, move or leave out a non-negotiable (or a habit, "h:<id>") for one day; null lets it float again. */
export async function saveDayHold(base: Record<string, unknown> | null, dayKey: string, key: string, hold: DayHold | null) {
  const cur = { ...(savedSettings ?? base ?? {}) } as Record<string, unknown> & { essentialDays?: Record<string, Record<string, DayHold>> };
  const days = { ...(cur.essentialDays ?? {}) };
  // Only a week back is kept.
  const cutoff = localDayKey(new Date(Date.now() - 7 * 86_400_000));
  for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
  const day = { ...(days[dayKey] ?? {}) };
  if (hold) day[key] = hold;
  else delete day[key];
  days[dayKey] = day;
  const next = { ...cur, essentialDays: days };
  keep(next);
  try {
    const local = JSON.parse(window.localStorage.getItem("auto-schedule") || "{}");
    window.localStorage.setItem("auto-schedule", JSON.stringify({ ...local, essentialDays: days }));
  } catch {
    /* storage unavailable */
  }
  await saveSchedulerSettingsAction(next);
}
