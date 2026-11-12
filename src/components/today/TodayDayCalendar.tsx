"use client";

import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { WeekView } from "@/components/calendar/WeekView";
import { useCalendarLayers, type DailyLayer } from "@/components/calendar/CalendarLayers";

/** Today on the calendar, with the calendar screen's own choices (which calendars show, the cards' look). */
export function TodayDayCalendar({ dayKey, tasks, events, daily, theme }: { dayKey: string; tasks: Task[]; events: GoogleCalendarEvent[]; daily: DailyLayer; theme: "calm" | "adventure" }) {
  const layers = useCalendarLayers();
  const shownTasks = layers.quests ? tasks.filter((t) => layers.done || t.status !== "completed") : [];
  const shownEvents = events.filter((e) => !layers.hidden.includes(e.calendarId ?? "primary") && (layers.allDay || !e.isAllDay));
  return <WeekView embedded dayKeys={[dayKey]} visible={1} tasks={shownTasks} events={shownEvents} theme={theme} portraits={layers.portraits} card={layers.card} daily={daily} essentials={layers.essentials} habitLook={layers.habits} />;
}
