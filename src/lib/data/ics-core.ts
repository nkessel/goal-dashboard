import ICAL from "ical.js";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import type { InterestCalendar } from "@/lib/interest-calendars";

/** A calendar feed's events between two times, repeats expanded (at most 400). */
export function parseIcs(text: string, cal: InterestCalendar, from: Date, to: Date): GoogleCalendarEvent[] {
  if (!/BEGIN:VCALENDAR/.test(text)) return [];
  const out: GoogleCalendarEvent[] = [];
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(text));
  } catch {
    return [];
  }
  // Times written in the calendar's own zone (TZID=America/New_York) need that zone known first.
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* a zone it can't read: those times fall back to UTC */
    }
  }
  const lo = from.getTime();
  const hi = to.getTime();
  for (const v of comp.getAllSubcomponents("vevent")) {
    if (out.length >= 400) break;
    let ev: ICAL.Event;
    try {
      ev = new ICAL.Event(v);
    } catch {
      continue;
    }
    if (!ev.startDate) continue;
    const base = {
      title: ev.summary || "(untitled)",
      description: ev.description ? String(ev.description).slice(0, 600) : null,
      location: ev.location || null,
      calendarId: `interest:${cal.id}`,
      calendarName: cal.name,
      color: cal.color ?? null,
      editable: false,
      htmlLink: (v.getFirstPropertyValue("url") as string | null) ?? null,
    };
    const push = (s: ICAL.Time, e: ICAL.Time | null, n: number) => {
      const start = s.toJSDate().getTime();
      const end = e ? e.toJSDate().getTime() : start + (s.isDate ? 86_400_000 : 3_600_000);
      if (end < lo || start > hi) return;
      out.push({ ...base, id: `${cal.id}:${ev.uid || base.title}:${n}`, start: new Date(start).toISOString(), end: new Date(end).toISOString(), isAllDay: s.isDate, recurring: ev.isRecurring() });
    };
    if (ev.isRecurring()) {
      try {
        const it = ev.iterator();
        let next: ICAL.Time | null;
        let n = 0;
        while ((next = it.next()) && n < 500) {
          n++;
          if (next.toJSDate().getTime() > hi) break;
          const o = ev.getOccurrenceDetails(next);
          push(o.startDate, o.endDate, n);
        }
      } catch {
        /* a repeat rule it can't read */
      }
    } else push(ev.startDate, ev.endDate, 0);
  }
  return out;
}

