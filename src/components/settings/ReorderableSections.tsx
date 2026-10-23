"use client";

import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const KEY = "settings-order";
/** Settings rows tell the list when they open, so nothing can be dragged while one is open. */
const OpenContext = createContext<((id: string, open: boolean) => void) | null>(null);
export function useReportOpen() {
  return useContext(OpenContext);
}
const LockedContext = createContext(false);

/** One section in the Settings list (its id keeps your order). */
export function SectionItem({ id, children }: { id: string; children: React.ReactNode }) {
  const locked = useContext(LockedContext);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(locked ? {} : listeners)}
      tabIndex={-1}
      // No text selection or iOS press-and-hold menu while holding to move it.
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: "relative", opacity: isDragging ? 0.85 : undefined, touchAction: locked ? undefined : "pan-y", WebkitTouchCallout: locked ? undefined : "none" }}
      className={`${locked ? "" : "select-none"} ${isDragging ? "cursor-grabbing" : ""}`}
      onContextMenu={locked ? undefined : (e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

/**
 * The Settings sections, in your order: drag one (hold it on a phone) to
 * move it. While a section is open, the list stays put.
 */
export function ReorderableSections({ children }: { children: React.ReactNode }) {
  const items = useMemo(() => Children.toArray(children).filter(isValidElement) as React.ReactElement<{ id: string }>[], [children]);
  const ids = items.map((c) => c.props.id);
  const [order, setOrder] = useState<string[] | null>(null);
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as string[] | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (Array.isArray(saved)) setOrder(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const report = useCallback((id: string, open: boolean) => {
    setOpenSet((s) => {
      if (open === s.has(id)) return s;
      const n = new Set(s);
      if (open) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  const sorted = order ? [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))] : ids;
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const sensors = useSensors(
    // Mouse and touch apart: on a phone only a held finger picks a section up, so scrolling never does.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(sorted, sorted.indexOf(String(e.active.id)), sorted.indexOf(String(e.over.id)));
    setOrder(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  const locked = openSet.size > 0;
  return (
    <OpenContext.Provider value={report}>
      <LockedContext.Provider value={locked}>
        <DndContext id="dnd-settings" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sorted} strategy={verticalListSortingStrategy}>
            <div data-no-press-scroll className="flex flex-col gap-2.5">
              {sorted.map((id) => byId.get(id))}
            </div>
          </SortableContext>
        </DndContext>
      </LockedContext.Provider>
    </OpenContext.Provider>
  );
}
