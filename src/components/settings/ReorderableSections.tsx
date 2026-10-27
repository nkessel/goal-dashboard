"use client";

import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const KEY = "settings-order";

/** A finger on a section's left edge moves it straight away (no hold), so the page never scrolls instead. */
class GripSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent: e }: React.PointerEvent) => e.pointerType !== "mouse" && e.isPrimary && !!(e.target as Element | null)?.closest?.("[data-grip]"),
    },
  ];
}
/** Settings rows tell the list when they open, so nothing can be dragged while one is open. */
const OpenContext = createContext<((id: string, open: boolean) => void) | null>(null);
export function useReportOpen() {
  return useContext(OpenContext);
}
const LockedContext = createContext(false);

/** One section in the Settings list (its id keeps your order). */
export function SectionItem({ id, children }: { id: string; children: React.ReactNode }) {
  const locked = useContext(LockedContext);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-section
      {...attributes}
      {...(locked ? {} : listeners)}
      tabIndex={-1}
      // No text selection or iOS press-and-hold menu while holding to move it.
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: "relative", opacity: isDragging ? 0.85 : undefined, touchAction: locked ? undefined : "pan-y", WebkitTouchCallout: locked ? undefined : "none" }}
      className={`${locked ? "" : "select-none"} ${isDragging ? "cursor-grabbing" : ""}`}
      onContextMenu={locked ? undefined : (e) => e.preventDefault()}
    >
      {children}
      <div data-section-slot />
      {/* An unmarked strip along the left edge drags the section straight away (no hold), even while one is open. */}
      <span ref={setActivatorNodeRef} {...listeners} aria-hidden data-grip className="absolute left-0 top-0 z-[2] h-[60px] w-4 cursor-grab" style={{ touchAction: "none" }} />
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
  // A section added since you set your order slots in after the one it follows by default.
  const sorted = order
    ? ids.filter((id) => !order.includes(id)).reduce(
        (list, id) => {
          const before = ids[ids.indexOf(id) - 1];
          const at = before ? list.indexOf(before) : -1;
          return at === -1 ? (before ? [...list, id] : [id, ...list]) : [...list.slice(0, at + 1), id, ...list.slice(at + 1)];
        },
        order.filter((id) => ids.includes(id))
      )
    : ids;
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const sensors = useSensors(
    // Mouse and touch apart: on a phone only a held finger picks a section up, so scrolling never does.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(GripSensor, { activationConstraint: { distance: 3 } }),
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
  const dragging = useRef(false);
  useEffect(() => {
    // iPhone only lets a drag stop the page scrolling through a non-passive
    // listener that's already in place when the finger goes down.
    const hold = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    window.addEventListener("touchmove", hold, { passive: false });
    return () => window.removeEventListener("touchmove", hold);
  }, []);
  return (
    <OpenContext.Provider value={report}>
      <LockedContext.Provider value={locked}>
        <DndContext id="dnd-settings" sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (dragging.current = true)} onDragCancel={() => (dragging.current = false)} onDragEnd={(e) => ((dragging.current = false), onDragEnd(e))}>
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

const TILES_KEY = "settings-tiles-order";

/** One half-wide tile in Settings (its id keeps your order). Empty tiles take no room. */
export function TileItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      className="flex min-w-0 select-none empty:hidden [&>*]:min-w-0 [&>*]:flex-1"
      style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 20 : undefined, opacity: isDragging ? 0.85 : undefined, touchAction: "pan-y", WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

/** The half-wide tiles at the top of Settings, two to a row: drag one (hold it on a phone) to move it. */
export function ReorderableTiles({ children }: { children: React.ReactNode }) {
  const items = useMemo(() => Children.toArray(children).filter(isValidElement) as React.ReactElement<{ id: string }>[], [children]);
  const ids = items.map((c) => c.props.id);
  const [order, setOrder] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TILES_KEY) ?? "null") as string[] | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (Array.isArray(saved)) setOrder(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  // A section added since you set your order slots in after the one it follows by default.
  const sorted = order
    ? ids.filter((id) => !order.includes(id)).reduce(
        (list, id) => {
          const before = ids[ids.indexOf(id) - 1];
          const at = before ? list.indexOf(before) : -1;
          return at === -1 ? (before ? [...list, id] : [id, ...list]) : [...list.slice(0, at + 1), id, ...list.slice(at + 1)];
        },
        order.filter((id) => ids.includes(id))
      )
    : ids;
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const dragging = useRef(false);
  // A drag that ends over a link isn't a tap on it.
  const justDragged = useRef(false);
  useEffect(() => {
    const hold = (e: TouchEvent) => {
      if (dragging.current) e.preventDefault();
    };
    window.addEventListener("touchmove", hold, { passive: false });
    return () => window.removeEventListener("touchmove", hold);
  }, []);
  function onDragEnd(e: DragEndEvent) {
    dragging.current = false;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(sorted, sorted.indexOf(String(e.active.id)), sorted.indexOf(String(e.over.id)));
    setOrder(next);
    try {
      window.localStorage.setItem(TILES_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <DndContext id="dnd-settings-tiles" sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (dragging.current = true)} onDragCancel={() => (dragging.current = false)} onDragEnd={onDragEnd}>
      <SortableContext items={sorted} strategy={rectSortingStrategy}>
        <div
          data-no-press-scroll
          className="grid grid-cols-2 gap-2.5"
          onClickCapture={(e) => {
            if (justDragged.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {sorted.map((id) => byId.get(id))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
