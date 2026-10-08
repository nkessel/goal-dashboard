"use client";

import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { addDays, formatDateParam, isSameDay, parseDateParam, startOfWeek } from "@/lib/calendar-dates";
import { WeekView, useNowMinute } from "./WeekView";

/** One day: a strip to hop between this week's days, then that day's time grid. */
export function DayView({
  dateKey,
  tasks,
  events = [],
  theme = "calm",
}: {
  dateKey: string;
  tasks: Task[];
  events?: GoogleCalendarEvent[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const date = parseDateParam(dateKey);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i));
  const nowMinute = useNowMinute();
  const now = nowMinute ? new Date(nowMinute * 60_000) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between px-1">
        {weekDays.map((day) => {
          const selected = isSameDay(day, date);
          const isToday = !!now && isSameDay(day, now);
          return (
            <Link key={formatDateParam(day)} href={`/calendar?view=day&date=${formatDateParam(day)}`} className="flex flex-col items-center gap-1">
              <span
                className="text-[11.5px]"
                style={{
                  color: selected ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)",
                  fontWeight: selected ? 700 : 400,
                  opacity: isAdventure && !selected ? 0.7 : 1,
                }}
              >
                {day.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[14px] tabular-nums"
                style={{
                  background: selected ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                  border: isToday && !selected ? `1.5px solid ${isAdventure ? "var(--t-gold)" : "var(--t-accent)"}` : undefined,
                  color: selected ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-cream)" : "var(--t-ink)",
                  fontWeight: selected ? 700 : 400,
                }}
              >
                {day.getDate()}
              </span>
            </Link>
          );
        })}
      </div>
      <WeekView dayKeys={[dateKey]} tasks={tasks} events={events} theme={theme} />
    </div>
  );
}
