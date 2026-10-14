"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import {
  HOUR_START,
  HOUR_END,
  dateAtHour,
  formatDateParam,
  formatHourLabel,
  formatShortTimeRange,
  isSameDay,
  parseDateParam,
} from "@/lib/calendar-dates";
import { useCalendarDragSelect } from "@/lib/use-calendar-drag-select";
import { CalendarAddPopup } from "./CalendarAddPopup";
import { CalendarTaskChip, getTaskDisplayWindow } from "./CalendarTaskChip";
import { GoogleEventChip } from "./GoogleEventChip";

const HOUR_PX = 48;

/** The current minute, ticking once a minute (0 on the server, so nothing time-dependent renders there). */
export function useNowMinute() {
  return useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 30_000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000),
    () => 0
  );
}

export function WeekView({
  dayKeys,
  tasks,
  events = [],
  theme = "calm",
}: {
  /** The columns to show (YYYY-MM-DD, read in the viewer's own time zone) — 7 for a week, 1 for a day. */
  dayKeys: string[];
  tasks: Task[];
  events?: GoogleCalendarEvent[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const days = dayKeys.map((k) => parseDateParam(k));
  const nowMinute = useNowMinute();
  const now = nowMinute ? new Date(nowMinute * 60_000) : null;
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

  // How wide one day's column is: overlapping items split it into lanes when
  // there's room, and fan out (overlapping, slightly offset) when there isn't.
  const boxRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setColWidth((el.clientWidth - 20 - 40) / Math.max(1, days.length));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [days.length]);

  const gridStart = (d: Date) => {
    const x = new Date(d);
    x.setHours(HOUR_START, 0, 0, 0);
    return x.getTime();
  };
  const gridMinutes = hourCount * 60;
  /** Minutes from the top of the grid, clamped to it. */
  const offset = (d: Date, day: Date) => Math.min(gridMinutes, Math.max(0, (d.getTime() - gridStart(day)) / 60_000));

  type Item =
    | { kind: "task"; key: string; dayIndex: number; top: number; bottom: number; start: Date; end: Date; task: Task }
    | { kind: "event"; key: string; dayIndex: number; top: number; bottom: number; start: Date; end: Date; event: GoogleCalendarEvent };
  const items: Item[] = [];
  for (const event of events) {
    if (event.isAllDay) continue;
    const start = new Date(event.start);
    const end = new Date(event.end);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) continue;
    const top = offset(start, days[dayIndex]);
    items.push({ kind: "event", key: `e-${event.id}`, dayIndex, top, bottom: Math.max(top + 20, offset(end, days[dayIndex])), start, end, event });
  }
  for (const task of tasks) {
    const { start, end } = getTaskDisplayWindow(task);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) continue;
    const top = offset(start, days[dayIndex]);
    items.push({ kind: "task", key: `t-${task.id}`, dayIndex, top, bottom: Math.max(top + 20, offset(end, days[dayIndex])), start, end, task });
  }

  // Side-by-side lanes for overlapping items on the same day.
  const lanes = new Map<string, { lane: number; count: number }>();
  for (let d = 0; d < days.length; d++) {
    const dayItems = items.filter((x) => x.dayIndex === d).sort((a, b) => a.top - b.top || b.bottom - a.bottom);
    let cluster: { it: Item; lane: number }[] = [];
    let clusterEnd = -1;
    const flush = () => {
      const count = Math.max(1, ...cluster.map((c) => c.lane + 1));
      cluster.forEach((c) => lanes.set(c.it.key, { lane: c.lane, count }));
      cluster = [];
    };
    for (const it of dayItems) {
      if (it.top >= clusterEnd && cluster.length) flush();
      const laneEnds: number[] = [];
      cluster.forEach((c) => (laneEnds[c.lane] = Math.max(laneEnds[c.lane] ?? -1, c.it.bottom)));
      let lane = laneEnds.findIndex((end) => end <= it.top);
      if (lane === -1) lane = laneEnds.length;
      cluster.push({ it, lane });
      clusterEnd = Math.max(clusterEnd, it.bottom);
    }
    if (cluster.length) flush();
  }

  const lineColor = isAdventure ? "rgba(122,82,51,.25)" : "var(--t-card-border)";

  return (
    <div
      ref={boxRef}
      className={`rounded-2xl p-2.5 ${isAdventure ? "parchment" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `40px repeat(${days.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${hourCount}, ${HOUR_PX}px)`,
          columnGap: 2,
        }}
      >
        <div />
        {days.map((day, i) => {
          const isToday = !!now && isSameDay(day, now);
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
                  fontSize: 13.5,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? (isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)") : "var(--t-ink-soft)",
                }}
              >
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span
                className="flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] tabular-nums"
                style={
                  isToday
                    ? { background: isAdventure ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", fontWeight: 700 }
                    : { color: "var(--t-ink)" }
                }
              >
                {day.getDate()}
              </span>
            </Link>
          );
        })}

        {days.map((day, i) =>
          now && isSameDay(day, now) ? (
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
              fontSize: 11.5,
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
            style={{ gridColumn: `2 / ${days.length + 2}`, gridRow: row + 2, borderTop: `1px solid ${lineColor}` }}
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

        {/* Items, placed to the minute, plus the current-time line */}
        {days.map((day, dayIndex) => {
          const dayItems = items.filter((it) => it.dayIndex === dayIndex);
          const nowTop = now && isSameDay(day, now) ? offset(now, day) : null;
          const showNow = nowTop !== null && nowTop > 0 && nowTop < gridMinutes;
          return (
            <div key={`col-${dayIndex}`} className="pointer-events-none relative" style={{ gridColumn: dayIndex + 2, gridRow: `2 / ${hourCount + 2}` }}>
              {dayItems.map((it) => {
                const l = lanes.get(it.key) ?? { lane: 0, count: 1 };
                const height = ((it.bottom - it.top) / 60) * HOUR_PX - 2;
                const past = now ? it.end.getTime() <= now.getTime() : false;
                const label = formatShortTimeRange(it.start, it.end);
                const oneLine = height < 34;
                // Too narrow to split (phones, multi-day views): fan out instead.
                const fan = l.count > 1 && colWidth > 0 && colWidth / l.count < 46;
                const step = Math.min(8, colWidth / (l.count + 2));
                return (
                  <div
                    key={it.key}
                    className="pointer-events-auto absolute"
                    style={{
                      top: (it.top / 60) * HOUR_PX + 1,
                      height,
                      left: fan ? l.lane * step : `${(100 / l.count) * l.lane}%`,
                      width: fan ? `calc(100% - ${l.lane * step + 1}px)` : `calc(${100 / l.count}% - 2px)`,
                      zIndex: (it.kind === "task" ? 2 : 1) + (fan ? l.lane * 2 : 0),
                      boxShadow: fan && l.lane > 0 ? "-2px 0 4px rgba(60,40,10,.25)" : undefined,
                      borderRadius: 6,
                      // Faded but still opaque, so past items fanned over each other stay legible.
                      filter: past ? "saturate(.2) contrast(.6) brightness(1.12)" : undefined,
                    }}
                  >
                    {it.kind === "event" ? (
                      <GoogleEventChip event={it.event} theme={theme} compact timeLabel={label} oneLine={oneLine} />
                    ) : (
                      <CalendarTaskChip task={it.task} theme={theme} compact timeLabel={label} oneLine={oneLine} />
                    )}
                  </div>
                );
              })}
              {showNow && (
                <div aria-hidden className="absolute left-0 right-0" style={{ top: (nowTop! / 60) * HOUR_PX, zIndex: 3 }}>
                  <div className="relative h-[2px]" style={{ background: "#d2453a" }}>
                    <span className="absolute -left-[5px] -top-[4px] h-[10px] w-[10px] rounded-full" style={{ background: "#d2453a" }} />
                  </div>
                </div>
              )}
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
