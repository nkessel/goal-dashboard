"use client";

import { useSyncExternalStore } from "react";

/**
 * How the Great Toucan Spirit's walkthrough cards look (owner, Nov 15): "A with the narrator" by default,
 * Original A and Blend 3 as backups in Settings › Help. Kept on this device (`tour-look`).
 */
export type TourLook = "narrator" | "spirit" | "page";

export const TOUR_LOOKS: { key: TourLook; label: string; hint: string }[] = [
  { key: "narrator", label: "Spirit card", hint: "The teal spirit card, the toucan at its corner" },
  { key: "spirit", label: "Speech bubble", hint: "The spirit card as his speech bubble, the toucan below it" },
  { key: "page", label: "Storybook page", hint: "A parchment page with the spirit's glow" },
];

const KEY = "tour-look";

function read(): TourLook {
  try {
    const v = localStorage.getItem(KEY);
    return v === "spirit" || v === "page" ? v : "narrator";
  } catch {
    return "narrator";
  }
}

export function setTourLook(look: TourLook) {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("tour-look-change"));
}

function subscribe(cb: () => void) {
  window.addEventListener("tour-look-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("tour-look-change", cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTourLook(): TourLook {
  return useSyncExternalStore(subscribe, read, () => "narrator");
}
