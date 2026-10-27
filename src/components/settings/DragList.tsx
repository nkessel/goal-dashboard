"use client";

import { useEffect, useRef } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SwipeReveal } from "@/components/ui/SwipeReveal";

/**
 * A short list whose rows you drag into order: the row itself moves (a held
 * finger on a phone), with no drag symbol taking up room.
 */
export type DragRowContent = {
  label: React.ReactNode;
  /** Its show/hide (or shown/folded) switch: swipe the row left on a phone, or hover it with a mouse. */
  toggle?: { hidden: boolean; onToggle: () => void; offLabel?: string } | null;
};

export function DragList({ id, ids, onReorder, row }: { id: string; ids: string[]; onReorder: (next: string[]) => void; row: (key: string) => DragRowContent }) {
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
            <DragRow key={k} id={k} content={row(k)} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function DragRow({ id, content }: { id: string; content: DragRowContent }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const t = content.toggle;
  // Hidden items are struck out; ones folded under Advanced are only dimmed.
  const struck = !!t?.hidden && t.offLabel !== "Advanced";
  const face = (
    <div className="group flex min-h-10 items-center gap-1 rounded-lg pl-2.5 pr-1" style={{ border: "1px solid rgba(139,112,64,.3)", background: "var(--t-card, #f6ecd2)", opacity: t?.hidden ? 0.6 : 1 }}>
      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${struck ? "line-through" : ""}`}>{content.label}</span>
      {t?.hidden && (
        <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
          {t.offLabel ?? "Hidden"}
        </span>
      )}
      {t && (
        <button
          type="button"
          onClick={t.onToggle}
          aria-label={t.hidden ? "Show it" : `Move to ${t.offLabel ?? "Hidden"}`}
          className="hidden h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:block"
          style={{ border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)" }}
        >
          {t.hidden ? "Show" : t.offLabel === "Advanced" ? "To Advanced" : "Hide"}
        </button>
      )}
    </div>
  );
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => e.preventDefault()}
      className={`cursor-grab select-none rounded-lg ${isDragging ? "cursor-grabbing shadow-lg" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined, touchAction: "pan-y", WebkitTouchCallout: "none" }}
    >
      {t ? (
        <SwipeReveal side="right" label={t.hidden ? "Show" : t.offLabel === "Advanced" ? "Advanced" : "Hide"} background={t.hidden ? "#4f7d38" : "#8a6116"} onAction={t.onToggle}>
          {face}
        </SwipeReveal>
      ) : (
        face
      )}
    </li>
  );
}
