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
  hourRowSpan,
  isSameDay,
} from "@/lib/calendar-dates";
import { useCalendarDragSelect } from "@/lib/use-calendar-drag-select";
import { CalendarAddPopup } from "./CalendarAddPopup";
import { CalendarTaskChip, getTaskDisplayWindow } from "./CalendarTaskChip";
import { GoogleEventChip } from "./GoogleEventChip";

export function WeekView({
  weekStart,
  today,
  tasks,
  events = [],
  theme = "calm",
}: {
  weekStart: Date;
  today: Date;
  tasks: Task[];
  events?: GoogleCalendarEvent[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hourCount = HOUR_END - HOUR_START + 1;

  // Drag (or tap) a time range on a day's column to open the add-quest
  // popup — either creating a new quest already scheduled there, or
  // searching existing quests to drop into that slot instead.
  const [addRange, setAddRange] = useState<{ start: Date; end: Date } | null>(null);
  const { startDrag, enterCell, isSelected } = useCalendarDragSelect(({ dayIndex, lowRow, highRow }) => {
    const day = days[dayIndex];
    if (!day) return;
    setAddRange({
      start: dateAtHour(day, HOUR_START + lowRow),
      end: dateAtHour(day, HOUR_START + highRow + 1),
    });
  });

  const placed = tasks
    .map((task) => {
      const { start, end } = getTaskDisplayWindow(task);
      const dayIndex = days.findIndex((d) => isSameDay(d, start));
      if (dayIndex === -1) return null;
      const { startRow, endRow } = hourRowSpan(start, end);
      return { task, dayIndex, startRow, endRow };
    })
    .filter((x): x is { task: Task; dayIndex: number; startRow: number; endRow: number } => x !== null);

  const placedEvents = events
    .map((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const dayIndex = days.findIndex((d) => isSameDay(d, start));
      if (dayIndex === -1) return null;
      const { startRow, endRow } = hourRowSpan(start, end);
      return { event, dayIndex, startRow, endRow };
    })
    .filter(
      (x): x is { event: GoogleCalendarEvent; dayIndex: number; startRow: number; endRow: number } => x !== null
    );

  const lineColor = isAdventure ? "rgba(122,82,51,.25)" : "var(--t-card-border)";

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
      <div
        className="grid"
        style={{
          gridTemplateColumns: "24px repeat(7, minmax(0, 1fr))",
          gridTemplateRows: `auto repeat(${hourCount}, 42px)`,
          columnGap: 2,
        }}
      >
        <div />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <Link
              key={day.toISOString()}
              href={`/calendar?view=day&date=${formatDateParam(day)}`}
              className="flex flex-col items-center pb-1.5 text-center"
              style={{ borderBottom: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
            >
              <span
                className={isAdventure ? "font-display" : ""}
                style={{
                  fontSize: 9,
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? (isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)") : "var(--t-ink-soft)",
                }}
              >
                {WEEKDAY_LABELS[i]}
              </span>
            </Link>
          );
        })}

        {days.map((day, i) =>
          isSameDay(day, today) ? (
            <div
              key={`hl-${i}`}
              style={{
                gridColumn: i + 2,
                gridRow: `2 / ${hourCount + 2}`,
                background: isAdventure ? "rgba(209,161,60,.10)" : "var(--t-accent-soft)",
                opacity: isAdventure ? 1 : 0.4,
              }}
            />
          ) : null
        )}

        {Array.from({ length: hourCount }, (_, row) => (
          <div
            key={`hour-${row}`}
            style={{
              gridColumn: 1,
              gridRow: row + 2,
              fontSize: 8.5,
              lineHeight: 1.1,
              whiteSpace: "pre-line",
              color: "var(--t-ink-soft)",
              paddingTop: 2,
              borderTop: `1px solid ${lineColor}`,
            }}
          >
            {formatHourLabel(HOUR_START + row).replace(" ", "\n")}
          </div>
        ))}
        {Array.from({ length: hourCount }, (_, row) => (
          <div
            key={`line-${row}`}
            style={{ gridColumn: "2 / 9", gridRow: row + 2, borderTop: `1px solid ${lineColor}` }}
          />
        ))}

        {/* Drag-to-add hit cells — one per (day, hour). Rendered before the
            task/event chips below so a chip occupying the same cell stacks
            visually on top and keeps first claim on pointer events there;
            dragging must start from genuinely empty space. */}
        {days.map((_, dayIndex) =>
          Array.from({ length: hourCount }, (_, row) => (
            <div
              key={`hit-${dayIndex}-${row}`}
              className="touch-none select-none"
              style={{
                gridColumn: dayIndex + 2,
                gridRow: row + 2,
                cursor: "pointer",
                background: isSelected(dayIndex, row)
                  ? isAdventure
                    ? "rgba(209,161,60,.35)"
                    : "var(--t-accent-soft)"
                  : undefined,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                startDrag(dayIndex, row);
              }}
              onPointerEnter={() => enterCell(dayIndex, row)}
            />
          ))
        )}

        {placedEvents.map(({ event, dayIndex, startRow, endRow }) => (
          <div
            key={event.id}
            style={{ gridColumn: dayIndex + 2, gridRow: `${startRow + 2} / ${endRow + 2}`, margin: 2 }}
          >
            <GoogleEventChip event={event} theme={theme} compact />
          </div>
        ))}
        {placed.map(({ task, dayIndex, startRow, endRow }) => (
          <div
            key={task.id}
            style={{ gridColumn: dayIndex + 2, gridRow: `${startRow + 2} / ${endRow + 2}`, margin: 2 }}
          >
            <CalendarTaskChip task={task} theme={theme} compact />
          </div>
        ))}
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
