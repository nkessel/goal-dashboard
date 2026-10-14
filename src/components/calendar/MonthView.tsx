"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { WEEKDAY_LABELS, formatDateParam, getMonthGridWeeks, isSameDay } from "@/lib/calendar-dates";
import { getTaskDisplayWindow } from "@/lib/calendar-task-window";

export function MonthView({
  month,
  today,
  tasks,
  events = [],
  theme = "calm",
}: {
  month: Date;
  today: Date;
  tasks: Task[];
  events?: GoogleCalendarEvent[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const weeks = getMonthGridWeeks(month);
  // Items are placed by the viewer's own local day, so only after mounting.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  return (
    <div
      className="rounded-xl p-2"
      style={{
        background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
        borderStyle: "solid",
        borderWidth: isAdventure ? 2 : 1,
        borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
      }}
    >
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className={isAdventure ? "font-display text-center" : "text-center"}
            style={{
              fontSize: 9,
              fontWeight: isAdventure ? 500 : 600,
              color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)",
              paddingBottom: 4,
            }}
          >
            {label[0]}
          </div>
        ))}

        {weeks.flatMap((week) =>
          week.map((day) => {
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = isSameDay(day, today);
            const dayTasks = mounted ? tasks.filter((t) => isSameDay(getTaskDisplayWindow(t).start, day)) : [];
            const dayEvents = mounted ? events.filter((e) => isSameDay(new Date(e.start), day)) : [];
            const dots = dayTasks.slice(0, 3);
            const eventDots = dayEvents.slice(0, Math.max(0, 3 - dots.length));
            const overflow = dayTasks.length + dayEvents.length - dots.length - eventDots.length;

            return (
              <Link
                key={day.toISOString()}
                href={`/calendar?view=day&date=${formatDateParam(day)}`}
                className="flex aspect-square flex-col items-center gap-0.5 rounded-lg pt-1"
                style={{
                  background: isToday ? (isAdventure ? "rgba(209,161,60,.18)" : "var(--t-accent-soft)") : "transparent",
                  opacity: inMonth ? 1 : 0.35,
                }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
                  style={{
                    background: isToday ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                    color: isToday ? (isAdventure ? "#2a1c10" : "#fff") : "var(--t-ink)",
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {day.getDate()}
                </span>
                <div className="flex items-center gap-0.5" style={{ minHeight: 6 }}>
                  {dots.map((t) => (
                    <span
                      key={t.id}
                      className="block h-1.5 w-1.5 rounded-full"
                      style={{
                        background:
                          t.status === "completed"
                            ? "var(--t-good)"
                            : isAdventure
                              ? "var(--t-gold)"
                              : "var(--t-accent)",
                      }}
                    />
                  ))}
                  {eventDots.map((e) => (
                    <span
                      key={e.id}
                      className="block h-1.5 w-1.5 rounded-full"
                      style={{ background: isAdventure ? "rgba(150,170,230,.85)" : "#7a90d6" }}
                    />
                  ))}
                  {overflow > 0 && <span style={{ fontSize: 7, color: "var(--t-ink-soft)" }}>+{overflow}</span>}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
