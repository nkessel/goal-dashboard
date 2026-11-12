import { cookies } from "next/headers";
import { listCalendarTasksForOwner } from "@/lib/data/tasks";
import { listEventsAllCalendars, type GoogleCalendarEvent } from "@/lib/google-calendar";
import { addDays, parseDateParam } from "@/lib/calendar-dates";
import type { DailyLayer } from "@/components/calendar/CalendarLayers";
import { TodayDayCalendar } from "./TodayDayCalendar";

/**
 * Today's day calendar, beside Today's quests (owner, Nov 12). Streams in after the rest of Today
 * (it waits on Google), so Today itself never waits for it.
 */
export async function TodayCalendarData({ ownerId, token, dayKey, daily, theme }: { ownerId: string; token: string | null | undefined; dayKey: string; daily: DailyLayer; theme: "calm" | "adventure" }) {
  // The server runs on UTC: a day either side, so the evening isn't cut off in the viewer's time zone.
  const day = parseDateParam(dayKey);
  const from = addDays(day, -1);
  const to = addDays(day, 2);
  const skip = decodeURIComponent((await cookies()).get("cal-skip")?.value ?? "").split("|").filter(Boolean);
  const [tasks, google] = await Promise.all([
    listCalendarTasksForOwner(ownerId, from, to).catch(() => []),
    token ? listEventsAllCalendars(token, from, to, skip).catch(() => null) : Promise.resolve(null),
  ]);
  const imported = new Set(tasks.map((t) => t.google_calendar_event_id).filter((id): id is string => Boolean(id)));
  const events: GoogleCalendarEvent[] = (google?.events ?? []).filter((e) => !imported.has(e.id));
  return <TodayDayCalendar dayKey={dayKey} tasks={tasks} events={events} daily={daily} theme={theme} />;
}
