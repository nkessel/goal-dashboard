"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import { applyAutoScheduleAction, listenBoardAction, resolveOptionalEventAction, saveSchedulerSettingsAction, schedulerContextAction } from "@/app/actions";
import { MEAL_DEFAULTS, MEAL_ICONS, MEAL_NAMES, SCHEDULER_DEFAULTS, clockOf, freeStretch, holdAt, localDayKey, mealsOn, planSchedule, type Avoid, type Busy, type MealKey, type SchedulerSettings, type TimeOfDay } from "@/lib/auto-schedule";
import { useEscape } from "@/lib/use-escape";
import { habitBlocksOn, habitOnDay } from "@/lib/timed-habits";
import type { Repeat } from "@/lib/habit-repeat";
import { Fold, useClosing } from "@/components/ui/Fold";

const LOCAL_KEY = "auto-schedule";
const TIMES: { v: TimeOfDay; label: string; hint: string }[] = [
  { v: "any", label: "Any", hint: "Whenever there's room" },
  { v: "morning", label: "AM", hint: "Mornings" },
  { v: "afternoon", label: "PM", hint: "Afternoons (12–5)" },
  { v: "evening", label: "Eve", hint: "Evenings (after 5)" },
];
const HOURS = Array.from({ length: 19 }, (_, i) => (i + 5) * 60); // 5 AM … 11 PM
const CAPS = [60, 120, 180, 240, 360, 480];

function readLocal(): Partial<SchedulerSettings> | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<SchedulerSettings>) : null;
  } catch {
    return null;
  }
}
function hiddenCalendars(): string[] {
  try {
    const raw = window.localStorage.getItem("calendar-layers");
    return raw ? ((JSON.parse(raw) as { hidden?: string[] }).hidden ?? []) : [];
  } catch {
    return [];
  }
}
const dayLabel = (d: Date) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};
// "9:30a" (short, so a row's times stay on one line on phones).
const hm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AaPp])\.?\s?[Mm]\.?$/, (_, p: string) => p.toLowerCase());

/**
 * One tap from the scheduling list to a planned fortnight: every quest on the
 * list, in its order, gets the first free time that suits it. You see the
 * whole plan first, nudge it, then place it all at once.
 */
