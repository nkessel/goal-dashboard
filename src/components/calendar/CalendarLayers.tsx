"use client";

import { MagicCalendarIcon } from "@/components/ui/Icons";
import { PaintTodayArt } from "./PaintTodayArt";
import { openPlanMyDay } from "./PlanMyDay";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent, GoogleCalendarInfo } from "@/lib/google-calendar";
import { DayView } from "./DayView";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { fromFeedback } from "@/lib/from-feedback";
import { CalendarList } from "./CalendarList";
import { InterestCalendars } from "./InterestCalendars";
import { KeepInTouch } from "./KeepInTouch";
import type { InterestCalendar } from "@/lib/interest-calendars";
import { AgendaContext } from "./CalendarTaskChip";
import type { SchedulerSettings } from "@/lib/auto-schedule";
import type { TimedHabit } from "@/lib/timed-habits";

export type DailyLayer = { settings: Partial<SchedulerSettings> | null; habits: TimedHabit[] };

const KEY = "calendar-layers";
/** How daily essentials (meal time, wind-down…) and habits with a set time look. */
export type EssentialsLook = "dashed" | "soft" | "line" | "quest" | "hidden";
export type HabitLook = "quest" | "dashed" | "hidden";
/** What a quest card on the calendar shows (owner, Nov 3: "options to customize what shows on quest cards"). */
export type CardShow = { art: boolean; time: boolean; xp: boolean; coins: boolean };
export const CARD_SHOW_DEFAULT: CardShow = { art: true, time: true, xp: true, coins: true };
type Layers = { hidden: string[]; /** The calendars' own order (owner, Nov 3). */ order: string[]; /** Archived: not shown, not loaded (the server reads the cal-skip cookie). */ archived: string[]; /** Calendars met before (ones unticked in Google start hidden the first time). */ seen: string[]; /** Other people's calendars hidden once (owner, Nov 4: "filled with a calendar that isn't mine"). */ mineOnly?: boolean; /** Second pass (owner, Nov 4 night): only the main calendar shows until others are ticked on. */ mainOnly?: boolean; /** What was showing before the Google switch went off: switching it on brings back just those (owner, Nov 4: it brought back all 65). */ shownBefore?: string[]; quests: boolean; done: boolean; allDay: boolean; portraits: boolean; essentials: EssentialsLook; habits: HabitLook; card: CardShow };
// Timed habits (Gym) show like the other non-negotiables by default (owner, Nov 4).
const DEFAULTS: Layers = { hidden: [], order: [], archived: [], seen: [], quests: true, done: true, allDay: true, portraits: false, essentials: "dashed", habits: "dashed", card: CARD_SHOW_DEFAULT };

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
    if (raw !== cache.raw) {
      const got = raw ? (JSON.parse(raw) as Partial<Layers> & { v?: number }) : {};
      // Saved before Nov 4: timed habits move to the non-negotiables' look once.
      if (got.v !== 2) {
        got.habits = "dashed";
        got.v = 2;
      }
      cache = { raw, val: { ...DEFAULTS, ...got, card: { ...CARD_SHOW_DEFAULT, ...(got.card ?? {}) } } };
    }
    return cache.val;
  } catch {
    return DEFAULTS;
  }
}
function write(next: Layers) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...next, v: 2 }));
    // The server skips archived calendars (no wasted calls to Google).
    document.cookie = `cal-skip=${encodeURIComponent(next.archived.join("|"))}; path=/; max-age=31536000; samesite=lax`;
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
  daily,
  agenda = {},
  interest = [],
}: {
  /** Calendars of interest: feeds shown in week and month views, and links to open. */
  interest?: InterestCalendar[];
  /** The quests waiting behind each quest on the calendar (its agenda). */
  agenda?: Record<string, { id: string; title: string }[]>;
  /** Daily essentials kept free and habits with a set time, drawn on the time grid. */
  daily?: DailyLayer;
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
  const [open, setOpen] = useState<"display" | "calendars" | "interest" | "friends" | null>(null);
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
  const hiddenCount = layers.hidden.filter((id) => !layers.archived.includes(id)).length + (layers.quests ? 0 : 1);
  // Calendars unticked in Google (subscriptions you keep but don't look at) start hidden here, once.
  // Calendars that aren't yours (other people's, even ones shared for editing; subscriptions; holidays) start hidden too, and,
  // once, any already showing: they filled the grid so free time couldn't be seen (owner, Nov 4). Tick one
  // back on under the caret beside "Google calendars".
  // Only your main calendar shows at first: the others (event-idea lists like "Boston area fun", other people's,
  // subscriptions) filled the week so no free time could be seen, and the auto-scheduler counted them as busy.
  const notMine = (c: (typeof calendars)[number]) => !c.primary;
  const unseen = calendars.filter((c) => !layers.seen.includes(c.id));
  const sweep = !layers.mainOnly && calendars.length > 0;
  useEffect(() => {
    if (!unseen.length && !sweep) return;
    const off = [...unseen.filter((c) => c.selected === false || notMine(c)), ...(sweep ? calendars.filter(notMine) : [])].map((c) => c.id);
    write({ ...layers, mineOnly: true, mainOnly: layers.mainOnly || calendars.length > 0, seen: [...layers.seen, ...unseen.map((c) => c.id)], hidden: [...layers.hidden, ...off.filter((id, i) => !layers.hidden.includes(id) && off.indexOf(id) === i)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notMine is a pure helper
  }, [unseen, layers, sweep, calendars]);
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
    <AgendaContext.Provider value={agenda}>
    <div className="flex flex-col gap-2">
      <div ref={panel} className={`relative ${open ? "z-[45]" : "z-[25]"} -mt-1 flex min-w-0 items-center justify-end gap-1.5 sm:gap-2`}>
        {/* Top-left: the scheduling list, as a calendar button with its count. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("open-scheduling"))}
          data-scheduling-pill=""
          aria-label={`Auto-scheduler (${toSchedule})`}
          title="Auto-scheduler: your list of quests to place"
          // A labelled pill that sticks out over the calendar's top-left corner.
          // Stays inside the edge on every screen (on tablets it stuck out and its left was cut off: ui-check, Nov 2).
          className={`hover-glow relative ${open ? "z-[1]" : "z-[30]"} mr-auto flex h-11 shrink-0 translate-y-5 items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-4 text-[14.5px] font-bold touch-manipulation`}
          style={{
            ...(isAdventure ? { background: "radial-gradient(circle at 35% 25%, #f6e3a8, #d9b45f 60%, #a88a3f)", border: "2px solid #4a3913", color: "#2a1c10" } : { ...chip, color: "var(--t-ink)" }),
            boxShadow: "0 6px 14px rgba(0,0,0,.4)",
          }}
        >
          <MagicCalendarIcon size={18} />
          {/* Short on narrower screens, so the toolbar never pushes it off the left edge (owner, Nov 4). */}
          <span className={`hidden lg:inline ${isAdventure ? "font-display tracking-wide" : ""}`}>Auto-scheduler</span>
          <span className={`lg:hidden ${isAdventure ? "font-display tracking-wide" : ""}`}>Auto</span>
          {toSchedule > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums" style={{ background: "#2a1c10", color: "#f6dc8e", border: "1px solid #d9b45f" }}>
              {toSchedule}
            </span>
          )}
        </button>
        {/* Plan my day: today's quests placed in today's free time (beside the week/month scheduling list). */}
        <button type="button" onClick={openPlanMyDay} aria-label="Plan my day" title="Plan my day" className="hover-glow flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-semibold sm:px-3" style={chip}>
          <span style={{ color: isAdventure ? "#e8c56c" : "var(--t-accent)", display: "flex" }}><MagicCalendarIcon size={16} /></span>
          <span className="hidden sm:inline">Plan my day</span>
        </button>
        {calendars.length > 0 && (() => {
          const othersOn = calendars.some((c) => !layers.hidden.includes(c.id) && !layers.archived.includes(c.id));
          return (
            <span className="flex h-9 shrink-0 items-center rounded-full" style={chip}>
              <button
                type="button"
                role="switch"
                aria-checked={othersOn}
                onClick={() => (othersOn ? set({ hidden: calendars.map((c) => c.id), shownBefore: calendars.filter((c) => !layers.hidden.includes(c.id)).map((c) => c.id) }) : set({ hidden: calendars.filter((c) => !(layers.shownBefore?.length ? layers.shownBefore.includes(c.id) : c.primary)).map((c) => c.id) }))}
                className="flex h-full items-center gap-2 whitespace-nowrap rounded-l-full pl-3 pr-1.5 text-[13.5px] font-semibold"
                title={othersOn ? "Hide your other calendars" : "Show your other calendars"}
              >
                <span className="sm:hidden">Google</span>
                <span className="hidden sm:inline">Google calendars</span>
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
        {/* Calendars of interest, right beside the Google calendars (owner, Nov 4). */}
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "interest" ? null : "interest"))}
          aria-expanded={open === "interest"}
          aria-label="Calendars of interest"
          title="Calendars of interest (for week and month planning)"
          className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-semibold"
          style={{ ...chip, ...(open === "interest" ? { background: isAdventure ? "rgba(217,180,95,.35)" : "var(--t-accent-soft)" } : {}) }}
        >
          <span aria-hidden>★</span>
          <span className="hidden sm:inline">Of interest</span>
        </button>
        {/* Friends to keep in touch with (owner, Nov 4). */}
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "friends" ? null : "friends"))}
          aria-expanded={open === "friends"}
          aria-label="Keep in touch"
          title="Keep in touch: friends to reach out to"
          className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-semibold"
          style={{ ...chip, ...(open === "friends" ? { background: isAdventure ? "rgba(217,180,95,.35)" : "var(--t-accent-soft)" } : {}) }}
        >
          <span aria-hidden>💬</span>
          <span className="hidden sm:inline">Keep in touch</span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => (o === "display" ? null : "display"))}
          aria-expanded={open === "display"}
          aria-label="Display settings"
          title="Display settings"
          className="settings-gear relative flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full transition-[background-color,transform] duration-100 active:scale-90"
          style={{ ...chip, color: isAdventure ? "var(--t-gold)" : "var(--t-ink)", ...(open === "display" ? { background: isAdventure ? "rgba(217,180,95,.35)" : "var(--t-accent-soft)" } : {}) }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" stroke="currentColor" strokeWidth="2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        {open === "friends" && (
          <div className="reveal absolute right-0 top-11 z-[35] w-[320px] max-w-[calc(100vw-24px)] rounded-2xl p-2.5" style={popup}>
            <p className="m-0 px-2 pb-1 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--t-ink-soft)" }}>
              Keep in touch
            </p>
            <div className="max-h-[60vh] overflow-y-auto">
              <KeepInTouch />
            </div>
          </div>
        )}
        {open === "interest" && (
          <div className="reveal absolute right-0 top-11 z-[35] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl p-2.5" style={popup}>
            <p className="m-0 px-2 pb-1 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--t-ink-soft)" }}>
              Calendars of interest
            </p>
            <InterestCalendars initial={interest} isAdventure={isAdventure} />
          </div>
        )}
        {open === "calendars" && (
          <div className="reveal absolute right-0 top-11 z-[35] w-[270px] max-w-[calc(100vw-24px)] rounded-2xl p-2.5" style={popup}>
            <p className="m-0 px-2 pb-1 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--t-ink-soft)" }}>
              Calendars{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
            </p>
            {row("Quests you scheduled", layers.quests, () => set({ quests: !layers.quests }))}
            <CalendarList
              calendars={calendars}
              hidden={layers.hidden}
              order={layers.order}
              archived={layers.archived}
              isAdventure={isAdventure}
              onToggle={toggleCal}
              onOrder={(order) => set({ order })}
              onArchive={(id, archive) =>
                set(
                  archive
                    ? { archived: [...layers.archived.filter((x) => x !== id), id], hidden: [...layers.hidden.filter((x) => x !== id), id], order: [...layers.order.filter((x) => x !== id), id] }
                    : { archived: layers.archived.filter((x) => x !== id), hidden: layers.hidden.filter((x) => x !== id) }
                )
              }
            />
            {layers.archived.length > 0 && <p className="m-0 px-2 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>Restoring one loads it on the next visit.</p>}
            <button type="button" onClick={() => set({ quests: true, hidden: calendars.map((c) => c.id) })} className="mx-2 mt-1 text-[13px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
              Just my quests
            </button>
          </div>
        )}
        {open === "display" && (
          <div className="reveal absolute right-0 top-11 z-[35] w-[270px] max-w-[calc(100vw-24px)] rounded-2xl p-2.5" style={popup}>
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
            <CardShowPicker value={layers.card} onChange={(card) => set({ card })} />
            <PaintTodayArt />
            {row("Finished quests", layers.done, () => set({ done: !layers.done }))}
            {row("All-day events", layers.allDay, () => set({ allDay: !layers.allDay }))}
            <LookPicker
              label="Meals, wind-down & tidy"
              value={layers.essentials}
              options={[
                ["dashed", "Dashed"],
                ["quest", "Like quests"],
                ["soft", "Soft"],
                ["line", "A line"],
                ["hidden", "Hide"],
              ]}
              onPick={(v) => set({ essentials: v as EssentialsLook })}
            />
            <LookPicker
              label="Habits with a time (Gym…)"
              value={layers.habits}
              options={[
                ["quest", "Like quests"],
                ["dashed", "Dashed"],
                ["hidden", "Hide"],
              ]}
              onPick={(v) => set({ habits: v as HabitLook })}
            />
            {calendars.length === 0 && (
              <p className="m-0 px-2 py-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                Connect Google Calendar to see your other calendars here.
              </p>
            )}
          </div>
        )}
      </div>

      {view === "day" && <DayView dateKey={dayKeys[0]} wideKeys={widen(dayKeys, BUFFER)} buffer={BUFFER} tasks={shownTasks} events={shownEvents} theme={theme} portraits={layers.portraits} card={layers.card} daily={daily} essentials={layers.essentials} habitLook={layers.habits} />}
      {(view === "3day" || view === "days" || view === "week" || view === "next7") && <WeekView dayKeys={widen(dayKeys, BUFFER)} visible={dayKeys.length} buffer={BUFFER} tasks={shownTasks} events={shownEvents} theme={theme} portraits={layers.portraits} card={layers.card} daily={daily} essentials={layers.essentials} habitLook={layers.habits} />}
      {view === "month" && <MonthView monthKey={monthKey} todayKey={todayKey} tasks={shownTasks} events={shownEvents} theme={theme} />}
    </div>
    </AgendaContext.Provider>
  );
}

