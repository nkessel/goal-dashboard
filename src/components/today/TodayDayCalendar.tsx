"use client";

import { useRef, useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { WeekView } from "@/components/calendar/WeekView";
import { useCalendarLayers, type DailyLayer } from "@/components/calendar/CalendarLayers";
import { todayCalendarDayAction } from "@/app/actions";

/** The day before or after a YYYY-MM-DD key. */
function shiftKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/**
 * Today on the calendar, with the calendar screen's own choices (which calendars show, the cards' look).
 * A sideways swipe pans to the day before or after (owner, Nov 25); the other day loads, then shows.
 */
export function TodayDayCalendar({ dayKey, tasks, events, daily, theme }: { dayKey: string; tasks: Task[]; events: GoogleCalendarEvent[]; daily: DailyLayer; theme: "calm" | "adventure" }) {
  const layers = useCalendarLayers();
  // Another day once panned (null: today, from the server, kept fresh by Today's own refreshes).
  const [other, setOther] = useState<{ dayKey: string; tasks: Task[]; events: GoogleCalendarEvent[] } | null>(null);
  const [seenDay, setSeenDay] = useState(dayKey);
  if (seenDay !== dayKey) {
    setSeenDay(dayKey);
    setOther(null);
  }
  const [loading, startLoading] = useTransition();
  const want = useRef(dayKey);
  const shown = other ?? { dayKey, tasks, events };
  function pan(n: number) {
    const next = shiftKey(shown.dayKey, n);
    want.current = next;
    if (next === dayKey) return setOther(null);
    startLoading(async () => {
      try {
        const r = await todayCalendarDayAction(next);
        if (want.current === r.dayKey) setOther(r);
      } catch {
        /* stay on the day shown */
      }
    });
  }
  // A quick sideways swipe (not a card drag, not mostly up or down) pans a day.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const shownTasks = layers.quests ? shown.tasks.filter((t) => layers.done || t.status !== "completed") : [];
  const shownEvents = shown.events.filter((e) => !layers.hidden.includes(e.calendarId ?? "primary") && (layers.allDay || !e.isAllDay));
  return (
    <div
      data-today-cal-day={shown.dayKey}
      className="transition-opacity duration-200"
      style={{ opacity: loading ? 0.6 : 1 }}
      onTouchStart={(e) => {
        const p = e.touches[0];
        touch.current = e.touches.length === 1 ? { x: p.clientX, y: p.clientY, t: Date.now() } : null;
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s || document.body.hasAttribute("data-quest-drag")) return;
        const p = e.changedTouches[0];
        const dx = p.clientX - s.x;
        const dy = p.clientY - s.y;
        if (Date.now() - s.t > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        pan(dx < 0 ? 1 : -1);
      }}
    >
      <WeekView embedded onPanDays={pan} dayKeys={[shown.dayKey]} visible={1} tasks={shownTasks} events={shownEvents} theme={theme} portraits={layers.portraits} card={layers.card} daily={daily} essentials={layers.essentials} habitLook={layers.habits} />
    </div>
  );
}
