"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { daySummary, useWeatherRange } from "@/lib/use-weather";
import { useRouter } from "next/navigation";
import { saveSchedulerSettingsAction, scheduleTaskAction, updateGoogleEventAction } from "@/app/actions";
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
import { CalendarItemMenu, type MenuTarget } from "./CalendarItemMenu";
import { CalendarTaskChip, getTaskDisplayWindow } from "./CalendarTaskChip";
import { sessionRef, showsOnCalendar } from "@/lib/calendar-task-window";
import type { CardShow } from "./CalendarLayers";
import { GoogleEventChip } from "./GoogleEventChip";
import type { DailyLayer, EssentialsLook, HabitLook } from "./CalendarLayers";
import { SCHEDULER_DEFAULTS, holdAt, localDayKey, mealsOn, MEAL_ICONS, MEAL_NAMES, type DayHold, type SchedulerSettings } from "@/lib/auto-schedule";
import { habitBlocksOn } from "@/lib/timed-habits";
import { fromFeedback } from "@/lib/from-feedback";

/** Hour height: condensed by default; drag the times on the left to zoom. */
const DEFAULT_HOUR_PX = 36;
/** Adventure quests are picture cards, so its hours start roomier. */
const ADVENTURE_HOUR_PX = 56;
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

/** The fixed time column, while the days scroll under it: parchment, so the days slide behind it. */
const TIME_BG = "linear-gradient(90deg, #f3e6c8 85%, #efe0bd)";

