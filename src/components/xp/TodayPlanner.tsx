"use client";

import { useState, useTransition } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addToTopOfTodayAction, reorderTasksAction, toggleManualPriorityAction } from "@/app/actions";
import { dueSoonList } from "@/lib/toucan-guide";
import { dueWindowLabel, readDueHours, saveDueHours } from "@/lib/due-soon";
import { DueWindowPicker } from "@/components/tasks/DueWindowPicker";

type Lite = { id: string; title: string; due_at: string | null; icon?: string | null; xp?: number; board?: string | null };

const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;
const INK = "#3d2f18";
const SOFT = "#6b5631";

/** "today", "tomorrow", "Tue", or "3 days ago". */
function dueWord(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 0) return diff === -1 ? "yesterday" : `${-diff} days ago`;
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Choose today's quests, right on the welcome screen: a gilded button opens a
 * tray with Due soon at its top (within the reach you pick) and Today's
 * Quests below. Drag a due quest down into today (or tap its +), drag today's
 * into order, × takes one off today. Saved as you go.
 */
export function TodayPlanner({ today: initialToday, due, label, icon }: { today: Lite[]; due: Lite[]; /** The button's own words and emoji (welcome button editor). */ label?: string; icon?: string }) {
  const [open, setOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(true);
  const [today, setToday] = useState(initialToday);
  const [hours, setHours] = useState(readDueHours);
  const [picking, setPicking] = useState(false);
  const [reachBtn, setReachBtn] = useState<HTMLButtonElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const onToday = new Set(today.map((t) => t.id));
  const soon = dueSoonList(due, undefined, hours).filter((t) => !onToday.has(t.id));
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 6 } }));

  const save = (fn: () => Promise<unknown>, undo: Lite[]) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setToday(undo);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  function add(q: Lite, at = today.length) {
    const before = today;
    const next = [...today.slice(0, at), q, ...today.slice(at)];
    setToday(next);
    save(async () => {
      await addToTopOfTodayAction(q.id);
      await reorderTasksAction(next.map((t) => t.id));
    }, before);
  }
  function remove(id: string) {
    const before = today;
    setToday(today.filter((t) => t.id !== id));
    save(() => toggleManualPriorityAction(id, false), before);
  }
  function onDragEnd(e: DragEndEvent) {
    const a = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (a.startsWith("d:")) {
      const q = soon.find((t) => `d:${t.id}` === a);
      if (!q) return;
      const at = over.startsWith("t:") ? today.findIndex((t) => `t:${t.id}` === over) : today.length;
      if (over === "today-zone" || over.startsWith("t:")) add(q, at < 0 ? today.length : at);
      return;
    }
    if (a.startsWith("t:") && over.startsWith("t:") && a !== over) {
      const before = today;
      const next = arrayMove(today, today.findIndex((t) => `t:${t.id}` === a), today.findIndex((t) => `t:${t.id}` === over));
      setToday(next);
      save(() => reorderTasksAction(next.map((t) => t.id)), before);
    }
  }

  return (
    <div className="flex w-full flex-col items-center">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={GILT}>
        {icon ? (
          <span aria-hidden>{icon}</span>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 6.5h11M4 12h16M4 17.5h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        )}
        {label || <>Choose today&rsquo;s quests</>}{today.length ? ` (${today.length})` : ""}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="drawer-body w-full" data-open={open ? "true" : "false"}>
        <div className="drawer-inner" inert={!open}>
          <DndContext id="dnd-today-planner" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <div className="mt-2 flex w-full flex-col gap-2 rounded-2xl p-2.5 text-left" style={{ background: "rgba(60,40,18,.08)", border: "1px solid rgba(139,112,64,.35)" }}>
              {/* Due soon, at the top: drag from here into today. */}
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setDueOpen((v) => !v)} aria-expanded={dueOpen} className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: INK }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: dueOpen ? "rotate(90deg)" : undefined }}>
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {soon.length ? `${soon.length} ${soon.length === 1 ? "quest" : "quests"} due within` : "Nothing else due within"}
                </button>
                <button ref={setReachBtn} type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking} className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold" style={GILT}>
                  {dueWindowLabel(hours)} ▾
                </button>
                {picking && (
                  <DueWindowPicker
                    hours={hours}
                    onPick={(h) => {
                      setPicking(false);
                      setHours(h);
                      saveDueHours(h);
                    }}
                    onClose={() => setPicking(false)}
                    ink={SOFT}
                    isAdventure={false}
                    paper
                    anchor={reachBtn}
                  />
                )}
              </div>
              <div className="drawer-body" data-open={dueOpen ? "true" : "false"}>
                <div className="drawer-inner" inert={!dueOpen}>
                  <div className="flex flex-col gap-1">
                    {soon.map((q) => (
                      <DueRow key={q.id} q={q} onAdd={() => add(q)} />
                    ))}
                  </div>
                </div>
              </div>
              <TodayZone>
                <span className="font-display text-[15px]" style={{ color: "#8a6116" }}>
                  Today&rsquo;s quests
                </span>
                <SortableContext items={today.map((t) => `t:${t.id}`)} strategy={verticalListSortingStrategy}>
                  {today.map((q) => (
                    <TodayRow key={q.id} q={q} onRemove={() => remove(q.id)} />
                  ))}
                </SortableContext>
                {!today.length && (
                  <span className="py-2 text-center text-[13px] italic" style={{ color: SOFT }}>
                    Drag quests here, or tap their +
                  </span>
                )}
              </TodayZone>
              {error && (
                <span className="text-[12.5px]" style={{ color: "#a33" }}>
                  {error}
                </span>
              )}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

