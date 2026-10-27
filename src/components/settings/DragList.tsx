"use client";

import { useEffect, useRef } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * A short list whose rows you drag into order: the row itself moves (a held
 * finger on a phone), with no drag symbol taking up room.
 */
export function DragList({ id, ids, onReorder, row }: { id: string; ids: string[]; onReorder: (next: string[]) => void; row: (key: string) => React.ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const dragging = useRef(false);
  useEffect(() => {
    // iPhone only lets a drag stop the page scrolling through a non-passive listener already in place.
    const hold = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    window.addEventListener("touchmove", hold, { passive: false });
    return () => window.removeEventListener("touchmove", hold);
  }, []);
  function onDragEnd(e: DragEndEvent) {
    dragging.current = false;
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }
  return (
    <DndContext id={`dnd-${id}`} sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (dragging.current = true)} onDragCancel={() => (dragging.current = false)} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {ids.map((k) => (
            <DragRow key={k} id={k}>
              {row(k)}
            </DragRow>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function DragRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex min-h-10 cursor-grab select-none items-center gap-1 rounded-lg pl-2.5 pr-1 ${isDragging ? "cursor-grabbing shadow-lg" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined, touchAction: "pan-y", WebkitTouchCallout: "none", border: "1px solid rgba(139,112,64,.3)", background: isDragging ? "var(--t-card, #f6ecd2)" : undefined }}
    >
      {children}
    </li>
  );
}

/** Shown / Hidden for one item. */
export function ShownSwitch({ hidden, onToggle, offLabel = "Hidden", title }: { hidden: boolean; onToggle: () => void; offLabel?: string; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!hidden}
      onClick={onToggle}
      title={title}
      className="h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold"
      style={hidden ? { border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink-soft)" } : { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}
    >
      {hidden ? offLabel : "Shown"}
    </button>
  );
}
