"use client";

import { useSyncExternalStore } from "react";

/**
 * A quest picked up from the "To schedule" slide-out, waiting to be placed:
 * tap (or drop on) a time on the calendar to put it there.
 */
export type Carried = { id: string; title: string; minutes: number };

let carried: Carried | null = null;
const listeners = new Set<() => void>();

export function carryQuest(q: Carried | null) {
  carried = q;
  listeners.forEach((l) => l());
}
export function getCarried() {
  return carried;
}
export function useCarried(): Carried | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => carried,
    () => null
  );
}
/** The drag type for a quest dragged out of the slide-out with a mouse. */
export const QUEST_DRAG_TYPE = "application/x-quest-to-schedule";
