"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/lib/data/types";
import { setTomorrowQueueAction } from "@/app/actions";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { QuestPickerSheet } from "@/components/tasks/QuestPickerSheet";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";

type TaskWithCategory = Task & { categoryLabel?: string | null };
const SLOTS = 3;

/**
 * Evening planning: three numbered slots for tomorrow's main quests. Drag to
 * reorder, × to take one out, tap an empty slot to fill it. When the day
 * turns over (5:30am) they move into Today's Quests in this order.
 */
export function TomorrowQuests({
  queued,
  candidates,
  theme,
  embedded = false,
  onCountChange,
}: {
  /** Shown inside its evening rite card: no heading of its own. */
  embedded?: boolean;
  /** How many slots are filled after a change (the rite completes at three). */
  onCountChange?: (n: number) => void;
  /** Null before the database update that adds the queue. */
  queued: TaskWithCategory[] | null;
  /** Open quests that could go in a slot. */
  candidates: TaskWithCategory[];
  theme: "calm" | "adventure";
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [seen, setSeen] = useState(queued);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<TaskWithCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen !== queued) {
    setSeen(queued);
    setOrder(null);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (queued === null) return null;

  const byId = new Map([...candidates, ...queued].map((t) => [t.id, t]));
  const ids = (order ?? queued.map((t) => t.id)).filter((id) => byId.has(id) || order?.includes(id));
  const filled = ids.slice(0, SLOTS);

  function save(next: string[]) {
    setOrder(next);
    setError(null);
    onCountChange?.(next.length);
    startTransition(async () => {
      try {
        await setTomorrowQueueAction(next);
      } catch (e) {
        setOrder(null);
        setError(e instanceof Error ? e.message : "Couldn't save tomorrow's plan.");
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = filled.indexOf(String(active.id));
    const to = filled.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    save(arrayMove(filled, from, to));
  }

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby={embedded ? undefined : "tomorrow-heading"} aria-label={embedded ? "Tomorrow's Quests" : undefined}>
      {!embedded && (
      <div className="flex items-end justify-between gap-2 px-1">
        <div>
          <h3 id="tomorrow-heading" className="font-display m-0 text-[21px] leading-tight" style={{ color: "#f1ead2", textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
            Tomorrow&apos;s Quests
          </h3>
          <p className="m-0 text-[13.5px]" style={{ color: "#d9d2bd", opacity: 0.85 }}>
            Your three main quests — waiting in Today&apos;s Quests when you wake.
          </p>
        </div>
        <span className="shrink-0 text-[14px]" style={{ color: "var(--t-gold)" }}>
          {filled.length}/{SLOTS}
        </span>
      </div>
      )}

      {error && (
        <p className="m-0 rounded-lg px-3 py-2 text-[14px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      <DndContext id="dnd-TomorrowQuests" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={filled} strategy={verticalListSortingStrategy}>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {filled.map((id, i) => {
              const t = byId.get(id);
              return (
                <SlotCard
                  key={id}
                  id={id}
                  n={i + 1}
                  task={t}
                  onEdit={t ? () => setEditing(t) : undefined}
                  onRemove={() => save(filled.filter((x) => x !== id))}
                />
              );
            })}
            {Array.from({ length: SLOTS - filled.length }).map((_, i) => (
              <li key={`empty-${i}`}>
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="hover-glow flex min-h-[58px] w-full items-center gap-3 rounded-2xl border-2 border-dashed px-3 text-left text-[15.5px]"
                  style={{ borderColor: "rgba(217,180,95,.45)", background: "rgba(8,10,26,.3)", color: "#f1ead2" }}
                >
                  <SlotNumber n={filled.length + i + 1} empty />
                  <span className="flex-1">{i === 0 ? "Choose a quest for tomorrow" : "Choose another"}</span>
                  <span className="text-xl leading-none" style={{ color: "var(--t-gold)" }} aria-hidden>
                    +
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {picking && (
        <QuestPickerSheet
          otherTasks={candidates.filter((t) => !filled.includes(t.id))}
          theme={theme}
          title="Add to Tomorrow's Quests"
          hint="Or pick one of your quests:"
          onPick={(id) => save([...filled, id].slice(0, SLOTS))}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </section>
  );
}

function SlotNumber({ n, empty = false }: { n: number; empty?: boolean }) {
  return (
    <span
      aria-hidden
      className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[17px] font-bold"
      style={
        empty
          ? { border: "1.5px dashed rgba(217,180,95,.6)", color: "rgba(241,234,210,.75)" }
          : { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }
      }
    >
      {n}
    </span>
  );
}

function SlotCard({ id, n, task, onEdit, onRemove }: { id: string; n: number; task?: TaskWithCategory; onEdit?: () => void; onRemove: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  const art = task && (task.icon_source === "ai" || task.icon_source === "library") ? task.icon_key : null;
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="board-sortable parchment moonlit relative flex cursor-grab touch-manipulation items-center gap-3 rounded-2xl px-3 py-2.5 active:cursor-grabbing"
      style={{
        borderRadius: 16,
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        boxShadow: isDragging ? "0 12px 28px rgba(0,0,0,.5)" : undefined,
        scale: isDragging ? "1.02" : undefined,
      }}
      aria-label={`Slot ${n}: ${task?.title ?? "quest"} — drag to reorder`}
    >
      <span className="relative z-[1]">
        <SlotNumber n={n} />
      </span>
      <span className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element -- quest portrait
          <img src={art} alt="" className="h-full w-full object-cover" />
        ) : (
          <QuestMonogram id={id} title={task?.title ?? "?"} size={40} />
        )}
      </span>
      <button type="button" onClick={onEdit} disabled={!onEdit} title="Edit this quest" className="relative z-[1] min-w-0 flex-1 text-left">
        <span className="line-clamp-2 block text-[16px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
          {task?.title ?? "Loading…"}
        </span>
        {task?.categoryLabel && (
          <span className="block truncate text-[12.5px]" style={{ color: "#5a4a30" }}>
            {task.categoryLabel}
          </span>
        )}
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Take ${task?.title ?? "this quest"} out of tomorrow`}
        className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] leading-none"
        style={{ color: "#5a4a30" }}
      >
        ×
      </button>
    </li>
  );
}