export function WeekView({
  dayKeys,
  tasks,
  events = [],
  theme = "calm",
  portraits = false,
  card,
  visible,
  buffer = 0,
  daily,
  essentials = "dashed",
  habitLook = "quest",
}: {
  daily?: DailyLayer;
  essentials?: EssentialsLook;
  habitLook?: HabitLook;
  /** Show quests as portrait cards (art above the title). */
  portraits?: boolean;
  /** What a quest card shows (creature, time, XP, coins). */
  card?: CardShow;
  /** How many days fit on screen; the rest of `dayKeys` (`buffer` days each side) are there to scroll to. */
  visible?: number;
  /** Days before and after the visible ones: the days scroll seamlessly, partway too (owner: repeat ask 12). */
  buffer?: number;
  /** The columns to show (YYYY-MM-DD, read in the viewer's own time zone) — 7 for a week, 1 for a day. */
  dayKeys: string[];
  tasks: Task[];
  events?: GoogleCalendarEvent[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const days = dayKeys.map((k) => parseDateParam(k));
  const [hourPx, setHourPx] = useState(isAdventure ? ADVENTURE_HOUR_PX : DEFAULT_HOUR_PX);
  const [gripY, setGripY] = useState<number | null>(null);
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
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
    // Only a real drag zooms: a tap or a wobble used to squeeze the day (owner's recording, Nov 3).
    let going = false;
    const move = (ev: PointerEvent) => {
      if (!going && Math.abs(ev.clientY - y0) < 12) return;
      going = true;
      zoomTo(z0 * Math.pow(2, (ev.clientY - y0 + (ev.clientY > y0 ? -12 : 12)) / 160));
    };
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
  const vis = Math.max(1, Math.min(days.length, visible ?? days.length));
  const seamless = buffer > 0 && days.length > vis;
  const single = vis === 1;
  const timeBg = isAdventure ? TIME_BG : "var(--t-card)";
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
    // Only the main button picks a time (a right-click is for a hold's menu).
    if (e.pointerType === "mouse" && e.button !== 0) return;
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
    // A second tap on a meal or habit hold opens its menu instead (owner, Nov 4: "double-tap").
    if (!p.moved && holdMenuAt(day, e.clientX, e.clientY, "tap", e.timeStamp)) {
      setSel(null);
      setAddRange(null);
      return;
    }
    setSel({ dayIndex, lo, hi });
    setAddRange({ start: minuteDate(day, lo), end: minuteDate(day, hi) });
  }

  // How wide one day's column is: overlapping items split it into lanes when
  // there's room, and fan out (overlapping, slightly offset) when there isn't.
  const boxRef = useRef<HTMLDivElement>(null);
  // Pinch to zoom the hours (two fingers on a phone, or a trackpad pinch).
  const pxNow = useRef(hourPx);
  useEffect(() => {
    pxNow.current = hourPx;
  }, [hourPx]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let start: { d: number; px: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { d: dist(e.touches), px: pxNow.current };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo(start.px * (dist(e.touches) / start.d));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(pxNow.current * Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstHourRef = useRef<HTMLDivElement>(null);
  // Where the hours start under the day headers (the time column above the strip lines up with it).
  const [headTop, setHeadTop] = useState(0);
  useLayoutEffect(() => {
    const h = firstHourRef.current;
    if (!h) return;
    const m = () => setHeadTop(h.offsetTop);
    m();
    const ro = new ResizeObserver(m);
    if (h.parentElement) ro.observe(h.parentElement);
    return () => ro.disconnect();
  }, [seamless]);
  const [colWidth, setColWidth] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Seamless: the days' room is the scroll strip's width less the time column and the gaps between days.
    const measure = () => setColWidth(seamless && scrollRef.current ? (scrollRef.current.clientWidth - 40 - 2 * vis) / vis : (el.clientWidth - 20 - 40) / vis);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vis, seamless]);

  // Seamless days: the grid scrolls sideways under a fixed time column, stopping wherever you leave it (part of a
  // day too). Past a few days from the middle, the window of loaded days moves along and the spot is kept.
  const [firstIdx, setFirstIdx] = useState(buffer);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!seamless || !el || colWidth <= 0) return;
    let frac = 0;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("cal-scroll") ?? "null") as { key: string; frac: number } | null;
      if (saved && saved.key === dayKeys[buffer]) frac = saved.frac;
      window.sessionStorage.removeItem("cal-scroll");
    } catch {
      /* storage unavailable */
    }
    el.scrollLeft = buffer * (colWidth + 2) + frac * (colWidth + 2);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the scroll spot is only known once laid out
    setFirstIdx(buffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the loaded days or the column size change
  }, [seamless, colWidth, dayKeys[0], buffer]);
  function onDaysScroll() {
    const el = scrollRef.current;
    if (!el || colWidth <= 0) return;
    const at = el.scrollLeft / (colWidth + 2);
    setFirstIdx(Math.floor(at + 0.5));
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const idx = Math.floor(at);
      if (Math.abs(idx - buffer) < Math.ceil(buffer / 2)) return;
      // Load the days around where you are, and come back to this exact spot.
      const key = dayKeys[idx];
      if (!key) return;
      try {
        window.sessionStorage.setItem("cal-scroll", JSON.stringify({ key, frac: at - idx }));
      } catch {
        /* storage unavailable */
      }
      router.replace(vis === 1 ? `/calendar?view=day&date=${key}` : `/calendar?view=days&n=${vis}&date=${key}`, { scroll: false });
    }, 260);
  }

  // Fluid days: drag the day headers sideways to move through days, or drag
  // the grip at their right end to make every day wider or narrower (more or
  // fewer days fit). It follows your finger, then settles on whole days.
  const [fluid, setFluid] = useState<{ dx: number; w: number | null; n?: number } | null>(null);
  const dragged = useRef(false);
  const goTo = (startOffset: number, n: number) => {
    const first = new Date(days[seamless ? Math.max(0, Math.min(days.length - 1, firstIdx)) : 0]);
    first.setDate(first.getDate() + startOffset);
    const key = formatDateParam(first);
    const k = Math.max(1, Math.min(14, n));
    router.push(k === 1 ? `/calendar?view=day&date=${key}` : `/calendar?view=days&n=${k}&date=${key}`, { scroll: false });
  };
  function startDayScroll(e: React.PointerEvent) {
    if (e.button !== 0 || colWidth <= 0) return;
    const x0 = e.clientX;
    dragged.current = false;
    if (seamless) {
      // A mouse drags the days along (a finger already scrolls them); nothing snaps.
      if (e.pointerType !== "mouse") return;
      const el = scrollRef.current;
      if (!el) return;
      const s0 = el.scrollLeft;
      const mv = (m: PointerEvent) => {
        const dx = m.clientX - x0;
        if (!dragged.current && Math.abs(dx) < 6) return;
        dragged.current = true;
        el.scrollLeft = s0 - dx;
      };
      const end = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      return;
    }
    const move = (m: PointerEvent) => {
      const dx = m.clientX - x0;
      if (!dragged.current && Math.abs(dx) < 8) return;
      dragged.current = true;
      setFluid({ dx, w: null });
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragged.current) return;
      const shift = Math.round(-(u.clientX - x0) / (colWidth + 2));
      setFluid(null);
      if (shift) goTo(shift, vis);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function startDayResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = boxRef.current;
    if (!el || colWidth <= 0) return;
    // The grip sits on the last day's right edge: wherever you pull that edge, the days share the room up to it.
    const left = el.getBoundingClientRect().left + 10 + 40;
    const avail = el.clientWidth - 20 - 40;
    const widthAt = (x: number) => Math.max(36, Math.min(avail, (x - left) / vis));
    const fit = (w: number) => Math.max(1, Math.min(14, Math.round(avail / w)));
    const move = (m: PointerEvent) => setFluid({ dx: 0, w: widthAt(m.clientX), n: fit(widthAt(m.clientX)) });
    const up = (u: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const n = fit(widthAt(u.clientX));
      setFluid(null);
      if (n !== vis) goTo(0, n);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  // A sideways trackpad swipe moves through the days too.
  const swipe = useRef(0);
  const onSideWheel = useEffectEvent((e: WheelEvent) => {
    // Seamless: a sideways swipe just scrolls the days (natively).
    if (seamless || e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY) || colWidth <= 0) return;
    e.preventDefault();
    swipe.current += e.deltaX;
    setFluid({ dx: -swipe.current, w: null });
    clearTimeout(swipeTimer.current);
    swipeTimer.current = setTimeout(() => {
      const shift = Math.round(swipe.current / (colWidth + 2));
      swipe.current = 0;
      setFluid(null);
      if (shift) goTo(shift, vis);
    }, 180);
  });
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => onSideWheel(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // The times' zoom handle: in the grid, or (seamless days) on the time column that stays put over them.
  const zoomSlider = (sliderStyle: React.CSSProperties) => (
        <div
      role="slider"
      aria-label="Zoom the calendar (drag the times)"
      aria-valuemin={MIN_HOUR_PX}
      aria-valuemax={MAX_HOUR_PX}
      aria-valuenow={hourPx}
      tabIndex={0}
      title="Drag the times up or down to zoom"
      className="group relative z-[5] cursor-ns-resize touch-none"
      style={sliderStyle}
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
  );
  const gridStart = (d: Date) => {
    const x = new Date(d);
    x.setHours(HOUR_START, 0, 0, 0);
    return x.getTime();
  };
  const gridMinutes = hourCount * 60;
  /** Minutes from the top of the grid, clamped to it. */
  const offset = (d: Date, day: Date) => Math.min(gridMinutes, Math.max(0, (d.getTime() - gridStart(day)) / 60_000));

  // Drag a quest or event to move it (to another day, too), or its bottom
  // edge to change how long it runs — snapping to the quarter hour. A mouse
  // drags after a few pixels; a finger holds for a moment first.
  type Span = { dayIndex: number; top: number; bottom: number };
  const [moving, setMoving] = useState<(Span & { key: string }) | null>(null);
  const [pending, setPending] = useState<Record<string, Span>>({});
  const [seenData, setSeenData] = useState({ tasks, events });
  if (seenData.tasks !== tasks || seenData.events !== events) {
    setSeenData({ tasks, events });
    setPending({});
  }
  const drag = useRef<{
    key: string;
    kind: "move" | "resize";
    pointerId: number;
    touch: boolean;
    x0: number;
    y0: number;
    from: Span;
    to: Span;
    active: boolean;
    timer?: number;
    item: { kind: "task"; task: Task } | { kind: "event"; event: GoogleCalendarEvent };
  } | null>(null);
  const justDragged = useRef(false);

  function startItemDrag(e: React.PointerEvent, key: string, span: Span, item: { kind: "task"; task: Task } | { kind: "event"; event: GoogleCalendarEvent }) {
    if (carried) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const kind = (e.target as HTMLElement).closest("[data-resize]") ? "resize" : "move";
    const touch = e.pointerType !== "mouse";
    const d = { key, kind, pointerId: e.pointerId, touch, x0: e.clientX, y0: e.clientY, from: span, to: span, active: false, timer: undefined as number | undefined, item } as NonNullable<typeof drag.current>;
    if (touch) {
      d.timer = window.setTimeout(() => {
        if (drag.current !== d) return;
        d.active = true;
        navigator.vibrate?.(8);
        setMoving({ key, ...span });
      }, 320);
    }
    drag.current = d;
  }

  const onDragMove = useEffectEvent((e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active) {
      if (d.touch) {
        if (dist > 8) {
          window.clearTimeout(d.timer);
          drag.current = null; // a scroll, not a drag
        }
        return;
      }
      if (dist <= 4) return;
      d.active = true;
    }
    const dMin = Math.round((((e.clientY - d.y0) / HOUR_PX) * 60) / SNAP) * SNAP;
    const len = d.from.bottom - d.from.top;
    let to: Span;
    if (d.kind === "resize") {
      to = { ...d.from, bottom: Math.max(d.from.top + SNAP, Math.min(gridMinutes, d.from.bottom + dMin)) };
    } else {
      const dDay = colWidth > 0 ? Math.round((e.clientX - d.x0) / (colWidth + 2)) : 0;
      const top = Math.max(0, Math.min(gridMinutes - len, Math.round((d.from.top + dMin) / SNAP) * SNAP));
      to = { dayIndex: Math.max(0, Math.min(days.length - 1, d.from.dayIndex + dDay)), top, bottom: top + len };
    }
    d.to = to;
    setMoving({ key: d.key, ...to });
  });

  const onDragUp = useEffectEvent((e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    window.clearTimeout(d.timer);
    drag.current = null;
    setMoving(null);
    if (!d.active) return;
    justDragged.current = true;
    window.setTimeout(() => (justDragged.current = false), 0);
    const { dayIndex, top, bottom } = d.to;
    if (dayIndex === d.from.dayIndex && top === d.from.top && bottom === d.from.bottom) return;
    const day = days[dayIndex];
    if (!day) return;
    const start = minuteDate(day, top).toISOString();
    const end = minuteDate(day, bottom).toISOString();
    setPending((p) => ({ ...p, [d.key]: d.to }));
    setPlaceError(null);
    void (async () => {
      try {
        if (d.item.kind === "task") await scheduleTaskAction(sessionRef(d.item.task), start, end);
        else await updateGoogleEventAction(d.item.event.id, d.item.event.calendarId ?? "primary", { startISO: start, endISO: end });
        router.refresh();
      } catch (err) {
        setPending((p) => {
          const n = { ...p };
          delete n[d.key];
          return n;
        });
        setPlaceError(err instanceof Error ? err.message : "Couldn't move that.");
      }
    })();
  });

  const onDragCancel = useEffectEvent((e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    window.clearTimeout(d.timer);
    drag.current = null;
    setMoving(null);
  });

  useEffect(() => {
    const mv = (e: PointerEvent) => onDragMove(e);
    const up = (e: PointerEvent) => onDragUp(e);
    const cancel = (e: PointerEvent) => onDragCancel(e);
    const tm = (e: TouchEvent) => {
      if (drag.current?.active) e.preventDefault();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("touchmove", tm, { passive: false });
    return () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", tm);
    };
  }, []);

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
    if (!showsOnCalendar(task)) continue;
    const { start, end } = getTaskDisplayWindow(task);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) continue;
    const top = offset(start, days[dayIndex]);
    // A short quest (a 15-minute mini-quest) still gets room for its card: at least ~30px tall.
    const minMins = Math.max(20, (30 / HOUR_PX) * 60);
    items.push({ kind: "task", key: `t-${sessionRef(task)}`, dayIndex, top, bottom: Math.max(top + minMins, offset(end, days[dayIndex])), start, end, task });
  }

  // An item being dragged (or just dropped, until fresh data arrives) shows at its new spot.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const o = moving?.key === it.key ? moving : pending[it.key];
    if (!o || !days[o.dayIndex]) continue;
    items[i] = { ...it, dayIndex: o.dayIndex, top: o.top, bottom: o.bottom, start: minuteDate(days[o.dayIndex], o.top), end: minuteDate(days[o.dayIndex], o.bottom) };
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
      <div className="relative">
      {seamless && (
        // The time column stays put while the days scroll under it (a sticky cell can't leave its grid cell, so it's its own layer).
        <div className="pointer-events-none absolute left-0 top-0 z-[30]" style={{ width: 40, height: headTop + hourCount * HOUR_PX, background: timeBg, boxShadow: "4px 0 6px -4px rgba(60,40,10,.25)" }}>
          {Array.from({ length: hourCount }, (_, row) => (
            <div
              key={`t-${row}`}
              className="absolute left-0 right-0"
              style={{ top: headTop + row * HOUR_PX, height: HOUR_PX, fontSize: HOUR_PX < 30 ? 10.5 : 11.5, lineHeight: 1.1, overflow: "hidden", whiteSpace: "pre-line", color: "var(--t-ink-soft)", paddingTop: 2, borderTop: `1px solid ${lineColor}` }}
            >
              {HOUR_PX < 30
                ? formatHourLabel(HOUR_START + row).replace(/:00/, "").replace(/\s?([AP])M/i, (_, m: string) => m.toLowerCase())
                : formatHourLabel(HOUR_START + row).replace(" ", "\n")}
            </div>
          ))}
          <div className="pointer-events-auto absolute left-0 right-0" style={{ top: headTop, height: hourCount * HOUR_PX }}>
            {zoomSlider({ position: "absolute", inset: 0 })}
          </div>
        </div>
      )}
      <div ref={scrollRef} onScroll={seamless ? onDaysScroll : undefined} className={`relative ${seamless ? "cal-days-scroll overflow-x-auto overflow-y-hidden" : "overflow-hidden"}`}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: fluid?.w ? `40px repeat(${days.length}, ${fluid.w}px)` : seamless && colWidth > 0 ? `40px repeat(${days.length}, ${colWidth}px)` : `40px repeat(${days.length}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${hourCount}, ${HOUR_PX}px)`,
          columnGap: 2,
          transform: fluid?.dx ? `translateX(${fluid.dx}px)` : undefined,
          transition: fluid ? "none" : "transform .25s ease-out",
          touchAction: seamless ? "pan-x pan-y pinch-zoom" : "pan-y pinch-zoom",
        }}
      >
        <div />
        {/* The grip on the last day's edge: pull it in for narrower days (more of them), out for wider ones. */}
        <div className="pointer-events-none relative z-[3]" style={{ gridColumn: (seamless ? Math.min(days.length, firstIdx + vis) : days.length) + 1, gridRow: 1 }}>
          <button
            type="button"
            onPointerDown={startDayResize}
            aria-label="Drag to show more or fewer days"
            title="Drag sideways: wider or narrower days"
            className="pointer-events-auto absolute bottom-1.5 right-0.5 flex h-7 w-6 cursor-ew-resize touch-none items-center justify-center rounded-full"
            style={{ border: `1px solid ${isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "#6b5531" : "var(--t-ink-soft)", background: isAdventure ? "rgba(255,248,230,.5)" : "var(--t-card)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {fluid?.w && (
            <span className="pointer-events-none absolute right-0 top-0 z-[5] whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "#2a1c10", color: "#f6dc8e" }}>
              {fluid.n === 1 ? "1 day" : `${fluid.n} days`}
            </span>
          )}
        </div>
        {days.map((day, i) => {
          const isToday = !!now && isSameDay(day, now);
          return (
            <Link
              key={day.toISOString()}
              href={`/calendar?view=day&date=${formatDateParam(day)}`}
              draggable={false}
              onPointerDown={startDayScroll}
              onClickCapture={(e) => {
                if (dragged.current) {
                  e.preventDefault();
                  dragged.current = false;
                }
              }}
              className="relative z-[1] flex cursor-grab select-none flex-col items-center pb-1.5 text-center"
              style={{ borderBottom: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`, paddingTop: isAdventure ? 18 : undefined, gridColumn: i + 2, gridRow: 1 }}
            >
              {isAdventure && isToday && <TodayCrest />}
              {/* The weekday and its date on one line; the weather on the next (owner, Nov 3). */}
              <span className="flex items-center gap-1">
                <span
                  className={isAdventure ? "font-display uppercase" : ""}
                  style={{
                    fontSize: isAdventure ? (vis >= 5 ? 12 : 13.5) : 13.5,
                    letterSpacing: isAdventure ? ".06em" : undefined,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? (isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)") : isAdventure ? "#4a3a22" : "var(--t-ink-soft)",
                  }}
                >
                  {day.toLocaleDateString(undefined, { weekday: vis >= 6 && colWidth > 0 && colWidth < 52 ? "narrow" : "short" })}
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
              </span>
              {!single && weather && (() => {
                const w = daySummary(weather[dayKeys[i]]);
                if (!w) return null;
                return (
                  <span className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1 text-[11px] leading-tight tabular-nums" style={{ color: "var(--t-ink-soft)" }} title={`High ${w.hi}°, low ${w.lo}°, ${w.rain}% chance of rain`}>
                    <span>
                      <b style={{ color: "var(--t-ink)", fontWeight: 600 }}>{w.hi}°</b> <span className="opacity-80">{w.lo}°</span>
                    </span>
                    {w.rain >= 20 && (
                      <span className="flex items-center gap-0.5" style={{ color: "#2f5f99" }}>
                        <RainCloud />
                        {w.rain}%
                      </span>
                    )}
                  </span>
                );
              })()}
            </Link>
          );
        })}

        {days.map((day, i) =>
          now && isSameDay(day, now) ? (
            isAdventure ? (
              single ? null : <div key={`hl-${i}`} aria-hidden className="quest-today pointer-events-none" style={{ gridColumn: i + 2, gridRow: `1 / ${hourCount + 2}`, margin: "0 -1px" }} />
            ) : (
            <div
              key={`hl-${i}`}
              style={{
                gridColumn: i + 2,
                gridRow: `2 / ${hourCount + 2}`,
                background: isAdventure ? "rgba(209,161,60,.10)" : "var(--t-accent-soft)",
                opacity: isAdventure ? 1 : 0.4,
              }}
            />
            )
          ) : null
        )}

        {Array.from({ length: hourCount }, (_, row) => (
          <div
            key={`hour-${row}`}
            ref={row === 0 ? firstHourRef : undefined}
            style={{
              // Seamless: the labels are drawn on the time column above the strip; these only keep the room.
              ...(seamless ? { visibility: "hidden" as const } : {}),
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
            {single && !seamless && weather?.[dayKeys[0]]?.[HOUR_START + row] && (() => {
              const w = weather[dayKeys[0]][HOUR_START + row];
              return (
                <span
                  className="pointer-events-none absolute right-1 top-0.5 z-[4] flex items-center gap-1 rounded px-1 text-[11.5px] tabular-nums"
                  style={{ color: "var(--t-ink-soft)", background: isAdventure ? "rgba(243,230,200,.75)" : "var(--t-card)" }}
                  title={`${w.temp}° · ${w.rain}% chance of rain`}
                >
                  {w.rain >= 30 && <span className="flex items-center gap-0.5" style={{ color: "#2f5f99" }}><RainCloud />{w.rain}%</span>}
                  {w.temp}°
                </span>
              );
            })()}
          </div>
        ))}
        {/* Drag the times up or down to squeeze or stretch the day. */}
        {!seamless && zoomSlider({ gridColumn: 1, gridRow: `2 / ${hourCount + 2}` })}

        {/* Drag-to-add hit cells — one per (day, hour). Rendered before the
            task/event chips below so a chip occupying the same cell stacks
            visually on top and keeps first claim on pointer events there;
            dragging must start from genuinely empty space. */}
        {days.map((_, dayIndex) => (
          <div
            key={`hit-${dayIndex}`}
            className="relative select-none"
            style={{ gridColumn: dayIndex + 2, gridRow: `2 / ${hourCount + 2}`, cursor: 'url("/design/cursor-hand.svg") 11 3, pointer', touchAction: "pan-y" }}
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
            // Right-click or double-click a meal or habit hold: its menu.
            onContextMenu={(e) => {
              if (days[dayIndex] && holdMenuAt(days[dayIndex], e.clientX, e.clientY, "menu", e.timeStamp)) {
                e.preventDefault();
                setSel(null);
                setAddRange(null);
              }
            }}
            onDoubleClick={(e) => {
              if (days[dayIndex] && holdMenuAt(days[dayIndex], e.clientX, e.clientY, "menu", e.timeStamp)) {
                setSel(null);
                setAddRange(null);
              }
            }}
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
              {/* One day on screen: its hourly weather at the right of each hour (it scrolls with its day). */}
              {seamless && single && weather?.[dayKeys[dayIndex]] &&
                Array.from({ length: hourCount }, (_, row) => {
                  const w = weather[dayKeys[dayIndex]]?.[HOUR_START + row];
                  if (!w) return null;
                  return (
                    <span key={`w-${row}`} className="pointer-events-none absolute right-1 z-[4] flex items-center gap-1 rounded px-1 text-[11.5px] tabular-nums" style={{ top: row * HOUR_PX + 2, color: "var(--t-ink-soft)", background: isAdventure ? "rgba(243,230,200,.75)" : "var(--t-card)" }} title={`${w.temp}° · ${w.rain}% chance of rain`}>
                      {w.rain >= 30 && <span className="flex items-center gap-0.5" style={{ color: "#2f5f99" }}><RainCloud />{w.rain}%</span>}
                      {w.temp}°
                    </span>
                  );
                })}
              {daily && (
                <DailyBlocks
                  day={day}
                  daily={daily}
                  essentials={essentials}
                  habitLook={habitLook}
                  busy={dayItems.map((it) => ({ start: it.start.getTime(), end: it.end.getTime() }))}
                  topOf={(d) => (offset(d, day) / 60) * HOUR_PX}
                  isAdventure={isAdventure}
                />
              )}
              {dayItems.map((it) => {
                const l = lanes.get(it.key) ?? { lane: 0, count: 1 };
                const height = ((it.bottom - it.top) / 60) * HOUR_PX - 2;
                const past = now ? it.end.getTime() <= now.getTime() : false;
                const label = formatShortTimeRange(it.start, it.end);
                const oneLine = height < 34;
                // Too narrow to split (phones, multi-day views): fan out instead.
                const fan = l.count > 1 && colWidth > 0 && colWidth / l.count < 46;
                const step = Math.min(8, colWidth / (l.count + 2));
                const canDrag = it.kind === "task" || (it.event.editable !== false && !it.event.isAllDay);
                const isMoving = moving?.key === it.key;
                const cardW = fan ? colWidth - l.lane * step - 1 : colWidth / l.count - 2;
                // Adventure: a finished quest is a victory, so it keeps its colour; past ones only soften.
                const fade = !past || isMoving ? undefined : isAdventure && it.kind === "task" ? (it.task.status === "completed" ? undefined : "saturate(.6) brightness(1.03)") : "saturate(.2) contrast(.6) brightness(1.12)";
                return (
                  <div
                    key={it.key}
                    onPointerDownCapture={canDrag ? (e) => startItemDrag(e, it.key, { dayIndex: it.dayIndex, top: it.top, bottom: it.bottom }, it.kind === "task" ? { kind: "task", task: it.task } : { kind: "event", event: it.event }) : undefined}
                    onClickCapture={(e) => {
                      // The end of a drag isn't a tap on the chip.
                      if (justDragged.current) {
                        e.stopPropagation();
                        e.preventDefault();
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setItemMenu({
                        x: e.clientX,
                        y: e.clientY,
                        target: it.kind === "task" ? { kind: "task", task: it.task, start: it.start, end: it.end } : { kind: "event", id: it.event.id, title: it.event.title, start: it.start, end: it.end },
                      });
                    }}
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
                      filter: fade,
                      ...(isMoving ? { zIndex: 40, boxShadow: "0 8px 18px rgba(40,25,5,.35)", outline: "2px solid rgba(217,180,95,.9)", cursor: 'url("/design/cursor-grabbing.svg") 13 12, grabbing' } : {}),
                      touchAction: canDrag ? "pan-y" : undefined,
                    }}
                  >
                    {it.kind === "event" ? (
                      <GoogleEventChip event={it.event} theme={theme} compact timeLabel={label} oneLine={oneLine} />
                    ) : (
                      <CalendarTaskChip task={it.task} theme={theme} compact timeLabel={label} oneLine={oneLine || (portraits && height < 64)} portrait={portraits} show={card} box={colWidth > 0 ? { w: cardW, h: height } : undefined} />
                    )}
                    {canDrag && height >= 18 && (
                      <div data-resize aria-hidden title="Drag to change how long it runs" className="cal-resize absolute inset-x-1 bottom-0 h-[7px] cursor-ns-resize" />
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
      </div>
      </div>

      {itemMenu && <CalendarItemMenu target={itemMenu.target} x={itemMenu.x} y={itemMenu.y} theme={theme} onClose={() => setItemMenu(null)} />}
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

/** The little gilded shield over today's column. */
function TodayCrest() {
  return (
    <svg aria-hidden width="18" height="21" viewBox="0 0 18 21" className="absolute left-1/2 top-0 -translate-x-1/2">
      <path d="M9 1l7 2.6v6.1c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V3.6z" fill="url(#crest-g)" stroke="#5a4214" strokeWidth="1.1" />
      <path d="M9 5.2c1.6 1.5 2.4 3 2.4 4.6 0 1.6-1 2.9-2.4 3.6-1.4-.7-2.4-2-2.4-3.6 0-1.6.8-3.1 2.4-4.6z" fill="#fbecc0" opacity=".9" />
      <defs>
        <linearGradient id="crest-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dc8e" />
          <stop offset=".55" stopColor="#d9b45f" />
          <stop offset="1" stopColor="#a88a3f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * A day's essentials (meal time, wind-down, the after-dinner tidy) where there's
 * room for them, quieter than quests; and habits with a set time (Gym at 7),
 * which look like quests unless you choose otherwise.
 */
/** Asks the day's holds whether one sits at this point and opens its menu (a tap needs a second one soon after). */
function holdMenuAt(day: Date, x: number, y: number, kind: "tap" | "menu", t: number): boolean {
  const ev = new CustomEvent("hold-menu", { cancelable: true, detail: { dayKey: localDayKey(day), x, y, kind, t } });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

// The scheduler settings as last saved from here (the page's copy is stale until it refreshes).
let savedSettings: Record<string, unknown> | null = null;
/** Keep, move or leave out a non-negotiable for one day; null lets it float again. */
async function saveDayHold(base: Record<string, unknown> | null, dayKey: string, key: string, hold: DayHold | null) {
  const cur = { ...(savedSettings ?? base ?? {}) } as Record<string, unknown> & { essentialDays?: Record<string, Record<string, DayHold>> };
  const days = { ...(cur.essentialDays ?? {}) };
  // Only a week back is kept.
  const cutoff = localDayKey(new Date(Date.now() - 7 * 86_400_000));
  for (const k of Object.keys(days)) if (k < cutoff) delete days[k];
  const day = { ...(days[dayKey] ?? {}) };
  if (hold) day[key] = hold;
  else delete day[key];
  days[dayKey] = day;
  const next = { ...cur, essentialDays: days };
  savedSettings = next;
  try {
    const local = JSON.parse(window.localStorage.getItem("auto-schedule") || "{}");
    window.localStorage.setItem("auto-schedule", JSON.stringify({ ...local, essentialDays: days }));
  } catch {
    /* storage unavailable */
  }
  await saveSchedulerSettingsAction(next);
}

// Each non-negotiable's own look, when it differs from the calendar's setting ("quest" card or dashed "hold").
const LOOKS_KEY = "hold-looks";
let looksCache: { raw: string | null; val: Record<string, "quest" | "hold"> } = { raw: null, val: {} };
function readLooks(): Record<string, "quest" | "hold"> {
  try {
    const raw = window.localStorage.getItem(LOOKS_KEY);
    if (raw !== looksCache.raw) looksCache = { raw, val: raw ? JSON.parse(raw) : {} };
    return looksCache.val;
  } catch {
    return {};
  }
}
const noLooks: Record<string, "quest" | "hold"> = {};
function subscribeLooks(cb: () => void) {
  window.addEventListener("hold-looks", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("hold-looks", cb);
    window.removeEventListener("storage", cb);
  };
}
function setLook(key: string, look: "quest" | "hold" | null) {
  const next = { ...readLooks() };
  if (look) next[key] = look;
  else delete next[key];
  try {
    window.localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("hold-looks"));
}
type HoldTarget = { key: string; label: string; at: number; minutes: number; kept: boolean; crowded: boolean; meal: boolean };

/**
 * The day's non-negotiables: meals and the like float inside their ranges around everything else, and a
 * timed habit (Gym 7–10) takes the first free stretch of its window. When there's no room left in the range,
 * it shows in a muted red (owner, Nov 4). Right-click or double-tap one for its menu: keep it where it is
 * (the red goes), move it or change its length, or leave it out today.
 */
function DailyBlocks({ day, daily, essentials, habitLook, busy, topOf, isAdventure }: { day: Date; daily: DailyLayer; essentials: EssentialsLook; habitLook: HabitLook; busy: { start: number; end: number }[]; topOf: (d: Date) => number; isAdventure: boolean }) {
  const router = useRouter();
  const dayKey = localDayKey(day);
  const looks = useSyncExternalStore(subscribeLooks, readLooks, () => noLooks);
  // Changes made here show at once, before the page catches up.
  const [mine, setMine] = useState<Record<string, DayHold | null>>({});
  const [menu, setMenu] = useState<HoldTarget | null>(null);
  const [edit, setEdit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (fromFeedback(e) || (menuRef.current && menuRef.current.contains(e.target as Node))) return;
      setMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  const base = { ...SCHEDULER_DEFAULTS, ...((savedSettings ?? daily.settings) ?? {}) } as SchedulerSettings;
  const dayHolds: Record<string, DayHold> = { ...(base.essentialDays?.[dayKey] ?? {}) };
  for (const [k, v] of Object.entries(mine)) {
    if (v) dayHolds[k] = v;
    else delete dayHolds[k];
  }
  const settings = { ...base, essentialDays: { ...(base.essentialDays ?? {}), [dayKey]: dayHolds } };
  const placed = habitBlocksOn(daily.habits, day, busy, dayHolds);
  const habits = habitLook === "hidden" ? [] : placed;
  const taken = [...busy, ...placed];
  const holds =
    essentials === "hidden"
      ? []
      : mealsOn(day, settings).map((m) => {
          const at = m.kept ? m.from : holdAt(m.from, m.to, m.minutes, taken, m.ideal);
          // Crowded out: it shows where it would best go, in red, until it's kept, moved or left out.
          const shown = at ?? m.ideal ?? m.from;
          taken.push({ start: shown, end: shown + m.minutes * 60_000 });
          return { ...m, at: shown, crowded: at === null };
        });

  const pick = (t: HoldTarget) => {
    setEdit(false);
    setMenu(t);
  };
  // The holds let clicks through (a quest can be dragged or added over them); the grid asks them instead.
  const targets: Record<string, HoldTarget> = {};
  const handlers = (t: HoldTarget) => {
    targets[t.key] = t;
    return { "data-hold-day": dayKey, "data-hold-key": t.key };
  };
  const onHoldMenu = useEffectEvent((e: Event) => {
    const d = (e as CustomEvent<{ dayKey: string; x: number; y: number; kind: "tap" | "menu"; t: number }>).detail;
    if (d.dayKey !== dayKey) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-hold-day="${dayKey}"]`)].find((n) => {
      const r = n.getBoundingClientRect();
      return d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom;
    });
    const t = el ? targets[el.dataset.holdKey ?? ""] : undefined;
    if (!t) return;
    // A crowded (muted red) one opens at a single tap or click (owner, Nov 4).
    if (d.kind === "tap" && !t.crowded) {
      const last = lastTap.current;
      if (!(last && last.key === t.key && d.t - last.at < 360)) {
        lastTap.current = { key: t.key, at: d.t };
        return;
      }
      lastTap.current = null;
    }
    e.preventDefault();
    pick(t);
  });
  useEffect(() => {
    const on = (e: Event) => onHoldMenu(e);
    window.addEventListener("hold-menu", on);
    return () => window.removeEventListener("hold-menu", on);
  }, []);
  const save = (key: string, hold: DayHold | null) => {
    setMine((m) => ({ ...m, [key]: hold }));
    saveDayHold(daily.settings, dayKey, key, hold)
      .then(() => router.refresh())
      .catch(() => setMine((m) => {
        const n = { ...m };
        delete n[key];
        return n;
      }));
  };
  const minsOf = (ms: number) => {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  };
  const keepAt = (t: HoldTarget, at: number, minutes = t.minutes) => {
    save(t.key, { at: minsOf(at), minutes });
    setMenu({ ...t, at, minutes, kept: true, crowded: false });
  };
  const red: React.CSSProperties = { background: "rgba(178,84,66,.13)", border: "1.5px dashed rgba(160,70,52,.6)", borderRadius: 6, color: "#8a3f2c" };

  // The grid is parchment in every theme: a soft brown ink reads on it.
  const ink = isAdventure ? "#6b5631" : "var(--t-ink-soft)";
  const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const chip = "h-8 rounded-full px-2.5 text-[12.5px] font-semibold";
  return (
    <>
      {holds.map((h) => {
        const top = topOf(new Date(h.at));
        const height = Math.max(16, topOf(new Date(h.at + h.minutes * 60_000)) - top - 2);
        const look: React.CSSProperties = h.crowded
          ? red
          : essentials === "soft"
            ? { background: "rgba(168,138,63,.16)", borderRadius: 6 }
            : essentials === "line"
              ? { borderLeft: "3px solid rgba(139,112,64,.55)" }
              : { border: `1.5px ${h.kept ? "solid" : "dashed"} rgba(139,112,64,.6)`, borderRadius: 6 };
        const t: HoldTarget = { key: h.key, label: MEAL_NAMES[h.key], at: h.at, minutes: h.minutes, kept: !!h.kept, crowded: h.crowded, meal: true };
        const asQuest = (looks[h.key] ?? (essentials === "quest" ? "quest" : "hold")) === "quest";
        if (asQuest) {
          // Like a quest: a storybook card with its emoji.
          return (
            <div
              key={h.key}
              {...handlers(t)}
              title={`${MEAL_NAMES[h.key]}${h.crowded ? ": no free time left for it here" : ""} · right-click or double-tap`}
              className="quest-card absolute inset-x-0.5 flex items-center gap-1.5 overflow-hidden"
              style={{ top: top + 1, height, zIndex: menu?.key === h.key ? 3 : 0, padding: height >= 26 ? "3px 6px 3px 4px" : "1px 6px", borderRadius: 14, ...(h.crowded ? { background: "linear-gradient(rgba(178,84,66,.2), rgba(178,84,66,.2)), linear-gradient(180deg,#f6e8c4,#e8d29c)", border: "1.5px dashed rgba(160,70,52,.7)" } : {}) }}
            >
              <span aria-hidden className="shrink-0" style={{ fontSize: Math.min(20, Math.max(12, height - 10)), lineHeight: 1 }}>
                {MEAL_ICONS[h.key]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate" style={{ color: h.crowded ? "#8a3f2c" : "#3a2a14", fontSize: 12.5, lineHeight: 1.15 }}>
                  {MEAL_NAMES[h.key]}
                </span>
                {height >= 34 && (
                  <span className="block truncate" style={{ color: h.crowded ? "#8a3f2c" : "var(--t-ink-soft)", fontSize: 10.5, lineHeight: 1.2 }}>
                    {clock(h.at)}
                  </span>
                )}
              </span>
            </div>
          );
        }
        return (
          <div
            key={h.key}
            {...handlers(t)}
            title={h.crowded ? `${MEAL_NAMES[h.key]}: no free time left for it here (right-click or double-tap)` : `${MEAL_NAMES[h.key]}: ${h.kept ? "kept here" : "kept free (floats as things are planned)"} · right-click or double-tap`}
            className="absolute inset-x-0.5 overflow-hidden px-1.5 py-0.5 text-[11px] italic leading-tight"
            style={{ top: top + 1, height, color: ink, opacity: 0.9, zIndex: menu?.key === h.key ? 3 : 0, ...look }}
          >
            <span aria-hidden>{MEAL_ICONS[h.key]}</span> {MEAL_NAMES[h.key]}
          </div>
        );
      })}
      {habits.map((b) => {
        const top = topOf(new Date(b.start));
        const height = Math.max(18, topOf(new Date(b.end)) - top - 2);
        const time = new Date(b.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        const quest = (looks[`h:${b.habit.id}`] ?? (habitLook === "quest" ? "quest" : "hold")) === "quest";
        const t: HoldTarget = { key: `h:${b.habit.id}`, label: b.habit.title, at: b.start, minutes: Math.round((b.end - b.start) / 60_000), kept: !!b.kept, crowded: !!b.crowded, meal: false };
        const crowdedLook: React.CSSProperties = b.crowded ? { background: "linear-gradient(rgba(178,84,66,.2), rgba(178,84,66,.2)), linear-gradient(180deg,#f6e8c4,#e8d29c)", border: "1.5px dashed rgba(160,70,52,.7)" } : {};
        if (quest && isAdventure) {
          // Like a quest: a storybook card with the habit's portrait beside its name (owner's mockup, Nov 3).
          // Tall enough: the portrait stands above the name (so a narrow week column still shows both); else beside it.
          const tall = height >= 50;
          const art = tall ? Math.min(height - 24, 34) : height >= 26 ? Math.min(height - 8, 30) : 0;
          return (
            <div key={b.habit.id} {...handlers(t)} className={`quest-card absolute inset-x-0.5 flex overflow-hidden ${tall ? "flex-col items-center justify-center gap-0.5 text-center" : "items-center gap-1.5"}`} title={`${b.habit.title}: a daily habit, ${time}${b.crowded ? " (no free time left in its window)" : ""} · right-click or double-tap`} style={{ top: top + 1, height, zIndex: menu?.key === t.key ? 3 : 1, padding: tall ? "3px 3px" : height >= 26 ? "3px 6px 3px 4px" : "1px 6px", borderRadius: 14, ...crowdedLook }}>
              {art >= 16 ? (
                <span className="quest-art flex shrink-0 items-center justify-center overflow-hidden" style={{ width: art, height: art, borderRadius: art > 30 ? 8 : 5 }}>
                  {b.habit.icon_key ? (
                    // eslint-disable-next-line @next/next/no-img-element -- habit portrait
                    <img src={b.habit.icon_key} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <span style={{ fontSize: art * 0.62, lineHeight: 1 }}>🌱</span>
                  )}
                </span>
              ) : null}
              <span className={tall ? "w-full min-w-0" : "min-w-0 flex-1"}>
                <span className="font-display block truncate" style={{ color: b.crowded ? "#8a3f2c" : "#3a2a14", fontSize: 12.5, lineHeight: 1.15 }}>
                  {b.habit.title}
                </span>
                {height >= (tall ? 76 : 34) && (
                  <span className="block truncate" style={{ color: b.crowded ? "#8a3f2c" : "var(--t-ink-soft)", fontSize: 10.5, lineHeight: 1.2 }}>
                    {time}
                  </span>
                )}
              </span>
            </div>
          );
        }
        return (
          <div
            key={b.habit.id}
            {...handlers(t)}
            className="absolute inset-x-0.5 flex items-start gap-1 overflow-hidden px-1.5 py-0.5 text-[11.5px] leading-tight"
            style={{
              top: top + 1,
              height,
              zIndex: menu?.key === t.key ? 3 : 1,
              borderRadius: 6,
              color: quest ? "#2a1c10" : ink,
              ...(quest
                ? { background: "linear-gradient(180deg,#f6e8c4,#e8d29c)", border: "1px solid #a88a3f", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }
                : { border: `1.5px ${b.kept ? "solid" : "dashed"} rgba(139,112,64,.6)`, fontStyle: "italic" }),
              ...(b.crowded ? red : {}),
            }}
          >
            <span aria-hidden>🌱</span>
            <span className="min-w-0">
              <b className="block truncate">{b.habit.title}</b>
              {height >= 30 && <span className="opacity-70">{time}</span>}
            </span>
          </div>
        );
      })}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menu.label}
          className="card-pop-in parchment pointer-events-auto absolute left-0.5 z-[30] flex w-[min(230px,calc(100vw-24px))] flex-col gap-1 p-2 text-[13px]"
          style={{ top: topOf(new Date(menu.at + menu.minutes * 60_000)) + 2, borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 10px 24px rgba(0,0,0,.3)", color: "#2a1c10" }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="relative z-[1] px-1 font-display text-[14.5px] leading-snug">
            {menu.label}
            <span className="block font-sans text-[12px] tabular-nums" style={{ color: menu.crowded ? "#8a3f2c" : "#6b5631" }}>
              {clock(menu.at)} · {menu.minutes}m{menu.kept ? " · kept here" : ""}
            </span>
          </span>
          {!menu.kept && (
            <button type="button" role="menuitem" onClick={() => (keepAt(menu, menu.at), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left font-semibold hover:bg-black/[.05]">
              ✓ Keep it here
            </button>
          )}
          <button type="button" role="menuitem" aria-expanded={edit} onClick={() => setEdit((v) => !v)} className="relative z-[1] h-9 rounded-lg px-2 text-left font-semibold hover:bg-black/[.05]" style={{ background: edit ? "rgba(217,180,95,.2)" : undefined }}>
            ✎ Edit time and length
          </button>
          {edit && (
            <div className="reveal relative z-[1] flex flex-col gap-1 rounded-lg px-1.5 py-1.5" style={{ background: "rgba(120,90,40,.08)" }}>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => keepAt(menu, menu.at - 15 * 60_000)} className={chip} style={{ border: "1px solid #b39a6a" }} aria-label="15 minutes earlier">
                  −15
                </button>
                <span className="min-w-[64px] flex-1 text-center font-bold tabular-nums">{clock(menu.at)}</span>
                <button type="button" onClick={() => keepAt(menu, menu.at + 15 * 60_000)} className={chip} style={{ border: "1px solid #b39a6a" }} aria-label="15 minutes later">
                  +15
                </button>
              </span>
              <span className="flex flex-wrap gap-1">
                {[15, 30, 45, 60, 90].map((m) => (
                  <button key={m} type="button" onClick={() => keepAt(menu, menu.at, m)} aria-pressed={m === menu.minutes} className={chip} style={m === menu.minutes ? { background: "var(--t-gold, #e2bb5c)", border: "1px solid #8a6116" } : { border: "1px solid #b39a6a" }}>
                    {m < 60 ? `${m}m` : m === 90 ? "1½h" : "1h"}
                  </button>
                ))}
              </span>
            </div>
          )}
          {menu.kept && (
            <button type="button" role="menuitem" onClick={() => (save(menu.key, null), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left hover:bg-black/[.05]">
              ↺ Let it float again
            </button>
          )}
          {(() => {
            const isQuest = (looks[menu.key] ?? ((menu.meal ? essentials : habitLook) === "quest" ? "quest" : "hold")) === "quest";
            return (
              <>
                <button type="button" role="menuitem" onClick={() => (setLook(menu.key, isQuest ? "hold" : "quest"), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left hover:bg-black/[.05]">
                  {isQuest ? "◌ Show this one as a hold" : "▣ Show this one as a quest card"}
                </button>
              </>
            );
          })()}
          <button type="button" role="menuitem" onClick={() => (save(menu.key, { off: true }), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left hover:bg-black/[.05]" style={{ color: "#8a3f2c" }}>
            Remove for today
          </button>
        </div>
      )}
    </>
  );
}

/** A small rain cloud, filled blue (the day's chance of rain sits beside it). */
function RainCloud() {
  return (
    <svg width="13" height="12" viewBox="0 0 24 22" aria-hidden>
      <path d="M7 14.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17.5 14.5z" fill="#5b8fd6" stroke="#2f5f99" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" stroke="#2f5f99" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
