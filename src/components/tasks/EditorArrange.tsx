"use client";

import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DEFAULT_EDITOR_LAYOUT, EDITOR_PARTS, saveEditorLayout, type EditorLayout, type EditorPart } from "@/lib/quest-editor-layout";

/*
 * The quest editor's gear arranges the editor right where it is: each part
 * drags (the whole part, no grips) and has a hide in its top-right corner that
 * tucks it under "More" (or brings it back up). The "More" line drags too:
 * everything below it waits under the fold.
 */

const FOLD = "__more__";
const GOLD = "#8a6116";
const SOFT = "var(--t-ink-soft)";

export function EditorArrange({ layout, shown, names, previews, onDone }: {
  layout: EditorLayout;
  /** Parts that apply to this quest (others still arrange, marked as not shown here). */
  shown: Record<EditorPart, boolean>;
  names: Partial<Record<EditorPart, string>>;
  previews: Partial<Record<EditorPart, React.ReactNode>>;
  onDone: () => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const surface = layout.order.filter((k) => !layout.folded.includes(k));
  const folded = layout.order.filter((k) => layout.folded.includes(k));
  const items: string[] = [...surface, FOLD, ...folded];
  const save = (list: string[]) => {
    const at = list.indexOf(FOLD);
    const order = list.filter((k) => k !== FOLD) as EditorPart[];
    saveEditorLayout({ order, folded: list.slice(at + 1) as EditorPart[], v: 2 });
  };
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    save(arrayMove(items, items.indexOf(String(active.id)), items.indexOf(String(over.id))));
  }
  const toggle = (k: EditorPart) => {
    const rest = items.filter((x) => x !== k);
    const at = rest.indexOf(FOLD);
    // Tucked away: first under More. Brought back: last on the surface.
    save(layout.folded.includes(k) ? [...rest.slice(0, at), k, ...rest.slice(at)] : [...rest.slice(0, at + 1), k, ...rest.slice(at + 1)]);
  };
  const label = (k: EditorPart) => names[k] ?? EDITOR_PARTS.find((p) => p.key === k)?.label ?? k;

  return (
    <div className="reveal flex flex-col gap-1.5">
      <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12.5px]" style={{ background: "rgba(217,180,95,.16)", border: "1px solid rgba(139,112,64,.35)", color: "var(--t-ink)" }}>
        <span className="min-w-0 flex-1">Drag parts to move them; the eye tucks one under More.</span>
        <button type="button" onClick={() => saveEditorLayout(null)} disabled={JSON.stringify(layout.order) === JSON.stringify(DEFAULT_EDITOR_LAYOUT.order) && JSON.stringify(layout.folded) === JSON.stringify(DEFAULT_EDITOR_LAYOUT.folded)} className="shrink-0 underline underline-offset-2 disabled:no-underline disabled:opacity-40" style={{ color: SOFT }}>
          Reset
        </button>
      </div>
      <DndContext id="dnd-quest-editor" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((k) =>
            k === FOLD ? (
              <FoldLine key={k} count={folded.length} />
            ) : (
              <Part key={k} id={k as EditorPart} label={label(k as EditorPart)} under={layout.folded.includes(k as EditorPart)} applies={shown[k as EditorPart]} onToggle={() => toggle(k as EditorPart)}>
                {previews[k as EditorPart]}
              </Part>
            )
          )}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[12px]" style={{ color: SOFT }}>
          Also in Settings › Quest editor
        </span>
        <button type="button" onClick={onDone} className="ml-auto h-8 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          Done
        </button>
      </div>
    </div>
  );
}

function FoldLine({ count }: { count: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: FOLD });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label="The More fold: parts below it wait under More"
      className={`flex min-h-8 touch-manipulation items-center gap-2 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
    >
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(139,112,64,.6))" }} />
      <span className="text-[12px] font-bold uppercase tracking-[.1em]" style={{ color: GOLD }}>
        Under More{count ? ` · ${count}` : ""}
      </span>
      <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(139,112,64,.6), transparent)" }} />
    </div>
  );
}

function Part({ id, label, under, applies, onToggle, children }: { id: EditorPart; label: string; under: boolean; applies: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    // The whole part drags: press and move it.
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`relative flex w-full touch-manipulation flex-col gap-1 rounded-xl px-2.5 py-1.5 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
        border: `1.5px ${under ? "dashed" : "solid"} rgba(139,112,64,${under ? 0.35 : 0.45})`,
        background: isDragging ? "rgba(255,248,228,.97)" : under ? "transparent" : "rgba(255,250,238,.45)",
        boxShadow: isDragging ? "0 10px 24px rgba(0,0,0,.25)" : undefined,
        opacity: applies ? 1 : 0.7,
      }}
    >
      <div className="flex min-h-7 items-center gap-1.5 pr-8">
        <span className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
          {label}
        </span>
        {!applies && (
          <span className="shrink-0 text-[11.5px] italic" style={{ color: SOFT }}>
            not on this quest
          </span>
        )}
      </div>
      {/* Hide (tuck under More) or bring back, in the top-right corner. */}
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={under ? `Show ${label} on the surface` : `Tuck ${label} under More`}
        title={under ? "Show on the surface" : "Tuck under More"}
        className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]"
        style={{ color: SOFT }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          {under ? <circle cx="12" cy="12" r="2.6" fill="currentColor" /> : <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />}
        </svg>
      </button>
      {children && !under && (
        // How it looks (not live while arranging), kept short.
        <div inert className="pointer-events-none max-h-[72px] overflow-hidden" style={{ maskImage: "linear-gradient(180deg,#000 60%,transparent)", WebkitMaskImage: "linear-gradient(180deg,#000 60%,transparent)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
