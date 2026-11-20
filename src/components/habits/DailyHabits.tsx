"use client";

import { stepsComplete } from "@/lib/habit-steps";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { GearIcon, SnoozeIcon } from "@/components/ui/Icons";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderRitesAction, setCoreHabitAction, setRiteDoneTimeAction, skipHabitAction, unskipHabitAction } from "@/app/actions";
import { TimeWheels } from "@/components/ui/TimeWheels";
import { useRouter } from "next/navigation";
import { saveOrQueue } from "@/lib/offline";
import { useLocalDay } from "@/components/evening/evening-clock";
import { nextOccurrence, repeatIsUp, repeatLabel } from "@/lib/habit-repeat";
import { RiteEditorDialog } from "@/components/evening/RiteEditorDialog";
import type { RiteView } from "@/components/evening/EveningRites";
import { FocusMode, habitAsTask } from "@/components/one-thing/OneThing";
import { CoinIcon } from "@/components/ui/Icons";
import { coinsForXp } from "@/lib/coins";
import { fromFeedback } from "@/lib/from-feedback";
import { defaultCleaning, normalizeCleaning, todaysPicks } from "@/lib/cleaning";
import { CleaningCheckIn } from "@/components/habits/CleaningCheckIn";
import { openLanguageWindow } from "@/components/xp/LearnLanguage";
import { setHabitTicks, useHabitTicks } from "@/lib/use-habit-ticks";
import type { HabitTicksSeed } from "@/lib/habit-ticks";
import { setHabitManyAction, setHabitXpNowAction, tickHabitAgainAction, undoHabitTickAction } from "@/app/actions";
import { SwipeReveal } from "@/components/ui/SwipeReveal";
import { Fold } from "@/components/ui/Fold";

/**
 * Daily habits: small repeating quests on the day side (stored like evening
 * rites, in the "day" slot). Tick each one once a day for its XP and coins;
 * its avatar is a checkbox unless it has a portrait. The ⋯ menu opens focus
 * mode (with a timer) or skips it for today. Collapsible, open by default.
 */
// Habits you can listen along to (walks, drives, the dog).
const LISTEN_HABIT = /\b(walk|walking|drive|driving|dog|commute|car ride|errands?|hike)\b|🐶|🐕/iu;

/** Whether each Daily Habits tray was open, kept outside the list so a redraw doesn't close it. */
const trayOpen = new Map<string, boolean>();

