"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent, GoogleCalendarInfo } from "@/lib/google-calendar";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { fromFeedback } from "@/lib/from-feedback";

const KEY = "calendar-layers";
type Layers = { hidden: string[]; quests: boolean; done: boolean; allDay: boolean; portraits: boolean };
const DEFAULTS: Layers = { hidden: [], quests: true, done: true, allDay: true, portraits: false };

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("calendar-layers", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("calendar-layers", cb);
  };
};
let cache: { raw: string | null; val: Layers } = { raw: null, val: DEFAULTS };
function read(): Layers {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cache.raw) cache = { raw, val: { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Layers>) : {}) } };
    return cache.val;
  } catch {
    return DEFAULTS;
  }
}
function write(next: Layers) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("calendar-layers"));
}

/**
 * The calendar with layers you can switch on and off: each Google calendar
 * (in its own colour), the quests the app scheduled, finished quests and
 * all-day events. The caret beside "Google calendars" chooses calendars, the
 * gear holds display settings; choices are remembered on this device. The
 * calendar button on the left opens the scheduling list.
 */
export function CalendarLayers({
  view,
  dayKeys,
  monthKey,
  todayKey,
  tasks,
  events,
  calendars,
  theme,
  dateKey,
  nDays,
  toSchedule = 0,
}: {
  /** Quests waiting on the scheduling list (the badge on its calendar button). */
  toSchedule?: number;
  dateKey: string;
  /** Days on screen (1–7) for the slider. */
  nDays: number;
  view: "day" | "3day" | "days" | "week" | "next7" | "month";
  dayKeys: string[];
  monthKey: string;
  todayKey: string;
  tasks: Task[];
  events: GoogleCalendarEvent[];
  calendars: GoogleCalendarInfo[];
  theme: "calm" | "adventure";
}) {
  const layers = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  const [open, setOpen] = useState<"display" | "calendars" | null>(null);
  const router = useRouter();
  const [days, setDays] = useState(nDays);
  const panel = useRef<HTMLDivElement>(null);
  const isAdventure = theme === "adventure";
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
      if (panel.current && e.target instanceof Node && !panel.current.contains(e.target)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && setOpen(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const shownTasks = layers.quests ? tasks.filter((t) => layers.done || t.status !== "completed") : [];
  const shownEvents = events.filter((e) => !layers.hidden.includes(e.calendarId ?? "primary") && (layers.allDay || !e.isAllDay));
  const set = (patch: Partial<Layers>) => write({ ...layers, ...patch });
  const toggleCal = (id: string) => set({ hidden: layers.hidden.includes(id) ? layers.hidden.filter((x) => x !== id) : [...layers.hidden, id] });
  const hiddenCount = layers.hidden.length + (layers.quests ? 0 : 1);
  const chip = { background: isAdventure ? "rgba(14,18,10,.55)" : "var(--t-card)", border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`, color: isAdventure ? "#f6ecd2" : "var(--t-ink)" };
  const popup = { background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: `1.5px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`, boxShadow: "0 12px 30px rgba(0,0,0,.35)" };

  const row = (label: string, on: boolean, onClick: () => void, color?: string | null) => (
    <button key={label} type="button" role="switch" aria-checked={on} onClick={onClick} className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[14.5px] hover:bg-black/[.05]">
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]"
        style={{ background: on ? (color ?? (isAdventure ? "#c99a2e" : "var(--t-accent)")) : "transparent", border: `2px solid ${color ?? (isAdventure ? "#8a6116" : "var(--t-accent)")}` }}
      >
        {on && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--t-ink)" }}>
        {label}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div ref={panel} className="relative z-[25] -mt-1 flex flex-wrap items-center justify-end gap-2">
        {/* Top-left: the scheduling list, as a calendar button with its count. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-scheduling"))}
          aria-label={`To schedule (${toSchedule})`}
          title="To schedule"
          // A labelled pill that sticks out over the calendar's top-left corner.
          className="hover-glow relative z-[30] mr-auto flex h-11 items-center gap-1.5 rounded-full pl-3 pr-4 text-[14.5px] font-bold"
          style={{
            ...(isAdventure ? { background: "radial-gradient(circle at 35% 25%, #f6e3a8, #d9b45f 60%, #a88a3f)", border: "2px solid #4a3913", color: "#2a1c10" } : { ...chip, color: "var(--t-ink)" }),
            transform: "translate(-12px, 20px)",
            boxShadow: "0 6px 14px rgba(0,0,0,.4)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" stroke="currentColor" strokeWidth="1.9" />
            <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M8 13.5h4M8 16.8h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span className={isAdventure ? "font-display tracking-wide" : ""}>To schedule</span>
          {toSchedule > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums" style={{ background: "#2a1c10", color: "#f6dc8e", border: "1px solid #d9b45f" }}>
              {toSchedule}
            </span>
          )}
        </button>
        {calendars.length > 0 && (() => {
          const othersOn = calendars.some((c) => !layers.hidden.includes(c.id));
          return (
            <span className="flex h-9 shrink-0 items-center rounded-full" style={chip}>
              <button
                type="button"
                role="switch"
                aria-checked={othersOn}
                onClick={() => set({ hidden: othersOn ? calendars.map((c) => c.id) : [] })}
                className="flex h-full items-center gap-2 whitespace-nowrap rounded-l-full pl-3 pr-1.5 text-[13.5px] font-semibold"
                title={othersOn ? "Hide your other calendars" : "Show your other calendars"}
              >
                Google calendars
                <span className="relative h-5 w-9 shrink-0 rounded-full transition-colors" style={{ background: othersOn ? "#a88a3f" : "rgba(127,127,127,.35)" }}>
                  <span className="absolute top-0.5 h-4 w-4 rounded-full transition-[left]" style={{ left: othersOn ? 18 : 2, background: othersOn ? "#f6dc8e" : "#e5e0d4" }} />
                </span>
              </button>
              {/* The caret: choose which calendars show. */}
              <button
                type="button"
                onClick={() => setOpen((o) => (o === "calendars" ? null : "calendars"))}
                aria-expanded={open === "calendars"}
                aria-label="Choose which calendars show"
                title="Choose which calendars show"
                className="flex h-full w-8 items-center justify-center rounded-r-full border-l"
                style={{ borderColor: isAdventure ? "rgba(217,180,95,.4)" : "var(--t-card-border)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: open === "calendars" ? "rotate(180deg)" : undefined }}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </span>
          );
        })()}
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "display" ? null : "display"))}
          aria-expanded={open === "display"}
          aria-label="Display settings"
          title="Display settings"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover-glow"
          style={{ ...chip, color: isAdventure ? "var(--t-gold)" : "var(--t-ink)" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="currentColor" strokeWidth="2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        {open === "calendars" && (
          <div className="reveal absolute right-0 top-11 w-[270px] max-w-[calc(100vw-24px)] rounded-2xl p-2.5" style={popup}>
            <p className="m-0 px-2 pb-1 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--t-ink-soft)" }}>
              Calendars{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
            </p>
            {row("Quests you scheduled", layers.quests, () => set({ quests: !layers.quests }))}
            {calendars.map((c) => row(c.name, !layers.hidden.includes(c.id), () => toggleCal(c.id), c.color))}
            <button type="button" onClick={() => set({ quests: true, hidden: calendars.map((c) => c.id) })} className="mx-2 mt-1 text-[13px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
              Just my quests
            </button>
          </div>
        )}
        {open === "display" && (
          <div className="reveal absolute right-0 top-11 w-[270px] max-w-[calc(100vw-24px)] rounded-2xl p-2.5" style={popup}>
            <p className="m-0 px-2 pb-1 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--t-ink-soft)" }}>
              Display
            </p>
            {view !== "month" && (
              <label className="flex flex-col gap-1 px-2 py-1.5 text-[14px]" style={{ color: "var(--t-ink)" }}>
                <span className="flex justify-between">
                  Days shown <b className="tabular-nums">{days}</b>
                </span>
                <input
                  type="range"
                  min={1}
                  max={7}
                  step={1}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  onPointerUp={() => days !== nDays && router.push(days === 1 ? `/calendar?view=day&date=${dateKey}` : `/calendar?view=days&n=${days}&date=${dateKey}`)}
                  onKeyUp={() => days !== nDays && router.push(days === 1 ? `/calendar?view=day&date=${dateKey}` : `/calendar?view=days&n=${days}&date=${dateKey}`)}
                  aria-label="Days shown"
                />
              </label>
            )}
            {row("Quests as portrait cards", layers.portraits, () => set({ portraits: !layers.portraits }))}
            {row("Finished quests", layers.done, () => set({ done: !layers.done }))}
            {row("All-day events", layers.allDay, () => set({ allDay: !layers.allDay }))}
            {calendars.length === 0 && (
              <p className="m-0 px-2 py-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                Connect Google Calendar to see your other calendars here.
              </p>
            )}
          </div>
        )}
      </div>

      {view === "day" && <DayView dateKey={dayKeys[0]} tasks={shownTasks} events={shownEvents} theme={theme} portraits={layers.portraits} />}
      {(view === "3day" || view === "days" || view === "week" || view === "next7") && <WeekView dayKeys={dayKeys} tasks={shownTasks} events={shownEvents} theme={theme} portraits={layers.portraits} />}
      {view === "month" && <MonthView monthKey={monthKey} todayKey={todayKey} tasks={shownTasks} events={shownEvents} theme={theme} />}
    </div>
  );
}
