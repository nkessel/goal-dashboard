"use client";

import { useState, useSyncExternalStore } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MENUS, layoutFor, menuLabel, readMenuLayouts, saveMenuLayoutFor, serverMenuLayouts, subscribeMenuLayouts } from "@/lib/menu-layouts";
import { GearIcon } from "@/components/ui/Icons";

/*
 * A context menu arranged where it opens, like the quest card's (owner, Nov 16:
 * "re-order and also edit the names of the context menu options here and in
 * other context menus"): its gear turns the items into rows you drag into
 * order, rename with a tap, and hide with the eye. Kept in this browser with
 * the Settings › Layout choices (lib/menu-layouts).
 */

export function useMenuLayouts() {
  return useSyncExternalStore(subscribeMenuLayouts, readMenuLayouts, serverMenuLayouts);
}

/** An item's words in a menu: yours if you renamed it. `k` is the item's key, or "key:state" when its words change. */
export function MenuLabel({ menu, k, children }: { menu?: string; k?: string; children: string }) {
  const all = useMenuLayouts();
  if (!menu || !k) return <>{children}</>;
  // An item whose words change with its state is only renamed per state ("key:state").
  if (!k.includes(":") && MENUS.find((m) => m.id === menu)?.items.find((i) => i.key === k)?.varies) return <>{children}</>;
  return <>{menuLabel(all, menu, k, children)}</>;
}

/** The gear at a menu's top right that turns arranging on and off. */
export function MenuGear({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      data-menu-gear
      aria-label={on ? "Done arranging this menu" : "Arrange this menu: order, names and which items show"}
      title={on ? "Done arranging" : "Arrange this menu"}
      className="absolute right-1.5 top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5"
      style={{ color: "var(--t-ink-soft)", background: on ? "rgba(217,180,95,.3)" : undefined, order: -1 }}
    >
      {on ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#5c7a2e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <GearIcon size={15} />
      )}
    </button>
  );
}

/** The menu's items as rows to drag, rename and hide. `states` names the state shown now for items whose words change ({ core: "on" }), with those words. */
export function MenuArrange({ menu, states = {} }: { menu: string; states?: Record<string, { state: string; label: string }> }) {
  const all = useMenuLayouts();
  const def = MENUS.find((m) => m.id === menu)!;
  const layout = layoutFor(def, all[menu]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    saveMenuLayoutFor(menu, { ...layout, order: arrayMove(layout.order, layout.order.indexOf(String(e.active.id)), layout.order.indexOf(String(e.over.id))) });
  }
  const toggle = (k: string) => saveMenuLayoutFor(menu, { ...layout, hidden: layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  return (
    <div data-menu-arrange className="reveal relative z-[1] flex flex-col pb-1 pt-2">
      <span className="px-3.5 pb-1 pr-10 text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        Drag to reorder; tap a name to rename it; the eye hides an item.
      </span>
      <DndContext id={`dnd-menu-${menu}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={layout.order} strategy={verticalListSortingStrategy}>
          {layout.order.map((k) => {
            const it = def.items.find((i) => i.key === k)!;
            const st = states[k];
            const lk = st ? `${k}:${st.state}` : k;
            const usual = st ? st.label : it.label;
            return (
              <ArrangeRow
                key={k}
                id={k}
                label={menuLabel(all, menu, lk, usual)}
                hidden={layout.hidden.includes(k)}
                canHide={!it.keep}
                onToggle={() => toggle(k)}
                onRename={(words) => {
                  const labels = { ...(layout.labels ?? {}) };
                  const w = words.trim();
                  if (w && w !== usual) labels[lk] = w;
                  else delete labels[lk];
                  saveMenuLayoutFor(menu, { ...layout, labels });
                }}
              />
            );
          })}
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
      data-arrange-row={id}
      className={`flex min-h-10 touch-manipulation items-center gap-2 pl-4 pr-1.5 text-[14.5px] ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: "relative", background: isDragging ? "var(--t-card, #f6ecd2)" : undefined, boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,.25)" : undefined, opacity: hidden ? 0.45 : 1 }}
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
          className="bare-input min-w-0 flex-1 bg-transparent text-[16px] outline-none"
          style={{ borderBottom: "1px solid #c8a24a" }}
        />
      ) : (
        <button type="button" onClick={() => setNaming(true)} onPointerDown={(e) => e.stopPropagation()} title="Tap to rename" className={`min-h-9 min-w-0 flex-1 text-left ${hidden ? "line-through" : ""}`}>
          {label}
        </button>
      )}
      {canHide && (
        <button type="button" onClick={onToggle} onPointerDown={(e) => e.stopPropagation()} aria-label={hidden ? `Show ${label}` : `Hide ${label}`} title={hidden ? "Show it" : "Hide it"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            {hidden ? <circle cx="12" cy="12" r="2.6" fill="currentColor" /> : <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
          </svg>
        </button>
      )}
    </div>
  );
}
