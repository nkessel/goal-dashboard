"use client";

import { useHiddenEvents } from "@/lib/hidden-events";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNowMinute } from "@/lib/use-now-minute";
import { daySummary, useWeatherRange } from "@/lib/use-weather";
import { useRouter } from "next/navigation";
import { scheduleTaskAction, updateGoogleEventAction } from "@/app/actions";
import { saveDayHold } from "@/lib/day-holds";
import { carryQuest, useCarried, QUEST_DRAG_TYPE, registerCalendarDrop, type Carried } from "@/lib/schedule-carry";
import { WeatherLocation, useWeatherPlaceName } from "@/components/ui/WeatherLocation";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import {
  HOUR_START,
  DAY_FROM,
  DAY_UNTIL,
  HOUR_END,
  formatDateParam,
  formatHourLabel,
  formatShortTimeRange,
  isSameDay,
  parseDateParam,
} from "@/lib/calendar-dates";
import { CalendarAddPopup } from "./CalendarAddPopup";
import { CalendarItemMenu, type MenuTarget } from "./CalendarItemMenu";
import { CalendarTaskChip, getTaskDisplayWindow, roomyScale } from "./CalendarTaskChip";
import { holdStill } from "./CalendarNav";
import { sessionRef, showsOnCalendar } from "@/lib/calendar-task-window";
import type { CardShow } from "./CalendarLayers";
import { GoogleEventChip } from "./GoogleEventChip";
import type { DailyLayer, EssentialsLook, HabitLook } from "./CalendarLayers";
import { localDayKey } from "@/lib/auto-schedule";
import { driveWords, useAllQuestDrives } from "@/lib/use-quest-cal";
import { writeCalUi, type CalUi } from "@/lib/cal-ui";
import { DEFAULT_HOUR_PX, savedCalHour, ADVENTURE_HOUR_PX, MIN_HOUR_PX, MAX_HOUR_PX, ZOOM_KEY, SPAN_KEY, MAX_SPAN } from "./week/zoom-store";
import { DaysZoom, HoursButton, GoToday, TodayCrest } from "./week/controls";
import { RainPct, RainCloud } from "./week/weather";
import { holdMenuAt, DailyBlocks } from "./week/DailyBlocks";

/**
 * Whether this is the browser, after hydration. The server's clock is in another time zone than the person's,
 * so cards, essentials and the now-line placed there land hours off and React throws that picture away
 * (Nov 19, the calendar's loading glitch). The server draws only the grid, hours and day headings.
 */
const noSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/**
 * Pick mode (When 3, `MiniCalendar`): the calendar places one quest that isn't saved yet. A tap on an empty spot
 * puts it there, it drags and its foot resizes; nothing else on the calendar moves, opens or navigates, and
 * nothing is written: the new time goes to `onChange`, and the host saves it. Everything for it sits behind `pick`.
 */
