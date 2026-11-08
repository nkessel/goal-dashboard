"use client";

import { useState } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CloseIcon } from "@/components/ui/Icons";

/**
 * Your reflection questions: edit one in place, × removes it, drag a row to
 * reorder (no grips: the row itself moves), and a line at the bottom adds one.
 */
export function ReflectionList({ list, onChange }: { list: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const ids = list.map((q, i) => `${i}:${q}`);
  const onEnd = (e: DragEndEvent) => {
    const from = ids.indexOf(String(e.active.id));
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onChange(arrayMove(list, from, to));
  };
  const add = () => {
    const q = draft.replace(/\s+/g, " ").trim();
    if (!q) return;
    if (!list.includes(q)) onChange([...list, q]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {list.map((q, i) => (
            <Row key={ids[i]} id={ids[i]} value={q} onSave={(v) => onChange(v ? list.map((x, j) => (j === i ? v : x)) : list.filter((_, j) => j !== i))} onRemove={() => onChange(list.filter((_, j) => j !== i))} />
          ))}
        </SortableContext>
      </DndContext>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 300))}
          placeholder="+ Add a question…"
          aria-label="Add a reflection question"
          className="h-8 min-w-0 flex-1 rounded-full border bg-[rgba(255,250,238,.6)] px-3 text-[16px] italic outline-none focus:ring-2 focus:ring-[rgba(138,97,22,.3)] sm:text-[14px]"
          style={{ borderColor: "rgba(139,112,64,.45)", color: "var(--t-ink)" }}
        />
        {draft.trim() && (
          <button type="submit" className="reveal h-8 rounded-full px-3 text-[13px] font-semibold" style={{ background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Add
          </button>
        )}
      </form>
    </div>
  );
}

function Row({ id, value, onSave, onRemove }: { id: string; value: string; onSave: (v: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [text, setText] = useState(value);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`due-in flex items-center gap-1 rounded-xl py-1 pl-2.5 pr-1 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined, background: isDragging ? "rgba(255,248,228,.97)" : "rgba(255,250,238,.45)", border: "1px solid rgba(139,112,64,.3)", boxShadow: isDragging ? "0 8px 18px rgba(0,0,0,.2)" : undefined }}
    >
      <textarea
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value.replace(/\n/g, " ").slice(0, 300))}
        onBlur={() => text.trim() !== value && onSave(text.replace(/\s+/g, " ").trim())}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Reflection question"
        className="min-w-0 flex-1 resize-none bg-transparent text-[16px] leading-snug outline-none [field-sizing:content] sm:text-[14px]"
        style={{ color: "var(--t-ink)" }}
      />
      <button type="button" onClick={onRemove} onPointerDown={(e) => e.stopPropagation()} aria-label="Remove this question" title="Remove" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
        <CloseIcon size={9} />
      </button>
    </div>
  );
}
