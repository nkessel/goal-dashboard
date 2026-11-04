import "server-only";
import { parseIcs } from "./ics-core";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import type { InterestCalendar } from "@/lib/interest-calendars";

/** Fetch a calendar feed (cached an hour) and its events between two times, repeats expanded. */
export async function feedEvents(cal: InterestCalendar, from: Date, to: Date): Promise<GoogleCalendarEvent[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let text = "";
  try {
    const res = await fetch(cal.url, { signal: ctrl.signal, next: { revalidate: 3600 }, headers: { accept: "text/calendar, */*" } });
    if (!res.ok) return [];
    text = await res.text();
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
  return parseIcs(text, cal, from, to);
}

/** Whether a link is itself a feed, or names one ("/events.ics", "?ical=1"…): the feed's address, or null. */
export async function findFeed(url: string): Promise<string | null> {
  const tries = [url];
  try {
    const u = new URL(url);
    tries.push(`${u.origin}/events.ics`, `${u.origin}/events/?ical=1`, `${u.origin}/?ical=1`, `${u.origin}/events/feed/ical/`, `${u.origin}/calendar.ics`);
  } catch {
    return null;
  }
  for (const t of tries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(t, { signal: ctrl.signal, headers: { accept: "text/calendar, */*" } });
      if (!res.ok) continue;
      const head = (await res.text()).slice(0, 2000);
      if (/BEGIN:VCALENDAR/.test(head)) return t;
    } catch {
      /* next */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
