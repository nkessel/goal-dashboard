"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import {
  getDayPlanAction,
  getQuickEventsAction,
  planQuestAtAction,
  planQuickEventAction,
  saveQuickEventsAction,
  unscheduleTaskAction,
  type DayPlan,
  type QuickEvent,
} from "@/app/actions";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";

type TaskWithCategory = Task & { categoryLabel?: string | null };
type Carry =
  | { kind: "quest"; id: string; title: string; minutes: number }
  | { kind: "move"; id: string; title: string; minutes: number }
  | { kind: "quick"; label: string; emoji: string; minutes: number; xp: number };

const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const DEFAULT_HOUR_PX = 30;
const MIN_HOUR_PX = 20;
const MAX_HOUR_PX = 96;
const ZOOM_KEY = "planner-hour-px";
const SNAP_MIN = 15;
const GUTTER = 46;

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function minutesOf(iso: string, dayStart: Date) {
  return Math.round((new Date(iso).getTime() - dayStart.getTime()) / 60_000);
}
function hourLabel(h: number) {
  return `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
}
function timeLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** Side-by-side lanes for overlapping items. */
function lanes<T extends { start: number; end: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = n));
    out.push(...cluster);
    cluster = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd && cluster.length) flush();
    const used = new Set(cluster.filter((c) => c.end > it.start).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

const WEATHER_KEY = "weather-coords";
const WEATHER_EVENT = "weather-coords";

/**
 * Tomorrow's hourly forecast (temperature, chance of rain) from Open-Meteo,
 * once a location has been shared: undefined = not asked yet, null =
 * loading or unavailable.
 */
function useHourlyWeather(dayKey: string | null): Record<number, { temp: number; rain: number }> | null | undefined {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null | undefined>(undefined);
  const [data, setData] = useState<Record<number, { temp: number; rain: number }> | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(WEATHER_KEY);
        setCoords(raw ? (JSON.parse(raw) as { lat: number; lon: number }) : undefined);
      } catch {
        setCoords(undefined);
      }
    };
    read();
    window.addEventListener(WEATHER_EVENT, read);
    return () => window.removeEventListener(WEATHER_EVENT, read);
  }, []);
  useEffect(() => {
    if (!coords || !dayKey) return;
    const fahrenheit = /^en-US/.test(navigator.language) || /^(America\/(?!Sao|Argentina|Bogota|Lima|Santiago|Caracas|Mexico)|US\/)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&hourly=temperature_2m,precipitation_probability&timezone=auto&start_date=${dayKey}&end_date=${dayKey}${fahrenheit ? "&temperature_unit=fahrenheit" : ""}`;
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((j: { hourly?: { time: string[]; temperature_2m: number[]; precipitation_probability: number[] } }) => {
        if (!alive || !j.hourly) return;
        const out: Record<number, { temp: number; rain: number }> = {};
        j.hourly.time.forEach((t, i) => {
          out[Number(t.slice(11, 13))] = { temp: Math.round(j.hourly!.temperature_2m[i]), rain: Math.round(j.hourly!.precipitation_probability[i] ?? 0) };
        });
        setData(out);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [coords, dayKey]);
  if (coords === undefined) return undefined;
  return data;
}

const MEAL_RE = /breakfast|brunch|lunch|dinner|supper|snack|meal/i;
const HEIGHT_KEY = "planner-height";
const PLANNING_KEY = "planner-open";
const DEFAULT_HEIGHT = 230;

/** Dark "night" palette for the planner, to sit in the evening's tray. */
const N = {
  ink: "#f1ead2",
  soft: "#b9b3c9",
  faint: "#8f89a8",
  gold: "#f2d27e",
  line: "rgba(255,255,255,.08)",
  grid: "rgba(12,14,34,.78)",
  border: "rgba(217,180,95,.28)",
};

/**
 * The evening's "Prepare for tomorrow's day": tomorrow's hours in a dark,
 * compact timeline (drag its bottom edge to make it any height, or open it
 * full screen), with what's already there — Google appointments, faint;
 * quests, bold. "Plan the day" opens every planning item at once: tomorrow's
 * quests, a Meal button (breakfast, lunch or dinner), exercise and the
 * rest, each earning its XP when placed. Right-click (or press and hold) an
 * item to change its XP. Tap an item, then tap a time.
 */
export function DayPlanner({
  day,
  chosen,
  onHide,
}: {
  /** This evening's day key. */
  day: string | null;
  /** Tomorrow's chosen quests. */
  chosen: TaskWithCategory[];
  theme?: "calm" | "adventure";
  /** Fold the tray away (the small link at the bottom). */
  onHide?: () => void;
}) {
  const tomorrow = day ? addDays(day, 1) : null;
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [quick, setQuick] = useState<QuickEvent[] | null>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editingQuick, setEditingQuick] = useState(false);
  const [planning, setPlanning] = useState(true);
  const [mealsOpen, setMealsOpen] = useState(false);
  const [xpFor, setXpFor] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  // How tall an hour is: drag the times on the left to squeeze or stretch the day.
  const [hourPx, setHourPx] = useState(DEFAULT_HOUR_PX);
  const HOUR_PX = hourPx;
  const weather = useHourlyWeather(tomorrow);
  const [full, setFull] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  const dayStart = tomorrow ? new Date(`${tomorrow}T00:00:00`) : null;

  const load = useCallback(async () => {
    if (!tomorrow) return;
    const start = new Date(`${tomorrow}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    try {
      setPlan(await getDayPlanAction(start.toISOString(), end.toISOString()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tomorrow.");
    }
  }, [tomorrow]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads tomorrow's calendar once the day is known
    void load();
    getQuickEventsAction().then(setQuick).catch(() => setQuick([]));
  }, [load]);

  // This device's choices: the timeline's height and whether planning is open.
  useEffect(() => {
    try {
      const h = Number(window.localStorage.getItem(HEIGHT_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (h >= 120) setHeight(h);
      const z = Number(window.localStorage.getItem(ZOOM_KEY));
      if (z >= MIN_HOUR_PX && z <= MAX_HOUR_PX) setHourPx(z);
      if (window.localStorage.getItem(PLANNING_KEY) === "0") setPlanning(false);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Start the view at 8am.
  useEffect(() => {
    if (plan && scrollRef.current) scrollRef.current.scrollTop = (8 - FIRST_HOUR) * HOUR_PX - 8;
  }, [plan === null, full]); // eslint-disable-line react-hooks/exhaustive-deps

  // A tap outside closes the Meal choices and the XP editor.
  useEffect(() => {
    if (!mealsOpen && !xpFor) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("[data-plan-pop]")) return;
      setMealsOpen(false);
      setXpFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [mealsOpen, xpFor]);

  // Esc closes a menu, then puts down whatever is being carried, then leaves full screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mealsOpen || xpFor) {
        setMealsOpen(false);
        setXpFor(null);
      } else if (carry) {
        setCarry(null);
        setGhost(null);
      } else if (full) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [carry, full, mealsOpen, xpFor]);

  if (!tomorrow || !dayStart) return null;

  function askForWeather() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        try {
          window.localStorage.setItem(WEATHER_KEY, JSON.stringify({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }));
        } catch {
          /* storage unavailable */
        }
        window.dispatchEvent(new Event(WEATHER_EVENT));
      },
      () => setError("Couldn't get your location for the forecast."),
      { maximumAge: 86_400_000, timeout: 10_000 }
    );
  }

  const placedIds = new Set((plan?.quests ?? []).map((q) => q.id));
  const toPlace = chosen.filter((t) => !placedIds.has(t.id));
  const tomorrowName = new Date(`${tomorrow}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const items = quick ?? [];
  const meals = items.filter((q) => MEAL_RE.test(q.label));
  const others = items.filter((q) => !MEAL_RE.test(q.label));
  const xpOf = (q: QuickEvent) => q.xp ?? 5;

  function togglePlanning() {
    const next = !planning;
    setPlanning(next);
    if (!next) {
      setMealsOpen(false);
      setXpFor(null);
    }
    try {
      window.localStorage.setItem(PLANNING_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  function saveQuick(next: QuickEvent[]) {
    setQuick(next);
    saveQuickEventsAction(next).catch((e) => setError(e instanceof Error ? e.message : "Couldn't save."));
  }

  const slotAt = (clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const y = clientY - grid.getBoundingClientRect().top;
    const raw = FIRST_HOUR * 60 + (y / HOUR_PX) * 60;
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    const minutes = carry?.minutes ?? 30;
    return Math.max(FIRST_HOUR * 60, Math.min(LAST_HOUR * 60 + 60 - minutes, snapped));
  };

  function place(startMin: number) {
    const c = carry;
    if (!c || !dayStart) return;
    const start = new Date(dayStart.getTime() + startMin * 60_000);
    const end = new Date(start.getTime() + c.minutes * 60_000);
    setCarry(null);
    setGhost(null);
    setError(null);
    setNote(null);
    // Show it right away; the server catches up.
    const temp = { id: c.kind === "quick" ? `temp-${Date.now()}` : c.id, title: c.kind === "quick" ? `${c.emoji} ${c.label}` : c.title, start: start.toISOString(), end: end.toISOString(), icon_key: null, icon_source: null, status: "open" };
    setPlan((p) => (p ? { ...p, quests: [...p.quests.filter((q) => q.id !== temp.id), temp] } : p));
    startBusy(async () => {
      try {
        if (c.kind === "quick") {
          const res = await planQuickEventAction({ title: `${c.emoji} ${c.label}`, startISO: start.toISOString(), endISO: end.toISOString(), planXp: c.xp });
          if (res.xp > 0) setNote(`${c.label} planned for ${timeLabel(startMin)} · +${res.xp} XP`);
        } else await planQuestAtAction(c.id, start.toISOString(), end.toISOString());
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't place that.");
        await load();
      }
    });
  }

  function takeOff(id: string) {
    setMenu(null);
    setNote(null);
    setPlan((p) => (p ? { ...p, quests: p.quests.filter((q) => q.id !== id) } : p));
    startBusy(async () => {
      try {
        await unscheduleTaskAction(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't take it off.");
      }
      await load();
    });
  }

  /** Right-click, or press and hold, to change an item's XP. */
  const xpHandlers = (label: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!meals.some((m) => m.label === label)) setMealsOpen(false);
      setXpFor(label);
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pressed.current = false;
      press.current = setTimeout(() => {
        pressed.current = true;
        navigator.vibrate?.(10);
        setXpFor(label);
      }, 480);
    },
    onPointerUp: () => press.current && clearTimeout(press.current),
    onPointerLeave: () => press.current && clearTimeout(press.current),
  });
  const pick = (q: QuickEvent) => {
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    const on = carry?.kind === "quick" && carry.label === q.label;
    setCarry(on ? null : { kind: "quick", label: q.label, emoji: q.emoji, minutes: q.minutes, xp: xpOf(q) });
    setMealsOpen(false);
  };

  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
  const timed = [
    ...(plan?.events ?? []).filter((e) => !e.isAllDay).map((e) => ({ ...e, type: "event" as const, start: minutesOf(e.start, dayStart), end: minutesOf(e.end, dayStart) })),
    ...(plan?.quests ?? []).map((q) => ({ ...q, type: "quest" as const, start: minutesOf(q.start, dayStart), end: minutesOf(q.end, dayStart) })),
  ].filter((x) => x.end > FIRST_HOUR * 60 && x.start < (LAST_HOUR + 1) * 60);
  const laid = lanes(timed);
  const allDay = (plan?.events ?? []).filter((e) => e.isAllDay);
  const totalXp = items.reduce((n, q) => n + xpOf(q), 0);

  const chip = "relative flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-1.5 text-[13px] font-semibold";
  const chipStyle = (on: boolean): React.CSSProperties =>
    on
      ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116", color: "#2a1c10", boxShadow: "0 0 0 3px rgba(242,201,76,.3)" }
      : { background: "rgba(255,250,238,.08)", border: "1.5px solid rgba(217,180,95,.45)", color: N.ink };
  const xpBadge = (n: number, on: boolean) => (
    <span className="rounded-full px-1.5 text-[12px] font-bold tabular-nums" style={{ background: on ? "rgba(42,28,16,.15)" : "rgba(242,210,126,.16)", color: on ? "#2a1c10" : N.gold }}>
      +{n}
    </span>
  );

  const xpEditor = (label: string) => {
    const q = items.find((x) => x.label === label);
    if (!q) return null;
    const set = (patch: Partial<QuickEvent>) => saveQuick(items.map((x) => (x.label === label ? { ...x, ...patch } : x)));
    return (
      <div role="dialog" aria-label={`${q.label}: XP and time`} className="card-pop-in absolute left-0 top-full z-30 mt-1.5 flex w-[220px] flex-col gap-2 rounded-xl p-3 parchment" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
        <p className="relative z-[1] m-0 text-[14px] font-semibold" style={{ color: "var(--t-ink)" }}>
          {q.emoji} {q.label}
        </p>
        <div className="relative z-[1] flex items-center justify-between gap-2 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
          Planning XP
          <span className="flex h-8 items-center rounded-full border" style={{ borderColor: "#b39a6a" }}>
            <button type="button" onClick={() => set({ xp: Math.max(0, xpOf(q) - 1) })} aria-label="Less XP" className="h-8 w-8 text-[17px] leading-none">
              −
            </button>
            <span className="min-w-6 text-center font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
              {xpOf(q)}
            </span>
            <button type="button" onClick={() => set({ xp: Math.min(100, xpOf(q) + 1) })} aria-label="More XP" className="h-8 w-8 text-[17px] leading-none">
              +
            </button>
          </span>
        </div>
        <label className="relative z-[1] flex items-center justify-between gap-2 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
          Takes
          <span className="flex items-center gap-1">
            <input
              type="number"
              min={5}
              step={5}
              defaultValue={q.minutes}
              onBlur={(e) => set({ minutes: Math.max(5, Math.min(600, Number(e.target.value) || q.minutes)) })}
              aria-label="Minutes"
              className="h-8 w-16 rounded-lg border px-2 text-right text-[16px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,251,240,.8)" }}
            />
            min
          </span>
        </label>
        <button type="button" onClick={() => setXpFor(null)} className="relative z-[1] h-9 rounded-full text-[14px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          Done
        </button>
      </div>
    );
  };

  const timeline = (
    <div
      ref={scrollRef}
      className="relative min-h-0 overflow-y-auto rounded-xl"
      style={{ background: N.grid, border: `1px solid ${N.border}`, height: full ? undefined : height, flex: full ? "1 1 auto" : undefined, boxShadow: "inset 0 4px 12px rgba(0,0,0,.4)" }}
    >
      {/* All-day events stay in view at the top of the day. */}
      {allDay.length > 0 && (
        <div className="sticky top-0 z-[6] flex flex-wrap gap-1 px-1.5 py-1" style={{ paddingLeft: GUTTER, background: "rgba(12,14,34,.94)", borderBottom: `1px solid ${N.line}` }}>
          {allDay.map((e) => (
            <span key={e.id} className="rounded-md px-2 py-0.5 text-[12px]" style={{ background: "rgba(140,150,190,.18)", color: "#c3c8dd" }}>
              {e.title}
            </span>
          ))}
        </div>
      )}
      <div
        ref={gridRef}
        className={`relative ${carry ? "cursor-copy" : ""}`}
        style={{ height: hours.length * HOUR_PX }}
        onPointerMove={(e) => carry && e.pointerType === "mouse" && setGhost(slotAt(e.clientY))}
        onPointerLeave={() => setGhost(null)}
        onClick={(e) => {
          if (!carry) return setMenu(null);
          const at = slotAt(e.clientY);
          if (at !== null) place(at);
        }}
      >
        {hours.map((h, i) => {
          const w = weather?.[h];
          return (
            <div key={h} className="absolute inset-x-0 flex" style={{ top: i * HOUR_PX, height: HOUR_PX, borderTop: i ? `1px solid ${N.line}` : undefined }}>
              <span className="w-[46px] shrink-0 pr-1.5 pt-0.5 text-right text-[11.5px] tabular-nums" style={{ color: N.faint }}>
                {hourLabel(h)}
              </span>
              <span className="flex-1" style={{ borderTop: HOUR_PX >= 36 ? "1px dashed rgba(255,255,255,.04)" : undefined, marginTop: HOUR_PX / 2 }} />
              {/* The hour's forecast, on the right. */}
              {w && (
                <span className="pointer-events-none absolute right-1.5 top-0.5 flex items-center gap-1 text-[11px] tabular-nums" style={{ color: N.faint }} title={`${w.temp}° · ${w.rain}% chance of rain`}>
                  {w.rain >= 40 && <span style={{ color: "#8fb6e8" }}>💧{w.rain}%</span>}
                  {w.temp}°
                </span>
              )}
            </div>
          );
        })}
        {/* Drag the times up or down to squeeze or stretch the day. */}
        <div
          role="slider"
          aria-label="Zoom the day (drag the times)"
          aria-valuemin={MIN_HOUR_PX}
          aria-valuemax={MAX_HOUR_PX}
          aria-valuenow={HOUR_PX}
          tabIndex={0}
          title="Drag up or down to zoom"
          className="absolute bottom-0 left-0 top-0 z-[5] w-[46px] cursor-ns-resize touch-none"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={onZoomDown}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            zoomTo(HOUR_PX + (e.key === "ArrowDown" ? 6 : -6));
          }}
        />

        {laid.map((it) => {
          const top = ((Math.max(it.start, FIRST_HOUR * 60) - FIRST_HOUR * 60) / 60) * HOUR_PX;
          const h = Math.max(22, ((Math.min(it.end, (LAST_HOUR + 1) * 60) - Math.max(it.start, FIRST_HOUR * 60)) / 60) * HOUR_PX - 2);
          const left = `calc(${GUTTER}px + (100% - ${GUTTER + 6}px) * ${it.lane / it.lanes})`;
          const width = `calc((100% - ${GUTTER + 6}px) / ${it.lanes} - 3px)`;
          if (it.type === "event") {
            return (
              // Appointments recede so quests stand out.
              <div key={`e-${it.id}`} className="pointer-events-none absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[12px] leading-tight" style={{ top, height: h, left, width, background: "rgba(140,150,190,.14)", border: "1px solid rgba(160,170,210,.28)", color: "#aeb3cc" }}>
                {it.title}
              </div>
            );
          }
          const art = it.icon_source === "ai" || it.icon_source === "library" ? it.icon_key : null;
          return (
            <div key={`q-${it.id}`} className="absolute" style={{ top, height: h, left, width }}>
              <button
                type="button"
                onClick={(e) => {
                  if (carry) return;
                  e.stopPropagation();
                  setMenu(menu === it.id ? null : it.id);
                }}
                className="flex h-full w-full items-start gap-1.5 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[13px] font-semibold leading-tight"
                style={{
                  background: "linear-gradient(180deg,#fbf0d2,#f0dcab)",
                  border: "1.5px solid #a8812e",
                  borderLeft: "4px solid #d9a83a",
                  color: "#2a1c10",
                  boxShadow: "0 2px 8px rgba(0,0,0,.45)",
                  opacity: it.status === "completed" ? 0.6 : it.id.startsWith("temp-") || busy ? 0.85 : 1,
                }}
              >
                {h >= 30 && (
                  <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full" style={{ border: "1px solid #a58c66", background: "#f3e6c8" }}>
                    {art ? (
                      // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                      <img src={art} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <QuestMonogram id={it.id} title={it.title} size={20} />
                    )}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.title}</span>
                  {h >= 40 && <span className="block text-[11.5px] font-normal opacity-75">{timeLabel(it.start)}</span>}
                </span>
              </button>
              {menu === it.id && !it.id.startsWith("temp-") && (
                <div className="card-pop-in absolute left-0 top-full z-20 mt-1 flex min-w-[170px] flex-col overflow-hidden rounded-xl parchment" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setCarry({ kind: "move", id: it.id, title: it.title, minutes: Math.max(SNAP_MIN, it.end - it.start) });
                    }}
                    className="relative z-[1] min-h-11 px-4 text-left text-[14.5px] hover:bg-black/5"
                  >
                    Move
                  </button>
                  <button type="button" onClick={() => takeOff(it.id)} className="relative z-[1] min-h-11 border-t px-4 text-left text-[14.5px] hover:bg-black/5" style={{ borderColor: "rgba(139,112,64,.3)" }}>
                    Take off the plan
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {carry && ghost !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-lg px-2 py-1 text-[13px] font-semibold"
            style={{
              top: ((ghost - FIRST_HOUR * 60) / 60) * HOUR_PX,
              height: Math.max(22, (carry.minutes / 60) * HOUR_PX - 2),
              left: GUTTER,
              right: 6,
              background: "rgba(242,210,126,.28)",
              border: "1.5px dashed #f2d27e",
              color: N.ink,
            }}
          >
            {timeLabel(ghost)} · {carry.kind === "quick" ? `${carry.emoji} ${carry.label}` : carry.title}
          </div>
        )}
      </div>
    </div>
  );

  /** Drag the bottom edge to make the timeline any height. */
  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const h0 = height;
    const el = e.currentTarget;
    let last = h0;
    const move = (ev: PointerEvent) => {
      last = Math.max(120, Math.min(hours.length * HOUR_PX + 2, h0 + ev.clientY - y0));
      setHeight(last);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      try {
        window.localStorage.setItem(HEIGHT_KEY, String(Math.round(last)));
      } catch {
        /* storage unavailable */
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  function zoomTo(px: number) {
    const v = Math.round(Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, px)));
    // Keep the hour in the middle of the view where it was.
    const el = scrollRef.current;
    if (el) {
      const mid = (el.scrollTop + el.clientHeight / 2) / HOUR_PX;
      requestAnimationFrame(() => (el.scrollTop = mid * v - el.clientHeight / 2));
    }
    setHourPx(v);
    try {
      window.localStorage.setItem(ZOOM_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  }
  function onZoomDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const z0 = HOUR_PX;
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

  const tools = (
    <div className="flex items-center gap-1">
      {onHide && !full && (
        <button type="button" onClick={onHide} className="mr-auto rounded-full px-2 py-1.5 text-[13px] underline-offset-2 hover:underline" style={{ color: N.soft }}>
          Hide planning
        </button>
      )}
      {weather === undefined && (
        <button type="button" onClick={askForWeather} className="rounded-full px-2.5 py-1.5 text-[13px] underline-offset-2 hover:underline" style={{ color: N.soft }} title="Show each hour's forecast (uses your location)">
          Show weather
        </button>
      )}
      <Link href={`/calendar?view=day&date=${tomorrow}`} className="rounded-full px-2.5 py-1.5 text-[13px] underline underline-offset-2" style={{ color: N.gold }}>
        Calendar
      </Link>
      <button
        type="button"
        onClick={() => setFull((v) => !v)}
        aria-label={full ? "Leave full screen" : "Full screen"}
        title={full ? "Leave full screen (Esc)" : "Full screen"}
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ border: `1px solid ${N.border}`, color: N.gold }}
      >
        {full ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );

  const body = (
    <div className={`flex flex-col gap-3 ${full ? "h-full" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-semibold ${full ? "font-display text-[22px]" : "text-[15px]"}`} style={{ color: N.ink }}>
          {tomorrowName}
        </span>
        {full && tools}
      </div>

      {/* Plan the day: every planning item at once */}
      <button
        type="button"
        onClick={togglePlanning}
        aria-expanded={planning}
        className="hover-glow flex min-h-10 items-center justify-between gap-2 rounded-xl px-3.5 text-left"
        // Gold until opened; then it settles into the tray.
        style={planning ? { background: "rgba(255,250,238,.06)", border: "1.5px solid rgba(217,180,95,.45)", color: N.ink } : { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116", color: "#2a1c10" }}
      >
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 7h14M5 12h10M5 17h7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Plan daily tasks
          {totalXp > 0 && <span className="text-[13px] font-bold" style={{ color: planning ? N.gold : "#5a3a08" }}>+XP</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: planning ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {planning && (
        <div className="flex flex-col gap-2" onClick={() => setXpFor(null)}>
          {toPlace.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {toPlace.map((t) => {
                const on = carry?.kind === "quest" && carry.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCarry(on ? null : { kind: "quest", id: t.id, title: t.title, minutes: t.estimate_minutes && t.estimate_minutes <= 480 ? t.estimate_minutes : 30 });
                    }}
                    className={chip}
                    style={chipStyle(on)}
                    title="Then tap a time below"
                  >
                    <QuestMonogram id={t.id} title={t.title} size={24} />
                    <span className="max-w-[160px] truncate pr-1">{t.title}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {meals.length > 0 && (
              <span className="relative" data-plan-pop>
                <button
                  type="button"
                  aria-expanded={mealsOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMealsOpen((v) => !v);
                  }}
                  className={chip}
                  style={chipStyle(carry?.kind === "quick" && meals.some((m) => m.label === carry.label))}
                >
                  <span aria-hidden>🍽️</span>
                  {carry?.kind === "quick" && meals.some((m) => m.label === carry.label) ? carry.label : "Meal"}
                  {xpBadge(Math.max(...meals.map(xpOf)), carry?.kind === "quick" && meals.some((m) => m.label === carry.label))}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {mealsOpen && (
                  <div className="card-pop-in absolute left-0 top-full z-30 mt-1.5 flex min-w-[200px] flex-col overflow-hidden rounded-xl parchment" style={{ borderRadius: 12 }} onClick={(e) => e.stopPropagation()}>
                    {meals.map((m, i) => (
                      <button
                        key={m.label}
                        type="button"
                        {...xpHandlers(m.label)}
                        onClick={() => pick(m)}
                        className="relative z-[1] flex min-h-11 items-center gap-2 px-3.5 text-left text-[15px] hover:bg-black/5"
                        style={i ? { borderTop: "1px solid rgba(139,112,64,.25)" } : undefined}
                      >
                        <span aria-hidden>{m.emoji}</span>
                        <span className="flex-1">{m.label}</span>
                        <span className="text-[12.5px]" style={{ color: "#5a4a30" }}>
                          {m.minutes}m
                        </span>
                        <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
                          +{xpOf(m)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {xpFor && meals.some((m) => m.label === xpFor) && xpEditor(xpFor)}
              </span>
            )}
            {others.map((q) => {
              const on = carry?.kind === "quick" && carry.label === q.label;
              return (
                <span key={q.label} className="relative" data-plan-pop>
                  <button
                    type="button"
                    aria-pressed={on}
                    {...xpHandlers(q.label)}
                    onClick={(e) => {
                      e.stopPropagation();
                      pick(q);
                    }}
                    className={chip}
                    style={chipStyle(on)}
                    title={`${q.minutes} minutes · +${xpOf(q)} XP for planning it — right-click to change`}
                  >
                    <span aria-hidden>{q.emoji}</span>
                    {q.label}
                    {xpBadge(xpOf(q), on)}
                  </button>
                  {xpFor === q.label && xpEditor(q.label)}
                </span>
              );
            })}
            <button type="button" onClick={(e) => (e.stopPropagation(), setEditingQuick((v) => !v))} className={`${chip} pr-3 font-normal`} style={{ border: "1.5px dashed rgba(217,180,95,.5)", color: N.soft }}>
              {editingQuick ? "Done" : "Edit list"}
            </button>
          </div>
          {editingQuick && quick && <QuickEventsEditor list={quick} onSave={saveQuick} />}
          {toPlace.length === 0 && chosen.length > 0 && (
            <p className="m-0 text-[13px]" style={{ color: N.soft }}>
              All of tomorrow&apos;s quests have a time.
            </p>
          )}
          <p className="m-0 text-[12.5px]" style={{ color: N.faint }}>
            Right-click (or press and hold) an item to change its XP.
          </p>
        </div>
      )}

      <p className="m-0 min-h-[20px] text-[13.5px]" role="status" style={{ color: carry || note ? N.gold : N.soft, fontWeight: carry ? 600 : 400 }}>
        {carry ? (
          <>
            Tap a time for “{carry.kind === "quick" ? carry.label : carry.title}” ·{" "}
            <button type="button" onClick={() => (setCarry(null), setGhost(null))} className="underline">
              cancel
            </button>
          </>
        ) : note ? (
          note
        ) : planning ? (
          "Choose something above, then tap a time."
        ) : (
          "Tap something on the plan to move it."
        )}
      </p>

      {error && (
        <p role="alert" className="m-0 text-[14px] font-semibold" style={{ color: "#f3b39f" }}>
          {error}
        </p>
      )}

      {timeline}
      {!full && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to make the day taller or shorter"
          tabIndex={0}
          onPointerDown={onResizeDown}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const next = Math.max(120, Math.min(hours.length * HOUR_PX + 2, height + (e.key === "ArrowDown" ? 48 : -48)));
            setHeight(next);
            try {
              window.localStorage.setItem(HEIGHT_KEY, String(next));
            } catch {
              /* storage unavailable */
            }
          }}
          className="-mt-2 flex h-5 cursor-ns-resize touch-none items-center justify-center"
          title="Drag to resize"
        >
          <span className="h-1.5 w-12 rounded-full" style={{ background: "rgba(217,180,95,.5)" }} />
        </div>
      )}

      {!plan?.calendarConnected && plan && (
        <p className="m-0 text-[12.5px]" style={{ color: N.faint }}>
          Connect Google Calendar on the Calendar page to see your appointments here too.
        </p>
      )}
      {!full && tools}
    </div>
  );

  if (full) {
    return (
      <>
        <p className="m-0 text-[14px]" style={{ color: N.soft }}>
          Open full screen ·{" "}
          <button type="button" onClick={() => setFull(false)} className="underline" style={{ color: N.gold }}>
            bring it back here
          </button>
        </p>
        {createPortal(
          <div role="dialog" aria-modal="true" aria-label={`Prepare for ${tomorrowName}`} className="overlay-fade-in fixed inset-0 z-[55] flex flex-col p-3 pt-[max(12px,env(safe-area-inset-top))] sm:p-6" style={{ background: "radial-gradient(ellipse at top, #1d2246, #0b0d1f 70%)" }}>
            <div className="mx-auto flex h-full w-full max-w-3xl flex-col">{body}</div>
          </div>,
          document.body
        )}
      </>
    );
  }
  return body;
}

/** Rename, retime, add or remove the quick-event buttons. */
function QuickEventsEditor({ list, onSave }: { list: QuickEvent[]; onSave: (l: QuickEvent[]) => void }) {
  const [rows, setRows] = useState(list);
  const commit = (next: QuickEvent[]) => {
    setRows(next);
    onSave(next.filter((r) => r.label.trim()));
  };
  const field = "h-9 rounded-lg border px-2 text-[16px]";
  const fieldStyle = { borderColor: "#b39a6a", background: "rgba(255,251,240,.8)" };
  return (
    <div className="flex flex-col gap-1.5 rounded-xl p-2.5" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={r.emoji} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))} onBlur={() => commit(rows)} aria-label="Emoji" className={`${field} w-11 text-center`} style={fieldStyle} />
          <input value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} onBlur={() => commit(rows)} aria-label="Name" className={`${field} min-w-0 flex-1`} style={fieldStyle} />
          <input
            type="number"
            min={5}
            step={5}
            value={r.minutes}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) || 30 } : x)))}
            onBlur={() => commit(rows)}
            aria-label="Minutes"
            className={`${field} w-16 text-right`}
            style={fieldStyle}
          />
          <span className="text-[12px]" style={{ color: "#5a4a30" }}>
            min
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={r.xp ?? 5}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, xp: Math.max(0, Number(e.target.value) || 0) } : x)))}
            onBlur={() => commit(rows)}
            aria-label="XP for planning it"
            className={`${field} w-14 text-right`}
            style={fieldStyle}
          />
          <span className="text-[12px]" style={{ color: "#5a4a30" }}>
            XP
          </span>
          <button type="button" onClick={() => commit(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.label}`} className="h-9 w-8 text-[18px] leading-none" style={{ color: "#5a4a30" }}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { emoji: "📌", label: "", minutes: 30, xp: 5 }])} className="h-9 w-fit rounded-full px-3 text-[14px] underline" style={{ color: "#5a4a30" }}>
        + Add a quick event
      </button>
    </div>
  );
}