export function DailyHabits({
  habits,
  completions,
  skips = [],
  stepChecks = [],
  cleaning: cleaningRaw = null,
  theme,
  listenHref = null,
  planned = [],
  core = [],
  bare = false,
  additional = false,
  ticks: ticksSeed = null,
}: {
  /** The habits not up today, as their own section under Daily Habits, like Additional Quests (owner, Nov 18). */
  additional?: boolean;
  /** Habits that count every tick, and today's ticks after the first, so cards are right from the first paint. */
  ticks?: HabitTicksSeed | null;
  /** Habits in today's plan (core ones and the ones picked for today): they sit in Today's Quests, not here. */
  planned?: string[];
  /** Core habits: a gold star, and they always come up in the day's plan. */
  core?: string[];
  /** Just today's planned habits as cards, for inside Today's Quests (no header, tray or extras). */
  bare?: boolean;
  /** Your list of videos to listen to (a board): a 🎧 pill under a walk, drive or dog-walk habit that's still to do. */
  listenHref?: string | null;
  /** The mess check-in (spaces, laundry, chores) shown under the cleaning habit. */
  cleaning?: unknown;
  /** Sub-habit ticks for the last couple of days. */
  stepChecks?: { rite_id: string; step_id: string; day: string }[];
  habits: RiteView[];
  /** Completions over the last few months (for today's ticks and the streaks). */
  completions: { rite_id: string; day: string }[];
  /** Days skipped on purpose; null before that database update. */
  skips?: { rite_id: string; day: string }[] | null;
  theme: "calm" | "adventure";
}) {
  const day = useLocalDay();
  // Closed until opened (the header still shows how the day is going).
  // Kept across a redraw (ticking a habit refreshes Today, which can draw the list anew), so the tray stays open.
  const [open, setOpen] = useState(() => trayOpen.get(bare ? "bare" : "main") ?? false);
  useEffect(() => {
    trayOpen.set(bare ? "bare" : "main", open);
  }, [open, bare]);
  const [look, setLook] = useState<HeaderLook>("togo");
  const [mark, setMark] = useState<HabitMark>("seedling");
  const [lookMenu, setLookMenu] = useState(false);
  // A + before the title that adds a habit (chosen in the header's settings).
  const [plusFirst, setPlusFirst] = useState(false);
  const plusSpot = useRef<HTMLSpanElement>(null);
  const headerBox = useRef<HTMLDivElement>(null);
  const [plusAt, setPlusAt] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const place = () => {
      const a = plusSpot.current?.getBoundingClientRect();
      const b = headerBox.current?.getBoundingClientRect();
      setPlusAt(a && b ? { left: a.left - b.left, top: a.top - b.top } : null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [plusFirst, mark]);
  useEffect(() => {
    try {
      // "beads" and the garden were retired: they show "Still to tend" now.
      const v = localStorage.getItem(LOOK_KEY)?.replace(/^(beads|garden)$/, "togo");
      const m = localStorage.getItem(MARK_KEY);
      /* eslint-disable react-hooks/set-state-in-effect -- the saved choice is only readable after hydration */
      setPlusFirst(localStorage.getItem(PLUS_KEY) === "1");
      if (v && LOOKS.some((l) => l.key === v)) setLook(v as HeaderLook);
      if (m && MARKS.some((x) => x.key === m)) setMark(m as HabitMark);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* storage unavailable */
    }
  }, []);
  function chooseMark(v: HabitMark) {
    setMark(v);
    try {
      localStorage.setItem(MARK_KEY, v);
    } catch {
      /* storage unavailable */
    }
  }
  function chooseLook(v: HeaderLook) {
    setLook(v);
    try {
      localStorage.setItem(LOOK_KEY, v);
    } catch {
      /* storage unavailable */
    }
  }
  useEffect(() => {
    if (!lookMenu) return;
    const close = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
      if (!(e.target as Element | null)?.closest?.("[data-habit-look]")) setLookMenu(false);
    };
    const esc = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && setLookMenu(false);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", esc);
    };
  }, [lookMenu]);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<RiteView | "new" | null>(null);
  // A sub-habit's own menu (right-click), by "habit:step".
  const [subMenu, setSubMenu] = useState<string | null>(null);
  useEffect(() => {
    if (!subMenu) return;
    const close = (e: PointerEvent) => !(e.target as Element).closest?.("[role=menu]") && setSubMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [subMenu]);
  const [editSub, setEditSub] = useState(false);
  const [pop, setPop] = useState<{ id: string; xp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [menuMax, setMenuMax] = useState<number | undefined>(undefined);
  /** The menu opens on the roomier side of its card and scrolls inside when even that is short (the bottom bar takes 100px). */
  const placeMenu = (r: DOMRect) => {
    const below = window.innerHeight - r.bottom - 100;
    const above = r.top - 12;
    const up = below < 500 && above > below;
    setMenuUp(up);
    setMenuMax(Math.max(180, up ? above : below));
  };
  // A tap anywhere outside the open menu closes it.
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
      if (!(e.target as Element | null)?.closest?.("[data-habit-menu]")) setMenuFor(null);
    };
    const esc = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && setMenuFor(null);
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", esc);
    };
  }, [menuFor]);
  const [confirmSkip, setConfirmSkip] = useState<string | null>(null);
  // Sub-habits: which habits are opened up, and ticks made here ahead of the save.
  const [openSubs, setOpenSubs] = useState<Set<string>>(() => new Set());
  const [stepOpt, setStepOpt] = useState<Record<string, boolean>>({});
  const [focusing, setFocusing] = useState<RiteView | null>(null);
  const [skipOverride, setSkipOverride] = useState<Record<string, boolean>>({});
  // Order kept locally while a drag is saving.
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(habits);
  const [, startTransition] = useTransition();
  const isAdventure = theme === "adventure";
  if (seen !== habits) {
    setSeen(habits);
    setOrder(null);
  }

  // One stable quest-shaped copy of the habit while focus mode is open.
  const focusTask = useMemo(() => (focusing && day ? habitAsTask(focusing, day) : null), [focusing, day]);
  // The mess check-in sits under the cleaning habit (the first with "clean" in its name).
  const cleaning = useMemo(() => (day ? (normalizeCleaning(cleaningRaw) ?? defaultCleaning(day)) : null), [cleaningRaw, day]);
  const cleanId = cleaning ? (cleaning.habitId && habits.some((h) => h.id === cleaning.habitId) ? cleaning.habitId : (habits.find((h) => /clean/i.test(h.title))?.id ?? null)) : null;
  // Its title says where today's 20 minutes go ("…: 🎨 Art desk"); tapping it opens the check-in tray.
  const cleanTop = cleaning && day ? (todaysPicks(cleaning, day)[0] ?? null) : null;
  const [cleanOpen, setCleanOpen] = useState(false);

  const byId = new Map(habits.map((h) => [h.id, h]));
  const ordered = (order ?? habits.map((h) => h.id)).map((id) => byId.get(id)).filter((h): h is RiteView => !!h);
  // Only habits that fall on today (weekday of the app day, 5:30am rollover).
  const weekday = day ? new Date(`${day}T12:00:00`).getDay() : null;
  const doneSet = new Set(completions.map((c) => `${c.rite_id}|${c.day}`));
  const skipSet = new Set((skips ?? []).map((c) => `${c.rite_id}|${c.day}`));
  const daysOf = (list: { rite_id: string; day: string }[] | null | undefined, id: string) => (list ?? []).filter((c) => c.rite_id === id).map((c) => c.day);
  // A habit on an interval is up from its day until done or skipped; one on weekdays, on those days.
  const dueOn = (h: RiteView, wd: number | null) => {
    if (h.repeat) return !!day && repeatIsUp(h.repeat, day, daysOf(completions, h.id), daysOf(skips, h.id).filter((d) => d !== day));
    return !h.days || h.days.length === 0 || wd === null || h.days.includes(wd);
  };
  const done = (id: string) => optimistic[id] ?? doneSet.has(`${id}|${day}`);
  const tickSet = new Set(stepChecks.map((c) => `${c.rite_id}|${c.step_id}|${c.day}`));
  const ticked = (h: RiteView, stepId: string) => stepOpt[`${h.id}|${stepId}`] ?? tickSet.has(`${h.id}|${stepId}|${day}`);
  const subsOf = (h: RiteView) => h.steps ?? [];
  const skipped = (id: string) => skipOverride[id] ?? skipSet.has(`${id}|${day}`);
  const dueToday = ordered.filter((h) => dueOn(h, weekday));
  // Snoozed until tomorrow (kept in this browser).
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- only readable after hydration
      setSnoozed(JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}"));
    } catch {}
  }, []);
  const isSnoozed = (id: string) => !!day && snoozed[id] === day;
  /** A tap on a habit's card: its sub-habits, the mess check-in, the phrase tool, or else its editor (⋯ and right-click edit any habit). */
  function cardTap(h: RiteView) {
    if (h.id === cleanId && cleaning) return setCleanOpen((v) => !v);
    if (subsOf(h).length) {
      return setOpenSubs((o) => {
        const n = new Set(o);
        if (n.has(h.id)) n.delete(h.id);
        else n.add(h.id);
        return n;
      });
    }
    if (/learn(ing)? (a )?language|language practice/i.test(h.title)) return openLanguageWindow();
    setEditing(h);
  }

  function snooze(h: RiteView, on: boolean) {
    if (!day) return;
    setMenuFor(null);
    const next = { ...Object.fromEntries(Object.entries(snoozed).filter(([, d]) => d === day)) };
    if (on) next[h.id] = day;
    else delete next[h.id];
    setSnoozed(next);
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {}
  }
  // Planned habits (core + picked for today) live in Today's Quests; this section keeps the rest (owner, Nov 14).
  const plannedSet = new Set(planned);
  const notToday = ordered.filter((h) => !dueToday.includes(h));
  const todays = additional ? notToday : dueToday.filter((h) => !skipped(h.id) && !isSnoozed(h.id) && plannedSet.has(h.id) === bare);
  const plannedHere = !bare && dueToday.some((h) => plannedSet.has(h.id) && !skipped(h.id) && !isSnoozed(h.id));
  const [coreOverride, setCoreOverride] = useState<Record<string, boolean>>({});
  const isCore = (id: string) => coreOverride[id] ?? core.includes(id);
  function toggleCore(h: RiteView) {
    const next = !isCore(h.id);
    setMenuFor(null);
    setError(null);
    setCoreOverride((o) => ({ ...o, [h.id]: next }));
    startTransition(async () => {
      try {
        await setCoreHabitAction(h.id, next);
      } catch (e) {
        setCoreOverride((o) => ({ ...o, [h.id]: !next }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  const skippedToday = dueToday.filter((h) => skipped(h.id));
  const snoozedToday = dueToday.filter((h) => !skipped(h.id) && isSnoozed(h.id));

  /**
   * Days in a row this habit was done, counting only the days it's due.
   * Today counts once ticked; until then the streak carries on from
   * yesterday. A missed day ends it; a rest day is passed over.
   */
  function streak(h: RiteView): number {
    if (!day || h.repeat) return 0;
    let n = 0;
    const d = new Date(`${day}T12:00:00`);
    for (let i = 0; i < 400; i++) {
      const key = localKey(d);
      if (dueOn(h, d.getDay())) {
        const isDone = i === 0 ? done(h.id) : doneSet.has(`${h.id}|${key}`);
        const isSkipped = i === 0 ? skipped(h.id) : skipSet.has(`${h.id}|${key}`);
        // A day it rested (skipped on purpose) neither counts nor breaks the streak (owner, Nov 14: "no guilt").
        if (isDone) n++;
        else if (!isSkipped && i > 0) return n;
      }
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function setSkip(h: RiteView, value: boolean) {
    if (!day) return;
    setMenuFor(null);
    setConfirmSkip(null);
    setError(null);
    setSkipOverride((o) => ({ ...o, [h.id]: value }));
    startTransition(async () => {
      try {
        if (value) await skipHabitAction(h.id, day);
        else await unskipHabitAction(h.id, day);
      } catch (e) {
        setSkipOverride((o) => ({ ...o, [h.id]: !value }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = ordered.map((h) => h.id);
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    setOrder(next);
    startTransition(async () => {
      try {
        await reorderRitesAction(next);
      } catch (e) {
        setOrder(null);
        setError(e instanceof Error ? e.message : "Couldn't reorder.");
      }
    });
  }

  // Habits that count every tick (owner, Nov 16): each tick is another completion with its XP.
  const ticks = useHabitTicks(day, ticksSeed);
  const isMany = (id: string) => ticks.many.includes(id);
  const timesToday = (id: string, isDone: boolean) => (isDone ? 1 + (isMany(id) ? (ticks.today[id] ?? 0) : 0) : 0);
  /** The small celebration for a tick, with the XP changeable right on it. */
  function celebrateTick(h: RiteView, xp: number, coinsEarned: number, times: number) {
    if (!day) return;
    celebrateProgress({
      title: h.title,
      heading: times > 1 ? "Done again!" : "Habit complete!",
      xp,
      coinsEarned,
      fromPct: 0,
      toPct: 100,
      barCaption: times > 1 ? `${times} times today` : "First one today",
      onXp: (n) => void setHabitXpNowAction(h.id, day, n).catch(() => setError("Couldn't change the XP.")),
    });
  }
  function toggleMany(h: RiteView) {
    const on = !isMany(h.id);
    setHabitTicks({ many: on ? [...ticks.many, h.id] : ticks.many.filter((id) => id !== h.id) });
    void setHabitManyAction(h.id, on).catch(() => setError("Couldn't save that."));
  }
  function tickAgain(h: RiteView) {
    if (!day) return;
    setError(null);
    const before = ticks.today[h.id] ?? 0;
    setHabitTicks({ today: { ...ticks.today, [h.id]: before + 1 } });
    startTransition(async () => {
      try {
        const r = await tickHabitAgainAction(h.id, day);
        setHabitTicks({ today: { ...ticks.today, [h.id]: r.extra } });
        celebrateTick(h, r.xp, r.coinsEarned, r.extra + 1);
      } catch (e) {
        setHabitTicks({ today: { ...ticks.today, [h.id]: before } });
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  /** From the menu: take back the latest tick (the habit itself when it was the only one). */
  function undoTick(h: RiteView) {
    if (!day) return;
    const extra = ticks.today[h.id] ?? 0;
    if (extra < 1) return toggle(h, true);
    setHabitTicks({ today: { ...ticks.today, [h.id]: extra - 1 } });
    startTransition(async () => {
      try {
        const r = await undoHabitTickAction(h.id, day);
        setHabitTicks({ today: { ...ticks.today, [h.id]: r.extra } });
      } catch {
        setHabitTicks({ today: { ...ticks.today, [h.id]: extra } });
        setError("Couldn't undo that.");
      }
    });
  }

  function toggle(h: RiteView, undo = false) {
    if (!day) return;
    // Already done and it counts every tick: this is one more.
    if (!undo && done(h.id) && isMany(h.id)) return tickAgain(h);
    const next = !done(h.id);
    if (next && isMany(h.id)) celebrateTick(h, h.xp_value, h.coin_value ?? coinsForXp(h.xp_value), 1);
    setError(null);
    setOptimistic((o) => ({ ...o, [h.id]: next }));
    if (next && h.xp_value > 0 && !isMany(h.id)) {
      setPop({ id: h.id, xp: h.xp_value });
      setTimeout(() => setPop((p) => (p?.id === h.id ? null : p)), 1400);
    }
    // The habit done doesn't mean every sub-habit was (owner, Nov 2): they keep their own ticks.
    startTransition(async () => {
      try {
        // Done and undone share one key, so only the latest waits when offline.
        if (next) {
          const out = await saveOrQueue("completeRite", { id: h.id, day }, `rite:${h.id}:${day}`);
          // "How do you feel?" (owner, Nov 19), once it's saved.
          // Its completion screen, with "How do you feel?" like the other celebrations (owner, Nov 19).
          if (!out.queued) celebrateProgress({ title: h.title, xp: h.xp_value ?? 0, fromPct: 0, toPct: 100, heading: "Habit kept!", barCaption: "Done for today", felt: { kind: "habit", riteId: h.id, day } });
        }
        else {
          await saveOrQueue("uncompleteRite", { id: h.id, day }, `rite:${h.id}:${day}`);
        }
      } catch (e) {
        setOptimistic((o) => ({ ...o, [h.id]: !next }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  /** Tick one sub-habit; the last required tick completes the habit. */
  function tickStep(h: RiteView, stepId: string) {
    if (!day) return;
    const on = !ticked(h, stepId);
    const subs = subsOf(h);
    const after = new Map(subs.map((st) => [st.id, st.id === stepId ? on : ticked(h, st.id)]));
    const wasDone = done(h.id);
    // Only the required sub-habits finish it (owner, Nov 14); with none required, ticks leave it as it was.
    const all = stepsComplete(subs, (id) => !!after.get(id)) ?? wasDone;
    setError(null);
    setStepOpt((o) => ({ ...o, ...Object.fromEntries(subs.map((st) => [`${h.id}|${st.id}`, after.get(st.id)!])) }));
    if (all !== wasDone) {
      setOptimistic((o) => ({ ...o, [h.id]: all }));
      if (all && h.xp_value > 0) {
        setPop({ id: h.id, xp: h.xp_value });
        setTimeout(() => setPop((p) => (p?.id === h.id ? null : p)), 1400);
      }
    }
    startTransition(async () => {
      try {
        await saveOrQueue("tickStep", { id: h.id, stepId, day, on }, `step:${h.id}:${stepId}:${day}`);
      } catch (e) {
        setStepOpt((o) => ({ ...o, [`${h.id}|${stepId}`]: !on }));
        setOptimistic((o) => ({ ...o, [h.id]: wasDone }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  return (
    (bare || additional) && todays.length === 0 ? null : (
    <section className="flex flex-col" data-habits-in-today={bare ? "" : undefined}>
      {!bare && (
      <div ref={headerBox} className="group relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-tour={additional ? undefined : "daily-habits"}
        // Open, the header and its tray read as one section: one border around both.
        className={`drawer-header relative flex min-h-[58px] w-full flex-col items-center justify-center overflow-hidden px-12 py-2.5 transition-[border-radius] duration-200 ${open ? "rounded-t-2xl" : "rounded-2xl"}`}
        style={
          isAdventure
            ? {
                background: "linear-gradient(180deg, #3a3524 0%, #2b281b 55%, #221f15 100%)",
                border: "2px solid #8d7642",
                borderBottomColor: open ? "transparent" : "#8d7642",
                boxShadow: open ? "inset 0 0 0 1px rgba(242,210,126,.18), inset 0 1px 0 rgba(255,235,180,.16)" : "inset 0 0 0 1px rgba(242,210,126,.18), inset 0 1px 0 rgba(255,235,180,.16), inset 0 -8px 16px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.35)",
              }
            : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }
        }
      >
        <span className={`flex items-center gap-3 ${isAdventure ? "font-display text-[21px]" : "text-sm font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
          {/* A + (as the mark, or before the title) is its own button, laid over this spot. */}
          {additional ? (
            <>
              <HabitIcon mark={mark === "plus" ? "seedling" : mark} />
              Additional Habits
              <span className="text-[15px]" style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)", fontWeight: 400 }}>
                ({todays.length})
              </span>
            </>
          ) : (
            <>
              {plusFirst || mark === "plus" ? <span ref={plusSpot} aria-hidden className="inline-block h-[30px] w-[30px]" /> : <HabitIcon mark={mark} />}
              {plusFirst && mark !== "plus" && <HabitIcon mark={mark} />}
              Daily Habits
            </>
          )}
        </span>
        {!additional && <HeaderAdornment look={look} habits={todays.map((h) => ({ title: h.title, done: done(h.id) }))} isAdventure={isAdventure} />}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="absolute right-5 top-1/2 -translate-y-1/2 transition-transform duration-300" style={{ transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)" }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke={isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {!additional && (plusFirst || mark === "plus") && plusAt && <PlusOverTitle at={plusAt} onClick={() => setEditing("new")} isAdventure={isAdventure} />}
      {/* How the header shows the day's progress. */}
      {!additional && (
      <button
        type="button"
        data-habit-look
        onClick={() => setLookMenu((v) => !v)}
        aria-label="How the Daily Habits header looks"
        aria-expanded={lookMenu}
        title="Habit display settings"
        // The app's one gear, on the header's top-right corner: shows when the header is hovered
        // (or focused, or its menu is open); on touch screens it stays, faintly.
        className={`absolute -right-1.5 -top-2.5 z-[5] flex h-8 w-8 items-center justify-center rounded-full transition-opacity duration-200 focus-visible:opacity-100 group-hover:opacity-100 ${lookMenu ? "opacity-100" : "opacity-0 [@media(hover:none)]:opacity-50"}`}
        style={
          isAdventure
            ? { color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }
            : { color: "var(--t-ink-soft)", background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 2px 6px rgba(0,0,0,.15)" }
        }
      >
        <GearIcon size={17} />
      </button>
      )}
      {!additional && lookMenu && (
        <div data-habit-look role="radiogroup" aria-label="Header style" className="card-pop-in parchment absolute right-0 top-full z-40 mt-3 flex w-[290px] flex-col gap-1 rounded-xl p-2" style={{ borderRadius: 12, boxShadow: "0 12px 28px rgba(0,0,0,.4)" }}>
          <p className="relative z-[1] m-0 px-1.5 pb-0.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
            The mark
          </p>
          <div className="relative z-[1] flex gap-1 px-1 pb-1.5">
            {MARKS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => chooseMark(m.key)}
                aria-pressed={mark === m.key}
                title={m.label}
                aria-label={m.label}
                className="flex h-10 flex-1 items-center justify-center rounded-lg"
                style={{ background: "linear-gradient(180deg,#3a3524,#221f15)", boxShadow: mark === m.key ? "0 0 0 2px #d9b45f" : "inset 0 0 0 1px rgba(139,112,64,.4)" }}
              >
                <HabitIcon mark={m.key} />
              </button>
            ))}
          </div>
          <label className="relative z-[1] flex min-h-9 cursor-pointer items-center gap-2 px-1.5 pb-1 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--t-gold-deep)]"
              checked={plusFirst}
              onChange={(e) => {
                setPlusFirst(e.target.checked);
                try {
                  localStorage.setItem(PLUS_KEY, e.target.checked ? "1" : "0");
                } catch {}
              }}
            />
            A + before the title, to add a habit
          </label>
          <p className="relative z-[1] m-0 px-1.5 pb-0.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
            Header style
          </p>
          {LOOKS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={look === l.key}
              onClick={() => chooseLook(l.key)}
              className="relative z-[1] flex flex-col items-stretch gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-black/5"
              style={look === l.key ? { background: "rgba(217,180,95,.35)", boxShadow: "inset 0 0 0 1.5px #a88a3f" } : undefined}
            >
              <span className="text-[14px] font-semibold" style={{ color: "var(--t-ink)" }}>
                {l.label} <span className="text-[12px] font-normal" style={{ color: "var(--t-ink-soft)" }}>· {l.hint}</span>
              </span>
              <span className="relative flex min-h-7 items-center justify-center overflow-hidden rounded-md px-2 py-1" style={{ background: "linear-gradient(180deg,#3a3524,#221f15)" }}>
                {l.key === "plain" ? (
                  <span className="font-display text-[14px]" style={{ color: "var(--t-cream)" }}>Daily Habits</span>
                ) : (
                  <HeaderAdornment look={l.key} habits={SAMPLE} isAdventure />
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      </div>
      )}

      <div className={bare ? "" : "drawer-body"} data-open={open || bare ? "true" : "false"}>
        <div className={bare ? "" : "drawer-inner"}>
          {/* Joined to the header: the same border runs down its sides and round its bottom. */}
          <div
            className={bare ? "" : "rounded-b-2xl px-2.5 pb-3 pt-3.5"}
            style={bare ? undefined : {
              // A deep green velvet tray, lit softly from the middle.
              // It starts in the header's own colour, so bar and tray read as one piece (no line between).
              background: isAdventure ? "linear-gradient(180deg, #221f15, rgba(34,31,21,0) 36px), radial-gradient(120% 80% at 50% 20%, rgba(74,92,58,.5), rgba(24,32,20,.85) 70%), linear-gradient(180deg, #232c1e, #161c13)" : "var(--t-bg)",
              border: isAdventure ? "2px solid #8d7642" : "1px solid var(--t-card-border)",
              borderTop: "none",
              boxShadow: "inset 0 -6px 10px -6px rgba(0,0,0,.55)",
            }}
          >
          {error && (
            <p className="m-0 px-2 pb-1 text-[13.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <DndContext id={bare ? "dnd-DailyHabits-today" : additional ? "dnd-DailyHabits-more" : "dnd-DailyHabits"} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={todays.map((h) => h.id)} strategy={verticalListSortingStrategy}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {todays.map((h) => {
              const d = done(h.id);
              const s = streak(h);
              return (
                <SortableHabit key={h.id} id={h.id} disabled={(!open && !bare) || additional} raised={menuFor === h.id || confirmSkip === h.id}>
                {/* Swipe left for "Snooze for today" (owner, Nov 2). */}
                <SwipeReveal side="right" label="Snooze today" icon={<SnoozeIcon size={18} />} background="linear-gradient(180deg,#5b6b8a,#3f4c66)" onAction={() => snooze(h, true)} disabled={d || additional}>
                <div
                  // The cleaning habit's whole card opens and closes its tray (not only its title).
                  onClick={(e) => {
                    if ((e.target as Element).closest("button,input,textarea,a,[role=menu]")) return;
                    cardTap(h);
                  }}
                  onContextMenu={(e) => {
                    if ((e.target as Element).closest("input,textarea,a")) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    placeMenu(r);
                    setMenuFor(h.id);
                  }}
                  className={`habit-row relative flex flex-wrap items-center gap-x-3 rounded-2xl px-3 py-2 ${isAdventure ? "parchment" : ""}`}
                  // Done: no crossed-out name; the whole card turns a little green (owner, Nov 12).
                  data-done={d ? "" : undefined}
                  // A gilded edge and a soft shadow, so each habit sits on the velvet like a card.
                  style={isAdventure ? { borderRadius: 16, boxShadow: isCore(h.id) ? "0 0 0 2px #d9b45f, 0 0 0 3.5px rgba(60,44,16,.6), 0 0 12px rgba(242,210,126,.35), 0 4px 10px rgba(0,0,0,.4)" : "0 0 0 1.5px #b39a6a, 0 0 0 3px rgba(60,44,16,.55), 0 4px 10px rgba(0,0,0,.4)" } : { background: "var(--t-card)", border: isCore(h.id) ? "1.5px solid var(--t-gold)" : "1px solid var(--t-card-border)" }}
                >
                  {h.icon_key ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={d}
                      aria-label={d ? (isMany(h.id) ? `Done again: ${h.title}` : `Undo ${h.title}`) : `Done: ${h.title}`}
                      title={d && isMany(h.id) ? "Tick again each time you do it" : undefined}
                      onClick={() => toggle(h)}
                      className="relative z-[1] h-11 w-11 shrink-0 rounded-full transition-transform active:scale-90"
                      style={{ boxShadow: d ? "0 0 0 2.5px #58a04a" : "0 0 0 2px #a58c66" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- habit portrait */}
                      <img src={h.icon_key} alt="" className="h-full w-full rounded-full object-cover" style={{ filter: d ? "saturate(.55) brightness(.92)" : undefined }} />
                      {d && (
                        <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)", border: "1.5px solid #fff6e0" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={d}
                      aria-label={d ? (isMany(h.id) ? `Done again: ${h.title}` : `Undo ${h.title}`) : `Done: ${h.title}`}
                      title={d && isMany(h.id) ? "Tick again each time you do it" : undefined}
                      onClick={() => toggle(h)}
                      className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
                      style={{
                        background: d ? "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)" : "radial-gradient(circle at 40% 35%, #fffaf0, #efe2c2)",
                        border: `2px solid ${d ? "#2f5a26" : "#b08a3a"}`,
                        boxShadow: d ? "0 0 8px rgba(120,190,90,.55)" : "inset 0 1px 2px rgba(90,60,20,.25), 0 0 0 1px rgba(255,240,200,.6)",
                      }}
                    >
                      {d && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cardTap(h)}
                    aria-expanded={h.id === cleanId && cleaning ? cleanOpen : undefined}
                    className="relative z-[1] min-w-0 flex-1 text-left"
                    title={h.id === cleanId && cleaning ? "Today's pick, your spaces, laundry and chores" : subsOf(h).length ? "Show its sub-habits" : "Edit habit (or ⋯ / right-click)"}
                  >
                    <span
                      className="block text-[16px] font-semibold leading-snug"
                      style={{ color: "var(--t-ink)" }}
                    >
                      {isCore(h.id) && (
                        <span aria-label="Core habit" title="Core habit: always in the day's plan" className="mr-1" style={{ color: "#b8860b" }}>
                          ★
                        </span>
                      )}
                      {/* A habit with sub-habits: a small caret after its name opens them in place (owner, Nov 18: idea D). The cleaning habit has none. */}
                      {h.id !== cleanId && subsOf(h).length > 0 ? (
                        // The caret stays with the name's last word, so it never sits alone on a line.
                        <>
                          {h.title.replace(/\S+$/, "")}
                          <span className="whitespace-nowrap">
                            {h.title.match(/\S+$/)?.[0]}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-1.5 inline-block align-middle opacity-60 transition-transform duration-300" style={{ transform: openSubs.has(h.id) ? "rotate(180deg)" : undefined }}>
                              <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </>
                      ) : (
                        h.title
                      )}
                      {h.id === cleanId && cleaning && (
                        <>
                          {cleanTop ? ": " : ""}
                          {cleanTop && (
                            <span className="md:ml-1.5" style={{ color: "#7a5410" }}>
                              {cleanTop.icon} {cleanTop.name}
                            </span>
                          )}
                        </>
                      )}
                      {/* Something to listen to, in the title's line like the cleaning area (owner, Nov 16). */}
                      {listenHref && !d && LISTEN_HABIT.test(h.title) && " "}
                      {listenHref && !d && LISTEN_HABIT.test(h.title) && (
                        <span
                          role="link"
                          tabIndex={0}
                          data-listen-link
                          title="Something to listen to"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => (e.stopPropagation(), window.location.assign(listenHref))}
                          onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), window.location.assign(listenHref))}
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap align-baseline text-[14px] md:ml-2.5 font-semibold underline-offset-2 hover:underline"
                          style={{ color: "#7a5410" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
                            <rect x="3" y="14" width="4.5" height="6.5" rx="1.6" />
                            <rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6" />
                          </svg>
                          Listen
                        </span>
                      )}
                    </span>
                    {/* How long it takes sits by the XP (owner, Nov 2); this line only when there's a time of day or a note. */}
                    {(() => {
                      // How many sub-habits, under the name with its time and note (owner, Nov 18): "3 habits"; once one is
                      // ticked, "2 of 3 left" with the quest cards' gold bar; then "✓ all done". The cleaning habit has none.
                      const subs = h.id === cleanId ? [] : subsOf(h);
                      const n = subs.filter((st) => ticked(h, st.id)).length;
                      const count = !subs.length ? "" : n >= subs.length ? "✓ all done" : n === 0 ? `${subs.length} habit${subs.length === 1 ? "" : "s"}` : `${subs.length - n} of ${subs.length} left`;
                      // Not up today: when it's next due, or that it was done today anyway.
                      const rest = additional ? (d ? "Done today" : nextLabel(h, day)) : [timesToday(h.id, d) > 1 ? `Done ${timesToday(h.id, d)} times today` : null, scheduleLabel(h), h.description].filter(Boolean).join(" · ");
                      if (!count && !rest) return null;
                      return (
                        <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                          {count && <span className="tabular-nums">{count}</span>}
                          {n > 0 && n < subs.length && (
                            <span
                              aria-hidden
                              className="h-1.5 w-14 overflow-hidden rounded-full"
                              style={{ background: isAdventure ? "#2a2416" : "var(--t-card-border)", border: isAdventure ? "1px solid #8a6c2c" : undefined, boxShadow: isAdventure ? "inset 0 1px 2px rgba(0,0,0,.5)" : undefined }}
                            >
                              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round((n / subs.length) * 100)}%`, background: isAdventure ? "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" : "var(--t-accent)" }} />
                            </span>
                          )}
                          {count && rest && <span aria-hidden>·</span>}
                          {rest && <span>{rest}</span>}
                        </span>
                      );
                    })()}
                  </button>
                  <span className="relative z-[1] flex shrink-0 flex-col items-end gap-0.5">
                    {h.estimate_minutes ? (
                      <span className="flex items-center gap-1 text-[12.5px] font-semibold tabular-nums leading-none" style={{ color: "var(--t-ink-soft)" }} title={`About ${h.estimate_minutes} minutes`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- the quest cards' clock */}
                        <img src="/design/ui-clock.png" alt="" width={13} height={13} />
                        {h.estimate_minutes < 60 ? `${h.estimate_minutes}m` : `${Math.floor(h.estimate_minutes / 60)}h${h.estimate_minutes % 60 ? ` ${h.estimate_minutes % 60}m` : ""}`}
                      </span>
                    ) : null}
                    <span className="flex items-center gap-1.5 text-[15px] font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
                      +{h.xp_value} XP
                      {(h.coin_value ?? coinsForXp(h.xp_value)) > 0 && (
                        <span className="flex items-center gap-0.5 text-[13.5px]" style={{ color: "#8a6116" }} title={`${h.coin_value ?? coinsForXp(h.xp_value)} coins`}>
                          <CoinIcon size={14} />
                          {h.coin_value ?? coinsForXp(h.xp_value)}
                        </span>
                      )}
                    </span>
                    {s > 0 && (
                      <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: isAdventure ? "#8a4b12" : "var(--t-clay)" }} title={`${s}-day streak`}>
                        🔥 {s}
                      </span>
                    )}
                  </span>
                  {(
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        // Near the bottom of the screen the menu opens upward so it isn't cut off.
                        const r = e.currentTarget.getBoundingClientRect();
                        placeMenu(r);
                        setMenuFor(menuFor === h.id ? null : h.id);
                      }}
                      data-habit-menu
                      aria-label={`More for ${h.title}`}
                      aria-expanded={menuFor === h.id}
                      className="relative z-[1] -mr-1 flex h-8 w-7 shrink-0 items-center justify-center rounded-full text-[18px] leading-none"
                      style={{ color: "var(--t-ink-soft)" }}
                    >
                      ⋯
                    </button>
                  )}
                  {menuFor === h.id && (
                    <div data-habit-menu data-menu="habit" role="menu" className={`card-pop-in absolute right-2 z-30 flex flex-col overflow-y-auto overflow-x-hidden rounded-xl parchment ${menuUp ? "bottom-full mb-1" : "top-full mt-1"}`} style={{ maxHeight: menuMax, borderRadius: 12, minWidth: 190 }}>
                      <button
                        type="button"
                        role="menuitem"
                        data-mi="edit"
                        onClick={() => {
                          setMenuFor(null);
                          setEditing(h);
                        }}
                        className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5"
                      >
                        <span aria-hidden className="w-[18px] text-center">✎</span> Edit habit
                      </button>
                      {d && day && <DoneTime riteId={h.id} day={day} onDone={() => setMenuFor(null)} />}
                      <button
                        type="button"
                        role="menuitem"
                        data-mi="sub"
                        onClick={() => {
                          setMenuFor(null);
                          setEditSub(true);
                          setEditing(h);
                        }}
                        className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5"
                        style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
                      >
                        <span aria-hidden className="flex w-[18px] justify-center">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none" style={{ border: "1.5px solid #8a6c2c" }}>+</span>
                        </span>
                        Add a sub-habit
                      </button>
                      <button
                        role="menuitem"
                        data-mi="focus"
                        style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          setFocusing(h);
                        }}
                        className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5"
                      >
                        <FocusGlyph /> Focus mode
                        {h.estimate_minutes ? (
                          <span className="ml-auto text-[13px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                            {h.estimate_minutes}m
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        data-mi="core"
                        onClick={() => toggleCore(h)}
                        className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5"
                        style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
                      >
                        <span aria-hidden className="w-[18px] text-center" style={{ color: "#b8860b" }}>
                          {isCore(h.id) ? "☆" : "★"}
                        </span>
                        {isCore(h.id) ? "Not a core habit" : "Make it a core habit"}
                      </button>
                      {isMany(h.id) && d && (
                        <button type="button" role="menuitem" data-mi="undo-tick" onClick={() => (setMenuFor(null), undoTick(h))} className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5" style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}>
                          <span aria-hidden className="w-[18px] text-center">↶</span>
                          Undo the last one
                        </button>
                      )}
                      <button type="button" role="menuitem" data-mi="many" onClick={() => (setMenuFor(null), toggleMany(h))} className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5" style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}>
                        <span aria-hidden className="w-[18px] text-center text-[13px] font-bold">×N</span>
                        {isMany(h.id) ? "Once a day is enough" : "Count every time I do it"}
                      </button>
                      {/* No "Skip today": Snooze does the same (owner, Nov 2). */}
                      <button
                        type="button"
                        onClick={() => snooze(h, true)}
                        className="relative z-[1] min-h-11 px-4 text-left text-[15px] hover:bg-black/5"
                        style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
                      >
                        <span className="flex items-center gap-2"><SnoozeIcon /> Snooze until tomorrow</span>
                      </button>
                    </div>
                  )}
                  {confirmSkip === h.id && (
                    <div role="alertdialog" aria-label="Skip and lose your streak?" className="card-pop-in absolute inset-x-2 top-full z-20 mt-1 flex flex-col gap-2 rounded-xl p-3 parchment" style={{ borderRadius: 12 }}>
                      <p className="relative z-[1] m-0 text-[14.5px] leading-snug" style={{ color: "var(--t-ink)" }}>
                        Skip <b>{h.title}</b> today? Your 🔥 {s}-day streak will end.
                      </p>
                      <div className="relative z-[1] flex justify-end gap-2">
                        <button type="button" onClick={() => setConfirmSkip(null)} className="h-9 rounded-full px-4 text-[14px] font-semibold" style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}>
                          Keep my streak
                        </button>
                        <button type="button" onClick={() => setSkip(h, true)} className="h-9 rounded-full px-3 text-[14px] underline" style={{ color: "var(--t-ink-soft)" }}>
                          Skip anyway
                        </button>
                      </div>
                    </div>
                  )}
                  {pop?.id === h.id && (
                    <span aria-hidden className="power-spark pointer-events-none absolute left-1/2 top-0 z-[2] text-[16px] font-bold" style={{ color: "var(--t-xp)" }}>
                      +{pop.xp} XP
                    </span>
                  )}
                  {subsOf(h).length > 0 && openSubs.has(h.id) && (
                    <ul className="due-in relative z-[1] m-0 mt-1 flex w-full basis-full list-none flex-col gap-0.5 pb-0.5 pl-12">
                      {subsOf(h).map((st) => {
                        const t = ticked(h, st.id);
                        const sk = `${h.id}:${st.id}`;
                        return (
                          <li
                            key={st.id}
                            // Its own small menu (owner, Nov 3): right-click a sub-habit.
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSubMenu((m) => (m === sk ? null : sk));
                            }}
                            className="relative"
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={t}
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={() => tickStep(h, st.id)}
                              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-1.5 text-left hover:bg-black/[.04]"
                            >
                              <span
                                aria-hidden
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
                                style={{ background: t ? "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)" : "rgba(255,250,238,.6)", border: `2px solid ${t ? "#2f5a26" : "#a58c66"}` }}
                              >
                                {t && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <span className="min-w-0 flex-1 text-[15px] leading-snug" style={{ color: "var(--t-ink)" }}>
                                {st.title}
                                {st.optional && (
                                  <span className="ml-1.5 text-[12px] italic" style={{ color: "var(--t-ink-soft)" }}>
                                    optional
                                  </span>
                                )}
                              </span>
                              {(st.xp || st.coins) && (
                                <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "var(--t-xp, #4f7d38)" }}>
                                  {st.xp ? `+${st.xp} XP` : ""}
                                  {st.coins ? ` · ${st.coins}🪙` : ""}
                                </span>
                              )}
                            </button>
                            {subMenu === sk && (
                              <span role="menu" className="card-pop-in absolute right-1 top-full z-[5] flex flex-col rounded-xl p-1 shadow-xl" style={{ background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", border: "1px solid #a88a3f" }} onMouseDown={(e) => e.stopPropagation()}>
                                <button type="button" role="menuitem" onClick={() => (setSubMenu(null), tickStep(h, st.id))} className="h-9 rounded-lg px-3 text-left text-[13.5px] font-semibold hover:bg-black/[.05]" style={{ color: "#2a1c10" }}>
                                  {t ? "Untick it" : "Tick it"}
                                </button>
                                <button type="button" role="menuitem" onClick={() => (setSubMenu(null), setEditing(h))} className="h-9 rounded-lg px-3 text-left text-[13.5px] font-semibold hover:bg-black/[.05]" style={{ color: "#2a1c10" }}>
                                  Edit sub-habits, XP and coins…
                                </button>
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                </SwipeReveal>
                {cleaning && day && h.id === cleanId && <CleaningCheckIn key={day} initial={cleaning} day={day} habitDone={d} isAdventure={isAdventure} open={cleanOpen} />}
                </SortableHabit>
              );
            })}
          </ul>
          </SortableContext>
          </DndContext>
          {!bare && plannedHere && (
            <p className="m-0 px-2 pt-1 text-center text-[13px] italic" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.8 }}>
              {todays.length ? "Today’s chosen habits are in Today’s Quests." : "Today’s habits are all in Today’s Quests ✦"}
            </p>
          )}
          {!bare && !additional && (<>
          {skippedToday.length > 0 && (
            <p className="m-0 px-2 pt-2 text-center text-[13.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.85 }}>
              {skippedToday.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && " · "}
                  {h.title} resting today{" "}
                  <button type="button" onClick={() => setSkip(h, false)} className="underline">
                    undo
                  </button>
                </span>
              ))}
            </p>
          )}
          {snoozedToday.length > 0 && (
            <p className="m-0 px-2 pt-2 text-center text-[13.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.85 }}>
              {snoozedToday.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && " · "}
                  {h.title} snoozed until tomorrow{" "}
                  <button type="button" onClick={() => snooze(h, false)} className="underline">
                    undo
                  </button>
                </span>
              ))}
            </p>
          )}
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            <li>
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="habit-add hover-glow mx-auto flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[14.5px]"
                style={
                  isAdventure
                    ? { background: "linear-gradient(180deg, rgba(58,53,36,.85), rgba(34,31,21,.85))", border: "1px solid rgba(217,180,95,.45)", color: "var(--t-cream)", boxShadow: "inset 0 1px 0 rgba(255,235,180,.12)" }
                    : { border: "1px solid var(--t-card-border)", background: "var(--t-card)", color: "var(--t-ink-soft)" }
                }
              >
                <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full text-[14px] leading-none" style={{ border: "1.5px solid var(--t-gold)", color: "var(--t-gold)" }}>
                  +
                </span>
                Add a habit
              </button>
            </li>
          </ul>
          </>)}
          </div>
        </div>
      </div>

      {editing && (
        <RiteEditorDialog
          rite={editing === "new" ? undefined : editing}
          slot="day"
          startWithSub={editSub}
          extraSubs={
            editing !== "new" && editing.id === cleanId && cleaning ? (
              <CleaningParts
                cleaning={cleaning}
                onOpen={() => {
                  setEditing(null);
                  setEditSub(false);
                  setCleanOpen(true);
                }}
              />
            ) : undefined
          }
          onClose={() => {
            setEditing(null);
            setEditSub(false);
          }}
        />
      )}
      {focusTask && <FocusMode task={focusTask} theme={theme} onClose={() => setFocusing(null)} />}
    </section>
    )
  );
}

/** A habit row that can be pressed and dragged to reorder (mouse after a short move, touch after a short hold). */
function SortableHabit({ id, disabled = false, raised = false, children }: { id: string; disabled?: boolean; raised?: boolean; children: React.ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="board-sortable touch-manipulation"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: "relative", zIndex: raised || isDragging ? 30 : undefined }}
    >
      {children}
    </li>
  );
}

function localKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLURAL_DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "Tuesdays · by 5:30 PM", "Mon, Wed, Fri", "by 9:00 AM". */
function scheduleLabel(h: RiteView): string | null {
  const parts: string[] = [];
  if (h.days && h.days.length > 0 && h.days.length < 7) {
    parts.push(h.days.length === 1 ? PLURAL_DAYS[h.days[0]] : h.days.map((d) => DAY_NAMES[d]).join(", "));
  }
  const clock = (t: string) => {
    const [hh, mm] = t.split(":").map(Number);
    return `${((hh + 11) % 12) + 1}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`;
  };
  if (h.due_time && h.window_to) parts.push(`${clock(h.due_time)}–${clock(h.window_to)}`);
  else if (h.due_time) parts.push(`at ${clock(h.due_time)}`);
  else if (h.window_to) parts.push(`before ${clock(h.window_to)}`);
  return parts.length ? parts.join(" · ") : null;
}

/** A target: focus mode. */
function FocusGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#7a5f2a" }}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

type HabitMark = "seedling" | "check" | "sun" | "leaf" | "plus";
const MARK_KEY = "habits-header-mark";
const SNOOZE_KEY = "habit-snooze";

/** When a habit not up today comes next: "Every year · next Mar 3" or "Mondays, Thursdays". */
function nextLabel(h: RiteView, day: string | null) {
  if (h.repeat && day) {
    const next = nextOccurrence(h.repeat, day);
    return `${repeatLabel(h.repeat)} · next ${new Date(`${next}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: next.slice(0, 4) !== day.slice(0, 4) ? "numeric" : undefined })}`;
  }
  return scheduleLabel(h) ?? "Not scheduled";
}
const PLUS_KEY = "habits-header-plus";
const MARKS: { key: HabitMark; label: string }[] = [
  { key: "seedling", label: "A seedling" },
  { key: "check", label: "A turning checkmark" },
  { key: "sun", label: "A rising sun" },
  { key: "leaf", label: "A leaf" },
  { key: "plus", label: "A plus (tap it to add a habit)" },
];

/** The mark beside "Daily Habits": a seedling by default (more in its display settings). */
/** The header's +: a little gilded button laid over the spot before the title. Adds a habit. */
function PlusOverTitle({ at, onClick, isAdventure }: { at: { left: number; top: number }; onClick: () => void; isAdventure: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add a habit"
      title="Add a habit"
      className="absolute z-[4] flex h-[30px] w-[30px] items-center justify-center rounded-full transition-transform hover:scale-110"
      style={{ left: at.left, top: at.top, color: "var(--t-gold)", border: "1.5px solid var(--t-gold)", background: isAdventure ? "rgba(20,18,10,.4)" : "transparent" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function HabitIcon({ mark = "seedling" }: { mark?: HabitMark }) {
  if (mark === "plus")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="var(--t-gold)" strokeWidth="1.8" />
        <path d="M12 7.5v9M7.5 12h9" stroke="var(--t-gold)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  if (mark === "check")
    return (
      // The loop turns clockwise, the way days come round.
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3.5a8.5 8.5 0 1 0 8.1 6" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" />
        <path d="M20.8 4.8l-.8 4.9-4.8-1.1" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 12.4l2.4 2.4 4.6-5" stroke="#8fc46a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (mark === "sun")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 17a7 7 0 0 1 14 0" fill="rgba(242,210,126,.25)" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 5v2.5M4.6 9.2l1.8 1.5M19.4 9.2l-1.8 1.5M3 17h18" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (mark === "leaf")
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" fill="rgba(143,196,106,.3)" stroke="#8fc46a" strokeWidth="1.9" strokeLinejoin="round" />
        <path d="M5 19c3-4 6-7 10-9" stroke="var(--t-gold)" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21v-9" stroke="#8fc46a" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13c0-4-3-6.5-7-6.5 0 4 3 6.5 7 6.5z" fill="rgba(143,196,106,.35)" stroke="#8fc46a" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 11c0-4 3-7 7.5-7 0 4.5-3 7-7.5 7z" fill="rgba(143,196,106,.35)" stroke="#8fc46a" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 21h10" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type HeaderLook = "togo" | "next" | "wins" | "glow" | "plain";
const LOOK_KEY = "habits-header-look";
const LOOKS: { key: HeaderLook; label: string; hint: string }[] = [
  { key: "togo", label: "Still to tend", hint: "how many are ready for you, not how many are missing" },
  { key: "next", label: "Next up", hint: "names the habit to do next" },
  { key: "wins", label: "Wins", hint: "counts only what you've done" },
  { key: "glow", label: "Rising glow", hint: "a gold line fills along the bottom" },
  { key: "plain", label: "Just the title", hint: "nothing extra" },
];
const SAMPLE = [
  { title: "Chester care", done: true },
  { title: "Stretch", done: false },
  { title: "Water the plants", done: false },
];

/** What the closed header says about today's habits, in the chosen style (never "0 of 3"). */
function HeaderAdornment({ look, habits, isAdventure }: { look: HeaderLook; habits: { title: string; done: boolean }[]; isAdventure: boolean }) {
  if (!habits.length || look === "plain") return null;
  const n = habits.filter((h) => h.done).length;
  const all = n === habits.length;
  const soft = isAdventure ? "rgba(246,236,210,.72)" : "var(--t-ink-soft)";
  const gold = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  if (look === "togo") {
    const left = habits.length - n;
    return (
      <span className="mt-0.5 text-[13px]" style={{ color: all ? gold : soft, fontWeight: all ? 600 : 400 }}>
        {all ? "✦ all tended today" : n ? `✦ ${n} done · ${left} more to tend` : `${left} ready for you today`}
      </span>
    );
  }
  if (look === "next") {
    const next = habits.find((h) => !h.done);
    return (
      <span className="mt-0.5 max-w-full truncate text-[13px] italic" style={{ color: soft }}>
        {next ? <>next: {next.title}</> : <span style={{ color: gold, fontStyle: "normal", fontWeight: 600 }}>✦ all done today</span>}
      </span>
    );
  }
  if (look === "wins")
    return (
      <span className="mt-0.5 text-[13px]" style={{ color: n ? gold : soft, fontWeight: n ? 600 : 400 }}>
        {all ? "✦ all done today" : n ? `✦ ${n} done` : "ready when you are"}
      </span>
    );
  // glow: a line of light along the bottom edge
  return (
    <span aria-label={all ? "All done today" : `${n} done today`} className="pointer-events-none absolute inset-x-0 bottom-0 block h-[3px]">
      <span
        className="block h-full transition-[width] duration-700"
        style={{ width: `${(n / habits.length) * 100}%`, background: "linear-gradient(90deg, rgba(242,210,126,.25), #f2d27e)", boxShadow: n ? "0 0 8px rgba(242,210,126,.8)" : undefined }}
      />
    </span>
  );
}

/**
 * The cleaning habit's own parts in its editor (owner, Nov 3: "the cleaning habit's sub-habits are missing"):
 * its spaces, chores and laundry, as they stand in the mess check-in, with a way to open it to change them.
 */
function CleaningParts({ cleaning, onOpen }: { cleaning: NonNullable<ReturnType<typeof normalizeCleaning>>; onOpen: () => void }) {
  const parts = [...cleaning.spaces.map((s) => ({ id: s.id, icon: s.icon, name: s.name })), { id: "laundry", icon: "🧺", name: "Laundry" }, ...cleaning.chores.map((c) => ({ id: c.id, icon: c.icon, name: c.name }))];
  return (
    <div className="flex flex-col gap-1.5 rounded-xl px-2.5 py-2" style={{ background: "rgba(168,138,63,.1)", border: "1px solid rgba(168,138,63,.35)" }}>
      <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        Spaces and chores (from the mess check-in)
      </span>
      <div className="flex flex-wrap gap-1">
        {parts.map((p) => (
          <span key={p.id} className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px]" style={{ background: "rgba(255,250,238,.8)", border: "1px solid rgba(168,138,63,.45)", color: "#2a1c10" }}>
            <span aria-hidden>{p.icon}</span>
            {p.name}
          </span>
        ))}
      </div>
      <button type="button" onClick={onOpen} className="self-start text-[13px] font-semibold underline underline-offset-2" style={{ color: "#6b4a12" }}>
        Change them in the mess check-in ›
      </button>
    </div>
  );
}

/** A done habit's time, changed after the fact: time wheels in its menu (owner, Nov 9). */
function DoneTime({ riteId, day, onDone }: { riteId: string; day: string; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}>
      <button type="button" role="menuitem" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="relative z-[1] flex min-h-11 w-full items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5">
        <span aria-hidden className="w-[18px] text-center">◷</span> Change when it was done
      </button>
      <Fold open={open}>
        <div className="relative z-[1] flex flex-col items-center gap-2 px-3 pb-3">
          <TimeWheels value={mins} onChange={setMins} />
          {error && <span className="text-[12.5px]" style={{ color: "var(--t-warn)" }}>{error}</span>}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const [y, m, dd] = day.split("-").map(Number);
                const at = new Date(y, m - 1, dd, Math.floor(mins / 60), mins % 60);
                // The app's day runs to 5:30am: an early-morning time belongs to the next calendar day.
                if (mins < 330) at.setDate(at.getDate() + 1);
                try {
                  await setRiteDoneTimeAction(riteId, day, at.toISOString());
                  onDone();
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't change it.");
                }
              })
            }
            className="h-9 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-60"
            style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}
          >
            {pending ? "Saving…" : "Save time"}
          </button>
        </div>
      </Fold>
    </div>
  );
}
