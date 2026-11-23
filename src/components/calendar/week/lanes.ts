// The week grid's layout, out of the render (split plan C2, with planner step 4): where each calendar item sits
// on the grid, and the side-by-side lanes for items that overlap. Pure functions of the items, the days and the
// grid's size, so the same layout can be checked without a browser.

import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { isSameDay } from "@/lib/calendar-dates";
import { sessionRef } from "@/lib/calendar-task-window";
import type { CalItem } from "@/lib/calendar-items";

/** An item on the grid: its day column and its top and bottom in minutes from the grid's first hour. */
export type GridItem =
  | { kind: "task"; key: string; dayIndex: number; top: number; bottom: number; start: Date; end: Date; task: Task }
  | { kind: "event"; key: string; dayIndex: number; top: number; bottom: number; start: Date; end: Date; event: GoogleCalendarEvent };

export type Grid = { days: Date[]; /** The first hour shown (7, or earlier once opened). */ h0: number; /** Minutes the grid holds. */ gridMinutes: number; hourPx: number };

function gridStart(day: Date, h0: number) {
  const x = new Date(day);
  x.setHours(h0, 0, 0, 0);
  return x.getTime();
}
/** Minutes from the top of the grid, clamped to it. */
export function gridOffset(d: Date, day: Date, g: Pick<Grid, "h0" | "gridMinutes">) {
  return Math.min(g.gridMinutes, Math.max(0, (d.getTime() - gridStart(day, g.h0)) / 60_000));
}

/**
 * Where each item lands: timed events and quests on a shown day, inside the hours shown. Those wholly before or
 * after the hours wait behind the Earlier / Later buttons (counted in `hidden`). A short quest still gets room
 * for its card (about 30px), and one late at night moves up just enough to stay inside the grid.
 */
export function placeOnGrid(items: CalItem[], g: Grid): { items: GridItem[]; hidden: { early: number; late: number } } {
  const hidden = { early: 0, late: 0 };
  const out: GridItem[] = [];
  const outside = (start: Date, end: Date, day: Date) => {
    const a = (start.getTime() - gridStart(day, g.h0)) / 60_000;
    const b = (end.getTime() - gridStart(day, g.h0)) / 60_000;
    if (b <= 0) hidden.early++;
    else if (a >= g.gridMinutes) hidden.late++;
    return b <= 0 || a >= g.gridMinutes;
  };
  for (const it of items) {
    if (it.allDay) continue;
    const start = new Date(it.start);
    const end = new Date(it.end);
    const dayIndex = g.days.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) continue;
    const day = g.days[dayIndex];
    if (outside(start, end, day)) continue;
    if (it.event) {
      const top = gridOffset(start, day, g);
      out.push({ kind: "event", key: `e-${it.event.id}`, dayIndex, top, bottom: Math.max(top + 20, gridOffset(end, day, g)), start, end, event: it.event });
    } else if (it.task) {
      const minMins = Math.max(20, (30 / g.hourPx) * 60);
      const top = Math.max(0, Math.min(gridOffset(start, day, g), g.gridMinutes - minMins));
      out.push({ kind: "task", key: `t-${sessionRef(it.task)}`, dayIndex, top, bottom: Math.max(top + minMins, gridOffset(end, day, g)), start, end, task: it.task });
    }
  }
  return { items: out, hidden };
}

/** Side-by-side lanes for overlapping items on the same day: each item's lane and how many lanes its cluster has. */
export function laneLayout(items: { key: string; dayIndex: number; top: number; bottom: number }[], dayCount: number): Map<string, { lane: number; count: number }> {
  type It = (typeof items)[number];
  const lanes = new Map<string, { lane: number; count: number }>();
  for (let d = 0; d < dayCount; d++) {
    const dayItems = items.filter((x) => x.dayIndex === d).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
    let cluster: { it: It; lane: number }[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const count = Math.max(1, ...cluster.map((c) => c.lane + 1));
      cluster.forEach((c) => lanes.set(c.it.key, { lane: c.lane, count }));
      cluster = [];
    };
    for (const it of dayItems) {
      if (it.top >= clusterEnd && cluster.length) flush();
      const laneEnds: number[] = [];
      cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -1, c.it.bottom)));
      let lane = laneEnds.findIndex((end) => end <= it.top);
      if (lane === -1) lane = laneEnds.length;
      cluster.push({ it, lane });
      clusterEnd = Math.max(clusterEnd, it.bottom);
    }
    if (cluster.length) flush();
  }
  return lanes;
}
