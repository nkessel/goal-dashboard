"use client";

import { useEffect, useState, useTransition } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveBoardOrderAction, setBoardMistAction } from "@/app/actions";
import { BOARD_ORDERS, normalizeBoardOrder, orderQuests, type BoardOrder } from "@/lib/board-order";
import { Fold } from "@/components/ui/Fold";
import { nextActionOf } from "@/lib/next-action";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";

import type { Task } from "@/lib/data/types";
import { TaskRow } from "@/components/tasks/TaskRow";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";

/** A quest board's quests: open ones as quest cards, finished ones below. */
export function BoardQuestList({
  tasks,
  boardId,
  nextTaskId = null,
  boardTitle = null,
  theme,
  mist = true,
  order: savedOrder,
}: {
  /** How this board lists its quests (lib/board-order.ts). */
  order?: unknown;
  tasks: Task[];
  boardId?: string;
  /** The step chosen as this board's next action, if any. */
  nextTaskId?: string | null;
  /** The board's name (courses pick their next step by the deadline coming up). */
  boardTitle?: string | null;
  theme: "calm" | "adventure";
  /** The mist over all but the next step; off for boards like a list of videos (owner, Nov 2). */
  mist?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const [order, setOrder] = useState<BoardOrder>(() => normalizeBoardOrder(savedOrder));
  const [ordering, setOrdering] = useState(false);
  const [, startOrder] = useTransition();
  const saveOrder = (next: BoardOrder) => {
    const before = order;
    setOrder(next);
    if (boardId) startOrder(() => void saveBoardOrderAction(boardId, next).catch(() => setOrder(before)));
  };
  const open = orderQuests(tasks.filter((t) => t.status === "open" && !t.is_aspiration), order);
  const dreams = tasks.filter((t) => t.status === "open" && t.is_aspiration);
  const done = tasks.filter((t) => t.status === "completed");
  const [editing, setEditing] = useState<Task | null>(null);
  // Fog of war: a board leads with its next step; the rest waits in the mist
  // until you ask to see it (remembered per board on this device).
  const fogKey = `board-fog:${boardId ?? "loose"}`;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      setRevealed(window.localStorage.getItem(fogKey) === "open");
    } catch {
      /* storage unavailable */
    }
  }, [fogKey]);
  function reveal(v: boolean) {
    setRevealed(v);
    try {
      window.localStorage.setItem(fogKey, v ? "open" : "fog");
    } catch {
      /* storage unavailable */
    }
  }
  // A quest linked here from another board wears that board's name.
  const linkTag = (t: Task) => (boardId && t.board_id && t.board_id !== boardId && t.home_board_title ? `↗ ${t.home_board_title}` : undefined);
  const next = boardId ? (nextActionOf({ id: boardId, title: boardTitle, next_task_id: nextTaskId }, open) ?? open[0]) : open[0];
  const [mistOn, setMistOn] = useState(mist);
  const [, startMist] = useTransition();
  const setMist = (on: boolean) => {
    if (!boardId) return;
    setMistOn(on);
    startMist(() => void setBoardMistAction(boardId, on).catch(() => setMistOn(!on)));
  };
  const foggy = mistOn && open.length > 2 && !!next;
  const rest = foggy ? open.filter((t) => t.id !== next!.id) : open;
  // My order: hold a card (or drag it with the mouse) to move it; the order is kept for this board.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const dragOn = order.by === "mine" && !!boardId && rest.length > 1;
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = rest.map((t) => t.id);
    const moved = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    saveOrder({ by: "mine", ids: foggy ? [next!.id, ...moved] : moved });
  }
  const [dragId, setDragId] = useState<string | null>(null);
  const dragTask = dragId ? rest.find((t) => t.id === dragId) : null;
  const orderLabel = BOARD_ORDERS.find((o) => o.by === order.by)?.label ?? "My order";
  const soft = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  return (
    <div className="flex flex-col gap-3">
      {foggy && (
        <section aria-label="Next step" className="flex flex-col gap-1.5">
          <h2 className={`m-0 flex items-center gap-2 ${isAdventure ? "font-display text-[17px]" : "text-[13.5px] font-bold uppercase tracking-wide"}`} style={{ color: isAdventure ? "#f2d27e" : "var(--t-accent)" }}>
            {/* A quiet target: focusing, not flashing (owner, Nov 2). */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
            </svg>
            Next step
          </h2>
          <ul className="flex flex-col gap-3">
            <TaskRow task={next!} theme={theme} categoryLabel={linkTag(next!)} />
          </ul>
        </section>
      )}
      {foggy && (
        <button
          type="button"
          onClick={() => reveal(!revealed)}
          aria-expanded={revealed}
          className="board-fog hover-glow relative flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left"
          style={{ border: `1.5px dashed ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
        >
          <span aria-hidden className="relative z-[1] text-[22px]">{revealed ? "☀️" : "🌫"}</span>
          <span className="relative z-[1] flex min-w-0 flex-1 flex-col">
            <span className={isAdventure ? "font-display text-[17px]" : "text-[15px] font-semibold"}>
              {revealed ? "Back into the mist" : `${rest.length} more quests in the mist`}
            </span>
            <span className="text-[13px]" style={{ opacity: 0.75 }}>
              {revealed ? "Just the next step, for focus" : "One step at a time — tap to see the road"}
            </span>
          </span>
          <span aria-hidden className="relative z-[1] text-[18px] transition-transform duration-200" style={{ transform: revealed ? "rotate(90deg)" : undefined }}>
            ›
          </span>
        </button>
      )}
      {/* The mist is a choice per board: off for lists you browse (videos, ideas). */}
      {boardId && open.length > 2 && !!next && (
        <button type="button" onClick={() => setMist(!mistOn)} className="-mt-1.5 self-end text-[12px] underline underline-offset-2" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.6 }}>
          {mistOn ? "No mist on this board" : "🌫 Use the mist on this board"}
        </button>
      )}
      {boardId && open.length > 1 && (!foggy || revealed) && (
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => setOrdering((v) => !v)} aria-expanded={ordering} className="flex items-center gap-1.5 self-end text-[12.5px] font-semibold" style={{ color: soft, opacity: 0.8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {orderLabel}
            {order.by === "mine" && rest.length > 1 && <span className="font-normal opacity-75">· hold a card to move it</span>}
          </button>
          <Fold open={ordering}>
            <div role="radiogroup" aria-label="Order the quests" className="flex flex-wrap justify-end gap-1.5 pb-1">
              {BOARD_ORDERS.map((o) => (
                <button
                  key={o.by}
                  type="button"
                  role="radio"
                  aria-checked={order.by === o.by}
                  onClick={() => {
                    saveOrder(o.by === "mine" ? { by: "mine", ids: order.ids } : { by: o.by, ids: order.ids });
                    setOrdering(false);
                  }}
                  className="qe-fact flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold"
                  data-open={order.by === o.by ? "true" : undefined}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Fold>
        </div>
      )}
      {open.length > 0 ? (
        (!foggy || revealed) &&
        (dragOn ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => (window.getSelection()?.removeAllRanges(), setDragId(String(e.active.id)))} onDragCancel={() => setDragId(null)} onDragEnd={(e) => (setDragId(null), onDragEnd(e))}>
            <SortableContext items={rest.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className={`flex flex-col gap-3 ${foggy ? "fade-in" : ""}`}>
                {rest.map((t) => (
                  <SortableQuest key={t.id} task={t} theme={theme} categoryLabel={linkTag(t)} />
                ))}
              </ul>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }}>
              {dragTask ? (
                <ul className="m-0 list-none p-0" style={{ transform: "scale(1.02)", filter: "drop-shadow(0 12px 18px rgba(0,0,0,.45))" }}>
                  <TaskRow task={dragTask} theme={theme} categoryLabel={linkTag(dragTask)} />
                </ul>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <ul className={`flex flex-col gap-3 ${foggy ? "fade-in" : ""}`}>
            {rest.map((t) => (
              <TaskRow key={t.id} task={t} theme={theme} categoryLabel={linkTag(t)} />
            ))}
          </ul>
        ))
      ) : (
        <p
          className="rounded-2xl border-2 border-dashed px-5 py-5 text-center text-[15.5px]"
          style={{ borderColor: isAdventure ? "rgba(217,180,95,.4)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
        >
          No quests on this board yet.
        </p>
      )}
      <AddTaskForm boardId={boardId} theme={theme} />
      {dreams.length > 0 && (
        <section
          className="flex flex-col gap-1 rounded-2xl px-5 py-4"
          style={{ border: `1.5px dashed ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`, background: isAdventure ? "rgba(8,10,6,.25)" : undefined }}
        >
          <h2 className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-sm font-semibold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Aspirations
          </h2>
          <p className="m-0 text-[13.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.75 }}>
            Not actionable yet. Open one and untick &ldquo;Not actionable yet&rdquo; when it&apos;s ready to become a quest.
          </p>
          <ul className="mt-1 flex flex-col">
            {dreams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="hover-glow flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[16px]"
                  style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
                >
                  <span aria-hidden style={{ color: "var(--t-gold)" }}>✧</span>
                  <span className="min-w-0 flex-1">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
      {done.length > 0 && (
        <section
          className={`flex flex-col gap-1 rounded-2xl px-5 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
          style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
        >
          <h2 className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[20px]" : "text-sm font-semibold"}`} style={{ color: "var(--t-ink)" }}>
            Completed
          </h2>
          <ul className="relative z-[1] flex flex-col">
            {done.map((t) => (
              <CompletedTaskRow key={t.id} task={t} theme={theme} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A quest card that can be held and dragged into place (a board in "My order"). */
function SortableQuest({ task, theme, categoryLabel }: { task: Task; theme: "calm" | "adventure"; categoryLabel?: string }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <TaskRow
      task={task}
      theme={theme}
      categoryLabel={categoryLabel}
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
