"use client";

import { GearIcon } from "@/components/ui/Icons";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { completeRiteAction, reorderRitesAction, skipHabitAction, tickAllRiteStepsAction, tickRiteStepAction, uncompleteRiteAction, unskipHabitAction } from "@/app/actions";
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

/**
 * Daily habits: small repeating quests on the day side (stored like evening
 * rites, in the "day" slot). Tick each one once a day for its XP and coins;
 * its avatar is a checkbox unless it has a portrait. The ⋯ menu opens focus
 * mode (with a timer) or skips it for today. Collapsible, open by default.
 */
export function DailyHabits({
  habits,
  completions,
  skips = [],
  stepChecks = [],
  cleaning: cleaningRaw = null,
  theme,
}: {
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
  const [open, setOpen] = useState(false);
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
  const [editSub, setEditSub] = useState(false);
  const [pop, setPop] = useState<{ id: string; xp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
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
  const ticked = (h: RiteView, stepId: string) => stepOpt[`${h.id}|${stepId}`] ?? (tickSet.has(`${h.id}|${stepId}|${day}`) || (done(h.id) && optimistic[h.id] === true));
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
  const todays = dueToday.filter((h) => !skipped(h.id) && !isSnoozed(h.id));
  const skippedToday = dueToday.filter((h) => skipped(h.id));
  const snoozedToday = dueToday.filter((h) => !skipped(h.id) && isSnoozed(h.id));
  const notToday = ordered.filter((h) => !dueToday.includes(h));
  const [showNotToday, setShowNotToday] = useState(false);

  /**
   * Days in a row this habit was done, counting only the days it's due.
   * Today counts once ticked; until then the streak carries on from
   * yesterday. A missed or skipped day ends it.
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
        if (isDone) n++;
        else if (isSkipped || i > 0) return n;
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

  function toggle(h: RiteView) {
    if (!day) return;
    const next = !done(h.id);
    setError(null);
    setOptimistic((o) => ({ ...o, [h.id]: next }));
    if (next && h.xp_value > 0) {
      setPop({ id: h.id, xp: h.xp_value });
      setTimeout(() => setPop((p) => (p?.id === h.id ? null : p)), 1400);
    }
    const subs = subsOf(h);
    if (subs.length) setStepOpt((o) => ({ ...o, ...Object.fromEntries(subs.map((st) => [`${h.id}|${st.id}`, next])) }));
    startTransition(async () => {
      try {
        if (subs.length) await tickAllRiteStepsAction(h.id, day, next);
        if (next) await completeRiteAction(h.id, day);
        else await uncompleteRiteAction(h.id, day);
      } catch (e) {
        setOptimistic((o) => ({ ...o, [h.id]: !next }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  /** Tick one sub-habit; the last tick completes the habit. */
  function tickStep(h: RiteView, stepId: string) {
    if (!day) return;
    const on = !ticked(h, stepId);
    const subs = subsOf(h);
    const after = new Map(subs.map((st) => [st.id, st.id === stepId ? on : ticked(h, st.id)]));
    const all = subs.every((st) => after.get(st.id));
    setError(null);
    setStepOpt((o) => ({ ...o, ...Object.fromEntries(subs.map((st) => [`${h.id}|${st.id}`, after.get(st.id)!])) }));
    const wasDone = done(h.id);
    if (all !== wasDone) {
      setOptimistic((o) => ({ ...o, [h.id]: all }));
      if (all && h.xp_value > 0) {
        setPop({ id: h.id, xp: h.xp_value });
        setTimeout(() => setPop((p) => (p?.id === h.id ? null : p)), 1400);
      }
    }
    startTransition(async () => {
      try {
        await tickRiteStepAction(h.id, stepId, day, on);
      } catch (e) {
        setStepOpt((o) => ({ ...o, [`${h.id}|${stepId}`]: !on }));
        setOptimistic((o) => ({ ...o, [h.id]: wasDone }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  return (
    <section className="flex flex-col">
      <div ref={headerBox} className="group relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        // Open, the header and its tray read as one section: one border around both.
        className={`drawer-header relative flex min-h-[58px] w-full flex-col items-center justify-center overflow-hidden px-12 py-2.5 transition-[border-radius] duration-200 ${open ? "rounded-t-2xl" : "rounded-2xl"}`}
        style={
          isAdventure
            ? {
                background: "linear-gradient(180deg, #3a3524 0%, #2b281b 55%, #221f15 100%)",
                border: "2px solid #8d7642",
                borderBottomColor: open ? "rgba(141,118,66,.45)" : "#8d7642",
                boxShadow: "inset 0 0 0 1px rgba(242,210,126,.18), inset 0 1px 0 rgba(255,235,180,.16), inset 0 -8px 16px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.35)",
              }
            : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }
        }
      >
        <span className={`flex items-center gap-3 ${isAdventure ? "font-display text-[21px]" : "text-sm font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
          {/* A + (as the mark, or before the title) is its own button, laid over this spot. */}
          {plusFirst || mark === "plus" ? <span ref={plusSpot} aria-hidden className="inline-block h-[30px] w-[30px]" /> : <HabitIcon mark={mark} />}
          {plusFirst && mark !== "plus" && <HabitIcon mark={mark} />}
          Daily Habits
        </span>
        <HeaderAdornment look={look} habits={todays.map((h) => ({ title: h.title, done: done(h.id) }))} isAdventure={isAdventure} />
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="absolute right-5 top-1/2 -translate-y-1/2 transition-transform duration-300" style={{ transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)" }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke={isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {(plusFirst || mark === "plus") && plusAt && <PlusOverTitle at={plusAt} onClick={() => setEditing("new")} isAdventure={isAdventure} />}
      {/* How the header shows the day's progress. */}
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
      {lookMenu && (
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

      <div className="drawer-body" data-open={open ? "true" : "false"}>
        <div className="drawer-inner">
          {/* Joined to the header: the same border runs down its sides and round its bottom. */}
          <div
            className="rounded-b-2xl px-2.5 pb-3 pt-3.5"
            style={{
              // A deep green velvet tray, lit softly from the middle.
              background: isAdventure ? "radial-gradient(120% 80% at 50% 0%, rgba(74,92,58,.55), rgba(24,32,20,.85) 70%), linear-gradient(180deg, #232c1e, #161c13)" : "var(--t-bg)",
              border: isAdventure ? "2px solid #8d7642" : "1px solid var(--t-card-border)",
              borderTop: "none",
              boxShadow: "inset 0 6px 10px -6px rgba(0,0,0,.55), inset 0 -6px 10px -6px rgba(0,0,0,.55)",
            }}
          >
          {error && (
            <p className="m-0 px-2 pb-1 text-[13.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <DndContext id="dnd-DailyHabits" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={todays.map((h) => h.id)} strategy={verticalListSortingStrategy}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {todays.map((h) => {
              const d = done(h.id);
              const s = streak(h);
              return (
                <SortableHabit key={h.id} id={h.id} disabled={!open} raised={menuFor === h.id || confirmSkip === h.id}>
                <div
                  onContextMenu={(e) => {
                    if ((e.target as Element).closest("input,textarea,a")) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenuUp(window.innerHeight - r.bottom < 200);
                    setMenuFor(h.id);
                  }}
                  className={`habit-row relative flex items-center gap-3 rounded-2xl px-3 py-2 ${isAdventure ? "parchment" : ""}`}
                  // A gilded edge and a soft shadow, so each habit sits on the velvet like a card.
                  style={isAdventure ? { borderRadius: 16, boxShadow: "0 0 0 1.5px #b39a6a, 0 0 0 3px rgba(60,44,16,.55), 0 4px 10px rgba(0,0,0,.4)" } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
                >
                  {h.icon_key ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={d}
                      aria-label={d ? `Undo ${h.title}` : `Done: ${h.title}`}
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
                      aria-label={d ? `Undo ${h.title}` : `Done: ${h.title}`}
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
                    onClick={() => (h.id === cleanId && cleaning ? setCleanOpen((v) => !v) : setEditing(h))}
                    aria-expanded={h.id === cleanId && cleaning ? cleanOpen : undefined}
                    className="relative z-[1] min-w-0 flex-1 text-left"
                    title={h.id === cleanId && cleaning ? "Today's pick, your spaces, laundry and chores" : "Edit habit"}
                  >
                    <span
                      className="block text-[16px] font-semibold leading-snug"
                      style={{ color: "var(--t-ink)", textDecoration: d ? "line-through" : undefined, textDecorationColor: "rgba(80,60,20,.45)", opacity: d ? 0.7 : 1 }}
                    >
                      {h.title}
                      {h.id === cleanId && cleaning && (
                        <>
                          {cleanTop ? ": " : ""}
                          {cleanTop && (
                            <span style={{ color: "#7a5410" }}>
                              {cleanTop.icon} {cleanTop.name}
                            </span>
                          )}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-1.5 inline-block align-middle opacity-60 transition-transform duration-300" style={{ transform: cleanOpen ? "rotate(180deg)" : undefined }}>
                            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </>
                      )}
                    </span>
                    {(h.description || h.due_time || h.estimate_minutes || (h.days && h.days.length < 7)) && (
                      <span className="block text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                        {[h.estimate_minutes ? `⏱ ${h.estimate_minutes}m` : null, scheduleLabel(h), h.description].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                  {subsOf(h).length > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={() => setOpenSubs((o) => { const n = new Set(o); if (n.has(h.id)) n.delete(h.id); else n.add(h.id); return n; })}
                      aria-expanded={openSubs.has(h.id)}
                      aria-label={`${openSubs.has(h.id) ? "Hide" : "Show"} the steps of ${h.title}`}
                      className="relative z-[1] flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold tabular-nums hover:bg-black/[.05]"
                      style={{ color: "var(--t-ink-soft)", border: "1px solid rgba(139,112,64,.35)" }}
                    >
                      {subsOf(h).filter((st) => ticked(h, st.id)).length}/{subsOf(h).length}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: openSubs.has(h.id) ? "rotate(90deg)" : undefined }}>
                        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  <span className="relative z-[1] flex shrink-0 flex-col items-end gap-0.5">
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
                  {!d && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        // Near the bottom of the screen the menu opens upward so it isn't cut off.
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenuUp(window.innerHeight - r.bottom < 200);
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
                    <div data-habit-menu data-menu="habit" role="menu" className={`card-pop-in absolute right-2 z-30 flex flex-col overflow-hidden rounded-xl parchment ${menuUp ? "bottom-full mb-1" : "top-full mt-1"}`} style={{ borderRadius: 12, minWidth: 190 }}>
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
                      {skips !== null && (
                        <button
                          type="button"
                          onClick={() => (s > 0 ? (setMenuFor(null), setConfirmSkip(h.id)) : setSkip(h, true))}
                          className="relative z-[1] min-h-11 px-4 text-left text-[15px] hover:bg-black/5"
                          style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
                        >
                          {h.repeat ? "⤼ Skip this time" : "⤼ Skip today"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => snooze(h, true)}
                        className="relative z-[1] min-h-11 px-4 text-left text-[15px] hover:bg-black/5"
                        style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
                      >
                        ☾ Snooze until tomorrow
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
                </div>
                {subsOf(h).length > 0 && openSubs.has(h.id) && (
                  <ul className="reveal m-0 ml-7 mt-1 flex list-none flex-col gap-0.5 rounded-xl px-2 py-1.5" style={isAdventure ? { background: "rgba(240,226,196,.9)", border: "1.5px solid #b39a6a" } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
                    {subsOf(h).map((st) => {
                      const t = ticked(h, st.id);
                      return (
                        <li key={st.id}>
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
                            <span className="text-[15px] leading-snug" style={{ color: "var(--t-ink)", textDecoration: t ? "line-through" : undefined, textDecorationColor: "rgba(80,60,20,.45)", opacity: t ? 0.7 : 1 }}>
                              {st.title}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {cleaning && day && h.id === cleanId && <CleaningCheckIn key={day} initial={cleaning} day={day} habitDone={d} isAdventure={isAdventure} open={cleanOpen} />}
                </SortableHabit>
              );
            })}
          </ul>
          </SortableContext>
          </DndContext>
          {skippedToday.length > 0 && (
            <p className="m-0 px-2 pt-2 text-center text-[13.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.85 }}>
              {skippedToday.map((h, i) => (
                <span key={h.id}>
                  {i > 0 && " · "}
                  {h.title} skipped today{" "}
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
          {/* Habits not up today: still here to see and edit. */}
          {notToday.length > 0 && (
            <div className="mt-2 flex flex-col items-center gap-1.5">
              <button type="button" onClick={() => setShowNotToday((v) => !v)} aria-expanded={showNotToday} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.85 }}>
                Not today ({notToday.length})
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: showNotToday ? "rotate(90deg)" : undefined }}>
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showNotToday && (
                <ul className="reveal m-0 flex w-full list-none flex-col gap-1.5 p-0">
                  {notToday.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(h)}
                        title="Edit habit"
                        className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-1.5 text-left opacity-80 hover:opacity-100 ${isAdventure ? "parchment" : ""}`}
                        style={isAdventure ? { borderRadius: 16 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
                      >
                        <span className="relative z-[1] min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
                            {h.title}
                          </span>
                          <span className="block text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                            {nextLabel(h, day)}
                          </span>
                        </span>
                        <span aria-hidden className="relative z-[1] text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
                          ✎
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
          </div>
        </div>
      </div>

      {editing && (
        <RiteEditorDialog
          rite={editing === "new" ? undefined : editing}
          slot="day"
          startWithSub={editSub}
          onClose={() => {
            setEditing(null);
            setEditSub(false);
          }}
        />
      )}
      {focusTask && <FocusMode task={focusTask} theme={theme} onClose={() => setFocusing(null)} />}
    </section>
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
  if (h.due_time) {
    const [hh, mm] = h.due_time.split(":").map(Number);
    parts.push(`by ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`);
  }
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
