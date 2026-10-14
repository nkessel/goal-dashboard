"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
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
import { QuestPickerSheet } from "./QuestPickerSheet";
import { GoldRule, Leaf, QuestShield } from "@/components/ui/Ornaments";

type ListName = "priority" | "other";
const MAX_PRIORITY = 3;
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
}: {
  task: TaskWithCategory;
  theme: "calm" | "adventure";
  behind?: TaskWithCategory;
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
}: {
  priorityTasks: TaskWithCategory[];
  otherTasks: TaskWithCategory[];
  theme?: "calm" | "adventure";
}) {
  const [localPriority, setLocalPriority] = useState<TaskWithCategory[] | null>(null);
  const [localOther, setLocalOther] = useState<TaskWithCategory[] | null>(null);
  const [seenPriorityTasks, setSeenPriorityTasks] = useState(priorityTasks);
  const [seenOtherTasks, setSeenOtherTasks] = useState(otherTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startList, setStartList] = useState<ListName | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  // A reward still locked behind an open prerequisite is drawn stacked behind it, not as its own card.
  const openIds = new Set([...priorityTasks, ...otherTasks].map((t) => t.id));
  const isLocked = (t: TaskWithCategory) => !!t.locked_by_task_id && openIds.has(t.locked_by_task_id);
  const lockedBehind = new Map<string, TaskWithCategory>();
  for (const t of [...priorityTasks, ...otherTasks]) if (isLocked(t)) lockedBehind.set(t.locked_by_task_id!, t);
  const priority = (localPriority ?? priorityTasks).filter((t) => !isLocked(t));
  const other = (localOther ?? otherTasks).filter((t) => !isLocked(t));

  // Fresh server props win once they match what we saved (or changed elsewhere).
  if (priorityTasks !== seenPriorityTasks) {
    setSeenPriorityTasks(priorityTasks);
    if (localPriority && !activeId && (!sameIdSet(localPriority, priorityTasks) || sameOrder(localPriority, priorityTasks))) setLocalPriority(null);
  }
  if (otherTasks !== seenOtherTasks) {
    setSeenOtherTasks(otherTasks);
    if (localOther && !activeId && (!sameIdSet(localOther, otherTasks) || sameOrder(localOther, otherTasks))) setLocalOther(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
    setDragError(null);
  }

  // Moving between the two lists happens live, while hovering.
  function onDragOver(e: DragOverEvent) {
    const id = String(e.active.id);
    const from = listOf(id);
    const to = listOf(e.over ? String(e.over.id) : null);
    if (!from || !to || from === to) return;
    if (to === "priority" && priority.length >= MAX_PRIORITY) return;
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      {/* Today's Quests: a subtle section of its own */}
      <section className="flex flex-col gap-3 rounded-3xl px-2.5 pb-3 pt-3 sm:px-3" style={sectionStyle}>
        {isAdventure ? (
          <div className="flex items-center gap-2 px-1">
            <span className="hidden flex-1 sm:flex">
              <GoldRule dir="left" />
            </span>
            <span className="flex-1 sm:hidden" />
            <Leaf flip />
            <h2 className="font-display m-0 whitespace-nowrap text-[23px] leading-none sm:text-[27px]" style={{ color: "var(--t-cream)", textShadow: "0 2px 8px rgba(0,0,0,.45)" }}>
              Today&apos;s Quests
              <span className="ml-2 align-middle text-[14px] font-normal" style={{ color: "var(--t-gold)" }}>
                ({priority.length}/{MAX_PRIORITY})
              </span>
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
              Today&apos;s Focus
            </h2>
            <span className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
              ({priority.length}/{MAX_PRIORITY})
            </span>
          </div>
        )}

        {dragError && (
          <p className="text-xs" style={{ color: "var(--t-warn)" }}>
            {dragError}
          </p>
        )}

        <SortableContext id="priority" items={priority.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3">
            {priority.map((task) => (
              <SortableQuest key={task.id} task={task} theme={theme} behind={lockedBehind.get(task.id)} />
            ))}
          </ul>
        </SortableContext>

        {/* An empty slot: tap to add a quest, or drop one here */}
        {priority.length < MAX_PRIORITY && (
          <Zone id={PRIORITY_ZONE} className="rounded-2xl">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="add-slot flex min-h-[84px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 text-[16px]"
              style={{
                borderColor: isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)",
                color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)",
                background: isAdventure ? "rgba(243,231,203,.04)" : "transparent",
              }}
            >
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full text-[24px] leading-none"
                style={{ border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.6)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
              >
                +
              </span>
              <span className={isAdventure ? "font-display" : ""}>
                {priority.length === 0 ? "Choose a quest for today" : "Add another quest"}
              </span>
            </button>
          </Zone>
        )}
      </section>

      {/* Additional Quests: a drawer that slides open */}
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
            <div className="pb-3 pt-3">
              {other.length === 0 ? (
                <p className="px-1 text-sm" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.7 }}>
                  Nothing here — nice.
                </p>
              ) : (
                <SortableContext id="other" items={other.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-3">
                    {other.map((task) => (
                      <SortableQuest key={task.id} task={task} theme={theme} behind={lockedBehind.get(task.id)} disabled={!otherOpen} />
                    ))}
                  </ul>
                </SortableContext>
              )}
            </div>
          </div>
        </div>
      </section>

      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {active ? (
          <ul className="m-0 list-none p-0" style={{ transform: "scale(1.02)", filter: "drop-shadow(0 12px 18px rgba(0,0,0,.45))" }}>
            <TaskRow task={active} theme={theme} categoryLabel={active.categoryLabel} />
          </ul>
        ) : null}
      </DragOverlay>

      {pickerOpen && <QuestPickerSheet otherTasks={other} theme={theme} onClose={() => setPickerOpen(false)} />}
    </DndContext>
  );
}
