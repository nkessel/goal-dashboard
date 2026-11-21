"use client";

import { useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { arrangeCalMenu, calMenuCanHide, saveCalMenuLayout, type CalMenuKind, type CalMenuLayout } from "@/lib/cal-menu-layout";

/**
 * The calendar menu arranged in place, like the quest card's ⋯ menu (owner, Nov 16 f562c138):
 * every row drags, the eye on its right hides it (or brings it back), and a tap on its name renames it.
 */
export function CalMenuArrange({ kind, rows, layout }: { kind: CalMenuKind; rows: { key: string; label: string }[]; layout: CalMenuLayout }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const list = arrangeCalMenu(rows, layout, true);
  const keys = list.map((r) => r.key);
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const moved = arrayMove(keys, keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
    // Rows this card doesn't offer keep their places after the ones it does.
    saveCalMenuLayout(kind, { ...layout, order: [...moved, ...layout.order.filter((k) => !moved.includes(k))] });
  }
  const toggle = (k: string) => saveCalMenuLayout(kind, { ...layout, hidden: layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  return (
    <div className="reveal flex flex-col pt-1" data-cal-menu-arrange>
      <span className="px-3.5 pb-1 pr-16 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
        Drag to reorder; tap a name to rename it; the eye hides an item.
      </span>
      <DndContext id={`dnd-cal-menu-${kind}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          {list.map((r) => (
            <ArrangeRow
              key={r.key}
              id={r.key}
              label={r.label}
              hidden={layout.hidden.includes(r.key)}
              canHide={calMenuCanHide(r.key)}
              onToggle={() => toggle(r.key)}
              onRename={(words) => saveCalMenuLayout(kind, { ...layout, labels: { ...(layout.labels ?? {}), [r.key]: words } })}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function ArrangeRow({ id, label, hidden, canHide, onToggle, onRename }: { id: string; label: string; hidden: boolean; canHide: boolean; onToggle: () => void; onRename: (words: string) => void }) {
  const [naming, setNaming] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex min-h-10 touch-manipulation items-center gap-2 pl-3.5 pr-1.5 text-[14.5px] ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        position: "relative",
        background: isDragging ? "var(--t-card)" : undefined,
        boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,.25)" : undefined,
        opacity: hidden ? 0.45 : 1,
        color: "var(--t-ink)",
      }}
    >
      {naming ? (
        <input
          autoFocus
          defaultValue={label}
          maxLength={40}
          aria-label={`Rename ${label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setNaming(false);
          }}
          onBlur={(e) => {
            onRename(e.currentTarget.value);
            setNaming(false);
          }}
          className="bare-input min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
          style={{ borderBottom: "1px solid #c8a24a" }}
        />
      ) : (
        <button type="button" onClick={() => setNaming(true)} onPointerDown={(e) => e.stopPropagation()} title="Tap to rename" className={`min-w-0 flex-1 truncate text-left ${hidden ? "line-through" : ""}`}>
          {label}
        </button>
      )}
      {canHide && (
        <button type="button" onClick={onToggle} onPointerDown={(e) => e.stopPropagation()} aria-label={hidden ? `Show ${label}` : `Hide ${label}`} title={hidden ? "Show it" : "Hide it"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            {hidden ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /> : <circle cx="12" cy="12" r="2.6" fill="currentColor" />}
          </svg>
        </button>
      )}
    </div>
  );
}
