"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** Check-in sliders move in halves everywhere (easy to hit, still fine-grained). */
export function useSliderStep(): number {
  return useSyncExternalStore(subscribe, () => 0.5, () => 0.5);
}

export const snapTo = (v: number, step: number) => Math.round(v / step) * step;