/** Drawn like a quest card on Today: parchment, the portrait in its ring, the title, board and XP. */
const CARD = { background: "linear-gradient(180deg,#f8eed6,#ecdcb4)", border: "1.5px solid #b39a6a", boxShadow: "0 2px 5px rgba(60,40,10,.18), inset 0 1px 0 rgba(255,255,255,.5)" } as const;
function CardBody({ q, meta }: { q: Lite; meta: React.ReactNode }) {
  const sub = [q.board ? <span key="b">{q.board}</span> : null, meta].filter(Boolean);
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "2px solid #a58c66", boxShadow: "0 0 0 2px rgba(217,180,95,.45)", background: "radial-gradient(circle at 40% 35%, #fbf3dc, #ecdcb4)" }}>
        {q.icon && (
          // eslint-disable-next-line @next/next/no-img-element -- quest portrait
          <img src={q.icon} alt="" draggable={false} className="h-full w-full object-cover" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug" style={{ color: INK }}>
          {q.title}
        </span>
        {sub.length > 0 && (
          <span className="flex gap-1.5 truncate text-[12px]" style={{ color: SOFT }}>
            {sub.map((x, i) => (
              <span key={i}>
                {i > 0 && "· "}
                {x}
              </span>
            ))}
          </span>
        )}
      </span>
      {!!q.xp && (
        <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: "#4f6d3c" }}>
          {q.xp} XP
        </span>
      )}
    </>
  );
}

function DueRow({ q, onAdd }: { q: Lite; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `d:${q.id}` });
  const [now] = useState(() => Date.now());
  const past = q.due_at && Date.parse(q.due_at) < now;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`due-in flex min-h-14 touch-manipulation items-center gap-2.5 rounded-2xl px-2.5 py-1.5 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ ...CARD, transform: CSS.Translate.toString(transform), zIndex: isDragging ? 10 : undefined, boxShadow: isDragging ? "0 10px 22px rgba(0,0,0,.25)" : CARD.boxShadow }}
    >
      <CardBody q={q} meta={<span style={{ color: past ? "#93402c" : SOFT }}>{dueWord(q.due_at)}</span>} />
      <button type="button" onClick={onAdd} onPointerDown={(e) => e.stopPropagation()} aria-label={`Add “${q.title}” to today`} title="Add to today" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] leading-none" style={GILT}>
        +
      </button>
    </div>
  );
}

function TodayZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "today-zone" });
  return (
    <div ref={setNodeRef} className="flex flex-col gap-1 rounded-xl p-2 transition-colors" style={{ background: isOver ? "rgba(217,180,95,.22)" : "rgba(255,250,238,.45)", border: `1.5px ${isOver ? "solid" : "dashed"} rgba(168,138,63,.6)` }}>
      {children}
    </div>
  );
}

function TodayRow({ q, onRemove }: { q: Lite; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `t:${q.id}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`due-in flex min-h-14 touch-manipulation items-center gap-2.5 rounded-2xl px-2.5 py-1.5 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ ...CARD, border: "1.5px solid #c99a3a", transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 10 : undefined, boxShadow: isDragging ? "0 10px 22px rgba(0,0,0,.25)" : CARD.boxShadow }}
    >
      <CardBody q={q} meta={q.due_at ? <span>due {dueWord(q.due_at)}</span> : null} />
      <button type="button" onClick={onRemove} onPointerDown={(e) => e.stopPropagation()} aria-label={`Take “${q.title}” off today`} title="Off today" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] leading-none hover:bg-black/[.06]" style={{ color: SOFT }}>
        ×
      </button>
    </div>
  );
}
