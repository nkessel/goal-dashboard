"use client";

import type { TourState } from "@/app/actions";

/**
 * The walkthrough's place, cached on this device (`tour-state`) and kept on the account
 * (`life_wheel.tour`, through saveTourAction). Every change says `tour-change`.
 */
const KEY = "tour-state";

export function readTour(): TourState | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && typeof v === "object" ? (v as TourState) : null;
  } catch {
    return null;
  }
}

export function writeTour(s: TourState, save = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("tour-change"));
  if (save) void import("@/app/actions").then((m) => m.saveTourAction(s)).catch(() => {});
}

export function subscribeTour(cb: () => void) {
  window.addEventListener("tour-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("tour-change", cb);
    window.removeEventListener("storage", cb);
  };
}

/** A tip the person closed stays closed (the XP guide in the quest editor, owner Nov 13). */
export function tipHidden(id: string) {
  return !!readTour()?.hidden?.includes(id);
}

export function hideTip(id: string) {
  const t = readTour() ?? { step: "intro" };
  writeTour({ ...t, hidden: [...new Set([...(t.hidden ?? []), id])] });
}

/** Start the walkthrough again from the top (Settings › Help). */
export function restartTour() {
  const t = readTour();
  writeTour({ step: "intro", done: false, hidden: t?.hidden ?? [] });
}
