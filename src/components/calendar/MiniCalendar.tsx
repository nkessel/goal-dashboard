"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { calendarWindowAction } from "@/app/actions";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { MagicCalendarIcon } from "@/components/ui/Icons";
import { addDaysYmd, ymd } from "@/lib/when";
import { WeekView } from "./WeekView";
import { useCalendarLayers, type DailyLayer } from "./CalendarLayers";
import { findSlot } from "./place-next";

type Slot = { start: string; end: string };
type Win = { from: string; to: string; tasks: Task[]; events: GoogleCalendarEvent[]; daily: DailyLayer };

const HOUR_PX = 40;
const LOAD_AHEAD = 14;

/** "Thu, Nov 20" for the day row. */
function dayWords(key: string, today: string) {
  if (key === today) return "Today";
  if (key === addDaysYmd(today, 1)) return "Tomorrow";
  return new Date(`${key}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * The real calendar, small (When 3, docs/plans/2026-11-17-due-and-scheduling-plan.md section 4): `WeekView` itself in
 * pick mode, in a box of its own that scrolls, so it looks like the calendar screen (cards, events, essentials,
 * the now line, your calendars' colours and hidden calendars). One day wide; three when there's room (560px).
 * Swipe sideways or use ‹ › for other days. Tap a spot to put the quest there, drag it, drag its foot to change
 * its length; Auto-schedule puts it in the first free spot. It writes nothing: the host gets `onChange`.
 */
export function MiniCalendar({ title, minutes, value, onChange, taskId, hideStart, dueAt, planBy, theme = "adventure" }: {
  title: string;
  minutes: number;
  value: Slot | null;
  onChange: (s: Slot) => void;
  /** The quest's own id: its block at `hideStart` (the time being changed) isn't drawn twice. */
  taskId?: string | null;
  hideStart?: string | null;
  dueAt?: string | null;
  planBy?: string | null;
  theme?: "calm" | "adventure";
}) {
  const [today] = useState(() => ymd(new Date()));
  const [first, setFirst] = useState(() => (value ? ymd(new Date(value.start)) : today));
  const boxRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const m = () => setWide(el.clientWidth >= 560);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = wide ? 3 : 1;
  const dayKeys = Array.from({ length: n }, (_, i) => addDaysYmd(first, i));

  // The days' data: today to two weeks on, more when you move past it (the same reads as Today's side calendar).
  const [win, setWin] = useState<Win | null>(null);
  const [error, setError] = useState<string | null>(null);
  const need = { from: addDaysYmd(first, -1), to: addDaysYmd(first, n + 1) };
  const covered = !!win && win.from <= need.from && win.to >= need.to;
  useEffect(() => {
    if (covered) return;
    let live = true;
    const from = need.from < today ? need.from : addDaysYmd(today, -1);
    const to = addDaysYmd(need.to, LOAD_AHEAD);
    calendarWindowAction(new Date(`${from}T00:00`).toISOString(), new Date(`${to}T00:00`).toISOString())
      .then((r) => live && setWin({ from, to, tasks: r.tasks, events: r.events, daily: r.daily }))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your calendar."));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the days shown leave what's loaded
  }, [covered, need.from, need.to]);

  const layers = useCalendarLayers();
  const tasks = (win?.tasks ?? []).filter((t) => (layers.quests ? layers.done || t.status !== "completed" : false) && !(taskId && t.id === taskId && hideStart && t.scheduled_start === hideStart));
  const events = (win?.events ?? []).filter((e) => !layers.hidden.includes(e.calendarId ?? "primary") && (layers.allDay || !e.isAllDay));

  const shift = (d: number) => setFirst((f) => {
    const next = addDaysYmd(f, d);
    return next < today ? today : next;
  });
  // A sideways swipe moves through the days (a finger up and down still scrolls the hours).
  const touch = useRef<{ x: number; y: number } | null>(null);

  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function autoSchedule() {
    setFinding(true);
    setNote(null);
    try {
      const s = await findSlot({ id: taskId ?? "new", title, estimate_minutes: minutes, effort: 0, due_at: dueAt ?? null, plan_by: planBy ?? null } as Parameters<typeof findSlot>[0]);
      if (!s) return setNote("No free spot in the next two weeks.");
      onChange({ start: s.start.toISOString(), end: s.end.toISOString() });
      setFirst(ymd(s.start));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't find a time.");
    } finally {
      setFinding(false);
    }
  }

  const arrow = (d: -1 | 1) => (
    <button type="button" onClick={() => shift(d * n)} disabled={d < 0 && first <= today} aria-label={d < 0 ? "Earlier days" : "Later days"} className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-30" style={{ color: "var(--t-ink-soft)" }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    <div ref={boxRef} className="flex flex-col gap-1.5" data-mini-calendar>
      <div className="flex items-center gap-1">
        {arrow(-1)}
        <span className="min-w-0 flex-1 truncate text-center font-display text-[14px]" style={{ color: "var(--t-ink)" }}>
          {n === 1 ? dayWords(first, today) : `${dayWords(first, today)} – ${dayWords(dayKeys[n - 1], today)}`}
        </span>
        {arrow(1)}
      </div>
      <div
        data-cal-scroller
        className="overflow-y-auto overscroll-contain rounded-xl"
        style={{ height: 300 }}
        onTouchStart={(e) => (touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null)}
        onTouchEnd={(e) => {
          const t0 = touch.current;
          touch.current = null;
          const t = e.changedTouches[0];
          if (!t0 || !t) return;
          const dx = t.clientX - t0.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(t.clientY - t0.y)) shift(dx < 0 ? n : -n);
        }}
      >
        {win ? (
          <WeekView
            key={first}
            embedded
            dayKeys={dayKeys}
            visible={n}
            tasks={tasks}
            events={events}
            theme={theme}
            portraits={layers.portraits}
            card={layers.card}
            daily={win.daily}
            essentials={layers.essentials}
            habitLook={layers.habits}
            ui={{ zoom: HOUR_PX }}
            pick={{ title, minutes, value, onChange, onShiftDays: shift }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--t-ink-soft)" }} role="status">
            {error ?? "Opening your calendar…"}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void autoSchedule()} disabled={finding} className="qe-fact flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold disabled:opacity-60">
          <MagicCalendarIcon size={15} />
          {finding ? "Finding a time…" : "Auto-schedule"}
        </button>
        {note && (
          <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }} role="status">
            {note}
          </span>
        )}
        <Link href={`/calendar?view=day&date=${first}`} prefetch={false} className="ml-auto text-[12.5px] font-semibold underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
          Open the calendar ›
        </Link>
      </div>
    </div>
  );
}
