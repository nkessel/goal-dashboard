"use client";

import { useState } from "react";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import {
  HOUR_START,
  HOUR_END,
  WEEKDAY_LABELS,
  addDays,
  dateAtHour,
  formatDateParam,
  formatHourLabel,
  isSameDay,
  startOfWeek,
} from "@/lib/calendar-dates";
import { useCalendarDragSelect } from "@/lib/use-calendar-drag-select";
import { CalendarAddPopup } from "./CalendarAddPopup";
import { CalendarTaskChip, getTaskDisplayWindow } from "./CalendarTaskChip";
import { GoogleEventChip } from "./GoogleEventChip";

export function DayView({
  date,
  today,
  tasks,
  events = [],
  theme = "calm",
}: {
  date: Date;
  today: Date;
  tasks: Task[];
  events?: GoogleCalendarEvent[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const weekStart = startOfWeek(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  const byHour = new Map<number, Task[]>();
  for (const task of tasks) {
    const { start } = getTaskDisplayWindow(task);
    const hour = Math.min(Math.max(start.getHours(), HOUR_START), HOUR_END);
    const list = byHour.get(hour) ?? [];
    list.push(task);
    byHour.set(hour, list);
  }

  const eventsByHour = new Map<number, GoogleCalendarEvent[]>();
  for (const event of events) {
    const start = new Date(event.start);
    const hour = Math.min(Math.max(start.getHours(), HOUR_START), HOUR_END);
    const list = eventsByHour.get(hour) ?? [];
    list.push(event);
    eventsByHour.set(hour, list);
  }

  // Drag (or tap) a time range within this single day to open the
  // add-quest popup — same behavior as WeekView, just a single "day column"
  // (dayIndex is always 0 here).
  const [addRange, setAddRange] = useState<{ start: Date; end: Date } | null>(null);
  const { startDrag, enterCell, isSelected } = useCalendarDragSelect(({ lowRow, highRow }) => {
    setAddRange({
      start: dateAtHour(date, HOUR_START + lowRow),
      end: dateAtHour(date, HOUR_START + highRow + 1),
    });
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Day strip */}
      <div className="flex justify-between">
        {weekDays.map((day, i) => {
          const selected = isSameDay(day, date);
          const isToday = isSameDay(day, today);
          return (
            <Link
              key={day.toISOString()}
              href={`/calendar?view=day&date=${formatDateParam(day)}`}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="text-[11px]"
                style={{
                  color: selected ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "var(--t-ink-soft)",
                  fontWeight: selected ? 700 : 400,
                  opacity: isAdventure && !selected ? 0.7 : 1,
                }}
              >
                {WEEKDAY_LABELS[i][0]}
              </span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
                style={{
                  background: selected ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
                  border: isToday && !selected ? `1.5px solid ${isAdventure ? "var(--t-gold)" : "var(--t-accent)"}` : undefined,
                  color: selected ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-cream)" : "var(--t-ink)",
                  fontWeight: selected ? 700 : 400,
                  opacity: isAdventure && !selected ? 0.85 : 1,
                }}
              >
                {day.getDate()}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Agenda */}
      <div className="flex flex-col">
        {hours.map((hour) => {
          const hourTasks = byHour.get(hour) ?? [];
          const hourEvents = eventsByHour.get(hour) ?? [];
          const row = hour - HOUR_START;
          return (
            <div
              key={hour}
              className="flex gap-3 py-2"
              style={{
                borderTop: `1px solid ${isAdventure ? "rgba(243,233,207,.15)" : "var(--t-card-border)"}`,
              }}
            >
              <div
                className="w-11 shrink-0 pt-0.5 text-[11px]"
                style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.6 : 1 }}
              >
                {formatHourLabel(hour)}
              </div>
              {/* The drag-to-add hit target for this hour — checking
                  e.target === e.currentTarget on pointerdown keeps a tap on
                  an existing chip (a descendant here, unlike WeekView's
                  sibling-cell layout) from starting a new drag; pointerenter
                  fires on this wrapper's whole box regardless, so dragging
                  across an hour that already has a chip still extends the
                  selection through it. */}
              <div
                className="flex min-h-[28px] flex-1 touch-none select-none flex-col gap-1.5 rounded-md"
                style={{
                  cursor: "pointer",
                  background: isSelected(0, row)
                    ? isAdventure
                      ? "rgba(209,161,60,.25)"
                      : "var(--t-accent-soft)"
                    : undefined,
                }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  startDrag(0, row);
                }}
                onPointerEnter={() => enterCell(0, row)}
              >
                {hourEvents.map((event) => (
                  <GoogleEventChip key={event.id} event={event} theme={theme} />
                ))}
                {hourTasks.map((task) => (
                  <CalendarTaskChip key={task.id} task={task} theme={theme} showTime />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {addRange && (
        <CalendarAddPopup
          start={addRange.start}
          end={addRange.end}
          theme={theme}
          onClose={() => setAddRange(null)}
        />
      )}
    </div>
  );
}
