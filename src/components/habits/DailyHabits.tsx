"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { completeRiteAction, reorderRitesAction, skipHabitAction, tickAllRiteStepsAction, tickRiteStepAction, uncompleteRiteAction, unskipHabitAction } from "@/app/actions";
import { useLocalDay } from "@/components/evening/evening-clock";
import { RiteEditorDialog } from "@/components/evening/RiteEditorDialog";
import type { RiteView } from "@/components/evening/EveningRites";
import { FocusMode, habitAsTask } from "@/components/one-thing/OneThing";
import { CoinIcon } from "@/components/ui/Icons";
import { coinsForXp } from "@/lib/coins";

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
  theme,
}: {
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
  const [open, setOpen] = useState(true);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<RiteView | "new" | null>(null);
  const [pop, setPop] = useState<{ id: string; xp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  // A tap anywhere outside the open menu closes it.
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-habit-menu]")) setMenuFor(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuFor(null);
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

  const byId = new Map(habits.map((h) => [h.id, h]));
  const ordered = (order ?? habits.map((h) => h.id)).map((id) => byId.get(id)).filter((h): h is RiteView => !!h);
  // Only habits that fall on today (weekday of the app day, 5:30am rollover).
  const weekday = day ? new Date(`${day}T12:00:00`).getDay() : null;
  const dueOn = (h: RiteView, wd: number | null) => !h.days || h.days.length === 0 || wd === null || h.days.includes(wd);
  const doneSet = new Set(completions.map((c) => `${c.rite_id}|${c.day}`));
  const skipSet = new Set((skips ?? []).map((c) => `${c.rite_id}|${c.day}`));
  const done = (id: string) => optimistic[id] ?? doneSet.has(`${id}|${day}`);
  const tickSet = new Set(stepChecks.map((c) => `${c.rite_id}|${c.step_id}|${c.day}`));
  const ticked = (h: RiteView, stepId: string) => stepOpt[`${h.id}|${stepId}`] ?? (tickSet.has(`${h.id}|${stepId}|${day}`) || (done(h.id) && optimistic[h.id] === true));
  const subsOf = (h: RiteView) => h.steps ?? [];
  const skipped = (id: string) => skipOverride[id] ?? skipSet.has(`${id}|${day}`);
  const dueToday = ordered.filter((h) => dueOn(h, weekday));
  const todays = dueToday.filter((h) => !skipped(h.id));
  const skippedToday = dueToday.filter((h) => skipped(h.id));
  const offToday = habits.length - dueToday.length;
  const doneCount = todays.filter((h) => done(h.id)).length;

  /**
   * Days in a row this habit was done, counting only the days it's due.
   * Today counts once ticked; until then the streak carries on from
   * yesterday. A missed or skipped day ends it.
   */
  function streak(h: RiteView): number {
    if (!day) return 0;
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="drawer-header relative flex min-h-[58px] w-full items-center justify-center rounded-2xl px-4 py-2.5"
        style={
          isAdventure
            ? {
                background: "linear-gradient(180deg, #3a3524 0%, #2b281b 55%, #221f15 100%)",
                border: "2px solid #8d7642",
                boxShadow: "inset 0 0 0 1px rgba(242,210,126,.18), inset 0 1px 0 rgba(255,235,180,.16), inset 0 -8px 16px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.35)",
              }
            : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }
        }
      >
        <span className={`flex items-center gap-3 ${isAdventure ? "font-display text-[21px]" : "text-sm font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
          <HabitIcon />
          Daily Habits
          {todays.length > 0 && (
            <span className="text-[15px] tabular-nums" style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)", fontWeight: 400 }}>
              ({doneCount}/{todays.length})
            </span>
          )}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="absolute right-5 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke={isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="drawer-body" data-open={open ? "true" : "false"}>
        <div className="drawer-inner">
          <div className="mt-2.5 rounded-2xl px-2 pb-2.5 pt-2.5" style={{ background: isAdventure ? "rgba(10,13,8,.35)" : "var(--t-bg)", boxShadow: "inset 0 6px 10px -6px rgba(0,0,0,.55), inset 0 -6px 10px -6px rgba(0,0,0,.55)" }}>
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
                  className={`relative flex items-center gap-3 rounded-2xl px-3 py-2 ${isAdventure ? "parchment" : ""}`}
                  style={isAdventure ? { borderRadius: 16 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
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
                        background: d ? "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)" : "rgba(255,250,238,.6)",
                        border: `2px solid ${d ? "#2f5a26" : "#a58c66"}`,
                      }}
                    >
                      {d && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(h)} className="relative z-[1] min-w-0 flex-1 text-left" title="Edit habit">
                    <span
                      className="block text-[16px] font-semibold leading-snug"
                      style={{ color: "var(--t-ink)", textDecoration: d ? "line-through" : undefined, textDecorationColor: "rgba(80,60,20,.45)", opacity: d ? 0.7 : 1 }}
                    >
                      {h.title}
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
                    <div data-habit-menu role="menu" className={`card-pop-in absolute right-2 z-30 flex flex-col overflow-hidden rounded-xl parchment ${menuUp ? "bottom-full mb-1" : "top-full mt-1"}`} style={{ borderRadius: 12, minWidth: 190 }}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuFor(null);
                          setEditing(h);
                        }}
                        className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5"
                      >
                        <span aria-hidden className="w-[18px] text-center">✎</span> Edit habit
                      </button>
                      <button
                        role="menuitem"
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
                          ⤼ Skip today
                        </button>
                      )}
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
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            <li>
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="habit-add flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-[14.5px]"
                style={{ borderColor: isAdventure ? "rgba(217,180,95,.4)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
              >
                <span aria-hidden className="text-[18px] leading-none" style={{ color: "var(--t-gold)" }}>
                  +
                </span>
                {habits.length === 0 ? "Add a habit" : offToday > 0 ? `Add a habit · ${offToday} not due today` : "Add a habit"}
              </button>
            </li>
          </ul>
          </div>
        </div>
      </div>

      {editing && <RiteEditorDialog rite={editing === "new" ? undefined : editing} slot="day" onClose={() => setEditing(null)} />}
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

function HabitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.1 6" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 4.8l.8 4.9 4.8-1.1" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 12.4l2.4 2.4 4.6-5" stroke="#8fc46a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
