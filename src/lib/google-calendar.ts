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