/** Which parts a quest card shows: its creature, time, XP and coins (each a toggle chip). */
function CardShowPicker({ value, onChange }: { value: CardShow; onChange: (v: CardShow) => void }) {
  const parts: [keyof CardShow, string][] = [
    ["art", "Creature"],
    ["time", "Time"],
    ["xp", "XP"],
    ["coins", "Coins"],
  ];
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <span className="text-[13.5px]" style={{ color: "var(--t-ink)" }}>
        Quest cards show
      </span>
      <span role="group" aria-label="Quest cards show" className="flex flex-wrap gap-1">
        {parts.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={value[k]}
            onClick={() => onChange({ ...value, [k]: !value[k] })}
            className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold"
            style={value[k] ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink-soft)" }}
          >
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Days loaded either side of the ones on screen, so the calendar scrolls on seamlessly (the page loads them too). */
const BUFFER = 7;
function widen(keys: string[], n: number): string[] {
  if (!keys.length) return keys;
  const at = (k: string, d: number) => {
    const [y, m, day] = k.split("-").map(Number);
    const x = new Date(y, m - 1, day + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  return [...Array.from({ length: n }, (_, i) => at(keys[0], i - n)), ...keys, ...Array.from({ length: n }, (_, i) => at(keys[keys.length - 1], i + 1))];
}

function LookPicker({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1.5">
      <span className="text-[13.5px]" style={{ color: "var(--t-ink)" }}>
        {label}
      </span>
      <span role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onPick(v)}
            className="h-8 rounded-full px-2.5 text-[12.5px] font-semibold"
            style={value === v ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)" }}
          >
            {l}
          </button>
        ))}
      </span>
    </div>
  );
}
