"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/data/types";
import { reorderTasksAction, toggleManualPriorityAction } from "@/app/actions";
import { TaskRow } from "./TaskRow";
import { GoldRule, Leaf, QuestShield } from "@/components/ui/Ornaments";
import { CreateSheet } from "@/components/create/CreateSheet";
import { SectionStack } from "./SectionStack";
import { settleOptimisticQuests, takeOptimisticFailure, useOptimisticQuests, type OptimisticQuest } from "@/lib/optimistic-quests";

/** A just-created quest, drawn like the rest while it saves (blank checkbox until its portrait is ready). */
function asTask(q: OptimisticQuest): TaskWithCategory {
  const now = new Date().toISOString();
  return {
    id: q.tempId,
    title: q.title,
    description: q.description,
    xp_value: q.xp,
    estimate_minutes: q.estimate,
    importance: 0,
    urgency: 0,
    icon_key: q.iconUrl,
    icon_source: q.iconUrl ? "library" : "monster",
    status: "open",
    is_manual_priority: q.placement === "today",
    in_additional: true,
    is_on_calendar: false,
    scheduled_start: null,
    scheduled_end: null,
    due_at: null,
    progress: 0,
    reschedule_count: 0,
    created_at: now,
    updated_at: now,
  } as unknown as TaskWithCategory;
}

/** Stand-ins can't be opened or dragged until they're real. */
function PendingQuest({ q, theme }: { q: OptimisticQuest; theme: "calm" | "adventure" }) {
  return (
    <li className="pointer-events-none list-none opacity-90" aria-busy="true">
      <ul className="m-0 list-none p-0">
        <TaskRow task={asTask(q)} theme={theme} />
      </ul>
    </li>
  );
}

type ListName = "priority" | "other";
const PRIORITY_ZONE = "zone:priority";
const OTHER_ZONE = "zone:other";

/** A task plus its board title for the card's pill (typed locally: the data layer is server-only). */
type TaskWithCategory = Task & { categoryLabel?: string | null };

function sameOrder(a: TaskWithCategory[], b: TaskWithCategory[]) {
  return a.length === b.length && a.every((t, i) => t.id === b[i]?.id);
}
function sameIdSet(a: TaskWithCategory[], b: TaskWithCategory[]) {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((t) => t.id));
  return b.every((t) => ids.has(t.id));
}

/** One draggable quest card: mouse drags after a short move, touch after a short press (so scrolling still works). */
function SortableQuest({
  task,
  theme,
  behind,
  disabled = false,
  listMoves,
}: {
  task: TaskWithCategory;
  theme: "calm" | "adventure";
  behind?: TaskWithCategory;
  listMoves?: React.ComponentProps<typeof TaskRow>["listMoves"];
  /** Cards in a closed drawer can't be dragged or dropped onto. */
  disabled?: boolean;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <TaskRow
      task={task}
      theme={theme}
      categoryLabel={task.categoryLabel}
      behind={behind}
      listMoves={listMoves}
      sortable={{
        setNodeRef,
        attributes: attributes as unknown as React.HTMLAttributes<HTMLElement>,
        listeners,
        isDragging,
        style: { transform: CSS.Translate.toString(transform), transition },
      }}
    />
  );
}

/** A drop target with no cards in it (an empty list, or a closed drawer's header). */
function Zone({ id, children, className, style }: { id: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} style={{ ...style, ...(isOver ? { boxShadow: "0 0 0 2px rgba(242,210,126,.75)" } : null) }}>
      {children}
    </div>
  );
}

/**
 * Today's Quests (pinned, up to 3) and the Additional Quests drawer. Cards
 * drag within and between the two with dnd-kit — mouse, touch (press and
 * hold) or keyboard — and the others slide aside smoothly. Dropping into the
 * other list pins/unpins; any new order is saved when the drag ends.
 *
 * The lists follow the server props except while a drag (or its save) is in
 * flight, when a local copy takes over until fresh props catch up.
 */
