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
  input: { start?: Date; end?: Date; title?: string; description?: string | null },
  calendarId = "primary"
): Promise<void> {
  const calendar = calendarClient(accessToken);
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      ...(input.start ? { start: { dateTime: input.start.toISOString() } } : {}),
      ...(input.end ? { end: { dateTime: input.end.toISOString() } } : {}),
      ...(input.title !== undefined ? { summary: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description ?? "" } : {}),
    },
  });
}

/** One of the person's Google calendars (their own, shared ones, holidays…). */
export type GoogleCalendarSource = {
  id: string;
  name: string;
  color: string | null;
  primary: boolean;
  /** Shown in Google Calendar itself (the default here too). */
  selected: boolean;
  /** Events on it can be moved and edited. */
  writable: boolean;
};

export async function listCalendars(accessToken: string): Promise<GoogleCalendarSource[]> {
  const calendar = calendarClient(accessToken);
  const res = await calendar.calendarList.list({ maxResults: 250 });
  return (res.data.items ?? [])
    .filter((c) => c.id && !c.deleted && !c.hidden)
    .map((c) => ({
      id: c.id!,
      name: c.summaryOverride || c.summary || c.id!,
      color: c.backgroundColor ?? null,
      primary: Boolean(c.primary),
      selected: Boolean(c.selected || c.primary),
      writable: c.accessRole === "owner" || c.accessRole === "writer",
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start: string; // ISO
  end: string; // ISO
  isAllDay: boolean;
  /** Which calendar it's on ("primary" when unknown). */
  calendarId?: string;
  /** That calendar's colour. */
  color?: string | null;
  /** Can be moved and edited from here. */
  editable?: boolean;
};

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
  source: { id: string; color?: string | null; writable?: boolean } = { id: "primary", writable: true }
): Promise<GoogleCalendarEvent[]> {
  const calendar = calendarClient(accessToken);
  const res = await calendar.events.list({
    calendarId: source.id,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  return (res.data.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.id)
    .map((e): GoogleCalendarEvent | null => {
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
        calendarId: source.id,
        color: source.color ?? null,
        // Only the organiser's copy can be changed; invitations stay as they are.
        editable: Boolean(source.writable) && (e.organizer?.self ?? true) && !e.recurringEventId,
      };
    })
    .filter((e): e is GoogleCalendarEvent => e !== null);
}
