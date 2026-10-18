"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** Check-in sliders: halves on touch screens (easier to hit), tenths with a mouse. */
export function useSliderStep(): number {
  return useSyncExternalStore(subscribe, () => (window.matchMedia(QUERY).matches ? 0.5 : 0.1), () => 0.1);
}

export const snapTo = (v: number, step: number) => Math.round(v / step) * step;
