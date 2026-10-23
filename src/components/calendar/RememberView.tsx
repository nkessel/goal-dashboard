"use client";

import { useEffect } from "react";

/**
 * Saves the calendar view (and its day count) so the calendar opens on it
 * next time. A cookie, so each device (phone, computer) keeps its own, and
 * named for the person, so two people on one browser keep theirs apart.
 * Read back by the calendar page ("cal-view-<id>") when a link names no view.
 */
export function RememberView({ view, n, who }: { view: string; n: number; who: string }) {
  useEffect(() => {
    document.cookie = `cal-view-${who}=${encodeURIComponent(`${view}|${n}`)}; path=/; max-age=31536000; samesite=lax`;
  }, [view, n, who]);
  return null;
}