export function TodayTaskBoard({
  priorityTasks,
  otherTasks,
  theme = "calm",
  between,
}: {
  priorityTasks: TaskWithCategory[];
  otherTasks: TaskWithCategory[];
  theme?: "calm" | "adventure";
  /** Daily habits: a section of its own, above Today's Quests unless moved. */
  between?: React.ReactNode;
}) {
  const [localPriority, setLocalPriority] = useState<TaskWithCategory[] | null>(null);
  const [localOther, setLocalOther] = useState<TaskWithCategory[] | null>(null);
  const [seenPriorityTasks, setSeenPriorityTasks] = useState(priorityTasks);
  const [seenOtherTasks, setSeenOtherTasks] = useState(otherTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startList, setStartList] = useState<ListName | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(true);
  const [dragError, setDragError] = useState<string | null>(null);
  // A quick move from a card's menu: drop the local copy on the next fresh props.
  const [softLocal, setSoftLocal] = useState(false);
  const [adding, setAdding] = useState(false);
  // A short note after a quick move (e.g. a snooze), with Undo.
  const [notice, setNotice] = useState<{ id: number; text: string; undo?: () => Promise<void> } | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice((n) => (n?.id === notice.id ? null : n)), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  const isAdventure = theme === "adventure";

  // A reward still locked behind an open prerequisite is drawn stacked behind it, not as its own card.
  const openIds = new Set([...priorityTasks, ...otherTasks].map((t) => t.id));
  const isLocked = (t: TaskWithCategory) => !!t.locked_by_task_id && openIds.has(t.locked_by_task_id);
  const lockedBehind = new Map<string, TaskWithCategory>();
  for (const t of [...priorityTasks, ...otherTasks]) if (isLocked(t)) lockedBehind.set(t.locked_by_task_id!, t);
  const priority = (localPriority ?? priorityTasks).filter((t) => !isLocked(t));
  const other = (localOther ?? otherTasks).filter((t) => !isLocked(t));
  // Quests just created elsewhere, until the real ones arrive.
  const pendingAll = useOptimisticQuests();
  const pending = pendingAll.filter((q) => !q.realId || !openIds.has(q.realId));
  useEffect(() => {
    if (pendingAll.length) settleOptimisticQuests(openIds);
    const f = takeOptimisticFailure();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- surfacing a background save failure
    if (f) setDragError(f);
  });

  // Fresh server props win once they match what we saved (or changed elsewhere).
  if (priorityTasks !== seenPriorityTasks || otherTasks !== seenOtherTasks) {
    setSeenPriorityTasks(priorityTasks);
    setSeenOtherTasks(otherTasks);
    if (softLocal && !activeId) {
      setSoftLocal(false);
      setLocalPriority(null);
      setLocalOther(null);
    } else {
      if (priorityTasks !== seenPriorityTasks && localPriority && !activeId && (!sameIdSet(localPriority, priorityTasks) || sameOrder(localPriority, priorityTasks))) setLocalPriority(null);
      if (otherTasks !== seenOtherTasks && localOther && !activeId && (!sameIdSet(localOther, otherTasks) || sameOrder(localOther, otherTasks))) setLocalOther(null);
    }
  }

  /** Move a card between the lists (or off them) at once, ahead of the save. */
  function listMovesFor(id: string) {
    return {
      move: (to: ListName | null) => {
        const task = [...priority, ...other].find((t) => t.id === id);
        if (!task) return;
        const nextPriority = priority.filter((t) => t.id !== id);
        const nextOther = other.filter((t) => t.id !== id);
        if (to === "priority") nextPriority.push(task);
        if (to === "other") nextOther.unshift(task);
        setDragError(null);
        setSoftLocal(true);
        setLocalPriority(nextPriority);
        setLocalOther(nextOther);
      },
      revert: (message: string) => {
        setSoftLocal(false);
        setLocalPriority(null);
        setLocalOther(null);
        setDragError(message);
      },
      notify: (n: { text: string; undo?: () => Promise<void> }) => setNotice({ id: Date.now(), ...n }),
    };
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // The pointer over a section header (e.g. the closed Additional Quests bar)
  // wins outright, so a card can be dropped straight onto it.
  const collision: CollisionDetection = (args) => {
    const zones = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id === OTHER_ZONE || c.id === PRIORITY_ZONE) });
    const header = zones.find((z) => z.id === OTHER_ZONE);
    if (header) return [header];
    const cards = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== OTHER_ZONE && c.id !== PRIORITY_ZONE) });
    return cards.length ? cards : zones;
  };

  const listOf = (id: string | null | undefined): ListName | null => {
    if (!id) return null;
    if (id === PRIORITY_ZONE) return "priority";
    if (id === OTHER_ZONE) return "other";
    if (priority.some((t) => t.id === id)) return "priority";
    if (other.some((t) => t.id === id)) return "other";
    return null;
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    setStartList(listOf(id));
    setLocalPriority(priority);
    setLocalOther(other);
    setSoftLocal(false);
    setDragError(null);
  }

  // Moving between the two lists happens live, while hovering.
  function onDragOver(e: DragOverEvent) {
    const id = String(e.active.id);
    const from = listOf(id);
    const to = listOf(e.over ? String(e.over.id) : null);
    if (!from || !to || from === to) return;
    const source = from === "priority" ? priority : other;
    const target = to === "priority" ? priority : other;
    const task = source.find((t) => t.id === id);
    if (!task) return;
    const overIndex = e.over ? target.findIndex((t) => t.id === String(e.over!.id)) : -1;
    const insertAt = overIndex === -1 ? target.length : overIndex;
    const nextTarget = [...target];
    nextTarget.splice(insertAt, 0, task);
    const nextSource = source.filter((t) => t.id !== id);
    if (from === "priority") {
      setLocalPriority(nextSource);
      setLocalOther(nextTarget);
    } else {
      setLocalOther(nextSource);
      setLocalPriority(nextTarget);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const list = listOf(id);
    let nextPriority = priority;
    let nextOther = other;
    if (list && e.over) {
      const items = list === "priority" ? priority : other;
      const from = items.findIndex((t) => t.id === id);
      const to = items.findIndex((t) => t.id === String(e.over!.id));
      if (from !== -1 && to !== -1 && from !== to) {
        const moved = arrayMove(items, from, to);
        if (list === "priority") nextPriority = moved;
        else nextOther = moved;
      }
    }
    setLocalPriority(nextPriority);
    setLocalOther(nextOther);
    setActiveId(null);
    const crossed = list && startList && list !== startList;
    setStartList(null);
    if (!list) return;

    startTransition(async () => {
      try {
        if (crossed) await toggleManualPriorityAction(id, list === "priority");
        await Promise.all([reorderTasksAction(nextPriority.map((t) => t.id)), reorderTasksAction(nextOther.map((t) => t.id))]);
      } catch (err) {
        setDragError(err instanceof Error ? err.message : "Couldn't move that quest — try again.");
        setLocalPriority(null);
        setLocalOther(null);
      }
    });
  }

  function onDragCancel() {
    setActiveId(null);
    setStartList(null);
    setLocalPriority(null);
    setLocalOther(null);
  }

  const active = activeId ? [...priority, ...other].find((t) => t.id === activeId) : null;
  const sectionStyle: React.CSSProperties = isAdventure
    ? { background: "rgba(14,18,10,.28)", border: "1px solid rgba(217,180,95,.2)", boxShadow: "inset 0 1px 0 rgba(255,240,200,.05)" }
    : { background: "var(--t-bg)", border: "1px solid var(--t-card-border)" };

  return (
    <DndContext id="dnd-TodayTaskBoard" sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      {/* Daily Habits, Today's Quests and Additional Quests: drag a closed one to reorder. */}
      <SectionStack
        storageKey="today-section-order"
        defaultOrder={["habits", "today", "other"]}
        sections={[
          {
            id: "today",
            node: (
              <section className="flex flex-col gap-3 rounded-3xl px-2.5 pb-3 pt-3 sm:px-3" style={sectionStyle}>
                <div className="relative">
                {isAdventure ? (
                  <div className="flex items-center gap-2 px-1">
                    <span className="hidden flex-1 sm:flex">
                      <GoldRule dir="left" />
                    </span>
                    <span className="flex-1 sm:hidden" />
                    <Leaf flip />
                    <h2 className="font-display m-0 whitespace-nowrap text-[23px] leading-none sm:text-[27px]" style={{ color: "var(--t-cream)", textShadow: "0 2px 8px rgba(0,0,0,.45)" }}>
                      <button type="button" onClick={() => setTodayOpen((v) => !v)} aria-expanded={todayOpen} className="cursor-pointer select-none">
                        Today&apos;s Quests
                      </button>
                    </h2>
                    <Leaf />
                    <span className="hidden flex-1 sm:flex">
                      <GoldRule dir="right" />
                    </span>
                    <span className="flex-1 sm:hidden" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2.5">
                    <h2 className="text-lg font-extrabold" style={{ color: "var(--t-ink)" }}>
                      <button type="button" onClick={() => setTodayOpen((v) => !v)} aria-expanded={todayOpen}>
                        Today&apos;s Focus
                      </button>
                    </h2>
                  </div>
                )}
                </div>
                {adding && <CreateSheet kinds={["quest"]} initial="quest" pinToToday theme={theme} onClose={() => setAdding(false)} />}

                {dragError && (
                  <p className="text-xs" style={{ color: "var(--t-warn)" }}>
                    {dragError}
                  </p>
                )}

                <div className="drawer-body" data-open={todayOpen ? "true" : "false"}>
                  <div className="drawer-inner -mx-1 px-1">
                    <Zone id={PRIORITY_ZONE} className="rounded-2xl">
                      <SortableContext id="priority" items={priority.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <ul className="flex min-h-[40px] flex-col gap-3 pb-0.5 pt-0.5">
                          {priority.map((task) => (
                            <SortableQuest key={task.id} task={task} theme={theme} behind={lockedBehind.get(task.id)} disabled={!todayOpen} listMoves={listMovesFor(task.id)} />
                          ))}
                          {pending
                            .filter((q) => q.placement === "today")
                            .map((q) => (
                              <PendingQuest key={q.tempId} q={q} theme={theme} />
                            ))}
                        </ul>
                      </SortableContext>
                      {priority.length === 0 && (
                        <p className="-mt-8 px-2 pb-1 text-center text-[14.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.75 }}>
                          Drag a quest up here, or add one below.
                        </p>
                      )}
                    </Zone>
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="habit-add mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-[14.5px]"
                      style={{ borderColor: isAdventure ? "rgba(217,180,95,.4)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
                    >
                      <span aria-hidden className="text-[18px] leading-none" style={{ color: "var(--t-gold)" }}>
                        +
                      </span>
                      Add a quest to today
                    </button>
                  </div>
                </div>
                {!todayOpen && priority.length > 0 && (
                  <button type="button" onClick={() => setTodayOpen(true)} className="-mt-1.5 flex items-center justify-center gap-1 self-center rounded-full px-3 py-1 text-[13.5px] font-semibold" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.85 }}>
                    Show {priority.length} {priority.length === 1 ? "quest" : "quests"}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </section>
            ),
          },
          ...(between ? [{ id: "habits", node: between }] : []),
          {
            id: "other",
            node: (
              <section>
                <Zone id={OTHER_ZONE} className="rounded-2xl">
                  <button
                    type="button"
                    data-quest-dropzone="other"
                    aria-expanded={otherOpen}
                    onClick={() => setOtherOpen((v) => !v)}
                    className="drawer-header relative flex min-h-[58px] w-full items-center justify-center rounded-2xl px-4 py-2.5"
                    style={
                      isAdventure
                        ? {
                            background: "linear-gradient(180deg, #34412f 0%, #263022 55%, #1f281c 100%)",
                            border: "2px solid #8d7642",
                            boxShadow: "inset 0 0 0 1px rgba(242,210,126,.18), inset 0 1px 0 rgba(255,235,180,.16), inset 0 -8px 16px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.35)",
                          }
                        : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }
                    }
                  >
                    <span className={`flex items-center gap-3 ${isAdventure ? "font-display text-[21px]" : "text-sm"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
                      {isAdventure && <QuestShield size={30} />}
                      {isAdventure ? "Additional Quests" : "More tasks"}
                      <span className="text-[15px]" style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)", fontWeight: 400 }}>
                        ({other.length})
                      </span>
                    </span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="absolute right-5 transition-transform duration-300" style={{ transform: otherOpen ? "rotate(180deg)" : undefined }}>
                      <path d="M5.5 9l6.5 6.5L18.5 9" stroke={isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </Zone>
                <div className="drawer-body" data-open={otherOpen ? "true" : "false"}>
                  <div className="drawer-inner -mx-2 px-2">
                    <div
                      className="quest-tray mt-2.5 max-h-[min(50vh,350px)] overflow-y-auto overscroll-contain rounded-2xl px-2 pb-3 pt-3"
                      style={{ background: isAdventure ? "rgba(10,13,8,.35)" : "var(--t-bg)", boxShadow: "inset 0 6px 10px -6px rgba(0,0,0,.55), inset 0 -6px 10px -6px rgba(0,0,0,.55)" }}
                    >
                      {pending.some((q) => q.placement === "additional") && (
                        <ul className="mb-3 flex flex-col gap-3">
                          {pending
                            .filter((q) => q.placement === "additional")
                            .map((q) => (
                              <PendingQuest key={q.tempId} q={q} theme={theme} />
                            ))}
                        </ul>
                      )}
                      {other.length === 0 ? (
                        <p className="px-1 text-sm" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.7 }}>
                          Nothing here — nice.
                        </p>
                      ) : (
                        <SortableContext id="other" items={other.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                          <ul className="flex flex-col gap-3">
                            {other.map((task) => (
                              <SortableQuest key={task.id} task={task} theme={theme} behind={lockedBehind.get(task.id)} disabled={!otherOpen} listMoves={listMovesFor(task.id)} />
                            ))}
                          </ul>
                        </SortableContext>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ),
          },
        ]}
      />

      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {active ? (
          <ul className="m-0 list-none p-0" style={{ transform: "scale(1.02)", filter: "drop-shadow(0 12px 18px rgba(0,0,0,.45))" }}>
            <TaskRow task={active} theme={theme} categoryLabel={active.categoryLabel} />
          </ul>
        ) : null}
      </DragOverlay>

      {notice &&
        createPortal(
          <div
            role="status"
            data-hide-when-typing
            className="card-pop-in fixed bottom-[calc(96px+env(safe-area-inset-bottom))] left-1/2 z-[58] flex w-[min(92vw,420px)] -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 shadow-xl"
            style={{ background: "rgba(22,26,44,.95)", border: "1.5px solid rgba(217,180,95,.6)", color: "#f1ead2" }}
          >
            <span className="min-w-0 flex-1 truncate text-[14px]">{notice.text}</span>
            {notice.undo && (
              <button
                type="button"
                onClick={() => {
                  const undo = notice.undo!;
                  setNotice(null);
                  startTransition(async () => {
                    try {
                      await undo();
                    } catch (e) {
                      setDragError(e instanceof Error ? e.message : "Couldn't undo that.");
                    }
                  });
                }}
                className="h-9 shrink-0 rounded-full px-4 text-[14px] font-bold"
                style={{ background: "var(--t-gold)", color: "#2a1c10" }}
              >
                Undo
              </button>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="flex h-9 w-8 shrink-0 items-center justify-center text-[18px] leading-none" style={{ color: "rgba(241,234,210,.7)" }}>
              ×
            </button>
          </div>,
          document.body
        )}

    </DndContext>
  );
}