export function AutoScheduler({ tasks, theme, onClose: closeNow, day, over = false, onTomorrow }: { tasks: Task[]; theme: "calm" | "adventure"; onClose: () => void; /** Plan just this one day (the evening's "plan tomorrow"): everything goes on it. */ day?: Date; /** Opened over the welcome screen: drawn above it. */ over?: boolean; /** Plan my day, late: offer tomorrow when today has no room left. */ onTomorrow?: () => void }) {
  const { closing, close: onClose } = useClosing(closeNow);
  useEscape(() => onClose());
  const router = useRouter();
  const isAdventure = theme === "adventure";
  const [settings, setSettings] = useState<SchedulerSettings | null>(null);
  const [busy, setBusy] = useState<Busy[] | null>(null);
  // One day's plan: habits with a length but no set time get room, and [bracketed] calendar events wait for ✓ or ×.
  const [flexHabits, setFlexHabits] = useState<{ id: string; title: string; days: number[] | null; minutes: number; repeat: Repeat | null }[]>([]);
  const [optional, setOptional] = useState<OptionalEvent[]>([]);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [google, setGoogle] = useState(true);
  const [calendars, setCalendars] = useState<{ id: string; name: string; color: string | null; writable: boolean; primary: boolean }[]>([]);
  const [showCals, setShowCals] = useState(false);
  const [showMeals, setShowMeals] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [listenBoard, setListenBoard] = useState<string | null>(null);
  useEffect(() => {
    if (day) listenBoardAction().then(setListenBoard, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the planner opens
  }, []);
  // The block you tapped: its options open under the day.
  const [picked, setPicked] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [applying, startApplying] = useTransition();
  // Planning starts from the moment the planner opens (or the start of the one day being planned).
  const [now] = useState(() => {
    if (!day) return new Date();
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    return d.getTime() > Date.now() ? d : new Date();
  });

  useEffect(() => {
    let live = true;
    // Far enough to reach the latest "plan it by" (up to two months).
    const furthest = Math.max(0, ...tasks.map((t) => (t.plan_by ? Math.ceil((Date.parse(t.plan_by) - now.getTime()) / 86_400_000) : 0)));
    const to = new Date(now);
    to.setDate(to.getDate() + (day ? 1 : Math.min(62, Math.max(SCHEDULER_DEFAULTS.horizon, furthest + 1)) + 1));
    schedulerContextAction(now.toISOString(), to.toISOString(), hiddenCalendars(), day ? localDayKey(now) : undefined)
      .then((ctx) => {
        if (!live) return;
        // Habits with a set time (Gym at 7) hold their time on each day they fall on.
        const habitBusy: Busy[] = [];
        for (let d = new Date(now); d <= to; d = new Date(d.getTime() + 86_400_000)) habitBusy.push(...habitBlocksOn(ctx.habits ?? [], d, ctx.busy).map((b) => ({ start: b.start, end: b.end })));
        setBusy([...ctx.busy, ...habitBusy]);
        if (day) {
          setFlexHabits((ctx.flexHabits ?? []).filter((h) => habitOnDay(h, now)));
          setOptional((ctx.optional ?? []).filter((o) => o.end > now.getTime()));
        }
        setCalendars(ctx.calendars ?? []);
        setGoogle(ctx.google);
        setSettings({ ...SCHEDULER_DEFAULTS, ...(readLocal() ?? {}), ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) });
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read your calendar."));
    return () => {
      live = false;
    };
    // Read once, when the planner opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // Saved a moment after the last change (here and on your account).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function change(patch: Partial<SchedulerSettings>) {
    setSettings((s) => {
      const next = { ...(s ?? SCHEDULER_DEFAULTS), ...patch };
      try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveSchedulerSettingsAction(next).catch(() => {}), 700);
      return next;
    });
  }
  const setPref = (id: string, v: TimeOfDay) => settings && change({ prefs: { ...settings.prefs, [id]: v } });

  // Quests already on the calendar ahead keep their time.
  const items = useMemo(
    () =>
      tasks
        .filter((t) => !(t.is_on_calendar && t.scheduled_start && new Date(t.scheduled_start) > now))
        .filter((t) => !skipped.has(t.id))
        .map((t) => ({ id: t.id, title: t.title, minutes: t.estimate_minutes, effort: t.effort ?? null, dueAt: t.due_at ?? null, planBy: t.plan_by ?? null })),
    [tasks, skipped, now]
  );
  // Calendars that only inform (subscriptions, other people's) don't block time unless you say so.
  const fyi = useMemo(() => new Set(settings?.fyi ?? calendars.filter((c) => !c.writable && !c.primary).map((c) => c.id)), [settings?.fyi, calendars]);
  const calBlocking = useMemo(() => {
    if (!busy) return null;
    const keptBusy = optional.filter((o) => kept.has(o.id)).map((o) => ({ start: o.start, end: o.end }));
    return [...busy.filter((b) => !b.cal || !fyi.has(b.cal)), ...keptBusy];
  }, [busy, fyi, optional, kept]);
  // Untimed habits for the day, each in the first free stretch from now (they hold that room from quests).
  const habitHolds = useMemo(() => {
    if (!day || !settings || !calBlocking) return [] as HabitHold[];
    const d0 = new Date(now);
    d0.setHours(0, 0, 0, 0);
    const from = Math.max(now.getTime(), d0.getTime() + settings.dayStart * 60_000);
    const to = d0.getTime() + settings.dayEnd * 60_000;
    const taken = [...calBlocking];
    const out: HabitHold[] = [];
    for (const h of flexHabits) {
      const at = freeStretch(from, to, h.minutes, taken);
      if (at === null) continue;
      out.push({ id: h.id, title: h.title, start: at, end: at + h.minutes * 60_000 });
      taken.push({ start: at, end: at + h.minutes * 60_000 });
    }
    return out;
  }, [day, settings, calBlocking, flexHabits, now]);
  const blocking = useMemo(() => (calBlocking ? [...calBlocking, ...habitHolds.map((h) => ({ start: h.start, end: h.end }))] : null), [calBlocking, habitHolds]);
  // "Another time": spots a quest shouldn't take again.
  const [avoid, setAvoid] = useState<Avoid>({});
  // One by one (the way it opens, owner Nov 3): each placement in time order; an accepted one keeps its time
  // while the rest are planned around it. Skipped ones wait until a chosen number of others are placed, then
  // are offered again wherever there's room by then.
  const [oneByOne, setOneByOne] = useState(true);
  const [fixed, setFixed] = useState<Placed[]>([]);
  const [later, setLater] = useState<{ id: string; at: number }[]>([]);
  const handled = fixed.length + skipped.size;
  const waiting = useMemo(() => new Set(later.filter((l) => l.at > handled).map((l) => l.id)), [later, handled]);
  const plan = useMemo(() => {
    if (!settings || !blocking) return null;
    const held = new Set(fixed.map((f) => f.id));
    // One day: all of it goes on that day (no daily cap, weekends too).
    const eff = day ? { ...settings, horizon: 1, maxPerDay: Math.max(settings.maxPerDay, 16 * 60), skipWeekends: false } : settings;
    const run = (hold: Set<string>) => planSchedule(items.filter((i) => !held.has(i.id) && !hold.has(i.id)), [...blocking, ...fixed.map((f) => ({ start: f.start.getTime(), end: f.end.getTime() }))], eff, now, avoid);
    if (!oneByOne || !waiting.size) return run(new Set());
    // Waiting ones come back as soon as nothing else is left to look at.
    const without = run(waiting);
    return without.placed.length ? without : run(new Set());
  }, [items, blocking, settings, now, avoid, fixed, day, oneByOne, waiting]);
  const current = useMemo(() => [...(plan?.placed ?? [])].sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null, [plan]);
  // Moved or resized by hand (drag on its strip, or Adjust): it's offered there instead.
  const [moved, setMoved] = useState<{ id: string; start: number; minutes: number } | null>(null);
  const shown = current && moved?.id === current.id ? { ...current, start: new Date(moved.start), end: new Date(moved.start + moved.minutes * 60_000), late: false } : current;
  const meals = Object.fromEntries((Object.keys(MEAL_DEFAULTS) as MealKey[]).map((k) => [k, { ...MEAL_DEFAULTS[k], ...((settings?.meals as Partial<Record<MealKey, object>> | undefined)?.[k] ?? {}) }])) as typeof MEAL_DEFAULTS;
  function setMeal(key: MealKey, patch: Partial<(typeof meals)[MealKey]>) {
    change({ meals: { ...meals, [key]: { ...meals[key], ...patch } } });
  }
  const todayKey = localDayKey(now);
  const breakfastToday = (settings?.breakfastDays ?? []).includes(todayKey);
  function toggleBreakfastToday() {
    const days = (settings?.breakfastDays ?? []).filter((d) => d >= todayKey);
    change({ breakfastDays: breakfastToday ? days.filter((d) => d !== todayKey) : [...days, todayKey] });
  }
  // Where each day's meal hour would fall now, shown faintly among the day's quests.
  const holdsFor = (day: Date) => {
    if (!settings || !blocking) return [];
    const placedBusy = [...fixed, ...(plan?.placed ?? [])].map((p) => ({ start: p.start.getTime(), end: p.end.getTime() }));
    return mealsOn(day, settings).map((m) => {
      const at = holdAt(m.from, m.to, m.minutes, [...blocking, ...placedBusy], m.ideal);
      return { key: m.key, from: m.from, to: m.to, at, minutes: m.minutes };
    });
  };
  function toggleFyi(id: string) {
    const next = new Set(fyi);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    change({ fyi: [...next] });
  }
  const byDay = useMemo(() => {
    const groups: { label: string; rows: NonNullable<typeof plan>["placed"] }[] = [];
    for (const p of [...fixed, ...(plan?.placed ?? [])].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const label = dayLabel(p.start);
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.rows.push(p);
      else groups.push({ label, rows: [p] });
    }
    return groups;
  }, [plan, fixed]);

  function apply() {
    const chosen = oneByOne ? fixed : [...fixed, ...(plan?.placed ?? [])];
    if (!chosen.length) return;
    setError(null);
    startApplying(async () => {
      try {
        const res = await applyAutoScheduleAction(chosen.map((p) => ({ taskId: p.id, startISO: p.start.toISOString(), endISO: p.end.toISOString() })));
        setDone(res.done);
        router.refresh();
        setTimeout(onClose, 1600);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't place them.");
      }
    });
  }

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const gold = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  const select = "h-9 rounded-lg border px-1.5 text-[15px]";
  const selectStyle = { borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: ink };
  const taskOf = new Map(tasks.map((t) => [t.id, t]));

  return createPortal(
    <div className={`${closing ? "overlay-fade-out pointer-events-none" : "overlay-fade-in"} fixed inset-0 ${over ? "z-[95]" : "z-[62]"} flex items-end justify-center p-0 sm:items-center sm:p-4`} style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Auto-schedule"
        onClick={(e) => e.stopPropagation()}
        className={`card-pop-in flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl ${isAdventure ? "parchment parchment-framed" : ""}`}
        style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
      >
        <div className="relative z-[1] flex items-start gap-2 px-4 pb-2 pt-3.5">
          <div className="min-w-0 flex-1">
            <h3 className={`m-0 ${isAdventure ? "font-display text-[21px]" : "text-[17px] font-bold"}`} style={{ color: ink }}>
              {day && dayLabel(now) === "Today" ? "✨ Plan my day" : `✨ Auto-schedule${day ? ` ${dayLabel(now).toLowerCase() === "tomorrow" ? "tomorrow" : dayLabel(now)}` : ""}`}
            </h3>
            <p className="m-0 text-[13.5px] leading-snug" style={{ color: soft }}>
              A plan for your list, in your free time{google ? " (around your Google calendars)" : ""}. Tap a gold block to change it.
            </p>
          </div>
          {/* 🎧 Today's learning video: the Online learning videos list, a tap away while planning (owner, Nov 3). */}
          {day && listenBoard && (
            <a href={`/boards/${listenBoard}`} aria-label="Something to listen to: pick today's learning video" title="Something to listen to: pick today's learning video" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] hover:bg-black/[.06]">
              🎧
            </a>
          )}
          {/* The finer settings (hours, daily limit, essentials, calendars) wait behind the gear. */}
          <button type="button" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} aria-label="Settings" title="Settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft, background: showSettings ? "rgba(217,180,95,.22)" : undefined }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[24px] leading-none hover:bg-black/[.06]" style={{ color: soft }}>
            ×
          </button>
        </div>

        {settings && (
          <Fold open={showSettings} className="relative z-[1]">
          <div className="relative z-[1] mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2 text-[13.5px]" style={{ background: isAdventure ? "rgba(120,90,40,.1)" : "var(--t-bg)", color: ink }}>
            <label className="flex items-center gap-1.5">
              <span style={{ color: soft }}>Between</span>
              <select aria-label="Start of the day" value={settings.dayStart} onChange={(e) => change({ dayStart: Math.min(Number(e.target.value), settings.dayEnd - 60) })} className={select} style={selectStyle}>
                {HOURS.map((m) => (
                  <option key={m} value={m}>
                    {clockOf(m)}
                  </option>
                ))}
              </select>
              <span style={{ color: soft }}>and</span>
              <select aria-label="End of the day" value={settings.dayEnd} onChange={(e) => change({ dayEnd: Math.max(Number(e.target.value), settings.dayStart + 60) })} className={select} style={selectStyle}>
                {HOURS.map((m) => (
                  <option key={m} value={m}>
                    {clockOf(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span style={{ color: soft }}>Up to</span>
              <select aria-label="Most quest time on one day" value={settings.maxPerDay} onChange={(e) => change({ maxPerDay: Number(e.target.value) })} className={select} style={selectStyle}>
                {CAPS.map((m) => (
                  <option key={m} value={m}>
                    {m / 60}h
                  </option>
                ))}
              </select>
              <span style={{ color: soft }}>a day</span>
            </label>
            <label className="flex min-h-9 items-center gap-1.5">
              <input type="checkbox" checked={settings.skipWeekends} onChange={(e) => change({ skipWeekends: e.target.checked })} className="h-4 w-4" />
              Keep weekends free
            </label>
            <button type="button" onClick={() => setShowMeals((v) => !v)} aria-expanded={showMeals} className="min-h-9 text-[13px] underline underline-offset-2" style={{ color: ink }}>
              Daily essentials kept free {showMeals ? "▾" : "▸"}
            </button>
            {!meals.breakfast.on && (
              <button type="button" onClick={toggleBreakfastToday} aria-pressed={breakfastToday} className="h-8 rounded-full px-3 text-[12.5px] font-semibold" style={breakfastToday ? { background: gold, color: isAdventure ? "#2a1c10" : "#fff" } : { border: "1px solid #b39a6a", color: ink }}>
                {breakfastToday ? "✓ Breakfast today" : "+ Breakfast today"}
              </button>
            )}
            <Fold open={showMeals}>
              <div className="flex w-full flex-col gap-1">
                <span className="text-[12px]" style={{ color: soft }}>
                  Never booked: the planner just leaves a free stretch somewhere in each range, so a meal can float to wherever there&rsquo;s room.
                </span>
                {(Object.keys(MEAL_DEFAULTS) as MealKey[]).map((k) => (
                  <div key={k} className="flex flex-wrap items-center gap-1.5">
                    <label className="flex min-h-9 w-full items-center gap-2 sm:w-[190px]">
                      <input type="checkbox" checked={meals[k].on} onChange={(e) => setMeal(k, { on: e.target.checked })} className="h-4 w-4" />
                      {MEAL_NAMES[k]}
                    </label>
                    <select aria-label={`${MEAL_NAMES[k]} length`} value={meals[k].minutes} onChange={(e) => setMeal(k, { minutes: Number(e.target.value) })} className={select} style={selectStyle} disabled={!meals[k].on && k !== "breakfast"}>
                      {[15, 20, 25, 30, 45, 60, 90].map((m) => (
                        <option key={m} value={m}>
                          {m < 60 ? `${m} min` : `${m / 60} hr`}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: soft }}>between</span>
                    <select aria-label={`${MEAL_NAMES[k]} earliest`} value={meals[k].from} onChange={(e) => setMeal(k, { from: Math.min(Number(e.target.value), meals[k].to - 30) })} className={select} style={selectStyle}>
                      {HOURS.map((m) => (
                        <option key={m} value={m}>
                          {clockOf(m)}
                        </option>
                      ))}
                    </select>
                    <span style={{ color: soft }}>and</span>
                    <select aria-label={`${MEAL_NAMES[k]} latest`} value={meals[k].to} onChange={(e) => setMeal(k, { to: Math.max(Number(e.target.value), meals[k].from + 30) })} className={select} style={selectStyle}>
                      {HOURS.map((m) => (
                        <option key={m} value={m}>
                          {clockOf(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </Fold>
            {calendars.length > 1 && (
              <button type="button" onClick={() => setShowCals((v) => !v)} aria-expanded={showCals} className="min-h-9 text-[13px] underline underline-offset-2" style={{ color: ink }}>
                Busy calendars ({calendars.length - [...fyi].filter((id) => calendars.some((c) => c.id === id)).length} of {calendars.length}) {showCals ? "▾" : "▸"}
              </button>
            )}
            <Fold open={!!showCals}>
              <ul className="m-0 flex w-full list-none flex-col gap-0.5 p-0">
                <li className="text-[12px]" style={{ color: soft }}>
                  Ticked calendars block time. Untick the ones that are just so you know (community events, other people&rsquo;s).
                </li>
                {calendars.map((c) => (
                  <li key={c.id}>
                    <label className="flex min-h-9 items-center gap-2">
                      <input type="checkbox" checked={!fyi.has(c.id)} onChange={() => toggleFyi(c.id)} className="h-4 w-4" />
                      <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color ?? "#8a8a8a" }} />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Fold>
          </div>
          </Fold>
        )}

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-14 sm:pb-3">
          {!plan && !error && (
            <p className="m-0 py-8 text-center text-[14.5px] italic" style={{ color: soft }}>
              Reading your calendar…
            </p>
          )}
          {day && plan && (optional.length > 0 || habitHolds.length > 0) && (
            <OptionalAndHabits
              optional={optional}
              kept={kept}
              habits={habitHolds}
              isAdventure={isAdventure}
              onKeep={(o) => {
                setKept((k) => new Set(k).add(o.id));
                resolveOptionalEventAction(o.calendarId, o.id, o.title, true).catch((e) => {
                  setKept((k) => {
                    const n = new Set(k);
                    n.delete(o.id);
                    return n;
                  });
                  setError(e instanceof Error ? e.message : "Couldn't keep it.");
                });
              }}
              onDelete={(o) =>
                resolveOptionalEventAction(o.calendarId, o.id, o.title, false)
                  .then(() => setOptional((list) => list.filter((x) => x.id !== o.id)))
                  .catch((e) => setError(e instanceof Error ? e.message : "Couldn't delete it."))
              }
            />
          )}
          {day && plan && plan.placed.length === 0 && fixed.length === 0 && settings && (
            <DayStrip day={now} rows={[]} busy={(blocking ?? []).map((x) => ({ start: x.start, end: x.end }))} holds={holdsFor(now)} extras={dayExtras(habitHolds, optional, kept)} from={settings.dayStart} to={settings.dayEnd} picked={null} onPick={() => {}} isAdventure={isAdventure} />
          )}
          {plan && plan.placed.length === 0 && plan.unplaced.length === 0 && (
            <p className="m-0 py-8 text-center text-[14.5px]" style={{ color: soft }}>
              {day && tasks.length === 0 ? "No quests on Today yet: add some, and I'll find them a time." : "Everything on the list already has a time. 🎉"}
            </p>
          )}
          {oneByOne && (
            <OneByOne
              current={shown}
              accepted={[...fixed].sort((a, b) => a.start.getTime() - b.start.getTime())}
              holds={shown ? holdsFor(shown.start) : []}
              busy={blocking ?? []}
              extras={day ? dayExtras(habitHolds, optional, kept) : []}
              from={settings?.dayStart ?? 8 * 60}
              to={settings?.dayEnd ?? 21 * 60}
              left={(plan?.placed.length ?? 1) - 1 + waiting.size}
              waiting={later.filter((l) => waiting.has(l.id)).map((l) => ({ title: taskOf.get(l.id)?.title ?? "A quest", after: l.at === Infinity ? null : l.at - handled }))}
              isAdventure={isAdventure}
              onAccept={() => {
                if (!shown) return;
                setFixed((f) => [...f, shown]);
                setMoved(null);
              }}
              onMove={(start, minutes) => current && setMoved({ id: current.id, start, minutes })}
              onAnother={() => {
                if (!current) return;
                setMoved(null);
                setAvoid((v) => ({ ...v, [current.id]: [...(v[current.id] ?? []), { start: current.start.getTime(), end: current.end.getTime() }] }));
              }}
              onSkip={(n) => {
                if (!current) return;
                setMoved(null);
                setLater((l) => [...l.filter((x) => x.id !== current.id), { id: current.id, at: n === null ? Infinity : handled + n }]);
              }}
              onLeave={() => {
                if (!current) return;
                setMoved(null);
                setSkipped((x) => new Set(x).add(current.id));
              }}
              onUndo={(id) => setFixed((f) => f.filter((x) => x.id !== id))}
            />
          )}
          {!oneByOne && byDay.map((g) => (
            <section key={g.label} className="flex flex-col gap-1">
              <h4 className={`m-0 ${isAdventure ? "font-display text-[16px]" : "text-[13.5px] font-bold uppercase tracking-wide"}`} style={{ color: isAdventure ? "#6b4f1d" : soft }}>
                {g.label}
              </h4>
              <DayStrip
                day={g.rows[0].start}
                rows={g.rows}
                busy={(blocking ?? []).map((x) => ({ start: new Date(x.start).getTime(), end: new Date(x.end).getTime() }))}
                holds={holdsFor(g.rows[0].start)}
                extras={day ? dayExtras(habitHolds, optional, kept) : []}
                from={settings?.dayStart ?? 8 * 60}
                to={settings?.dayEnd ?? 21 * 60}
                picked={picked}
                onPick={(id) => setPicked((x) => (x === id ? null : id))}
                isAdventure={isAdventure}
              />
              <ul className="m-0 flex list-none flex-col p-0">
                {g.rows.map((p, i) => {
                  const t = taskOf.get(p.id);
                  const pref = settings?.prefs[p.id] ?? "any";
                  const open = picked === p.id;
                  return (
                    <li key={p.id} className="fade-in flex flex-col">
                      <button type="button" onClick={() => setPicked(open ? null : p.id)} aria-expanded={open} className="flex min-h-8 items-center gap-2 rounded-lg px-1.5 text-left" style={{ background: open ? "rgba(217,180,95,.18)" : undefined }}>
                        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: gold, color: isAdventure ? "#2a1c10" : "#fff" }}>
                          {i + 1}
                        </span>
                        <span className="w-[86px] shrink-0 text-[12.5px] tabular-nums" style={{ color: soft }}>
                          {hm(p.start)}–{hm(p.end)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: ink }}>
                          {p.title}
                        </span>
                        {p.late && <span className="shrink-0 text-[11.5px] font-bold" style={{ color: "var(--t-warn)" }}>late</span>}
                      </button>
                      <Fold open={open}>
                        <span className="flex flex-wrap items-center gap-1 py-1 pl-8">
                          <span role="radiogroup" aria-label={`When for ${p.title}`} className="flex rounded-full p-0.5" style={{ background: "rgba(120,90,40,.12)" }}>
                            {TIMES.map((o) => (
                              <button key={o.v} type="button" role="radio" aria-checked={pref === o.v} title={o.hint} onClick={() => setPref(p.id, o.v)} className="h-7 rounded-full px-2 text-[12px] font-semibold" style={pref === o.v ? { background: gold, color: isAdventure ? "#2a1c10" : "#fff" } : { color: soft }}>
                                {o.label}
                              </button>
                            ))}
                          </span>
                          <button type="button" onClick={() => (setSkipped((x) => new Set(x).add(p.id)), setPicked(null))} className="h-7 rounded-full px-2.5 text-[12px]" style={{ color: soft }}>
                            Leave it out
                          </button>
                          {p.split && t?.estimate_minutes ? (
                            <span className="text-[11.5px]" style={{ color: soft }}>
                              first part of {Math.round((t.estimate_minutes / 60) * 10) / 10}h
                            </span>
                          ) : null}
                        </span>
                      </Fold>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {plan && plan.unplaced.length > 0 && (
            <section className="flex flex-col gap-1">
              <h4 className="m-0 text-[13.5px] font-bold" style={{ color: "var(--t-warn)" }}>
                Didn&rsquo;t fit
              </h4>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {plan.unplaced.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 text-[14px]" style={{ color: ink }}>
                    <span className="min-w-0 flex-1 truncate">{u.title}</span>
                    <span className="shrink-0 text-[12.5px]" style={{ color: soft }}>
                      {u.why}
                    </span>
                  </li>
                ))}
              </ul>
              {onTomorrow && plan.placed.length === 0 ? (
                <button type="button" onClick={onTomorrow} className="self-start rounded-full px-3.5 py-1.5 text-[13.5px] font-bold" style={{ background: gold, color: isAdventure ? "#2a1c10" : "#fff" }}>
                  Plan tomorrow instead ›
                </button>
              ) : (
                <p className="m-0 text-[12.5px]" style={{ color: soft }}>
                  Try a longer day, a higher daily limit, or &ldquo;Any&rdquo; time.
                </p>
              )}
            </section>
          )}
          {skipped.size > 0 && (
            <button type="button" onClick={() => setSkipped(new Set())} className="self-start text-[13px] underline" style={{ color: soft }}>
              Bring back the {skipped.size} left out
            </button>
          )}
          {error && (
            <p className="m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="relative z-[1] flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: "rgba(139,112,64,.3)" }}>
          {done !== null ? (
            <p className="card-pop-in m-0 flex-1 text-center text-[16px] font-bold" style={{ color: isAdventure ? "#3f6a2c" : "var(--t-good)" }}>
              ✓ {done === 1 ? "1 quest placed" : `${done} quests placed`}. Your days have a shape.
            </p>
          ) : (
            <>
              <button type="button" onClick={onClose} className="h-11 rounded-full px-4 text-[14.5px] underline" style={{ color: soft }}>
                Not now
              </button>
              {!oneByOne ? (
                <>
                  <button type="button" onClick={() => (setFixed([]), setOneByOne(true))} disabled={!plan?.placed.length} className="ml-auto h-11 rounded-full px-3 text-[14px] underline underline-offset-2 disabled:opacity-50" style={{ color: soft }}>
                    One by one
                  </button>
                  <button type="button" onClick={apply} disabled={applying || !plan?.placed.length} className="hover-glow h-11 rounded-full px-5 text-[15px] font-bold disabled:opacity-50" style={{ background: gold, color: isAdventure ? "#2a1c10" : "#fff" }}>
                    {applying ? "Placing…" : `Place all ${(plan?.placed.length ?? 0) + fixed.length}`}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setOneByOne(false)} className="h-11 rounded-full px-3 text-[14px] underline underline-offset-2" style={{ color: soft }}>
                    See the whole plan
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={applying || fixed.length === 0}
                    className="hover-glow ml-auto h-11 rounded-full px-5 text-[15px] font-bold disabled:opacity-50"
                    style={{ background: gold, color: isAdventure ? "#2a1c10" : "#fff" }}
                  >
                    {applying ? "Placing…" : current ? `Place the ${fixed.length === 1 ? "one" : fixed.length} OK'd` : `Place ${fixed.length} on the calendar`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** One day as a strip: your busy time (grey), essentials kept free (dashed), and each placed quest (a gold, numbered block). */
function DayStrip({ day, rows, busy, holds, extras = [], from, to, picked, onPick, isAdventure }: { day: Date; rows: Placed[]; busy: { start: number; end: number }[]; holds: Hold[]; /** Habits kept room for (🌿) and optional events (dotted, until kept). */ extras?: Extra[]; from: number; to: number; picked: string | null; onPick: (id: string) => void; isAdventure: boolean }) {
  const d0 = new Date(day);
  d0.setHours(0, 0, 0, 0);
  const t0 = d0.getTime() + from * 60_000;
  const span = Math.max(60, to - from) * 60_000;
  const pos = (a: number, b: number) => {
    const l = Math.max(0, Math.min(1, (a - t0) / span));
    const r = Math.max(0, Math.min(1, (b - t0) / span));
    return { left: `${l * 100}%`, width: `${Math.max(0, r - l) * 100}%` };
  };
  const hours: number[] = [];
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) hours.push(m);
  const label = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    return h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
  };
  return (
    <div className="flex flex-col gap-0.5">
      <div className="relative h-9 overflow-hidden rounded-lg" style={{ background: isAdventure ? "rgba(255,250,238,.6)" : "var(--t-bg)", border: "1px solid rgba(139,112,64,.3)" }}>
        {hours.map((m) => (
          <span key={m} aria-hidden className="absolute inset-y-0 w-px" style={{ left: `${((m - from) / (to - from)) * 100}%`, background: "rgba(139,112,64,.15)" }} />
        ))}
        {busy.filter((b) => b.end > t0 && b.start < t0 + span && !extras.some((x) => x.kind === "habit" && x.start === b.start && x.end === b.end)).map((b, i) => (
          <span key={`b${i}`} aria-hidden className="absolute inset-y-1 rounded" style={{ ...pos(b.start, b.end), background: "rgba(90,80,60,.28)" }} />
        ))}
        {extras.filter((x) => x.end > t0 && x.start < t0 + span).map((x) => (
          <span key={x.id} aria-hidden title={x.title} className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded text-[10px]" style={{ ...pos(x.start, x.end), ...(x.kind === "habit" ? { background: "rgba(92,138,70,.22)", border: "1px dashed rgba(63,106,44,.7)" } : { border: "1.5px dotted rgba(90,80,60,.6)", background: "rgba(90,80,60,.08)" }) }}>
            {x.kind === "habit" ? "🌿" : "?"}
          </span>
        ))}
        {holds.filter((h) => h.at !== null).map((h) => (
          <span key={h.key} aria-hidden title={MEAL_NAMES[h.key]} className="absolute inset-y-1.5 flex items-center justify-center rounded text-[10px]" style={{ ...pos(h.at!, h.at! + h.minutes * 60_000), border: "1px dashed rgba(139,112,64,.55)" }}>
            {MEAL_ICONS[h.key]}
          </span>
        ))}
        {rows.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            aria-label={`${p.title}, tap for options`}
            title={p.title}
            className="absolute inset-y-0.5 flex items-center justify-center overflow-hidden rounded-md text-[11px] font-bold"
            style={{ ...pos(p.start.getTime(), p.end.getTime()), minWidth: 14, background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", color: "#2a1c10", border: picked === p.id ? "2px solid #6b4f1d" : "1px solid #8a6116" }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="relative h-3.5 text-[10px] tabular-nums" aria-hidden style={{ color: "rgba(107,79,29,.7)" }}>
        {hours.filter((m, i) => i % 2 === 0 && m - from >= (to - from) * 0.03 && to - m >= (to - from) * 0.03).map((m) => (
          <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - from) / (to - from)) * 100}%` }}>
            {label(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

type Hold = { key: MealKey; from: number; to: number; at: number | null; minutes: number };
type HabitHold = { id: string; title: string; start: number; end: number };
type OptionalEvent = { id: string; calendarId: string; title: string; start: number; end: number };
type Extra = { id: string; title: string; start: number; end: number; kind: "habit" | "optional" };
const dayExtras = (habits: HabitHold[], optional: OptionalEvent[], kept: Set<string>): Extra[] => [
  ...habits.map((h) => ({ ...h, kind: "habit" as const })),
  ...optional.filter((o) => !kept.has(o.id)).map((o) => ({ id: o.id, title: o.title, start: o.start, end: o.end, kind: "optional" as const })),
];
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/i, (_, p: string) => p.toLowerCase());

/**
 * The day's other parts, above the plan: optional [bracketed] events from your calendar, each with
 * ✓ (keep: its brackets come off and it holds its time) and × (delete; a moment to undo), and the
 * habits it keeps room for.
 */
function OptionalAndHabits({ optional, kept, habits, isAdventure, onKeep, onDelete }: { optional: OptionalEvent[]; kept: Set<string>; habits: HabitHold[]; isAdventure: boolean; onKeep: (o: OptionalEvent) => void; onDelete: (o: OptionalEvent) => void }) {
  const [leaving, setLeaving] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const soft = "var(--t-ink-soft)";
  const ink = "var(--t-ink)";
  const round = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold";
  function del(o: OptionalEvent) {
    const t = setTimeout(() => {
      onDelete(o);
      setLeaving((l) => {
        const n = { ...l };
        delete n[o.id];
        return n;
      });
    }, 3500);
    setLeaving((l) => ({ ...l, [o.id]: t }));
  }
  function undo(id: string) {
    clearTimeout(leaving[id]);
    setLeaving((l) => {
      const n = { ...l };
      delete n[id];
      return n;
    });
  }
  return (
    <section className="flex flex-col gap-1">
      {optional.length > 0 && (
        <>
          <h4 className={`m-0 ${isAdventure ? "font-display text-[16px]" : "text-[13.5px] font-bold uppercase tracking-wide"}`} style={{ color: isAdventure ? "#6b4f1d" : soft }}>
            Optional today
          </h4>
          <ul className="m-0 flex list-none flex-col p-0">
            {optional.map((o) => {
              const isKept = kept.has(o.id);
              const going = o.id in leaving;
              return (
                <li key={o.id} className="fade-in flex min-h-9 items-center gap-2 rounded-lg px-1.5" style={{ opacity: going ? 0.55 : 1, transition: "opacity .2s" }}>
                  <span className="w-[86px] shrink-0 text-[12.5px] tabular-nums" style={{ color: soft }}>
                    {clock(o.start)}–{clock(o.end)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: ink, textDecoration: going ? "line-through" : undefined }}>
                    {isKept ? o.title : `[${o.title}]`}
                  </span>
                  {going ? (
                    <button type="button" onClick={() => undo(o.id)} className="h-7 shrink-0 rounded-full px-2.5 text-[12.5px] font-semibold underline underline-offset-2" style={{ color: ink }}>
                      Undo
                    </button>
                  ) : isKept ? (
                    <span className="confirm-pop shrink-0 text-[12.5px] font-semibold" style={{ color: "#3f6a2c" }}>
                      ✓ Kept
                    </span>
                  ) : (
                    <>
                      <button type="button" onClick={() => onKeep(o)} aria-label={`Keep ${o.title}`} title="Keep it (holds its time)" className={round} style={{ border: "1.5px solid #3f6a2c", color: "#3f6a2c", background: "rgba(92,138,70,.12)" }}>
                        ✓
                      </button>
                      <button type="button" onClick={() => del(o)} aria-label={`Delete ${o.title} from your calendar`} title="Delete it from your calendar" className={round} style={{ border: "1.5px solid #a3412a", color: "#a3412a", background: "rgba(163,65,42,.08)" }}>
                        ×
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {habits.length > 0 && (
        <p className="m-0 text-[12.5px] leading-snug" style={{ color: soft }}>
          🌿 Room kept for {habits.map((h) => `${h.title} (${clock(h.start)})`).join(", ")}.
        </p>
      )}
    </section>
  );
}
type Placed = { id: string; title: string; start: Date; end: Date; late?: boolean };

/**
 * One placement at a time (owner, Nov 3: "it goes through where it thinks each item should go, in sequence"):
 * its day as a strip where the gold block is dragged (or a time tapped) to move it, Adjust for the day,
 * time and length, then Looks good, Another time, Skip (offered again after a chosen number of others),
 * or Leave it out. Nothing is placed until the end.
 */
function OneByOne({
  current,
  accepted,
  holds,
  busy,
  extras,
  from,
  to,
  left,
  waiting,
  isAdventure,
  onAccept,
  onMove,
  onAnother,
  onSkip,
  onLeave,
  onUndo,
}: {
  current: Placed | null;
  accepted: Placed[];
  holds: Hold[];
  busy: Busy[];
  extras: Extra[];
  from: number;
  to: number;
  /** How many more after this one (no fractions). */
  left: number;
  waiting: { title: string; after: number | null }[];
  isAdventure: boolean;
  onAccept: () => void;
  onMove: (start: number, minutes: number) => void;
  onAnother: () => void;
  onSkip: (after: number | null) => void;
  onLeave: () => void;
  onUndo: (id: string) => void;
}) {
  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const gold = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  const [adjust, setAdjust] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const minutes = current ? Math.round((current.end.getTime() - current.start.getTime()) / 60_000) : 0;
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const clash = current
    ? [...busy, ...accepted.map((p) => ({ start: p.start.getTime(), end: p.end.getTime() }))].some((b) => b.start < current.end.getTime() && b.end > current.start.getTime())
    : false;
  const chip = "h-8 rounded-full px-2.5 text-[12.5px] font-semibold";
  const quiet = { border: "1px solid #b39a6a", color: ink };
  const on = { background: gold, color: isAdventure ? "#2a1c10" : "#fff" };
  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <div key={current.id} className="card-pop-in flex flex-col gap-2 rounded-2xl px-3.5 py-3" style={{ background: isAdventure ? "rgba(255,250,238,.7)" : "var(--t-bg)", border: "1.5px dashed #b8913f" }}>
          <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: isAdventure ? "#8a6116" : soft }}>
            Where it could go
            {left > 0 && <span className="ml-auto font-semibold normal-case tracking-normal">{left === 1 ? "1 more after this" : `${left} more after this`}</span>}
          </span>
          <span className={`${isAdventure ? "font-display text-[20px]" : "text-[17px] font-bold"} leading-snug`} style={{ color: ink }}>
            {current.title}
          </span>
          <span className="text-[15px] font-semibold tabular-nums" style={{ color: isAdventure ? "#6b4f1d" : "var(--t-accent)" }}>
            {dayLabel(current.start)}, {hm(current.start)} – {hm(current.end)}
            {current.late && (
              <span className="ml-1.5 text-[12px] font-bold" style={{ color: "var(--t-warn)" }}>
                later than hoped
              </span>
            )}
            {clash && (
              <span className="ml-1.5 text-[12px] font-bold" style={{ color: "var(--t-warn)" }}>
                overlaps something
              </span>
            )}
          </span>
          <ReviewStrip
            day={current.start}
            current={current}
            accepted={accepted.filter((p) => sameDay(p.start, current.start))}
            busy={busy}
            holds={holds}
            extras={extras}
            from={from}
            to={to}
            isAdventure={isAdventure}
            onMove={(start) => onMove(start, minutes)}
          />
          {holds.length > 0 && (
            <span className="text-[12.5px] italic" style={{ color: soft }}>
              {holds.map((h) => `${MEAL_ICONS[h.key]} ${MEAL_NAMES[h.key]}${h.at !== null ? ` ${hm(new Date(h.at))}` : ": crowded out"}`).join(" · ")}
            </span>
          )}
          <Fold open={adjust}>
            <div className="flex flex-col gap-1.5 rounded-xl px-2 py-2" style={{ background: "rgba(120,90,40,.08)" }}>
              <span className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => onMove(current.start.getTime() - 86_400_000, minutes)} className={chip} style={quiet} aria-label="A day earlier">
                  ‹ Day
                </button>
                <button type="button" onClick={() => onMove(current.start.getTime() - 15 * 60_000, minutes)} className={chip} style={quiet} aria-label="15 minutes earlier">
                  −15
                </button>
                <span className="min-w-[64px] text-center text-[13.5px] font-bold tabular-nums" style={{ color: ink }}>
                  {hm(current.start)}
                </span>
                <button type="button" onClick={() => onMove(current.start.getTime() + 15 * 60_000, minutes)} className={chip} style={quiet} aria-label="15 minutes later">
                  +15
                </button>
                <button type="button" onClick={() => onMove(current.start.getTime() + 86_400_000, minutes)} className={chip} style={quiet} aria-label="A day later">
                  Day ›
                </button>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[12.5px]" style={{ color: soft }}>
                  Length
                </span>
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <button key={m} type="button" onClick={() => onMove(current.start.getTime(), m)} aria-pressed={m === minutes} className={chip} style={m === minutes ? on : quiet}>
                    {m < 60 ? `${m}m` : m === 90 ? "1½h" : `${m / 60}h`}
                  </button>
                ))}
              </span>
            </div>
          </Fold>
          <Fold open={skipOpen}>
            <div className="flex flex-wrap items-center gap-1 rounded-xl px-2 py-2" style={{ background: "rgba(120,90,40,.08)" }}>
              <span className="mr-0.5 text-[12.5px]" style={{ color: soft }}>
                Offer it again after
              </span>
              {[1, 2, 3, 5].map((n) => (
                <button key={n} type="button" onClick={() => (setSkipOpen(false), onSkip(n))} className={chip} style={quiet}>
                  {n === 1 ? "the next one" : `${n} others`}
                </button>
              ))}
              <button type="button" onClick={() => (setSkipOpen(false), onSkip(null))} className={chip} style={quiet}>
                all the rest
              </button>
            </div>
          </Fold>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => (setAdjust(false), setSkipOpen(false), onAccept())} className="hover-glow h-10 rounded-full px-5 text-[14.5px] font-bold" style={on}>
              Looks good ✓
            </button>
            <button type="button" onClick={onAnother} className="h-10 rounded-full px-3.5 text-[14px] font-semibold" style={{ border: "1.5px solid #b39a6a", color: ink }}>
              Another time
            </button>
            <button type="button" onClick={() => (setSkipOpen((v) => !v), setAdjust(false))} aria-expanded={skipOpen} className="h-10 rounded-full px-3 text-[14px] font-semibold" style={{ color: ink, background: skipOpen ? "rgba(217,180,95,.22)" : undefined }}>
              Skip…
            </button>
            <button type="button" onClick={() => (setAdjust((v) => !v), setSkipOpen(false))} aria-expanded={adjust} className="h-10 rounded-full px-3 text-[14px] font-semibold" style={{ color: ink, background: adjust ? "rgba(217,180,95,.22)" : undefined }}>
              Adjust
            </button>
            <button type="button" onClick={onLeave} className="ml-auto h-10 rounded-full px-2 text-[13px] underline underline-offset-2" style={{ color: soft }}>
              Leave it out
            </button>
          </div>
        </div>
      ) : (
        <p className="card-pop-in m-0 py-3 text-center text-[15px]" style={{ color: ink }}>
          {accepted.length ? "All looked over. Place them when you're ready." : "Nothing left to look over."}
        </p>
      )}
      {waiting.length > 0 && (
        <p className="m-0 text-[12.5px]" style={{ color: soft }}>
          Coming back: {waiting.map((w) => `${w.title}${w.after === null ? " (at the end)" : w.after === 1 ? " (after the next one)" : ` (after ${w.after} more)`}`).join(" · ")}
        </p>
      )}
      {accepted.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {accepted.map((p) => (
            <li key={p.id} className="due-in flex items-center gap-2 text-[13.5px]" style={{ color: ink }}>
              <span aria-hidden style={{ color: "#3f6a2c" }}>
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <span className="shrink-0 tabular-nums" style={{ color: soft }}>
                {dayLabel(p.start).replace(/day,.*/, "day")} {hm(p.start)}
              </span>
              <button type="button" onClick={() => onUndo(p.id)} aria-label={`Look at ${p.title} again`} title="Look at it again" className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: soft }}>
                ↺
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The day of the quest being looked at: drag its gold block (or tap a time) to move it; 5-minute steps. */
function ReviewStrip({ day, current, accepted, busy, holds, extras, from, to, isAdventure, onMove }: { day: Date; current: Placed; accepted: Placed[]; busy: Busy[]; holds: Hold[]; extras: Extra[]; from: number; to: number; isAdventure: boolean; onMove: (start: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; s0: number; moved: boolean } | null>(null);
  const d0 = new Date(day);
  d0.setHours(0, 0, 0, 0);
  // The strip covers your day, and stretches if the quest sits outside it.
  const startMin = Math.round((current.start.getTime() - d0.getTime()) / 60_000);
  const endMin = Math.round((current.end.getTime() - d0.getTime()) / 60_000);
  const a = Math.min(from, Math.floor(startMin / 60) * 60);
  const b = Math.max(to, Math.ceil(endMin / 60) * 60);
  const t0 = d0.getTime() + a * 60_000;
  const span = Math.max(60, b - a) * 60_000;
  const len = current.end.getTime() - current.start.getTime();
  const pos = (s: number, e: number) => {
    const l = Math.max(0, Math.min(1, (s - t0) / span));
    const r = Math.max(0, Math.min(1, (e - t0) / span));
    return { left: `${l * 100}%`, width: `${Math.max(0, r - l) * 100}%` };
  };
  const snap = (ms: number) => Math.max(t0, Math.min(t0 + span - len, Math.round(ms / 300_000) * 300_000));
  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    return r ? t0 + ((clientX - r.left) / r.width) * span : current.start.getTime();
  };
  const hours: number[] = [];
  for (let m = Math.ceil(a / 60) * 60; m <= b; m += 60) hours.push(m);
  const label = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    return h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
  };
  const wide = pos(current.start.getTime(), current.end.getTime());
  return (
    <div className="flex flex-col gap-0.5">
      <div
        ref={box}
        className="relative h-12 cursor-pointer overflow-hidden rounded-lg"
        style={{ background: isAdventure ? "rgba(255,250,238,.75)" : "var(--t-card)", border: "1px solid rgba(139,112,64,.35)" }}
        // Tap a time: the quest moves there.
        onClick={(e) => onMove(snap(at(e.clientX) - len / 2))}
        title="Tap a time, or drag the gold block"
      >
        {hours.map((m) => (
          <span key={m} aria-hidden className="absolute inset-y-0 w-px" style={{ left: `${((m - a) / (b - a)) * 100}%`, background: "rgba(139,112,64,.15)" }} />
        ))}
        {busy.filter((x) => x.end > t0 && x.start < t0 + span).map((x, i) => (
          <span key={`b${i}`} aria-hidden className="absolute inset-y-1 rounded" style={{ ...pos(x.start, x.end), background: "rgba(90,80,60,.28)" }} />
        ))}
        {extras.filter((x) => x.end > t0 && x.start < t0 + span).map((x) => (
          <span key={x.id} aria-hidden title={x.title} className="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded text-[10px]" style={{ ...pos(x.start, x.end), ...(x.kind === "habit" ? { background: "rgba(92,138,70,.22)", border: "1px dashed rgba(63,106,44,.7)" } : { border: "1.5px dotted rgba(90,80,60,.6)", background: "rgba(90,80,60,.08)" }) }}>
            {x.kind === "habit" ? "🌿" : "?"}
          </span>
        ))}
        {holds.filter((h) => h.at !== null).map((h) => (
          <span key={h.key} aria-hidden title={MEAL_NAMES[h.key]} className="absolute inset-y-2 flex items-center justify-center rounded text-[10px]" style={{ ...pos(h.at!, h.at! + h.minutes * 60_000), border: "1px dashed rgba(139,112,64,.55)" }}>
            {MEAL_ICONS[h.key]}
          </span>
        ))}
        {accepted.map((p) => (
          <span key={p.id} aria-hidden title={p.title} className="absolute inset-y-1.5 rounded-md" style={{ ...pos(p.start.getTime(), p.end.getTime()), background: "rgba(63,106,44,.35)", border: "1px solid rgba(63,106,44,.7)" }} />
        ))}
        <button
          type="button"
          aria-label={`${current.title}: drag to move, or use the arrow keys`}
          className="absolute inset-y-0.5 flex cursor-grab touch-none items-center justify-center overflow-hidden rounded-md px-1 text-[11px] font-bold active:cursor-grabbing"
          style={{ ...wide, minWidth: 18, background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", color: "#2a1c10", border: "2px solid #6b4f1d", boxShadow: "0 2px 6px rgba(0,0,0,.25)" }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x0: e.clientX, s0: current.start.getTime(), moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const r = box.current?.getBoundingClientRect();
            if (!d || !r) return;
            if (!d.moved && Math.abs(e.clientX - d.x0) < 4) return;
            d.moved = true;
            onMove(snap(d.s0 + ((e.clientX - d.x0) / r.width) * span));
          }}
          onPointerUp={(e) => {
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            onMove(snap(current.start.getTime() + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 60 : 5) * 60_000));
          }}
        >
          <span className="truncate">{current.title}</span>
        </button>
      </div>
      <div className="relative h-3.5 text-[10px] tabular-nums" aria-hidden style={{ color: "rgba(107,79,29,.7)" }}>
        {hours.filter((m, i) => i % 2 === 0 && m - a >= (b - a) * 0.03 && b - m >= (b - a) * 0.03).map((m) => (
          <span key={m} className="absolute -translate-x-1/2" style={{ left: `${((m - a) / (b - a)) * 100}%` }}>
            {label(m)}
          </span>
        ))}
      </div>
    </div>
  );
}
