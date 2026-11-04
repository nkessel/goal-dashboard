"use client";

import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { GoogleCalendarInfo } from "@/lib/google-calendar";
import { Fold } from "@/components/ui/Fold";

/** The calendars in the order the person keeps them: their own order first, then any new ones. */
export function orderCalendars(calendars: GoogleCalendarInfo[], order: string[]): GoogleCalendarInfo[] {
  const at = new Map(order.map((id, i) => [id, i]));
  return [...calendars].sort((a, b) => (at.get(a.id) ?? 1e6 + calendars.indexOf(a)) - (at.get(b.id) ?? 1e6 + calendars.indexOf(b)));
}

/**
 * Every Google calendar (subscribed ones too) as one list (owner, Nov 3): tap a row to show or hide it,
 * drag a row to reorder (no grips), the box at its right archives it. Archived calendars wait in a fold
 * at the bottom, not loaded, and come back with Restore.
 */
export function CalendarList({
  calendars,
  hidden,
  order,
  archived,
  isAdventure,
  onToggle,
  onOrder,
  onArchive,
}: {
  calendars: GoogleCalendarInfo[];
  hidden: string[];
  order: string[];
  archived: string[];
  isAdventure: boolean;
  onToggle: (id: string) => void;
  onOrder: (ids: string[]) => void;
  onArchive: (id: string, archive: boolean) => void;
}) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const sorted = orderCalendars(calendars, order);
  const live = sorted.filter((c) => !archived.includes(c.id));
  // Archived ones the server skipped aren't in the list any more: keep their names from the order.
  const gone = archived.map((id) => sorted.find((c) => c.id === id) ?? { id, name: nameFromId(id), color: null, primary: false });
  const onEnd = (e: DragEndEvent) => {
    const ids = live.map((c) => c.id);
    const from = ids.indexOf(String(e.active.id));
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onOrder([...arrayMove(ids, from, to), ...archived]);
  };
  return (
    <div className="flex flex-col">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={live.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {live.map((c) => (
            <Row key={c.id} cal={c} on={!hidden.includes(c.id)} isAdventure={isAdventure} onToggle={() => onToggle(c.id)} onArchive={() => onArchive(c.id, true)} />
          ))}
        </SortableContext>
      </DndContext>
      {gone.length > 0 && (
        <details className="group mt-1 px-2">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
            Archived ({gone.length})
          </summary>
          <Fold open>
            <div className="flex flex-col gap-0.5 pb-1">
              {gone.map((c) => (
                <div key={c.id} className="flex min-h-8 items-center gap-2 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
                  <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ border: `2px solid ${c.color ?? "#a58c66"}`, opacity: 0.6 }} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <button type="button" onClick={() => onArchive(c.id, false)} className="h-7 shrink-0 rounded-full px-2.5 text-[12.5px] font-semibold" style={{ border: "1px solid #a88a3f", color: "var(--t-ink)" }}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </Fold>
        </details>
      )}
    </div>
  );
}

function nameFromId(id: string) {
  const at = id.indexOf("@");
  return at > 0 ? id.slice(0, at) : id;
}

function Row({ cal, on, isAdventure, onToggle, onArchive }: { cal: GoogleCalendarInfo; on: boolean; isAdventure: boolean; onToggle: () => void; onArchive: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cal.id });
  const color = cal.color;
  return (
    <div
      ref={setNodeRef}
      className="group/cal relative flex items-center rounded-lg hover:bg-black/[.05]"
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 2 : undefined, boxShadow: isDragging ? "0 6px 16px rgba(0,0,0,.25)" : undefined, background: isDragging ? "var(--t-card, #fbf3df)" : undefined }}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className="flex min-h-10 min-w-0 flex-1 touch-manipulation items-center gap-2.5 px-2 text-left text-[14.5px]"
      >
        <span
          aria-hidden
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px]"
          style={{ background: on ? (color ?? (isAdventure ? "#c99a2e" : "var(--t-accent)")) : "transparent", border: `2px solid ${color ?? (isAdventure ? "#8a6116" : "var(--t-accent)")}` }}
        >
          {on && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate" style={{ color: "var(--t-ink)" }}>
          {cal.name}
        </span>
      </button>
      {!cal.primary && (
        <button
          type="button"
          onClick={onArchive}
          aria-label={`Archive ${cal.name}`}
          title="Archive (stop loading it)"
          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-35 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover/cal:opacity-80"
          style={{ color: "var(--t-ink-soft)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="4" width="18" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
