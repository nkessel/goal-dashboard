"use client";

import { useState } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CoinIcon } from "@/components/ui/Icons";
import { Fold } from "@/components/ui/Fold";

export type SubHabit = { id: string; title: string; xp?: number; coins?: number };

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * A habit's sub-habits, the way the owner asked (repeat ask 15): always in view,
 * each row dragged by itself to reorder (no arrows, no grips), renamed in place,
 * and its own little menu (right-click, or tap its dot) for XP, coins and Remove,
 * opening right under the row. A line at the bottom adds one.
 */
export function SubHabitList({ list, onChange, autoFocus = false, noun = "sub-habit" }: { list: SubHabit[]; onChange: (next: SubHabit[]) => void; autoFocus?: boolean; noun?: string }) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const onEnd = (e: DragEndEvent) => {
    const from = list.findIndex((s) => s.id === e.active.id);
    const to = e.over ? list.findIndex((s) => s.id === e.over!.id) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onChange(arrayMove(list, from, to));
  };
  const add = () => {
    const t = draft.replace(/\s+/g, " ").trim();
    if (!t) return;
    onChange([...list, { id: newId(), title: t }]);
    setDraft("");
  };
  const set = (id: string, patch: Partial<SubHabit>) => onChange(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  return (
    <div className="flex flex-col gap-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd} onDragStart={() => setMenu(null)}>
        <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {list.map((s) => (
            <Row
              key={s.id}
              sub={s}
              menuOpen={menu === s.id}
              onMenu={() => setMenu((m) => (m === s.id ? null : s.id))}
              onChange={(patch) => set(s.id, patch)}
              onRemove={() => (setMenu(null), onChange(list.filter((x) => x.id !== s.id)))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 px-2">
        <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed text-[12px]" style={{ borderColor: "#a58c66", color: "var(--t-ink-soft)" }}>
          +
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 120))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          autoFocus={autoFocus}
          placeholder={list.length ? `Another ${noun}` : noun === "sub-habit" ? "Add a sub-habit (e.g. Food and water)" : `Add a ${noun}`}
          aria-label={`Add a ${noun}`}
          className="h-8 min-w-0 flex-1 rounded-md border border-dashed bg-transparent px-2 text-[16px] sm:text-[15px]"
          style={{ borderColor: "#b39a6a" }}
        />
      </div>
    </div>
  );
}

/** The XP and coins a sub-habit pays when ticked, as one quiet badge ("+3 XP · 1"). */
function Pays({ sub }: { sub: SubHabit }) {
  if (!sub.xp && !sub.coins) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold tabular-nums" style={{ color: "#8a6116" }}>
      {sub.xp ? `+${sub.xp} XP` : null}
      {sub.coins ? (
        <span className="flex items-center gap-0.5">
          {sub.xp ? "·" : "+"} {sub.coins} <CoinIcon size={12} />
        </span>
      ) : null}
    </span>
  );
}

function Row({ sub, menuOpen, onMenu, onChange, onRemove }: { sub: SubHabit; menuOpen: boolean; onMenu: () => void; onChange: (patch: Partial<SubHabit>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: "relative" }}
      className="due-in"
    >
      <div
        {...attributes}
        {...listeners}
        role="listitem"
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu();
        }}
        className={`group flex min-h-9 items-center gap-2 rounded-xl px-2 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          background: isDragging ? "rgba(255,248,228,.97)" : "linear-gradient(180deg, rgba(255,250,236,.75), rgba(244,231,200,.6))",
          border: `1px solid ${menuOpen ? "rgba(138,97,22,.6)" : "rgba(139,112,64,.3)"}`,
          boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,.2)" : "inset 0 1px 0 rgba(255,255,255,.5)",
        }}
      >
        <button
          type="button"
          onClick={onMenu}
          aria-label={`Options for ${sub.title}`}
          aria-expanded={menuOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        >
          <span aria-hidden className="h-[18px] w-[18px] rounded-full" style={{ border: "2px solid #a58c66", background: menuOpen ? "rgba(217,180,95,.45)" : "rgba(255,250,238,.6)" }} />
        </button>
        <input
          value={sub.title}
          onChange={(e) => onChange({ title: e.target.value.slice(0, 120) })}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Sub-habit"
          className="h-8 min-w-0 flex-1 cursor-text rounded-md border-0 bg-transparent px-1 text-[16px] sm:text-[15px]"
        />
        <Pays sub={sub} />
      </div>
      <Fold open={menuOpen}>
        <div className="mx-2 mb-1 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2.5 py-2 text-[13.5px]" style={{ background: "rgba(255,250,238,.55)", border: "1px dashed rgba(139,112,64,.45)" }}>
          <Stepper label="XP" value={sub.xp ?? 0} max={100} onChange={(n) => onChange({ xp: n || undefined })} />
          <Stepper label={<CoinIcon size={14} />} aria="Coins" value={sub.coins ?? 0} max={50} onChange={(n) => onChange({ coins: n || undefined })} />
          <button type="button" onClick={onRemove} className="ml-auto h-8 rounded-full px-2.5 text-[13px] font-semibold hover:bg-black/5" style={{ color: "var(--t-warn)" }}>
            Remove
          </button>
        </div>
      </Fold>
    </div>
  );
}

function Stepper({ label, aria, value, max, onChange }: { label: React.ReactNode; aria?: string; value: number; max: number; onChange: (n: number) => void }) {
  const name = aria ?? (typeof label === "string" ? label : "");
  return (
    <span className="flex items-center gap-1">
      <span className="flex items-center font-semibold">{label}</span>
      <span className="flex h-8 items-center rounded-full border" style={{ borderColor: value ? "#5a4520" : "#b39a6a" }}>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Less ${name}`} className="flex h-8 w-7 items-center justify-center text-[16px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
          −
        </button>
        <span className="min-w-5 text-center font-bold tabular-nums" style={{ color: value ? "#8a6116" : "var(--t-ink-soft)" }}>
          {value}
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${name}`} className="flex h-8 w-7 items-center justify-center text-[16px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
          +
        </button>
      </span>
    </span>
  );
}
