// One list of what's on the calendar (planner step 4, docs/CALENDAR-PLANNER-DESIGN.md section 2a). Pure: no React,
// no server, so the server, the calendar views and the scheduler can all read the same list.
//
// Today it holds quests (and their further sessions) and Google events, in the order the week grid has always
// drawn them (events first, then quests), so lanes come out the same. Essentials, habits and travel join it in
// later steps (7a, 8); `travelBefore`/`travelAfter` already carry a quest's drive.

import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { getTaskDisplayWindow, sessionRef, showsOnCalendar } from "@/lib/calendar-task-window";

export type CalItem = {
  /** "t:<task id>" | "s:<session id>" | "g:<google id>" */
  ref: string;
  kind: "quest" | "session" | "event";
  title: string;
  /** ISO moments. */
  start: string;
  end: string;
  /** Minutes kept free before and after (driving there and back). */
  travelBefore: number;
  travelAfter: number;
  onGoogle: boolean;
  googleEventId: string | null;
  allDay: boolean;
  state: "placed";
  task?: Task;
  event?: GoogleCalendarEvent;
};

/** The ref of a quest's calendar block: "t:<id>", or "s:<session id>" for a further session. */
export function questRef(t: Pick<Task, "id" | "session_id">): string {
  const r = sessionRef(t);
  return r.startsWith("s:") ? r : `t:${r}`;
}

/**
 * Every view's list: events (not hidden), then the quests that show on the calendar (`showsOnCalendar`), each at
 * its display window. Open quests carry their drive as travel; done ones don't (the drive is over).
 */
export function calendarItems(tasks: Task[], events: GoogleCalendarEvent[], opts: { drives?: Record<string, number>; hiddenEvents?: ReadonlySet<string> } = {}): CalItem[] {
  const out: CalItem[] = [];
  for (const e of events) {
    if (opts.hiddenEvents?.has(e.id)) continue;
    out.push({ ref: `g:${e.id}`, kind: "event", title: e.title, start: e.start, end: e.end, travelBefore: 0, travelAfter: 0, onGoogle: true, googleEventId: e.id, allDay: e.isAllDay, state: "placed", event: e });
  }
  for (const t of tasks) {
    if (!showsOnCalendar(t)) continue;
    const { start, end } = getTaskDisplayWindow(t);
    const drive = t.status !== "completed" ? (opts.drives?.[t.id] ?? 0) : 0;
    out.push({
      ref: questRef(t),
      kind: t.session_id ? "session" : "quest",
      title: t.title,
      start: start.toISOString(),
      end: end.toISOString(),
      travelBefore: drive,
      travelAfter: drive,
      onGoogle: !!t.google_calendar_event_id,
      googleEventId: t.google_calendar_event_id ?? null,
      allDay: false,
      state: "placed",
      task: t,
    });
  }
  return out;
}

/** The time an item keeps busy, travel included (ms since epoch). */
export function busyWindow(item: Pick<CalItem, "start" | "end" | "travelBefore" | "travelAfter">): { start: number; end: number } {
  return { start: Date.parse(item.start) - item.travelBefore * 60_000, end: Date.parse(item.end) + item.travelAfter * 60_000 };
}
