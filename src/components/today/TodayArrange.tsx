"use client";

import { useState, useSyncExternalStore } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GearIcon } from "@/components/ui/Icons";
import { BOARD_PARTS, DEFAULT_TODAY_LAYOUT, TODAY_PARTS, readTodayLayout, saveTodayLayout, serverTodayLayout, subscribeTodayLayout, type TodayPart } from "@/lib/today-layout";

const GOLD = "#8a6116";

/**
 * Today, in the order you chose, with a gear (top right, on hover; faint on
 * phones) that arranges it right here: every part drags, the eye in its
 * corner hides it, and hidden parts wait as + chips. The quest board's parts
 * (Due soon, Today's Quests, Daily Habits, Additional Quests) move as a group
 * among the rest, and in their own order inside it.
 */
export function TodayArrange({ parts, board }: { parts: Partial<Record<TodayPart, React.ReactNode>>; board: React.ReactNode }) {
  const layout = useSyncExternalStore(subscribeTodayLayout, readTodayLayout, serverTodayLayout);
  const [arranging, setArranging] = useState(false);
  const shown = layout.order.filter((k) => !layout.hidden.includes(k));
  // The board sits where the first of its parts does.
  const boardAt = layout.order.find((k) => BOARD_PARTS.includes(k));
  const nodes: React.ReactNode[] = [];
  for (const k of layout.order) {
    if (k === boardAt) nodes.push(<div key="board" className="flex flex-col gap-6">{board}</div>);
    else if (!BOARD_PARTS.includes(k) && shown.includes(k) && parts[k]) nodes.push(<div key={k} className="contents">{parts[k]}</div>);
  }

  return (
    <div className="group/today relative flex flex-col gap-6">
      <button
        type="button"
        onClick={() => setArranging((v) => !v)}
        aria-pressed={arranging}
        aria-label={arranging ? "Done arranging Today" : "Arrange Today"}
        title={arranging ? "Done arranging" : "Arrange Today"}
        className={`settings-gear absolute -top-3 right-0 z-[3] flex h-8 w-8 items-center justify-center rounded-full transition-opacity ${arranging ? "opacity-100" : "opacity-0 group-hover/today:opacity-80 focus-visible:opacity-100 [@media(hover:none)]:opacity-45"}`}
        style={{ color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }}
      >
        <GearIcon size={16} />
      </button>
      {arranging ? <Arranging parts={parts} onDone={() => setArranging(false)} /> : nodes}
    </div>
  );
}

function Arranging({ parts, onDone }: { parts: Partial<Record<TodayPart, React.ReactNode>>; onDone: () => void }) {
  const layout = useSyncExternalStore(subscribeTodayLayout, readTodayLayout, serverTodayLayout);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const shown = layout.order.filter((k) => !layout.hidden.includes(k));
  const hidden = layout.order.filter((k) => layout.hidden.includes(k));
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(shown, shown.indexOf(active.id as TodayPart), shown.indexOf(over.id as TodayPart));
    saveTodayLayout({ ...layout, order: [...next, ...hidden] });
  }
  const toggle = (k: TodayPart) => saveTodayLayout({ ...layout, hidden: layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  const isDefault = JSON.stringify(layout) === JSON.stringify(DEFAULT_TODAY_LAYOUT);

  return (
    <div className="reveal parchment flex flex-col gap-2 rounded-3xl p-3" style={{ border: "1.5px solid #a88a3f" }}>
      <div className="flex items-center gap-2 pr-9">
        <h2 className="m-0 font-display text-[19px]" style={{ color: "#2a1c10" }}>
          Arrange Today
        </h2>
        <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "#6b5631" }}>
          Drag parts to move them; the eye hides one.
        </span>
      </div>
      <DndContext id="dnd-today-arrange" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          {shown.map((k) => (
            <Part key={k} id={k} onHide={() => toggle(k)}>
              {BOARD_PARTS.includes(k) ? null : parts[k]}
            </Part>
          ))}
        </SortableContext>
      </DndContext>
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[12px] font-semibold" style={{ color: "#6b5631" }}>
            Hidden:
          </span>
          {hidden.map((k) => (
            <button key={k} type="button" onClick={() => toggle(k)} aria-label={`Show ${label(k)}`} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1.5px dashed #b39a6a", color: "#2a1c10", background: "rgba(255,250,238,.6)" }}>
              <span aria-hidden className="text-[15px] leading-none" style={{ color: GOLD }}>
                +
              </span>
              {label(k)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={() => saveTodayLayout(null)} disabled={isDefault} className="text-[12.5px] underline underline-offset-2 disabled:no-underline disabled:opacity-40" style={{ color: "#6b5631" }}>
          Reset
        </button>
        <span className="min-w-0 flex-1 text-[11.5px]" style={{ color: "#7a6440" }}>
          The quest parts move together; inside, they keep your order.
        </span>
        <button type="button" onClick={onDone} className="h-8 shrink-0 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          Done
        </button>
      </div>
    </div>
  );
}

const label = (k: TodayPart) => TODAY_PARTS.find((p) => p.key === k)?.label ?? k;

function Part({ id, onHide, children }: { id: TodayPart; onHide: () => void; children: React.ReactNode }) {
  const meta = TODAY_PARTS.find((p) => p.key === id)!;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    // The whole part drags.
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`relative flex touch-manipulation flex-col gap-1 rounded-xl px-2.5 py-1.5 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        border: `1.5px solid rgba(139,112,64,${BOARD_PARTS.includes(id) ? 0.6 : 0.4})`,
        background: isDragging ? "rgba(255,248,228,.97)" : BOARD_PARTS.includes(id) ? "rgba(226,187,92,.14)" : "rgba(255,250,238,.45)",
        boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,.25)" : undefined,
      }}
    >
      <div className="flex min-h-7 items-baseline gap-2 pr-8">
        <span className="shrink-0 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
          {meta.label}
        </span>
        <span className="min-w-0 truncate text-[12px]" style={{ color: "#7a6440" }}>
          {meta.hint}
        </span>
      </div>
      <button
        type="button"
        onClick={onHide}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Hide ${meta.label}`}
        title="Hide this part"
        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]"
        style={{ color: "#6b5631" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
      {children && (
        // How it looks (not live while arranging), kept short.
        <div inert className="pointer-events-none max-h-[84px] overflow-hidden" style={{ maskImage: "linear-gradient(180deg,#000 55%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 55%,transparent)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
