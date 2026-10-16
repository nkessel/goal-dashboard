"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/data/types";
import { reorderSchedulingAction, setSchedulingAction } from "@/app/actions";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { TaskScheduleControl } from "@/components/tasks/TaskScheduleControl";

const OPEN_KEY = "scheduling-list-open";
const NUMBERED = 3;

/**
 * The scheduling priority list beside the calendar: quests (often people to
 * see) waiting for a time. The first three are numbered; the rest wait
 * below, unnumbered. Drag to reorder; tap one to open it, or "Find a time"
 * to put it on the calendar. Collapsible, remembered on this device.
 */
export function SchedulingList({ tasks, theme }: { tasks: Task[]; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [open, setOpen] = useState(true);
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(tasks);
  const [editing, setEditing] = useState<Task | null>(null);
  const [scheduling, setScheduling] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen !== tasks) {
    setSeen(tasks);
    setOrder(null);
  }

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (window.localStorage.getItem(OPEN_KEY) === "0") setOpen(false);
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = (order ?? tasks.map((t) => t.id)).filter((id) => byId.has(id));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function save(next: string[]) {
    setOrder(next);
    setError(null);
    startTransition(async () => {
      try {
        await reorderSchedulingAction(next);
      } catch (e) {
        setOrder(null);
        setError(e instanceof Error ? e.message : "Couldn't save the order.");
      }
    });
  }
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    save(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }
  function remove(id: string) {
    setOrder(ids.filter((x) => x !== id));
    startTransition(async () => {
      try {
        await setSchedulingAction(id, null);
      } catch (e) {
        setOrder(null);
        setError(e instanceof Error ? e.message : "Couldn't take it off.");
      }
    });
  }

  return (
    <aside
      aria-label="Scheduling priority list"
      className={`flex flex-col rounded-2xl ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? { borderRadius: 16 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <button type="button" onClick={toggle} aria-expanded={open} className="relative z-[1] flex min-h-12 items-center gap-2 px-4 text-left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#7a5f2a" }}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 9.6h17M8 3v4M16 3v4M8 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className={`flex-1 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
          To schedule
          {ids.length > 0 && <span className="ml-1.5 text-[13.5px] font-normal" style={{ color: "var(--t-ink-soft)" }}>({ids.length})</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : undefined, color: "var(--t-ink-soft)" }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="relative z-[1] flex flex-col gap-1 px-2.5 pb-3">
          {error && (
            <p className="m-0 px-1 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          {ids.length === 0 ? (
            <p className="m-0 px-1.5 pb-1 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
              Nothing waiting. Tick &ldquo;Add to the scheduling list&rdquo; in a quest to line it up here.
            </p>
          ) : (
            <DndContext id="dnd-SchedulingList" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {ids.map((id, i) => (
                    <Row
                      key={id}
                      task={byId.get(id)!}
                      n={i < NUMBERED ? i + 1 : null}
                      dividerBefore={i === NUMBERED}
                      onOpen={() => setEditing(byId.get(id)!)}
                      onSchedule={() => setScheduling(byId.get(id)!)}
                      onRemove={() => remove(id)}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
      {scheduling &&
        createPortal(
          <div className="overlay-fade-in fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }} onClick={() => setScheduling(null)}>
            <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <TaskScheduleControl task={scheduling} theme={theme} startOpen onDone={() => setScheduling(null)} />
            </div>
          </div>,
          document.body
        )}
    </aside>
  );
}

function Row({ task, n, dividerBefore, onOpen, onSchedule, onRemove }: { task: Task; n: number | null; dividerBefore: boolean; onOpen: () => void; onSchedule: () => void; onRemove: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id });
  const art = (task.icon_source === "ai" || task.icon_source === "library") && task.icon_key ? task.icon_key : null;
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="touch-manipulation"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.45 : 1, position: "relative", zIndex: isDragging ? 5 : undefined }}
    >
      {dividerBefore && (
        <span aria-hidden className="mb-1.5 mt-0.5 block border-t border-dashed" style={{ borderColor: "rgba(139,112,64,.4)" }} />
      )}
      <div className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-black/[.04]">
        {n !== null ? (
          <span
            aria-label={`Number ${n}`}
            className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
          >
            {n}
          </span>
        ) : (
          <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center text-[18px] leading-none" style={{ color: "rgba(110,90,50,.5)" }}>
            •
          </span>
        )}
        <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- quest portrait
            <img src={art} alt="" className="h-full w-full object-cover" />
          ) : (
            <QuestMonogram id={task.id} title={task.title} size={32} />
          )}
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left" title="Open this quest">
          <span className="line-clamp-2 block text-[14.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
            {task.title}
          </span>
          {task.is_on_calendar && task.scheduled_start && (
            <span className="block text-[12px]" style={{ color: "#3f6a2c" }}>
              Scheduled {new Date(task.scheduled_start).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onSchedule}
          className="h-8 shrink-0 rounded-full px-2.5 text-[12.5px] font-semibold"
          style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}
          title="Put it on the calendar"
        >
          Find a time
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onRemove}
          aria-label={`Take ${task.title} off the list`}
          title="Take it off the list"
          className="flex h-8 w-6 shrink-0 items-center justify-center text-[18px] leading-none"
          style={{ color: "var(--t-ink-soft)" }}
        >
          ×
        </button>
      </div>
    </li>
  );
}
