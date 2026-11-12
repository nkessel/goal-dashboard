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

/**
 * A calendar on screen that takes quests dragged from elsewhere by finger or mouse (dnd-kit drags on Today,
 * owner Nov 12: "the calendar next to the today screen so the user can … just drag items into the calendar").
 * The dragging list asks at each move whether a calendar is under the point (it shows where it would land),
 * and on letting go whether one took it.
 */
export type CalendarDropTarget = {
  hover: (x: number, y: number, q: Carried) => boolean;
  drop: (x: number, y: number, q: Carried) => boolean;
  leave: () => void;
};
const dropTargets = new Set<CalendarDropTarget>();
export function registerCalendarDrop(t: CalendarDropTarget) {
  dropTargets.add(t);
  return () => {
    dropTargets.delete(t);
  };
}
export function hoverCalendarAt(x: number, y: number, q: Carried): boolean {
  let hit = false;
  for (const t of dropTargets) {
    if (!hit && t.hover(x, y, q)) hit = true;
    else t.leave();
  }
  return hit;
}
export function dropOnCalendarAt(x: number, y: number, q: Carried): boolean {
  let took = false;
  for (const t of dropTargets) {
    if (!took && t.drop(x, y, q)) took = true;
    else t.leave();
  }
  return took;
}
export function leaveCalendars() {
  for (const t of dropTargets) t.leave();
}
