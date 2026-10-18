import "server-only";
import { google } from "googleapis";

function calendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

export type BusyInterval = { start: Date; end: Date };

/**
 * Busy blocks on the user's primary calendar between timeMin/timeMax.
 * v1 scheduling logic (per spec) treats every gap between these as
 * available — no working-hours/time-of-day preferences yet.
 */
export async function listBusyIntervals(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyInterval[]> {
  const calendar = calendarClient(accessToken);
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    },
  });

  const busy = res.data.calendars?.primary?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
}

/**
 * Creates an event on the user's primary calendar for a scheduled task.
 * Returns the created event's id, stored on tasks.google_calendar_event_id
 * so a future edit/reschedule can update the same event instead of
 * duplicating it (two-way sync groundwork).
 */
export async function createCalendarEvent(
  accessToken: string,
  input: { title: string; description?: string; start: Date; end: Date }
): Promise<string> {
  const calendar = calendarClient(accessToken);
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    },
  });

  if (!res.data.id) throw new Error("Google Calendar did not return an event id");
  return res.data.id;
}

/** Removes an event (a quest taken back off the calendar). */
export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const calendar = calendarClient(accessToken);
  await calendar.events.delete({ calendarId: "primary", eventId });
}

/**
 * Updates (moves) an existing event — used when a task already has a
 * calendar event and gets rescheduled, so it's a move rather than a
 * duplicate create.
 */
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  input: { start: Date; end: Date }
): Promise<void> {
  const calendar = calendarClient(accessToken);
  await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: {
      start: { dateTime: input.start.toISOString() },
      end: { dateTime: input.end.toISOString() },
    },
  });
}

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start: string; // ISO
  end: string; // ISO
  isAllDay: boolean;
  /** Which of the person's calendars it's on, and that calendar's colour. */
  calendarId?: string;
  color?: string | null;
};

export type GoogleCalendarInfo = { id: string; name: string; color: string | null; primary: boolean };

/** The calendars in the person's Google list (their own, shared ones, holidays…). */
export async function listCalendars(accessToken: string): Promise<GoogleCalendarInfo[]> {
  const calendar = calendarClient(accessToken);
  const res = await calendar.calendarList.list({ maxResults: 50 });
  return (res.data.items ?? [])
    .filter((c) => c.id && !c.deleted && !c.hidden)
    .map((c) => ({ id: c.id!, name: c.summaryOverride || c.summary || c.id!, color: c.backgroundColor ?? null, primary: !!c.primary }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

/**
 * The user's real Google Calendar appointments in a range — read-only,
 * separate from the app's own "pull a task onto the calendar" flow. Lets
 * the Calendar view show what's actually on someone's calendar, not just
 * quests the app scheduled there. All-day events (date-only, no time) are
 * given a start/end spanning the whole day so they still plot sensibly.
 */
export async function listEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  cal: { id: string; color?: string | null } = { id: "primary" }
): Promise<GoogleCalendarEvent[]> {
  const calendar = calendarClient(accessToken);
  const res = await calendar.events.list({
    calendarId: cal.id,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.id)
    .map((e) => {
      const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
      const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : undefined);
      const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T23:59:59` : undefined);
      if (!start || !end) return null;
      return {
        id: e.id!,
        title: e.summary || "(No title)",
        description: e.description ?? null,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        isAllDay,
        calendarId: cal.id,
        color: cal.color ?? null,
      };
    })
    .filter((e): e is GoogleCalendarEvent => e !== null);
}

/** Events from every calendar in the list (up to 12), each tagged with its calendar. */
export async function listEventsAllCalendars(accessToken: string, timeMin: Date, timeMax: Date): Promise<{ calendars: GoogleCalendarInfo[]; events: GoogleCalendarEvent[] }> {
  let calendars: GoogleCalendarInfo[] = [];
  try {
    calendars = await listCalendars(accessToken);
  } catch {
    // Older grants may not cover the calendar list: fall back to the main calendar.
    return { calendars: [{ id: "primary", name: "My calendar", color: null, primary: true }], events: await listEvents(accessToken, timeMin, timeMax) };
  }
  const lists = await Promise.all(calendars.slice(0, 12).map((c) => listEvents(accessToken, timeMin, timeMax, { id: c.id, color: c.color }).catch(() => [] as GoogleCalendarEvent[])));
  const primaryId = calendars.find((c) => c.primary)?.id;
  // The same meeting can sit on several calendars; show it once.
  const seen = new Set<string>();
  const events = lists.flat().filter((e) => {
    const k = `${e.title}|${e.start}|${e.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { calendars: calendars.slice(0, 12).map((c) => (c.id === primaryId ? { ...c, id: c.id } : c)), events };
}
