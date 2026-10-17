"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { daySummary, useWeatherRange } from "@/lib/use-weather";
import { useRouter } from "next/navigation";
import { scheduleTaskAction } from "@/app/actions";
import { carryQuest, useCarried, QUEST_DRAG_TYPE, type Carried } from "@/lib/schedule-carry";
import { WeatherLocation, useWeatherPlaceName } from "@/components/ui/WeatherLocation";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import {
  HOUR_START,
  HOUR_END,
  formatDateParam,
  formatHourLabel,
  formatShortTimeRange,
  isSameDay,
  parseDateParam,
} from "@/lib/calendar-dates";
import { CalendarAddPopup } from "./CalendarAddPopup";
import { CalendarTaskChip, getTaskDisplayWindow } from "./CalendarTaskChip";
import { GoogleEventChip } from "./GoogleEventChip";

/** Hour height: condensed by default; drag the times on the left to zoom. */
const DEFAULT_HOUR_PX = 36;
const MIN_HOUR_PX = 18;
const MAX_HOUR_PX = 96;
const ZOOM_KEY = "calendar-hour-px";

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
  const [hourPx, setHourPx] = useState(DEFAULT_HOUR_PX);
  const [gripY, setGripY] = useState<number | null>(null);
  const HOUR_PX = hourPx;
  useEffect(() => {
    try {
      const z = Number(window.localStorage.getItem(ZOOM_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (z >= MIN_HOUR_PX && z <= MAX_HOUR_PX) setHourPx(z);
    } catch {
      /* storage unavailable */
    }
  }, []);
  function zoomTo(px: number) {
    const v = Math.round(Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, px)));
    setHourPx(v);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  }
  function onZoomDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture unavailable */
    }
    const y0 = e.clientY;
    const z0 = hourPx;
    const move = (ev: PointerEvent) => zoomTo(z0 * Math.pow(2, (ev.clientY - y0) / 160));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
  const weather = useWeatherRange(dayKeys[0] ?? null, dayKeys[dayKeys.length - 1] ?? null);
  const placeName = useWeatherPlaceName();
  const router = useRouter();
  const carried = useCarried();
  const [ghost, setGhost] = useState<{ dayIndex: number; min: number } | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  /** Put a quest from the "To schedule" list at a time on the calendar. */
  async function placeCarried(q: Carried, dayIndex: number, startMin: number) {
    const day = days[dayIndex];
    if (!day) return;
    const start = minuteDate(day, startMin);
    const end = new Date(start.getTime() + q.minutes * 60_000);
    carryQuest(null);
    setGhost(null);
    setPlaceError(null);
    setPlacing(true);
    try {
      await scheduleTaskAction(q.id, start.toISOString(), end.toISOString());
      router.refresh();
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : "Couldn't put it on the calendar.");
    } finally {
      setPlacing(false);
    }
  }
  const single = days.length === 1;
  const nowMinute = useNowMinute();
  const now = nowMinute ? new Date(nowMinute * 60_000) : null;
  const hourCount = HOUR_END - HOUR_START + 1;

  // Drag (or tap) a time range on a day's column to open the add-quest
  // popup — either creating a new quest already scheduled there, or
  // searching existing quests to drop into that slot instead.
  const [addRange, setAddRange] = useState<{ start: Date; end: Date } | null>(null);
  // Pick a time to the quarter hour: drag with a mouse for a range, or tap
  // (mouse or finger) for a 30-minute slot. Touch still scrolls the page.
  const [sel, setSel] = useState<{ dayIndex: number; lo: number; hi: number } | null>(null);
  const pick = useRef<{ dayIndex: number; startMin: number; x: number; y: number; mouse: boolean; moved: boolean; lo: number; hi: number } | null>(null);
  const SNAP = 15;
  const minuteAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = ((e.clientY - r.top) / HOUR_PX) * 60;
    return Math.max(0, Math.min(hourCount * 60 - SNAP, Math.floor(m / SNAP) * SNAP));
  };
  const minuteDate = (day: Date, minutes: number) => {
    const d = new Date(day);
    d.setHours(HOUR_START, 0, 0, 0);
    return new Date(d.getTime() + minutes * 60_000);
  };
  function pickDown(e: React.PointerEvent<HTMLDivElement>, dayIndex: number) {
    const m = minuteAt(e);
    if (carried) {
      e.preventDefault();
      void placeCarried(carried, dayIndex, m);
      return;
    }
    const mouse = e.pointerType === "mouse";
    pick.current = { dayIndex, startMin: m, x: e.clientX, y: e.clientY, mouse, moved: false, lo: m, hi: m + SNAP };
    if (mouse) {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unavailable — moves within the column still track */
      }
      setSel({ dayIndex, lo: m, hi: m + SNAP });
    }
  }
  function pickMove(e: React.PointerEvent<HTMLDivElement>, dayIndex: number) {
    const p = pick.current;
    if (!p || p.dayIndex !== dayIndex) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) p.moved = true;
    if (!p.mouse) return;
    const m = minuteAt(e);
    p.lo = Math.min(p.startMin, m);
    p.hi = Math.max(p.startMin, m) + SNAP;
    setSel({ dayIndex, lo: p.lo, hi: p.hi });
  }
  function pickUp(e: React.PointerEvent<HTMLDivElement>, dayIndex: number) {
    const p = pick.current;
    pick.current = null;
    if (!p || p.dayIndex !== dayIndex) return;
    const day = days[dayIndex];
    if (!day) return;
    let lo = p.startMin;
    let hi = p.startMin + 30;
    if (p.mouse && p.moved) {
      lo = p.lo;
      hi = p.hi;
    } else if (!p.mouse && p.moved) {
      setSel(null);
      return; // a scroll, not a tap
    }
    setSel({ dayIndex, lo, hi });
    setAddRange({ start: minuteDate(day, lo), end: minuteDate(day, hi) });
  }

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
      {(carried || placing || placeError) && (
        <div
          role="status"
          className="sticky top-2 z-[30] mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold"
          style={{ background: "radial-gradient(circle at 30% 20%, #f6e3a8, #d9b45f 70%)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "0 4px 12px rgba(0,0,0,.25)" }}
        >
          <span className="min-w-0 flex-1">
            {placing ? "Putting it on the calendar…" : placeError ? placeError : <>Tap a time to place <b>{carried!.title}</b></>}
          </span>
          {carried && (
            <button type="button" onClick={() => (carryQuest(null), setGhost(null))} className="h-8 shrink-0 rounded-full px-3 text-[13px]" style={{ background: "#2a1c10", color: "#f6dc8e" }}>
              Cancel
            </button>
          )}
          {placeError && (
            <button type="button" onClick={() => setPlaceError(null)} className="h-8 shrink-0 rounded-full px-3 text-[13px]" style={{ background: "#2a1c10", color: "#f6dc8e" }}>
              OK
            </button>
          )}
        </div>
      )}
      <div className="mb-1.5 flex items-center gap-2 px-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
        {weather === undefined ? (
          <>
            <WeatherLocation />
            <span>· for hourly temperatures and rain</span>
          </>
        ) : (
          <>
            <span>Weather for {placeName ?? "your location"} ·</span>
            <WeatherLocation label="change" />
          </>
        )}
      </div>
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
              {!single && weather && (() => {
                const w = daySummary(weather[dayKeys[i]]);
                if (!w) return null;
                return (
                  <span className="mt-0.5 flex flex-col items-center text-[11px] leading-tight tabular-nums" style={{ color: "var(--t-ink-soft)" }} title={`High ${w.hi}°, low ${w.lo}°, ${w.rain}% chance of rain`}>
                    <span>
                      <b style={{ color: "var(--t-ink)", fontWeight: 600 }}>{w.hi}°</b> {w.lo}°
                    </span>
                    {w.rain >= 30 && <span style={{ color: "#3f6fa8" }}>💧{w.rain}%</span>}
                  </span>
                );
              })()}
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
              fontSize: HOUR_PX < 30 ? 10.5 : 11.5,
              lineHeight: 1.1,
              overflow: "hidden",
              whiteSpace: "pre-line",
              color: "var(--t-ink-soft)",
              paddingTop: 2,
              borderTop: `1px solid ${lineColor}`,
            }}
          >
            {HOUR_PX < 30
              ? formatHourLabel(HOUR_START + row).replace(/:00/, "").replace(/\s?([AP])M/i, (_, m: string) => m.toLowerCase())
              : formatHourLabel(HOUR_START + row).replace(" ", "\n")}
          </div>
        ))}
        {Array.from({ length: hourCount }, (_, row) => (
          <div
            key={`line-${row}`}
            className="relative"
            style={{ gridColumn: `2 / ${days.length + 2}`, gridRow: row + 2, borderTop: `1px solid ${lineColor}` }}
          >
            {single && weather?.[dayKeys[0]]?.[HOUR_START + row] && (() => {
              const w = weather[dayKeys[0]][HOUR_START + row];
              return (
                <span
                  className="pointer-events-none absolute right-1 top-0.5 z-[4] flex items-center gap-1 rounded px-1 text-[11.5px] tabular-nums"
                  style={{ color: "var(--t-ink-soft)", background: isAdventure ? "rgba(243,230,200,.75)" : "var(--t-card)" }}
                  title={`${w.temp}° · ${w.rain}% chance of rain`}
                >
                  {w.rain >= 30 && <span style={{ color: "#3f6fa8" }}>💧{w.rain}%</span>}
                  {w.temp}°
                </span>
              );
            })()}
          </div>
        ))}
        {/* Drag the times up or down to squeeze or stretch the day. */}
        <div
          role="slider"
          aria-label="Zoom the calendar (drag the times)"
          aria-valuemin={MIN_HOUR_PX}
          aria-valuemax={MAX_HOUR_PX}
          aria-valuenow={hourPx}
          tabIndex={0}
          title="Drag the times up or down to zoom"
          className="group relative z-[5] cursor-ns-resize touch-none"
          style={{ gridColumn: 1, gridRow: `2 / ${hourCount + 2}` }}
          onPointerMove={(e) => setGripY(e.clientY - e.currentTarget.getBoundingClientRect().top)}
          onPointerLeave={() => setGripY(null)}
          onPointerDown={onZoomDown}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            zoomTo(hourPx + (e.key === "ArrowDown" ? 6 : -6));
          }}
        >
          {/* A gilded rail and grip appear where you can stretch the day. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 right-0 top-1 w-[2px] rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ background: "linear-gradient(180deg, transparent, rgba(217,180,95,.85) 12%, rgba(217,180,95,.85) 88%, transparent)" }}
          />
          {gripY !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-[7px] flex h-[34px] w-4 flex-col items-center justify-between rounded-full py-[3px]"
              style={{
                top: Math.max(0, gripY - 17),
                background: "radial-gradient(circle at 40% 30%, #f9e7ad, #d9b45f 60%, #a88a3f)",
                border: "1px solid #4a3913",
                boxShadow: "0 2px 6px rgba(60,40,10,.35)",
              }}
            >
              <svg width="9" height="6" viewBox="0 0 10 6" aria-hidden>
                <path d="M1 5l4-4 4 4" fill="none" stroke="#3b2a14" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="h-[3px] w-[3px] rotate-45" style={{ background: "#3b2a14" }} />
              <svg width="9" height="6" viewBox="0 0 10 6" aria-hidden>
                <path d="M1 1l4 4 4-4" fill="none" stroke="#3b2a14" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>

        {/* Drag-to-add hit cells — one per (day, hour). Rendered before the
            task/event chips below so a chip occupying the same cell stacks
            visually on top and keeps first claim on pointer events there;
            dragging must start from genuinely empty space. */}
        {days.map((_, dayIndex) => (
          <div
            key={`hit-${dayIndex}`}
            className="relative select-none"
            style={{ gridColumn: dayIndex + 2, gridRow: `2 / ${hourCount + 2}`, cursor: "pointer", touchAction: "pan-y" }}
            onPointerDown={(e) => pickDown(e, dayIndex)}
            onPointerMove={(e) => {
              if (carried && e.pointerType === "mouse") setGhost({ dayIndex, min: minuteAt(e) });
              pickMove(e, dayIndex);
            }}
            onPointerLeave={() => setGhost(null)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(QUEST_DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const r = e.currentTarget.getBoundingClientRect();
              const m = Math.max(0, Math.min(hourCount * 60 - SNAP, Math.floor((((e.clientY - r.top) / HOUR_PX) * 60) / SNAP) * SNAP));
              setGhost({ dayIndex, min: m });
            }}
            onDragLeave={() => setGhost(null)}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(QUEST_DRAG_TYPE);
              if (!raw) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const m = Math.max(0, Math.min(hourCount * 60 - SNAP, Math.floor((((e.clientY - r.top) / HOUR_PX) * 60) / SNAP) * SNAP));
              void placeCarried(JSON.parse(raw) as Carried, dayIndex, m);
            }}
            onPointerUp={(e) => pickUp(e, dayIndex)}
            onPointerCancel={() => (pick.current = null, setSel(null))}
          >
            {carried && ghost && ghost.dayIndex === dayIndex && (
              <div
                className="pointer-events-none absolute inset-x-0.5 z-[6] overflow-hidden rounded-md px-1 text-[11px] font-semibold"
                style={{ top: (ghost.min / 60) * HOUR_PX, height: (carried.minutes / 60) * HOUR_PX, background: "rgba(217,180,95,.55)", border: "1.5px dashed #6b5124", color: "#2a1c10" }}
              >
                {carried.title}
              </div>
            )}
            {sel && sel.dayIndex === dayIndex && (
              <div
                className="pointer-events-none absolute inset-x-0.5 rounded-md"
                style={{
                  top: (sel.lo / 60) * HOUR_PX,
                  height: ((sel.hi - sel.lo) / 60) * HOUR_PX,
                  background: isAdventure ? "rgba(209,161,60,.35)" : "var(--t-accent-soft)",
                  border: `1.5px solid ${isAdventure ? "rgba(168,138,63,.8)" : "var(--t-accent)"}`,
                }}
              >
                <span className="absolute left-1 top-0.5 text-[10.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                  {formatShortTimeRange(minuteDate(days[dayIndex], sel.lo), minuteDate(days[dayIndex], sel.hi))}
                </span>
              </div>
            )}
          </div>
        ))}

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
          onClose={() => (setAddRange(null), setSel(null))}
        />
      )}
    </div>
  );
}
