/** Hour height: condensed by default; drag the times on the left to zoom. */
export const DEFAULT_HOUR_PX = 36;

/** The hour last looked at on the calendar, if it was within the last few minutes (moving between days). */
export function savedCalHour(): number | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem("cal-hour") ?? "null") as { hour: number; at: number } | null;
    return saved && Date.now() - saved.at < 5 * 60_000 ? saved.hour : null;
  } catch {
    return null;
  }
}

/** Adventure quests are picture cards, so its hours start roomier. */
export const ADVENTURE_HOUR_PX = 56;

export const MIN_HOUR_PX = 18;

export const MAX_HOUR_PX = 96;

export const ZOOM_KEY = "calendar-hour-px";

/** How many days the zoom slider shows (partway too), remembered on this device. */
export const SPAN_KEY = "calendar-day-span";

export const MAX_SPAN = 14;
