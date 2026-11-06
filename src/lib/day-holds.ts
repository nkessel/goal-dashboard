"use client";

import { saveSchedulerSettingsAction } from "@/app/actions";
import { localDayKey, type DayHold } from "@/lib/auto-schedule";

// The scheduler settings as last saved from here (the page's copy is stale until it refreshes).
let savedSettings: Record<string, unknown> | null = null;
export const getSavedSettings = () => savedSettings;

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
  savedSettings = next;
  try {
    const local = JSON.parse(window.localStorage.getItem("auto-schedule") || "{}");
    window.localStorage.setItem("auto-schedule", JSON.stringify({ ...local, essentialDays: days }));
  } catch {
    /* storage unavailable */
  }
  await saveSchedulerSettingsAction(next);
}