export type CalPick = {
  title: string;
  minutes: number;
  value: { start: string; end: string } | null;
  onChange: (s: { start: string; end: string }) => void;
  /** Move the days shown by n (a sideways swipe or trackpad swipe), instead of going to the calendar screen. */
  onShiftDays?: (n: number) => void;
};

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
  embedded = false,
  ui,
  pick: pickMode,
}: {
  /** Pick mode: place this one quest (see `CalPick`). */
  pick?: CalPick;
  /** What the server read from the `cal-ui` cookie: starting values, so the first picture is the final one. */
  ui?: CalUi;
  /** Inside a box of its own that scrolls (Today's day calendar): it scrolls that box, not the page, and stays on its day. */
  embedded?: boolean;
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
  const [hourPx, setHourPx] = useState(ui?.zoom ?? (isAdventure ? ADVENTURE_HOUR_PX : DEFAULT_HOUR_PX));
  // 7 AM–10:30 PM by default; the hours before and after open from a button (owner, Nov 6: "The user should have to click a button to see before 7am and after 10:30pm").
  const [early, setEarly] = useState(ui?.early ?? false);
  // null: the late hours follow the quests (a quest running past 10:30 PM opens them; owner, Nov 19: "Yes").
  const [lateChoice, setLate] = useState<boolean | null>(ui?.late ?? null);
  // Just placed at a time behind the early/late buttons (from a picker): open those hours so it's seen (planner step 2c).
  const picking = !!pickMode;
  useEffect(() => {
    if (picking) return;
    let at: string | null = null;
    try {
      at = window.sessionStorage.getItem("cal-reveal");
      if (at) window.sessionStorage.removeItem("cal-reveal");
    } catch {
      /* storage unavailable */
    }
    if (!at) return;
    const d = new Date(at);
    const hr = d.getHours() + d.getMinutes() / 60;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage after a placement
    if (hr < DAY_FROM) setEarly(true);
    else if (hr >= DAY_UNTIL) setLate(true);
  }, [tasks, picking]);
  const H0 = early ? HOUR_START : DAY_FROM;
  const [gripY, setGripY] = useState<number | null>(null);
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number; target: MenuTarget } | null>(null);
  const HOUR_PX = hourPx;
  useEffect(() => {
    if (ui?.zoom || picking) return;
    try {
      const z = Number(window.localStorage.getItem(ZOOM_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (z >= MIN_HOUR_PX && z <= MAX_HOUR_PX) setHourPx(z);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once after hydration; the cookie value only seeds the start
  }, []);
  function zoomTo(px: number) {
    const v = Math.round(Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, px)));
    setHourPx(v);
    // Pick mode's small calendar keeps its own size: the calendar screen's zoom stays as it is.
    if (picking) return;
    try {
      window.localStorage.setItem(ZOOM_KEY, String(v));
      writeCalUi({ zoom: v });
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
  // Driving to a quest's place and back (owner, Nov 12): kept free before and after it.
  const drives = useAllQuestDrives();
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
      // A habit from the auto-scheduler (owner, Nov 6): it holds that time on that day.
      if (q.id.startsWith("h:")) await saveDayHold(daily?.settings ?? null, localDayKey(start), q.id, { at: start.getHours() * 60 + start.getMinutes(), minutes: q.minutes });
      else await scheduleTaskAction(q.id, start.toISOString(), end.toISOString());
      router.refresh();
    } catch (e) {
      setLanding(null);
      setPlaceError(e instanceof Error ? e.message : "Couldn't put it on the calendar.");
    } finally {
      setPlacing(false);
    }
  }
  // A quest card dragged here from elsewhere (Today's lists): where it would land, then where it landed until fresh data arrives.
  const [ext, setExt] = useState<{ dayIndex: number; min: number; q: Carried } | null>(null);
  const [landing, setLanding] = useState<{ dayIndex: number; min: number; q: Carried } | null>(null);
  const [seenTasks, setSeenTasks] = useState(tasks);
  if (tasks !== seenTasks) {
    setSeenTasks(tasks);
    setLanding(null);
  }
  const vis = Math.max(1, Math.min(days.length, visible ?? days.length));
  const seamless = buffer > 0 && days.length > vis;
  const single = vis === 1;
  // How many days fit on screen, partway too: the zoom slider over the days, or a sideways pinch (owner, Nov 5 and 12:
  // "a slider from 1-14 days… allow partial days to show… super smooth").
  const fromCookie = ui?.span && ui.span >= 1 && ui.span <= MAX_SPAN && Math.max(1, Math.ceil(ui.span - 0.01)) === vis ? ui.span : null;
  const [span, setSpan] = useState<number | null>(seamless ? fromCookie : null);
  useEffect(() => {
    if (!seamless) return;
    let s: number | null = null;
    try {
      const v = Number(window.localStorage.getItem(SPAN_KEY));
      if (v >= 1 && v <= MAX_SPAN && Math.max(1, Math.ceil(v - 0.01)) === vis) s = v;
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
    setSpan(s ?? fromCookie);
  }, [vis, seamless, fromCookie]);
  const shown = seamless ? Math.max(1, Math.min(MAX_SPAN, days.length - 1, span ?? vis)) : vis;
  /** While zooming: which day (and how far into it) stays under the slider's middle or the pointer. */
  const zoomAnchor = useRef<{ d: number; off: number } | null>(null);
  const zoomAnim = useRef(0);
  const timeBg = isAdventure ? TIME_BG : "var(--t-card)";
  const nowMinute = useNowMinute();
  const hydrated = useHydrated();
  const hiddenEvents = useHiddenEvents();
  // A quest on a shown day that starts before the 10:30 PM fold and ends after it would be cut at the fold: the
  // late hours open by themselves (until you fold them with the button).
  const crossesLate =
    hydrated &&
    tasks.some((t) => {
      if (!showsOnCalendar(t)) return false;
      const { start, end } = getTaskDisplayWindow(t);
      const fold = new Date(start);
      fold.setHours(Math.floor(DAY_UNTIL), Math.round((DAY_UNTIL % 1) * 60), 0, 0);
      return start < fold && end > fold && days.some((d) => isSameDay(d, start));
    });
  const late = lateChoice ?? crossesLate;
  const H1 = late ? HOUR_END + 1 : DAY_UNTIL;
  const now = nowMinute ? new Date(nowMinute * 60_000) : null;
  const hourCount = Math.ceil(H1 - H0);
  const gridMinutes = (H1 - H0) * 60;
  const lastRowPx = (H1 - H0 - (hourCount - 1)) * HOUR_PX;

  // Drag (or tap) a time range on a day's column to open the add-quest
  // popup — either creating a new quest already scheduled there, or
  // searching existing quests to drop into that slot instead.
  const [addRange, setAddRange] = useState<{ start: Date; end: Date } | null>(null);
  // Pick a time to the quarter hour: drag with a mouse for a range, or tap
  // (mouse or finger) for a 30-minute slot. Touch still scrolls the page.
  const [sel, setSel] = useState<{ dayIndex: number; lo: number; hi: number } | null>(null);
  const pick = useRef<{ dayIndex: number; startMin: number; x: number; y: number; mouse: boolean; moved: boolean; lo: number; hi: number; sideways?: number } | null>(null);
  const SNAP = 15;
  const minuteAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = ((e.clientY - r.top) / HOUR_PX) * 60;
    return Math.max(0, Math.min(gridMinutes - SNAP, Math.floor(m / SNAP) * SNAP));
  };
  const minuteDate = (day: Date, minutes: number) => {
    const d = new Date(day);
    d.setHours(H0, 0, 0, 0);
    return new Date(d.getTime() + minutes * 60_000);
  };
  function pickDown(e: React.PointerEvent<HTMLDivElement>, dayIndex: number) {
    // Only the main button picks a time (a right-click is for a hold's menu).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const m = minuteAt(e);
    if (carried && !pickMode) {
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
    // A mouse dragged sideways moves through the days (at any hour), instead of picking a time.
    const dx = e.clientX - p.x;
    const el = scrollRef.current;
    if (seamless && el && (p.sideways != null || (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - p.y) * 1.5))) {
      if (p.sideways == null) p.sideways = el.scrollLeft;
      el.scrollLeft = p.sideways - dx;
      setSel(null);
      return;
    }
    const m = minuteAt(e);
    p.lo = Math.min(p.startMin, m);
    p.hi = Math.max(p.startMin, m) + SNAP;
    setSel({ dayIndex, lo: p.lo, hi: p.hi });
  }
  function pickUp(e: React.PointerEvent<HTMLDivElement>, dayIndex: number) {
    const p = pick.current;
    pick.current = null;
    if (!p || p.dayIndex !== dayIndex) return;
    if (p.sideways != null) return; // it moved the days
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
    // Pick mode: a tap puts the quest there at its length (a mouse drag, at the length dragged). Nothing opens.
    if (pickMode) {
      setSel(null);
      const start = minuteDate(day, lo);
      const end = p.mouse && p.moved ? minuteDate(day, hi) : new Date(start.getTime() + Math.max(15, pickMode.minutes) * 60_000);
      pickMode.onChange({ start: start.toISOString(), end: end.toISOString() });
      return;
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
  // The grid holds the whole day. It opens on the hour you were looking at when you move between days
  // (kept for a few minutes in sessionStorage "cal-hour"); otherwise an hour before now when today is shown,
  // else at 7 AM.
  const openedAt = useRef(false);
  useLayoutEffect(() => {
    const h = firstHourRef.current;
    if (!h || openedAt.current) return;
    openedAt.current = true;
    if (embedded) {
      // Its own box scrolls: an hour before now.
      const sc = h.closest<HTMLElement>("[data-cal-scroller]");
      if (!sc) return;
      // Pick mode opens on the picked time when there is one.
      const d = pickMode?.value ? new Date(pickMode.value.start) : new Date();
      const hr = Math.min(H1, Math.max(H0, d.getHours() + d.getMinutes() / 60 - 1));
      sc.scrollTop = Math.max(0, h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop + (hr - H0) * HOUR_PX - 40);
      return;
    }
    let hour = savedCalHour();
    if (hour == null) {
      if (window.scrollY > 10) return;
      const d = new Date();
      const todayShown = days.some((day) => isSameDay(day, d));
      hour = todayShown ? Math.max(DAY_FROM - 2, d.getHours() + d.getMinutes() / 60 - 1) : DAY_FROM;
    }
    const y = h.getBoundingClientRect().top + window.scrollY + (Math.min(H1, Math.max(H0, hour)) - H0) * HOUR_PX - 96;
    window.scrollTo({ top: Math.max(0, y) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the hours are first laid out
  }, []);
  // Remember the hour in view, so moving to other days (swiping, ‹ ›, the date) keeps it.
  useEffect(() => {
    if (embedded) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const keep = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const h = firstHourRef.current;
        if (!h) return;
        const top = h.getBoundingClientRect().top + window.scrollY;
        const hour = H0 + (window.scrollY + 96 - top) / HOUR_PX;
        try {
          window.sessionStorage.setItem("cal-hour", JSON.stringify({ hour: Math.max(H0, hour), at: Date.now() }));
        } catch {
          /* storage unavailable */
        }
      }, 150);
    };
    window.addEventListener("scroll", keep, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", keep);
    };
  }, [HOUR_PX, H0, embedded]);
  const [colWidth, setColWidth] = useState(0);
  // Until the screen is measured, only the days that will show are drawn, at equal widths. Drawing every loaded
  // day (7 more each side, for scrolling) squeezed them all onto the screen: the "14-day view" flash (Nov 19).
  const pre = seamless && colWidth <= 0;
  const preFrom = pre ? buffer : 0;
  const preTo = pre ? Math.min(days.length, buffer + vis) : days.length;
  const nCols = preTo - preFrom;
  const col = (i: number) => i - preFrom + 2;
  const mapDrawn = <T,>(fn: (day: Date, i: number) => T) => days.map((day, i) => (i >= preFrom && i < preTo ? fn(day, i) : null));
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Seamless: the days' room is the scroll strip's width less the time column and the gaps between days.
    const measure = () => setColWidth(seamless && scrollRef.current ? (scrollRef.current.clientWidth - 40 - 2 * shown) / shown : (el.clientWidth - 20 - 40) / vis);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vis, shown, seamless]);

  // Seamless days: the grid scrolls sideways under a fixed time column, stopping wherever you leave it (part of a
  // day too). Past a few days from the middle, the window of loaded days moves along and the spot is kept.
  const [firstIdx, setFirstIdx] = useState(buffer);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!seamless || !el || colWidth <= 0) return;
    // Zooming: the day under the slider's middle (or the pointer) stays where it is while the days widen or narrow.
    const z = zoomAnchor.current;
    let frac = 0;
    if (!z) try {
      const saved = JSON.parse(window.sessionStorage.getItem("cal-scroll") ?? "null") as { key: string; frac: number } | null;
      if (saved && saved.key === dayKeys[buffer]) frac = saved.frac;
      window.sessionStorage.removeItem("cal-scroll");
    } catch {
      /* storage unavailable */
    }
    el.scrollTo({ left: z ? z.d * (colWidth + 2) - z.off : buffer * (colWidth + 2) + frac * (colWidth + 2), behavior: "instant" });
    if (!z) setFirstIdx(buffer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the loaded days or the column size change
  }, [seamless, colWidth, dayKeys[0], buffer]);
  function onDaysScroll() {
    const el = scrollRef.current;
    if (!el || colWidth <= 0) return;
    const at = el.scrollLeft / (colWidth + 2);
    if (pinRowRef.current) pinRowRef.current.style.transform = `translateX(${-el.scrollLeft}px)`;
    setFirstIdx(Math.floor(at + 0.5));
    clearTimeout(scrollTimer.current);
    if (zoomAnchor.current) return; // the zoom loads the days around it once it settles
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
      const n = Math.max(1, Math.ceil(shown - 0.01));
      holdStill();
      router.replace(vis === 1 && n === 1 ? `/calendar?view=day&date=${key}` : `/calendar?view=days&n=${n}&date=${key}`, { scroll: false });
    }, 260);
  }

  // Zoom the days: wider or narrower, smoothly, partway too. The page loads the right days once it settles.
  function zoomDays(next: number, off?: number) {
    const el = scrollRef.current;
    if (!seamless || !el || colWidth <= 0) return;
    const s = Math.round(Math.max(1, Math.min(MAX_SPAN, days.length - 1, next)) * 100) / 100;
    if (s === shown) return;
    if (!zoomAnchor.current) {
      const o = off ?? (el.clientWidth - 40) / 2;
      zoomAnchor.current = { d: (el.scrollLeft + o) / (colWidth + 2), off: o };
    }
    setSpan(s);
  }
  /** Glide to a number of days (the − and + beside the slider). */
  function zoomDaysTo(target: number) {
    cancelAnimationFrame(zoomAnim.current);
    const from = shown;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 260);
      zoomDays(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) zoomAnim.current = requestAnimationFrame(step);
    };
    zoomAnim.current = requestAnimationFrame(step);
  }
  const commitZoom = useEffectEvent(() => {
    const el = scrollRef.current;
    zoomAnchor.current = null;
    if (!el || colWidth <= 0) return;
    try {
      window.localStorage.setItem(SPAN_KEY, String(shown));
      writeCalUi({ span: shown });
    } catch {
      /* storage unavailable */
    }
    const n = Math.max(1, Math.ceil(shown - 0.01));
    const at = el.scrollLeft / (colWidth + 2);
    const idx = Math.max(0, Math.floor(at));
    if (n === vis && Math.abs(idx - buffer) < Math.ceil(buffer / 2)) return;
    const key = dayKeys[idx];
    if (!key) return;
    try {
      window.sessionStorage.setItem("cal-scroll", JSON.stringify({ key, frac: at - idx }));
    } catch {
      /* storage unavailable */
    }
    holdStill();
    router.replace(`/calendar?view=days&n=${n}&date=${key}`, { scroll: false });
  });
  useEffect(() => {
    if (span == null || !zoomAnchor.current) return;
    const t = setTimeout(() => commitZoom(), 650);
    return () => clearTimeout(t);
  }, [span]);
  /** Ctrl + wheel (a trackpad pinch) over the day headings zooms the days; over the hours it zooms the hours. */
  const onDayWheel = useEffectEvent((e: WheelEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    cancelAnimationFrame(zoomAnim.current);
    zoomDays(shown * Math.exp(e.deltaY * 0.01), Math.max(0, e.clientX - el.getBoundingClientRect().left - 40));
  });
  const onDayPinch = useEffectEvent((fromSpan: number, ratio: number, x: number) => {
    const el = scrollRef.current;
    if (!el) return;
    zoomDays(fromSpan * ratio, Math.max(0, x - el.getBoundingClientRect().left - 40));
  });
  const spanNow = useEffectEvent(() => shown);
  // Pinch to zoom the hours (two fingers on a phone, or a trackpad pinch); spread side by side, the days.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Fingers spread side by side zoom the days; one above the other zoom the hours.
    let start: { d: number; px: number; days: boolean; span: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const dx = Math.abs(e.touches[0].clientX - e.touches[1].clientX);
      const dy = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
      start = { d: dist(e.touches), px: pxNow.current, days: dx > dy * 1.4, span: spanNow() };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault();
      if (start.days) onDayPinch(start.span, start.d / Math.max(1, dist(e.touches)), (e.touches[0].clientX + e.touches[1].clientX) / 2);
      else zoomTo(start.px * (dist(e.touches) / start.d));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const hoursTop = firstHourRef.current?.getBoundingClientRect().top;
      if (hoursTop != null && e.clientY < hoursTop) return onDayWheel(e);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomTo reads only setters and pick mode, which is fixed for a WeekView's life
  }, []);

  // Fluid days: drag the day headers sideways to move through days, or drag
  // the grip at their right end to make every day wider or narrower (more or
  // fewer days fit). It follows your finger, then settles on whole days.
  const [fluid, setFluid] = useState<{ dx: number; w: number | null; n?: number } | null>(null);
  const dragged = useRef(false);
  const goTo = (startOffset: number, n: number) => {
    if (pickMode) {
      if (startOffset) pickMode.onShiftDays?.(startOffset);
      return;
    }
    const first = new Date(days[seamless ? Math.max(0, Math.min(days.length - 1, firstIdx)) : 0]);
    first.setDate(first.getDate() + startOffset);
    const key = formatDateParam(first);
    const k = Math.max(1, Math.min(14, n));
    router.push(k === 1 ? `/calendar?view=day&date=${key}` : `/calendar?view=days&n=${k}&date=${key}`, { scroll: false });
  };
  function startDayScroll(e: React.PointerEvent) {
    if (embedded || e.button !== 0 || colWidth <= 0) return;
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
    x.setHours(H0, 0, 0, 0);
    return x.getTime();
  };
  /** Whether something lies wholly before or after the hours shown (those wait behind the Earlier/Later buttons). */
  const hidden = { early: 0, late: 0 };
  // The hour's label, with its temperature beneath it when one day is on screen (owner, Nov 12: "put the temperature beneath/next to the times").
  const hourLabel = (row: number) => {
    const w = single ? weather?.[dayKeys[seamless ? Math.max(0, Math.min(days.length - 1, firstIdx)) : 0]]?.[H0 + row] : undefined;
    const text = HOUR_PX < 30 ? formatHourLabel(H0 + row).replace(/:00/, "").replace(/\s?([AP])M/i, (_, m: string) => m.toLowerCase()) : formatHourLabel(H0 + row).replace(" ", "\n");
    return (
      <>
        {text}
        {w && (
          <span className="block tabular-nums" style={{ fontSize: 10.5, color: "var(--t-ink-soft)", opacity: 0.85 }} title={`${w.temp}° · ${w.rain}% chance of rain`}>
            {w.temp}°
          </span>
        )}
        {w && w.rain >= 20 && <RainPct pct={w.rain} />}
      </>
    );
  };
  /** A day's XP: what its quests have paid so far, else what they'd pay. */
  const dayXp = (i: number) => {
    let won = 0;
    let ahead = 0;
    for (const it of items) {
      if (it.kind !== "task" || it.dayIndex !== i) continue;
      if (it.task.status === "completed") won += it.task.xp_awarded ?? it.task.xp_value ?? 0;
      else ahead += it.task.xp_value ?? 0;
    }
    return { won, ahead };
  };
  /**
   * A day's heading: weekday, date and its XP on one line ("+ 50XP", owner Nov 12), the weather under it.
   * The same heading also stays pinned at the top while you scroll down (`compact` draws it smaller, unused now).
   */
  const dayHead = (day: Date, i: number, isToday: boolean, compact: boolean) => {
    const { won, ahead } = dayXp(i);
    const w = weather ? daySummary(weather[dayKeys[i]]) : null;
    return (
      <>
        <span className="flex flex-wrap items-center justify-center gap-x-1">
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
            className={`flex ${compact ? "h-5 min-w-5" : "h-6 min-w-6"} items-center justify-center rounded-full px-1 text-[13px] tabular-nums`}
            style={
              isToday
                ? { background: isAdventure ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", fontWeight: 700 }
                : { color: "var(--t-ink)" }
            }
          >
            {day.getDate()}
          </span>
          {(won > 0 || ahead > 0) && (
            <span
              className="whitespace-nowrap text-[11px] font-semibold leading-tight tabular-nums"
              style={{ color: won ? "var(--t-xp, #8a6c2c)" : "var(--t-ink-soft)", opacity: won ? 1 : 0.75 }}
              title={won ? `${won} XP won this day${ahead ? ` · ${ahead} more to win` : ""}` : `${ahead} XP to win this day`}
            >
              + {won || ahead}XP
            </span>
          )}
        </span>
        {w && (
          <span className={`${compact ? "" : "mt-0.5"} flex flex-wrap items-center justify-center gap-x-1 text-[11px] leading-tight tabular-nums`} style={{ color: "var(--t-ink-soft)" }} title={`High ${w.hi}°, low ${w.lo}°, ${w.rain}% chance of rain`}>
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
        )}
      </>
    );
  };
  // The heading row pinned at the top once the real one scrolls away, following the days sideways.
  const pinRowRef = useRef<HTMLDivElement | null>(null);
  const [pinShown, setPinShown] = useState(false);
  useLayoutEffect(() => {
    if (pinRowRef.current) pinRowRef.current.style.transform = `translateX(${-(scrollRef.current?.scrollLeft ?? 0)}px)`;
  });
  // "Go to today" beside the + button whenever today (or now's hour) is off the screen (owner, Nov 12).
  const todayIdx = now ? days.findIndex((d) => isSameDay(d, now)) : -1;
  const [nowOff, setNowOff] = useState(false);
  useEffect(() => {
    const check = () => {
      const h = firstHourRef.current;
      if (!h) return;
      const sc = embedded ? h.closest<HTMLElement>("[data-cal-scroller]") : null;
      const top = h.getBoundingClientRect().top - (sc ? sc.getBoundingClientRect().top : 0);
      const gridH = (gridMinutes / 60) * HOUR_PX;
      // The headings' own top: once they reach the top of the screen the same bar stays there (owner's note
      // 38bf14ef: "keep the same bar persisting … landing where it currently is once it scrolls back").
      const days = scrollRef.current?.getBoundingClientRect();
      const headsAt = (days?.top ?? 0) - (sc ? sc.getBoundingClientRect().top : 0);
      // Not while the calendar itself is off the screen (Today's calendar tucked away at the side).
      const onScreen = !!days && days.left < window.innerWidth - 4 && days.right > 4;
      setPinShown(onScreen && headsAt < -1 && top + gridH > 60);
      const d = new Date();
      const hr = d.getHours() + d.getMinutes() / 60;
      if (hr < H0 || hr > H1) return setNowOff(false);
      const y = top + (hr - H0) * HOUR_PX;
      setNowOff(y < 40 || y > window.innerHeight - 110);
    };
    check();
    const sc = embedded ? firstHourRef.current?.closest<HTMLElement>("[data-cal-scroller]") : null;
    const target: HTMLElement | Window = sc ?? window;
    target.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // Today's calendar sliding in from the side: look again once it's on screen.
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(() => check(), { threshold: [0, 0.5, 1] }) : null;
    if (io && scrollRef.current) io.observe(scrollRef.current);
    return () => {
      target.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      io?.disconnect();
    };
  }, [gridMinutes, HOUR_PX, H0, H1, embedded]);
  const todayOff = todayIdx < 0 || (seamless && (todayIdx < firstIdx || todayIdx >= firstIdx + vis)) || nowOff;
  function goToday() {
    const d = new Date();
    const hr = d.getHours() + d.getMinutes() / 60;
    // The hour that puts now in the middle of the screen (the grid opens with that hour 96px from the top).
    const hour = hr - (window.innerHeight / 2 - 96) / HOUR_PX;
    if (todayIdx < 0) {
      try {
        window.sessionStorage.setItem("cal-hour", JSON.stringify({ hour, at: Date.now() }));
      } catch {
        /* storage unavailable */
      }
      const first = new Date(d);
      first.setDate(first.getDate() - Math.floor((vis - 1) / 2));
      const key = formatDateParam(first);
      router.push(vis === 1 ? `/calendar?view=day&date=${key}` : `/calendar?view=days&n=${vis}&date=${key}`, { scroll: false });
      return;
    }
    if (hr < H0) setEarly(true);
    if (hr > H1) setLate(true);
    const el = scrollRef.current;
    if (seamless && el && colWidth > 0) el.scrollTo({ left: Math.max(0, todayIdx - Math.floor((vis - 1) / 2)) * (colWidth + 2), behavior: "smooth" });
    const h = firstHourRef.current;
    if (h) {
      const top = h.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top + (hr - (hr < H0 ? HOUR_START : H0)) * HOUR_PX - window.innerHeight / 2), behavior: "smooth" });
    }
  }
  // Line the time column's parchment up with the card's (both tile the same texture from the card's corner).
  const timeColRef = useRef<HTMLDivElement | null>(null);
  const [texAt, setTexAt] = useState("0 0");
  useLayoutEffect(() => {
    const col = timeColRef.current;
    const box = boxRef.current;
    if (!col || !box) return;
    const place = () => {
      const c = col.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const bl = parseFloat(getComputedStyle(box).borderLeftWidth) || 0;
      const bt = parseFloat(getComputedStyle(box).borderTopWidth) || 0;
      setTexAt(`${-(c.left - b.left - bl)}px ${-(c.top - b.top - bt)}px`);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [seamless, early, late]);
  const outside = (start: Date, end: Date, day: Date) => {
    const a = (start.getTime() - gridStart(day)) / 60_000;
    const b = (end.getTime() - gridStart(day)) / 60_000;
    if (b <= 0) hidden.early++;
    else if (a >= gridMinutes) hidden.late++;
    return b <= 0 || a >= gridMinutes;
  };
  /** Minutes from the top of the grid, clamped to it. */
  const offset = (d: Date, day: Date) => Math.min(gridMinutes, Math.max(0, (d.getTime() - gridStart(day)) / 60_000));

  // Drag a quest or event to move it (to another day, too), or its bottom
  // edge to change how long it runs — snapping to the quarter hour. A mouse
  // drags after a few pixels; a finger holds for a moment first.
  type Span = { dayIndex: number; top: number; bottom: number };
  type DragItem = { kind: "task"; task: Task } | { kind: "event"; event: GoogleCalendarEvent } | { kind: "pick" };
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
    item: DragItem;
  } | null>(null);
  const justDragged = useRef(false);

  function startItemDrag(e: React.PointerEvent, key: string, span: Span, item: DragItem) {
    if (carried && !pickMode) return;
    // Pick mode: only the quest being placed moves.
    if (pickMode && item.kind !== "pick") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A popup opened from this card (the quest editor, a menu) is portalled out of it but its
    // pointer events still bubble here through React: dragging inside it moved the quest (owner, Nov 5).
    if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
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
    if (dayIndex === d.from.dayIndex && top === d.from.top && bottom === d.from.bottom) {
      // A finger held still and let go: that's a long press, so open the card's menu (iPhone fires no contextmenu).
      const fromDay = days[d.from.dayIndex];
      if (d.touch && fromDay && d.item.kind !== "pick") {
        const start = minuteDate(fromDay, d.from.top);
        const end = minuteDate(fromDay, d.from.bottom);
        setItemMenu({
          x: d.x0,
          y: d.y0,
          target: d.item.kind === "task" ? { kind: "task", task: d.item.task, start, end } : { kind: "event", id: d.item.event.id, title: d.item.event.title, start, end },
        });
      }
      return;
    }
    const day = days[dayIndex];
    if (!day) return;
    const start = minuteDate(day, top).toISOString();
    const end = minuteDate(day, bottom).toISOString();
    // Pick mode writes nothing: the host gets the new time.
    if (d.item.kind === "pick") return pickMode?.onChange({ start, end });
    const item = d.item;
    setPending((p) => ({ ...p, [d.key]: d.to }));
    setPlaceError(null);
    void (async () => {
      try {
        if (item.kind === "task") await scheduleTaskAction(sessionRef(item.task), start, end);
        else await updateGoogleEventAction(item.event.id, item.event.calendarId ?? "primary", { startISO: start, endISO: end });
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
    | { kind: "event"; key: string; dayIndex: number; top: number; bottom: number; start: Date; end: Date; event: GoogleCalendarEvent }
    | { kind: "pick"; key: "pick"; dayIndex: number; top: number; bottom: number; start: Date; end: Date };
  const items: Item[] = [];
  for (const event of hydrated ? events : []) {
    if (event.isAllDay || hiddenEvents.has(event.id)) continue;
    const start = new Date(event.start);
    const end = new Date(event.end);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) continue;
    if (outside(start, end, days[dayIndex])) continue;
    const top = offset(start, days[dayIndex]);
    items.push({ kind: "event", key: `e-${event.id}`, dayIndex, top, bottom: Math.max(top + 20, offset(end, days[dayIndex])), start, end, event });
  }
  for (const task of hydrated ? tasks : []) {
    if (!showsOnCalendar(task)) continue;
    const { start, end } = getTaskDisplayWindow(task);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex === -1) continue;
    if (outside(start, end, days[dayIndex])) continue;
    // A short quest (a 15-minute mini-quest) still gets room for its card: at least ~30px tall. One that starts
    // late at night moves up just enough that its card stays inside the grid, not cut at the bottom.
    const minMins = Math.max(20, (30 / HOUR_PX) * 60);
    const top = Math.max(0, Math.min(offset(start, days[dayIndex]), gridMinutes - minMins));
    items.push({ kind: "task", key: `t-${sessionRef(task)}`, dayIndex, top, bottom: Math.max(top + minMins, offset(end, days[dayIndex])), start, end, task });
  }

  // Pick mode: the quest being placed, as a card of its own (dashed, "tentative") at its picked time.
  if (pickMode?.value && hydrated) {
    const start = new Date(pickMode.value.start);
    const end = new Date(pickMode.value.end);
    const dayIndex = days.findIndex((d) => isSameDay(d, start));
    if (dayIndex !== -1 && !outside(start, end, days[dayIndex])) {
      const top = offset(start, days[dayIndex]);
      items.push({ kind: "pick", key: "pick", dayIndex, top, bottom: Math.max(top + 20, offset(end, days[dayIndex])), start, end });
    }
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

  // Quest cards dragged in from Today's lists (dnd-kit, finger or mouse) ask here where they'd land.
  function hitAt(x: number, y: number): { dayIndex: number; min: number } | null {
    const box = boxRef.current;
    if (!box) return null;
    const sc = embedded ? box.closest<HTMLElement>("[data-cal-scroller]") : null;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    }
    for (const el of box.querySelectorAll<HTMLElement>("[data-cal-hit]")) {
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const m = Math.max(0, Math.min(gridMinutes - SNAP, Math.floor((((y - r.top) / HOUR_PX) * 60) / SNAP) * SNAP));
      return { dayIndex: Number(el.dataset.calHit), min: m };
    }
    return null;
  }
  const dropIn = useEffectEvent((kind: "hover" | "drop" | "leave", x: number, y: number, q: Carried | null): boolean => {
    if (kind === "leave" || !q) {
      if (ext) setExt(null);
      return false;
    }
    const h = hitAt(x, y);
    if (kind === "drop") {
      setExt(null);
      if (!h) return false;
      setLanding({ ...h, q });
      void placeCarried(q, h.dayIndex, h.min);
      return true;
    }
    if (!h) {
      if (ext) setExt(null);
      return false;
    }
    if (!ext || ext.dayIndex !== h.dayIndex || ext.min !== h.min || ext.q.id !== q.id) setExt({ ...h, q });
    // Near the top or bottom of its own box: scroll the hours along.
    const sc = embedded ? boxRef.current?.closest<HTMLElement>("[data-cal-scroller]") : null;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (y < r.top + 48) sc.scrollTop -= 14;
      else if (y > r.bottom - 48) sc.scrollTop += 14;
    }
    return true;
  });
  // Pick mode takes no quests dragged in from elsewhere (Today's side calendar keeps them).
  useEffect(
    () =>
      picking
        ? undefined
        : registerCalendarDrop({
            hover: (x, y, q) => dropIn("hover", x, y, q),
            drop: (x, y, q) => dropIn("drop", x, y, q),
            leave: () => void dropIn("leave", 0, 0, null),
          }),
    [picking]
  );

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
          // Above the auto-scheduler's floating window (z 40), so the list never hides it (owner, Nov 19, 0d594111).
          className="sticky top-2 z-[45] mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold"
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
      <div className={`mb-1.5 items-center gap-2 px-1 text-[13px] ${embedded ? "hidden" : "flex"}`} style={{ color: "var(--t-ink-soft)" }}>
        <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
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
        </span>
        {seamless && <DaysZoom span={shown} isAdventure={isAdventure} onChange={(s) => (cancelAnimationFrame(zoomAnim.current), zoomDays(s))} onStep={zoomDaysTo} />}
      </div>
      {/* The day headings stay at the top once they reach it: the same bar, drawn the same way, so it never seems to
          change (owner's note 38bf14ef, Nov 16; it used to be a compressed copy that faded in). It hands back to the
          real headings the moment they scroll back to their place. */}
      <div aria-hidden={!pinShown} className="pointer-events-none sticky top-0 z-[33] h-0">
        <div
          data-date-pin
          className="relative overflow-hidden"
          style={{
            visibility: pinShown ? "visible" : "hidden",
            ...(isAdventure ? { backgroundColor: "#ecdab4", backgroundImage: "url(/design/tex-parchment-2.jpg)", backgroundSize: "384px 384px" } : { background: "var(--t-card)" }),
            borderBottom: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
            boxShadow: "0 3px 8px rgba(0,0,0,.18)",
          }}
        >
          <div
            ref={pinRowRef}
            className="grid"
            style={{
              gridTemplateColumns: seamless && colWidth > 0 ? `40px repeat(${days.length}, ${colWidth}px)` : `40px repeat(${nCols}, minmax(0, 1fr))`,
              columnGap: 2,
            }}
          >
            <div />
            {mapDrawn((day, i) => (
              <div key={`pin-${day.toISOString()}`} className="relative flex flex-col items-center pb-1.5 text-center" style={{ paddingTop: isAdventure ? 18 : undefined }}>
                {isAdventure && !!now && isSameDay(day, now) && <TodayCrest />}
                {dayHead(day, i, !!now && isSameDay(day, now), false)}
              </div>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0" style={{ width: 40, ...(isAdventure ? { backgroundColor: "#ecdab4", backgroundImage: "url(/design/tex-parchment-2.jpg)", backgroundSize: "384px 384px" } : { background: timeBg }), borderRight: `1px solid ${lineColor}` }} />
        </div>
      </div>
      <div className="relative" style={{ paddingBottom: 30 }}>
      {/* Earlier and later hours: on the time bar itself, just above and below its first and last marks (owner, Nov 12). */}
      <HoursButton side="early" open={early} hidden={hidden.early} isAdventure={isAdventure} top={Math.max(0, headTop - 26)} onToggle={() => {
        if (!pickMode) writeCalUi({ early: !early });
        setEarly(!early);
      }} />
      <HoursButton side="late" open={late} hidden={hidden.late} isAdventure={isAdventure} top={headTop + (gridMinutes / 60) * HOUR_PX + 4} onToggle={() => {
        if (!pickMode) writeCalUi({ late: !late });
        setLate(!late);
      }} />
      {seamless && (
        // The time column stays put while the days scroll under it (a sticky cell can't leave its grid cell, so it's its own layer).
        // Its parchment is the card's own, lined up with it, so the strip doesn't show as a different colour (owner, Nov 12).
        <div ref={timeColRef} className="pointer-events-none absolute left-0 top-0 z-[30]" style={{ width: 40, height: headTop + (gridMinutes / 60) * HOUR_PX, ...(isAdventure ? { backgroundColor: "#ecdab4", backgroundImage: "url(/design/tex-parchment-2.jpg)", backgroundSize: "384px 384px", backgroundPosition: texAt } : { background: timeBg }), borderRight: `1px solid ${lineColor}` }}>
          {Array.from({ length: hourCount }, (_, row) => (
            <div
              key={`t-${row}`}
              className="absolute left-0 right-0"
              style={{ top: headTop + row * HOUR_PX, height: row === hourCount - 1 ? lastRowPx : HOUR_PX, fontSize: HOUR_PX < 30 ? 10.5 : 11.5, lineHeight: 1.1, overflow: "hidden", whiteSpace: "pre-line", color: "var(--t-ink-soft)", paddingTop: 2, borderTop: `1px solid ${lineColor}` }}
            >
              {hourLabel(row)}
            </div>
          ))}
          <div className="pointer-events-auto absolute left-0 right-0" style={{ top: headTop, height: (gridMinutes / 60) * HOUR_PX }}>
            {zoomSlider({ position: "absolute", inset: 0 })}
          </div>
        </div>
      )}
      <div ref={scrollRef} onScroll={seamless ? onDaysScroll : undefined} data-cal-days className={`relative ${seamless ? "cal-days-scroll overflow-x-auto overflow-y-hidden" : "overflow-hidden"}`}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: fluid?.w ? `40px repeat(${days.length}, ${fluid.w}px)` : seamless && colWidth > 0 ? `40px repeat(${days.length}, ${colWidth}px)` : `40px repeat(${nCols}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${hourCount - 1}, ${HOUR_PX}px) ${lastRowPx}px`,
          columnGap: 2,
          transform: fluid?.dx ? `translateX(${fluid.dx}px)` : undefined,
          transition: fluid ? "none" : "transform .25s ease-out",
          touchAction: seamless ? "pan-x pan-y pinch-zoom" : "pan-y pinch-zoom",
        }}
      >
        <div />
        {/* The grip on the last day's edge: pull it in for narrower days (more of them), out for wider ones. */}
        <div className="pointer-events-none relative z-[3]" style={{ gridColumn: (pre ? nCols : seamless ? Math.min(days.length, firstIdx + vis) : days.length) + 1, gridRow: 1 }}>
          {!seamless && !pickMode && <button
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
          </button>}
          {fluid?.w && (
            <span className="pointer-events-none absolute right-0 top-0 z-[5] whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: "#2a1c10", color: "#f6dc8e" }}>
              {fluid.n === 1 ? "1 day" : `${fluid.n} days`}
            </span>
          )}
        </div>
        {mapDrawn((day, i) => {
          const isToday = !!now && isSameDay(day, now);
          return (
            // prefetch off: a link to this same screen with other search words makes Next fetch it again and
            // again for as long as it shows (hundreds of requests a second, found Nov 16).
            <Link
              key={day.toISOString()}
              prefetch={false}
              href={`/calendar?view=day&date=${formatDateParam(day)}`}
              draggable={false}
              onPointerDown={startDayScroll}
              onClickCapture={(e) => {
                // Pick mode stays where it is (the editor is open).
                if (dragged.current || pickMode) {
                  e.preventDefault();
                  dragged.current = false;
                }
              }}
              className="relative z-[1] flex cursor-grab select-none flex-col items-center pb-1.5 text-center"
              style={{ borderBottom: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`, paddingTop: isAdventure ? 18 : undefined, gridColumn: col(i), gridRow: 1 }}
            >
              {isAdventure && isToday && <TodayCrest />}
              {dayHead(day, i, isToday, false)}
            </Link>
          );
        })}

        {mapDrawn((day, i) =>
          now && isSameDay(day, now) ? (
            isAdventure ? (
              single ? null : <div key={`hl-${i}`} aria-hidden className="quest-today pointer-events-none" style={{ gridColumn: col(i), gridRow: `1 / ${hourCount + 2}`, margin: "0 -1px" }} />
            ) : (
            <div
              key={`hl-${i}`}
              style={{
                gridColumn: col(i),
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
            {hourLabel(row)}
          </div>
        ))}
        {Array.from({ length: hourCount }, (_, row) => (
          <div
            key={`line-${row}`}
            className="relative"
            style={{ gridColumn: `2 / ${nCols + 2}`, gridRow: row + 2, borderTop: `1px solid ${lineColor}` }}
          >

          </div>
        ))}
        {/* Drag the times up or down to squeeze or stretch the day. */}
        {!seamless && zoomSlider({ gridColumn: 1, gridRow: `2 / ${hourCount + 2}` })}

        {/* Drag-to-add hit cells — one per (day, hour). Rendered before the
            task/event chips below so a chip occupying the same cell stacks
            visually on top and keeps first claim on pointer events there;
            dragging must start from genuinely empty space. */}
        {mapDrawn((_, dayIndex) => (
          <div
            key={`hit-${dayIndex}`}
            data-cal-hit={dayIndex}
            className="relative select-none"
            style={{ gridColumn: col(dayIndex), gridRow: `2 / ${hourCount + 2}`, cursor: 'url("/design/cursor-hand.svg") 11 3, pointer', touchAction: seamless ? "pan-x pan-y" : "pan-y" }}
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
              const m = Math.max(0, Math.min(gridMinutes - SNAP, Math.floor((((e.clientY - r.top) / HOUR_PX) * 60) / SNAP) * SNAP));
              setGhost({ dayIndex, min: m });
            }}
            onDragLeave={() => setGhost(null)}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(QUEST_DRAG_TYPE);
              if (!raw) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const m = Math.max(0, Math.min(gridMinutes - SNAP, Math.floor((((e.clientY - r.top) / HOUR_PX) * 60) / SNAP) * SNAP));
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
            {[ext, landing].map((g, gi) =>
              g && g.dayIndex === dayIndex ? (
                <div
                  key={gi ? "landing" : "ext"}
                  data-cal-landing={gi ? "" : undefined}
                  className={`pointer-events-none absolute inset-x-0.5 z-[6] flex flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold leading-tight ${gi ? "card-pop-in quest-card" : ""}`}
                  style={{
                    top: (g.min / 60) * HOUR_PX,
                    height: Math.max(22, (g.q.minutes / 60) * HOUR_PX),
                    transition: gi ? undefined : "top 120ms ease-out",
                    ...(gi ? { background: "linear-gradient(180deg, #fbf3dc, #eedcb3)", border: "1.5px solid #a88a3f", boxShadow: "0 4px 10px rgba(0,0,0,.25)" } : { background: "rgba(217,180,95,.45)", border: "1.5px dashed #6b5124" }),
                    color: "#2a1c10",
                  }}
                >
                  <span className="truncate font-display">{g.q.title}</span>
                  <span className="truncate text-[10.5px] font-normal" style={{ color: "#5b4520" }}>
                    {gi ? "Placing…" : formatShortTimeRange(minuteDate(days[dayIndex], g.min), minuteDate(days[dayIndex], g.min + g.q.minutes))}
                  </span>
                </div>
              ) : null
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
        {mapDrawn((day, dayIndex) => {
          const dayItems = items.filter((it) => it.dayIndex === dayIndex);
          const nowTop = now && isSameDay(day, now) ? offset(now, day) : null;
          const showNow = nowTop !== null && nowTop > 0 && nowTop < gridMinutes;
          return (
            <div key={`col-${dayIndex}`} className="pointer-events-none relative" style={{ gridColumn: col(dayIndex), gridRow: `2 / ${hourCount + 2}` }}>

              {daily && hydrated && (
                <DailyBlocks
                  day={day}
                  daily={daily}
                  essentials={essentials}
                  habitLook={habitLook}
                  busy={dayItems.map((it) => {
                    const d = it.kind === "task" && it.task.status !== "completed" ? (drives[it.task.id] ?? 0) * 60_000 : 0;
                    return { start: it.start.getTime() - d, end: it.end.getTime() + d };
                  })}
                  topOf={(d) => (offset(d, day) / 60) * HOUR_PX}
                  isAdventure={isAdventure}
                />
              )}
              {dayItems.flatMap((it) => {
                const m = it.kind === "task" && it.task.status !== "completed" ? drives[it.task.id] : 0;
                if (!m) return [];
                const l = lanes.get(it.key) ?? { lane: 0, count: 1 };
                const band = (key: string, top: number, words: string) => (
                  <div
                    key={key}
                    data-drive-band
                    aria-hidden
                    className="absolute flex items-center justify-center overflow-hidden whitespace-nowrap rounded-md text-[10.5px] font-semibold"
                    style={{
                      top: (top / 60) * HOUR_PX + 1,
                      height: Math.max(2, (m / 60) * HOUR_PX - 2),
                      left: `${(100 / l.count) * l.lane}%`,
                      width: `calc(${100 / l.count}% - 2px)`,
                      zIndex: 1,
                      color: "#5b4520",
                      border: "1px dashed rgba(122,82,51,.55)",
                      background: "repeating-linear-gradient(135deg, rgba(217,180,95,.16) 0 6px, rgba(217,180,95,.04) 6px 12px)",
                    }}
                  >
                    {(m / 60) * HOUR_PX >= 14 && <span className="truncate px-1">🚗 {words}</span>}
                  </div>
                );
                return [band(`drive-to-${it.key}`, it.top - m, `${driveWords(m)} there`), band(`drive-back-${it.key}`, it.bottom, `${driveWords(m)} back`)];
              })}
              {dayItems.map((it) => {
                const l = lanes.get(it.key) ?? { lane: 0, count: 1 };
                const height = ((it.bottom - it.top) / 60) * HOUR_PX - 2;
                if (it.kind === "pick") {
                  const isMovingPick = moving?.key === "pick";
                  return (
                    <div
                      key="pick"
                      data-cal-pick
                      onPointerDownCapture={(e) => startItemDrag(e, "pick", { dayIndex: it.dayIndex, top: it.top, bottom: it.bottom }, { kind: "pick" })}
                      className="cal-chip cal-tentative pointer-events-auto absolute flex flex-col overflow-hidden px-1.5 py-0.5 text-[11.5px] font-semibold leading-tight"
                      style={{
                        top: (it.top / 60) * HOUR_PX + 1,
                        height,
                        left: `${(100 / l.count) * l.lane}%`,
                        width: `calc(${100 / l.count}% - 2px)`,
                        zIndex: isMovingPick ? 40 : 20,
                        color: "#2a1c10",
                        cursor: isMovingPick ? 'url("/design/cursor-grabbing.svg") 13 12, grabbing' : 'url("/design/cursor-grab.svg") 13 12, grab',
                        transition: isMovingPick ? undefined : "top 120ms ease-out, height 120ms ease-out",
                        touchAction: "none",
                        ["--tent-c" as string]: "#8a6116",
                      }}
                    >
                      <span className="truncate font-display">{pickMode?.title}</span>
                      {height >= 30 && (
                        <span className="truncate text-[10.5px] font-normal tabular-nums" style={{ color: "#5b4520" }}>
                          {formatShortTimeRange(it.start, it.end)}
                        </span>
                      )}
                      {height >= 18 && <div data-resize aria-hidden title="Drag to change how long it runs" className="cal-resize absolute inset-x-1 bottom-0 h-[7px] cursor-ns-resize" />}
                    </div>
                  );
                }
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
                      if (pickMode) return;
                      setItemMenu({
                        x: e.clientX,
                        y: e.clientY,
                        target: it.kind === "task" ? { kind: "task", task: it.task, start: it.start, end: it.end } : { kind: "event", id: it.event.id, title: it.event.title, start: it.start, end: it.end },
                      });
                    }}
                    // Pick mode: the others are only there to see (85%, nothing opens), so the new card stands out.
                    className={`${pickMode ? "pointer-events-none" : "pointer-events-auto"} absolute`}
                    style={{
                      ...(pickMode ? { opacity: 0.85 } : {}),
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
                      touchAction: canDrag ? (seamless ? "pan-x pan-y" : "pan-y") : undefined,
                    }}
                  >
                    {it.kind === "event" ? (
                      <GoogleEventChip event={it.event} theme={theme} compact timeLabel={label} oneLine={oneLine} scale={colWidth > 0 && !oneLine ? roomyScale(cardW, height) : 1} boxH={height} />
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
      {todayOff && !embedded && <GoToday onClick={goToday} />}

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

