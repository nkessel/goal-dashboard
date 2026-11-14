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
import { PrioritizeTool } from "@/components/tasks/PrioritizeTool";
import { PrioritizeIcon } from "@/components/ui/Icons";

type TaskWithCategory = Task & { categoryLabel?: string | null };

/**
 * Evening planning: the quests for tomorrow, as many as you like, in one
 * list dragged into the order you'll do them. One "+" adds another. When the
 * day turns over (5:30am) they move into Today's Quests in that order.
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
  const [local, setLocal] = useState<{ rank: string[]; seq: string[] } | null>(null);
  // Which shown quests are ticked for tomorrow (owner, Nov 3: a checkbox each, "Confirm N quests"); null = as saved.
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [rowsLocal, setRowsLocal] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [seen, setSeen] = useState(queued);
  const [picking, setPicking] = useState(false);
  const [prioritizing, setPrioritizing] = useState(false);
  const [editing, setEditing] = useState<TaskWithCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (seen !== queued) {
    setSeen(queued);
    setLocal(null);
    // The list you're working on stays as it is when fresh data arrives (adding a quest used to clear it:
    // the suggestions from Today and anything unticked vanished; owner, Nov 10). Anything newly on
    // tomorrow's list from elsewhere joins at the end, ticked.
    if (rowsLocal && queued) {
      const add = queued.map((t) => t.id).filter((id) => !rowsLocal.includes(id));
      if (add.length) {
        setRowsLocal([...rowsLocal, ...add]);
        setTicked(new Set([...(ticked ?? []), ...add]));
      }
    }
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
  // One list, in the order you'll do them (anything not yet placed goes last).
  const savedOrder = [...seq.filter((id) => rank.includes(id)), ...rank.filter((id) => !seq.includes(id))];
  // Shown: what's chosen plus anything unticked here (it stays until you leave), in order.
  const ordered = (rowsLocal ?? savedOrder).filter((id) => byId.has(id));
  // Saved quests start ticked; ones only suggested from Today start unticked.
  const tick = ticked ?? new Set(fromToday.length ? [] : savedOrder);
  const count = ordered.filter((id) => tick.has(id)).length;
  const toggle = (id: string) => {
    const n = new Set(tick);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setTicked(n);
    setConfirmed(null);
    if (!rowsLocal) setRowsLocal(ordered);
  };
  const allOn = ordered.length > 0 && ordered.every((id) => tick.has(id));
  const confirm = () => {
    const chosen = ordered.filter((id) => tick.has(id));
    save(chosen, chosen);
    setConfirmed(chosen.length);
  };

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
    const from = ordered.indexOf(String(active.id));
    const to = ordered.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    // Importance follows the same order now that there's one list.
    const moved = arrayMove(ordered, from, to);
    setRowsLocal(moved);
    const chosen = moved.filter((id) => tick.has(id));
    if (!fromToday.length || ticked) save(chosen, chosen);
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

      {fromToday.length > 0 && !ticked && (
        <p className="m-0 px-1 text-[12.5px] italic" style={{ color: soft }}>
          Today&apos;s quests, to choose from. Tick the ones for tomorrow.
        </p>
      )}
      {(
        <div className="flex items-center gap-2 px-1">
          <button type="button" onClick={() => setPrioritizing(true)} aria-label="Prioritize tomorrow" title="Prioritize tomorrow: cards or a list" className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold" style={{ border: "1px solid rgba(168,138,63,.7)", color: ink }}>
            <PrioritizeIcon size={14} />
            Prioritize
          </button>
          {ordered.length > 0 && <button type="button" onClick={() => (setTicked(new Set(allOn ? [] : ordered)), setRowsLocal(ordered), setConfirmed(null))} className="h-9 rounded-full px-3.5 text-[13.5px] font-semibold" style={{ border: "1px solid rgba(168,138,63,.7)", color: ink }}>
            {allOn ? "Clear all" : "Choose all"}
          </button>}
          {ordered.length > 0 && <button
            type="button"
            onClick={confirm}
            disabled={count === 0}
            className="ml-auto h-9 rounded-full px-4 text-[14px] font-bold transition-colors disabled:cursor-default"
            style={count === 0 ? { background: "rgba(200,200,200,.2)", color: "rgba(241,234,210,.6)", border: "1px solid rgba(200,200,200,.35)" } : { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10", boxShadow: "0 1px 3px rgba(60,40,10,.3)" }}
          >
            {confirmed !== null && confirmed === count ? `✓ ${count} for tomorrow` : `Confirm ${count} ${count === 1 ? "quest" : "quests"}`}
          </button>}
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
              return (
                <SlotCard key={id} id={id} n={i + 1} task={t} checked={tick.has(id)} onToggle={() => toggle(id)} onEdit={t ? () => setEditing(t) : undefined} />
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
          onPick={(id) => {
            // Added here: on the list, ticked, and saved with the others ticked.
            const rows = [...ordered.filter((x) => x !== id), id];
            const t = new Set(tick).add(id);
            setRowsLocal(rows);
            setTicked(t);
            const chosen = rows.filter((x) => t.has(x));
            save(chosen, chosen);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
      {prioritizing && <PrioritizeTool day="tomorrow" theme={theme} onClose={() => setPrioritizing(false)} />}
    </section>
  );
}

/** A gilded round checkbox: on tomorrow's list or not. */
function TickBox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={onToggle}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
    >
      <span
        aria-hidden
        className="flex h-[26px] w-[26px] items-center justify-center rounded-full transition-all duration-200"
        style={checked ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 8px rgba(242,210,126,.55)" } : { background: "rgba(255,250,238,.85)", border: "1.5px solid #b39a6a" }}
      >
        {checked && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="gold-check-draw">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3a2a10" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  );
}

function SlotCard({ id, n, task, checked, onToggle, onEdit }: { id: string; n: number; task?: TaskWithCategory; checked: boolean; onToggle: () => void; onEdit?: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  const art = task && (task.icon_source === "ai" || task.icon_source === "library") ? task.icon_key : null;
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="board-sortable parchment moonlit relative flex cursor-grab touch-manipulation items-center gap-2.5 rounded-2xl px-2.5 py-2.5 transition-opacity active:cursor-grabbing"
      style={{
        borderRadius: 16,
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        boxShadow: isDragging ? "0 12px 28px rgba(0,0,0,.5)" : undefined,
        opacity: checked ? 1 : 0.78,
      }}
      aria-label={`${task?.title ?? "quest"}${checked ? ", for tomorrow" : ""} (number ${n}) — drag to reorder`}
    >
      <span className="relative z-[1]">
        <TickBox checked={checked} onToggle={onToggle} label={`${checked ? "Take" : "Put"} ${task?.title ?? "this quest"} ${checked ? "off" : "on"} tomorrow's list`} />
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
          {[task?.categoryLabel, task?.estimate_minutes ? `${task.estimate_minutes}m` : null].filter(Boolean).join(" · ")}
        </span>
      </button>
    </li>
  );
}
