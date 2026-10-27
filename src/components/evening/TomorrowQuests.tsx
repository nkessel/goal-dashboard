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
type Mode = "rank" | "seq";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "rank", label: "By importance", hint: "Drag so the one that matters most is on top." },
  { key: "seq", label: "In order", hint: "Drag into the order you'll do them. Today's Quests follow this order." },
];

/**
 * Evening planning: the quests for tomorrow, as many as you like, with two
 * orders — how much each matters, and the order you'll do them in. One "+"
 * adds another. When the day turns over (5:30am) they move into Today's
 * Quests in the order you'll do them, each showing how important it is.
 */
export function TomorrowQuests({
  queued,
  candidates,
  theme,
  embedded = false,
  heading = !embedded,
  onCountChange,
  todayIds = [],
}: {
  /** What's on Today's Quests now, shown as the starting choice until you change it. */
  todayIds?: string[];
  /** Show its own "Tomorrow's Quests" heading (off inside the evening rite's tray). */
  heading?: boolean;
  /** Null before the database update that adds the queue. In importance order. */
  queued: TaskWithCategory[] | null;
  /** Open quests that could be added. */
  candidates: TaskWithCategory[];
  theme: "calm" | "adventure";
  /** Shown inside its evening rite card: no heading of its own. */
  embedded?: boolean;
  /** How many are chosen after a change. */
  onCountChange?: (n: number) => void;
}) {
  const [mode, setMode] = useState<Mode>("rank");
  const [local, setLocal] = useState<{ rank: string[]; seq: string[] } | null>(null);
  const [seen, setSeen] = useState(queued);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<TaskWithCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen !== queued) {
    setSeen(queued);
    setLocal(null);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (queued === null) return null;

  const byId = new Map([...candidates, ...queued].map((t) => [t.id, t]));
  // Nothing chosen yet: start from what's on Today now (saved once you change anything).
  const fromToday = !local && queued.length === 0 ? todayIds.filter((id) => byId.has(id)) : [];
  const rank = (local?.rank ?? (fromToday.length ? fromToday : queued.map((t) => t.id))).filter((id) => byId.has(id));
  const seq =
    local?.seq ??
    (fromToday.length ? fromToday : [...queued].sort((a, b) => (a.queue_seq ?? a.queue_rank ?? 0) - (b.queue_seq ?? b.queue_rank ?? 0)).map((t) => t.id));
  const ordered = (mode === "rank" ? rank : seq.filter((id) => rank.includes(id)));

  function save(nextRank: string[], nextSeq: string[]) {
    setLocal({ rank: nextRank, seq: nextSeq });
    setError(null);
    onCountChange?.(nextRank.length);
    startTransition(async () => {
      try {
        await setTomorrowQueueAction(nextRank, nextSeq);
      } catch (e) {
        setLocal(null);
        setError(e instanceof Error ? e.message : "Couldn't save tomorrow's plan.");
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const list = mode === "rank" ? rank : seq;
    const from = list.indexOf(String(active.id));
    const to = list.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const moved = arrayMove(list, from, to);
    if (mode === "rank") save(moved, seq);
    else save(rank, moved);
  }

  const isAdventure = theme === "adventure";
  const ink = embedded ? "var(--t-ink)" : "#f1ead2";
  const soft = embedded ? "#5a4a30" : "#d9d2bd";

  return (
    <section className="flex flex-col gap-2.5" aria-label="Tomorrow's Quests">
      {heading && (
        <div className="flex items-end justify-between gap-2 px-1">
          <h3 className="font-display m-0 text-[21px] leading-tight" style={{ color: ink, textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
            Tomorrow&apos;s Quests
          </h3>
          <span className="shrink-0 text-[14px]" style={{ color: "var(--t-gold)" }}>
            {rank.length}
          </span>
        </div>
      )}

      {fromToday.length > 0 && (
        <p className="m-0 px-1 text-[12.5px] italic" style={{ color: soft }}>
          Starting from what&apos;s on Today now. Change anything to make it tomorrow&apos;s plan.
        </p>
      )}
      {rank.length > 1 && (
        <div className="flex flex-col gap-1">
          <div role="tablist" aria-label="Order" className="inline-flex w-fit rounded-full p-0.5" style={{ background: embedded ? "rgba(70,50,20,.12)" : "rgba(255,255,255,.08)", border: embedded ? undefined : "1px solid rgba(217,180,95,.25)" }}>
            {MODES.map((m) => {
              const on = m.key === mode;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setMode(m.key)}
                  className="h-8 rounded-full px-3.5 text-[13.5px] font-semibold"
                  style={{
                    background: on ? (isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)") : "transparent",
                    color: on ? (isAdventure ? "#2a1c10" : "#fff") : ink,
                    boxShadow: on ? "0 1px 3px rgba(60,40,10,.3)" : undefined,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="m-0 text-[13px]" style={{ color: soft }}>
            {MODES.find((m) => m.key === mode)!.hint}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 rounded-lg px-3 py-2 text-[14px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      <DndContext id="dnd-TomorrowQuests" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {ordered.map((id, i) => {
              const t = byId.get(id);
              const importance = rank.indexOf(id) + 1;
              return (
                <SlotCard
                  key={id}
                  id={id}
                  n={i + 1}
                  mode={mode}
                  importance={importance}
                  task={t}
                  onEdit={t ? () => setEditing(t) : undefined}
                  onRemove={() => save(rank.filter((x) => x !== id), seq.filter((x) => x !== id))}
                />
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="habit-add flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[15px]"
                style={{ borderColor: "rgba(168,138,63,.55)", background: embedded ? "rgba(255,250,238,.35)" : "rgba(8,10,26,.3)", color: ink }}
              >
                <span aria-hidden className="text-xl leading-none" style={{ color: isAdventure ? "#a8812e" : "var(--t-accent)" }}>
                  +
                </span>
                {rank.length === 0 ? "Choose a quest for tomorrow" : "Add another"}
              </button>
            </li>
          </ol>
        </SortableContext>
      </DndContext>

      {picking && (
        <QuestPickerSheet
          otherTasks={candidates.filter((t) => !rank.includes(t.id))}
          theme={theme}
          title="Add to Tomorrow's Quests"
          hint="Or pick one of your quests:"
          onPick={(id) => save([...rank, id], [...seq.filter((x) => x !== id), id])}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** A round seal with the quest's place in the current order. */
function OrderSeal({ n, mode }: { n: number; mode: Mode }) {
  return (
    <span
      aria-hidden
      className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px] font-bold"
      style={
        mode === "rank"
          ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }
          : { background: "rgba(255,250,238,.75)", border: "1.5px solid #8a6c2c", color: "#4a3913" }
      }
    >
      {n}
    </span>
  );
}

function SlotCard({
  id,
  n,
  mode,
  importance,
  task,
  onEdit,
  onRemove,
}: {
  id: string;
  n: number;
  mode: Mode;
  importance: number;
  task?: TaskWithCategory;
  onEdit?: () => void;
  onRemove: () => void;
}) {
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
      }}
      aria-label={`${mode === "rank" ? "Importance" : "Step"} ${n}: ${task?.title ?? "quest"} — drag to reorder`}
    >
      <span className="relative z-[1]">
        <OrderSeal n={n} mode={mode} />
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
        <span className="block truncate text-[12.5px]" style={{ color: "#5a4a30" }}>
          {[mode === "seq" ? `#${importance} in importance` : null, task?.categoryLabel, task?.estimate_minutes ? `${task.estimate_minutes}m` : null].filter(Boolean).join(" · ")}
        </span>
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
