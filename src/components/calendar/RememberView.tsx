"use client";

import { useEffect } from "react";

// Read back by the calendar page (as "cal-view") when a link names no view.
const CALENDAR_VIEW_COOKIE = "cal-view";

/** Saves the calendar view (and its day count) so the calendar opens on it next time. */
export function RememberView({ view, n }: { view: string; n: number }) {
  useEffect(() => {
    document.cookie = `${CALENDAR_VIEW_COOKIE}=${encodeURIComponent(`${view}|${n}`)}; path=/; max-age=31536000; samesite=lax`;
  }, [view, n]);
  return null;
}
