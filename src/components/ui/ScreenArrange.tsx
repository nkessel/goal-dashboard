"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GearIcon } from "@/components/ui/Icons";
import { readLayout, saveLayout, subscribeLayout, type ScreenLayout } from "@/lib/screen-layout";

const GOLD = "#8a6116";

export type ScreenPart = {
  key: string;
  label: string;
  hint?: string;
  /** What it shows; null when there's nothing right now (it keeps its place). */
  node: React.ReactNode;
  /** Can't be hidden (the screen's main thing). */
  keep?: boolean;
};

/**
 * A screen in the order you chose, with a gear (top right, on hover; faint on
 * phones) that arranges it right here: every part drags, the eye in its
 * corner hides it, hidden parts wait as + chips. The same pattern as Today
 * and the welcome screen (HANDOFF §5, "Settings in context").
 */
export function ScreenArrange({ screen, name, parts, gap = "gap-4", gearClass = "-top-3 right-0" }: { screen: string; name: string; parts: ScreenPart[]; gap?: string; gearClass?: string }) {
  const keys = parts.map((p) => p.key);
  const keysId = keys.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys are compared by value
  const defaults = useMemo(() => keys, [keysId]);
  const read = useCallback(() => readLayout(screen, defaults), [screen, defaults]);
  const server = useMemo<ScreenLayout>(() => ({ order: defaults, hidden: [] }), [defaults]);
  const layout = useSyncExternalStore(subscribeLayout, read, () => server);
  const [arranging, setArranging] = useState(false);
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const shown = layout.order.filter((k) => !layout.hidden.includes(k) || byKey.get(k)?.keep);

  return (
    <div className={`group/arrange relative flex flex-col ${gap}`}>
      <button
        type="button"
        onClick={() => setArranging((v) => !v)}
        aria-pressed={arranging}
        aria-label={arranging ? `Done arranging ${name}` : `Arrange ${name}`}
        title={arranging ? "Done arranging" : `Arrange ${name}`}
        className={`settings-gear absolute z-[3] flex h-8 w-8 items-center justify-center rounded-full transition-opacity ${gearClass} ${arranging ? "opacity-100" : "opacity-0 group-hover/arrange:opacity-80 focus-visible:opacity-100 [@media(hover:none)]:opacity-45"}`}
        style={{ color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }}
      >
        <GearIcon size={16} />
      </button>
      {arranging ? (
        <Arranging screen={screen} name={name} layout={layout} defaults={defaults} byKey={byKey} onDone={() => setArranging(false)} />
      ) : (
        shown.map((k) => {
          const node = byKey.get(k)?.node;
          return node ? <div key={k} className="contents">{node}</div> : null;
        })
      )}
    </div>
  );
}

function Arranging({ screen, name, layout, defaults, byKey, onDone }: { screen: string; name: string; layout: ScreenLayout; defaults: string[]; byKey: Map<string, ScreenPart>; onDone: () => void }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const isHidden = (k: string) => layout.hidden.includes(k) && !byKey.get(k)?.keep;
  const shown = layout.order.filter((k) => !isHidden(k));
  const hidden = layout.order.filter(isHidden);
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(shown, shown.indexOf(String(active.id)), shown.indexOf(String(over.id)));
    saveLayout(screen, { ...layout, order: [...next, ...hidden] });
  }
  const toggle = (k: string) => saveLayout(screen, { ...layout, hidden: layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  const isDefault = layout.hidden.length === 0 && layout.order.join("|") === defaults.join("|");
  const label = (k: string) => byKey.get(k)?.label ?? k;

  return (
    <div className="reveal parchment flex flex-col gap-2 rounded-3xl p-3" style={{ border: "1.5px solid #a88a3f" }}>
      <div className="flex items-center gap-2 pr-9">
        <h2 className="m-0 font-display text-[19px]" style={{ color: "#2a1c10" }}>
          Arrange {name}
        </h2>
        <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: "#6b5631" }}>
          Drag parts to move them; the eye hides one.
        </span>
      </div>
      <DndContext id={`dnd-arrange-${screen}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          {shown.map((k) => {
            const p = byKey.get(k);
            return p ? <Part key={k} part={p} onHide={p.keep ? null : () => toggle(k)} /> : null;
          })}
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
        <button type="button" onClick={() => saveLayout(screen, null)} disabled={isDefault} className="text-[12.5px] underline underline-offset-2 disabled:no-underline disabled:opacity-40" style={{ color: "#6b5631" }}>
          Reset
        </button>
        <button type="button" onClick={onDone} className="ml-auto h-8 shrink-0 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          Done
        </button>
      </div>
    </div>
  );
}

function Part({ part, onHide }: { part: ScreenPart; onHide: (() => void) | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: part.key });
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
        border: "1.5px solid rgba(139,112,64,.4)",
        background: isDragging ? "rgba(255,248,228,.97)" : "rgba(255,250,238,.45)",
        boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,.25)" : undefined,
      }}
    >
      <div className="flex min-h-7 items-baseline gap-2 pr-8">
        <span className="shrink-0 text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
          {part.label}
        </span>
        {part.hint && (
          <span className="min-w-0 truncate text-[12px]" style={{ color: "#7a6440" }}>
            {part.hint}
          </span>
        )}
      </div>
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Hide ${part.label}`}
          title="Hide this part"
          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]"
          style={{ color: "#6b5631" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
            <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {part.node && (
        // How it looks (not live while arranging), kept short.
        <div inert className="pointer-events-none max-h-[84px] overflow-hidden" style={{ maskImage: "linear-gradient(180deg,#000 55%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 55%,transparent)" }}>
          {part.node}
        </div>
      )}
    </div>
  );
}
