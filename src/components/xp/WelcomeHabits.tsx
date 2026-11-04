"use client";

import { useCallback, useEffect, useState } from "react";
import { completeRiteAction, createRiteAction, reorderRitesAction, uncompleteRiteAction, welcomeHabitsAction } from "@/app/actions";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocalDay } from "@/components/evening/evening-clock";
import { HABIT_PILLS, openLanguageWindow } from "@/components/xp/LearnLanguage";
import { Fold } from "@/components/ui/Fold";
import { Confirm } from "@/components/toucan/SayingFeedback";
import { patchFx, type FxSettings } from "@/lib/celebration-fx";

export type WelcomeHabit = { id: string; title: string; xp: number; today: boolean; done: boolean };

const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;
const SOFT = "#6b5631";

/** "+ Add a habit": a name line right where the button was (no popup); the new habit shows at once. */
function AddHabit({ onAdded, height = 36 }: { onAdded: (id: string) => void; height?: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center rounded-full border border-dashed px-3 text-[13px] font-semibold" style={{ height, borderColor: "#b39a6a", color: SOFT }}>
        + Add a habit
      </button>
    );
  return (
    <form
      className="reveal flex w-full items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        setErr(null);
        try {
          const id = await createRiteAction({ title: name.trim(), isCore: false, slot: "day" });
          setName("");
          setOpen(false);
          onAdded(id);
        } catch (x) {
          setErr(x instanceof Error ? x.message : "That didn't save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="A new daily habit" aria-label="New habit's name" className="h-9 min-w-0 flex-1 rounded-full px-3 text-[16px]" style={{ background: "rgba(255,250,238,.92)", border: "1px solid #b39a6a", color: "#2a1c10" }} />
      <button type="submit" disabled={!name.trim() || busy} className="font-display h-9 shrink-0 rounded-full px-3.5 text-[14px] disabled:opacity-50" style={GILT}>
        {busy ? "Adding…" : "Add ✦"}
      </button>
      <button type="button" onClick={() => (setOpen(false), setName(""))} aria-label="Never mind" className="h-9 w-7 shrink-0 text-[18px] leading-none" style={{ color: SOFT }}>
        ×
      </button>
      {err && <span className="w-full text-[12px]" style={{ color: "#a33" }}>{err}</span>}
    </form>
  );
}

/** Your daily habits for the welcome screen (null while loading); refetch after adding one. */
export function useWelcomeHabits() {
  const day = useLocalDay();
  const [list, setList] = useState<WelcomeHabit[] | null>(null);
  const load = useCallback(() => {
    if (!day) return;
    welcomeHabitsAction(day)
      .then(setList)
      .catch(() => setList((l) => l ?? []));
  }, [day]);
  useEffect(load, [load]);
  return { day, list, setList, load };
}

/**
 * The welcome screen's Habits part: a gilded Habits button that slides open
 * today's habits you picked (in edit mode, its ✎), each a button you tap when
 * it's done (tap again to undo); the phrase tool pills sit with them.
 */
export function WelcomeHabits({ fx }: { fx: FxSettings }) {
  const { day, list, setList, load } = useWelcomeHabits();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const picked = fx.welcomeHabitIds;
  const shown = (list ?? []).filter((h) => h.today && (!picked || picked.includes(h.id)));
  const tools = HABIT_PILLS.filter((p) => (fx.welcomeHabitPills ?? HABIT_PILLS.map((x) => x.key)).includes(p.key));
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  // Drag a habit to reorder (owner, Nov 4: "the habits aren't reorderable"); the same order as Today's Daily Habits.
  function onDragEnd(e: DragEndEvent) {
    if (!list || !e.over || e.active.id === e.over.id) return;
    const ids = list.map((h) => h.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setList(next.map((id) => list.find((h) => h.id === id)!));
    reorderRitesAction(next).catch(() => setSaid("That order didn't save. Try again?"));
  }
  function toggle(h: WelcomeHabit) {
    if (!day) return;
    const next = !h.done;
    setList((l) => (l ?? []).map((x) => (x.id === h.id ? { ...x, done: next } : x)));
    setSaid(next ? `${h.title.replace(/\s+\S*\p{Extended_Pictographic}\S*$/u, "")} ✓${h.xp ? ` +${h.xp} XP` : ""}` : "Taken back");
    (next ? completeRiteAction(h.id, day) : uncompleteRiteAction(h.id, day)).catch(() => {
      setList((l) => (l ?? []).map((x) => (x.id === h.id ? { ...x, done: !next } : x)));
      setSaid("That didn't save. Try again?");
    });
  }
  return (
    <div className="flex w-full flex-col items-center">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={GILT}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 21c-4.5-2.6-7-6-7-9.6A4.4 4.4 0 0 1 12 8.6a4.4 4.4 0 0 1 7 2.8C19 15 16.5 18.4 12 21z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 8.6V4.5M12 4.5c1.2-1.3 2.8-1.6 4-1.2-.3 1.6-1.9 2.6-4 1.2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Habits
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open} eager className="w-full">
        <div className="flex flex-wrap justify-center gap-1.5 px-1 pt-2">
          {list === null && (
            <span className="text-[13px] italic" style={{ color: SOFT }}>
              Gathering your habits…
            </span>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={shown.map((h) => h.id)} strategy={rectSortingStrategy}>
              {shown.map((h) => (
                <SortablePill key={h.id} id={h.id}>
                  <button
                    type="button"
                    aria-pressed={h.done}
                    onClick={() => toggle(h)}
                    className="welcome-habit flex h-9 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold"
                    data-done={h.done ? "true" : "false"}
                  >
                    <span aria-hidden className="welcome-habit-check flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full">
                      {h.done && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{h.title}</span>
                  </button>
                </SortablePill>
              ))}
            </SortableContext>
          </DndContext>
          {tools.map((p) => (
            <button key={p.key} type="button" onClick={openLanguageWindow} className="font-display flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14.5px]" style={GILT}>
              <span aria-hidden>{p.icon}</span>
              {/* A habit of the same name sits beside it, so this one says what it does. */}
              {p.key === "language" ? "Practice a phrase" : p.label}
            </button>
          ))}
          {list !== null && !shown.length && (
            <span className="w-full text-center text-[13px] italic" style={{ color: SOFT }}>
              {list.length ? "None of your picked habits fall on today." : "No daily habits yet."}
            </span>
          )}
          <AddHabit
            onAdded={(id) => {
              // A habit added here shows here (even if you'd picked a list before).
              if (picked) patchFx({ welcomeHabitIds: [...picked, id] });
              load();
            }}
          />
        </div>
        <div className="flex justify-center">
          <Confirm text={said} onDone={() => setSaid(null)} />
        </div>
      </Fold>
    </div>
  );
}

/** The Habits part's options (its ✎ or a long press while arranging): which habits show, and add one. */
export function HabitOptions({ fx }: { fx: FxSettings }) {
  const { list, load } = useWelcomeHabits();
  const all = list ?? [];
  const picked = fx.welcomeHabitIds ?? all.map((h) => h.id);
  const set = (p: Partial<FxSettings>) => patchFx(p);
  const pills = fx.welcomeHabitPills ?? HABIT_PILLS.map((x) => x.key);
  return (
    <div className="flex w-full flex-col gap-1.5 py-1">
      <span className="text-[12px]" style={{ color: SOFT }}>
        Show these habits as buttons (on the days they fall):
      </span>
      <div className="flex flex-wrap gap-1.5">
        {all.map((h) => {
          const on = picked.includes(h.id);
          return (
            <button key={h.id} type="button" aria-pressed={on} onClick={() => set({ welcomeHabitIds: on ? picked.filter((id) => id !== h.id) : [...picked, h.id] })} className="welcome-habit-pick flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" data-on={on ? "true" : "false"}>
              {on ? "✓ " : ""}
              {h.title}
            </button>
          );
        })}
        {HABIT_PILLS.map((p) => {
          const on = pills.includes(p.key);
          return (
            <button key={p.key} type="button" aria-pressed={on} onClick={() => set({ welcomeHabitPills: on ? pills.filter((k) => k !== p.key) : [...pills, p.key] })} className="welcome-habit-pick flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" data-on={on ? "true" : "false"}>
              {on ? "✓ " : ""}
              {p.icon} {p.label}
            </button>
          );
        })}
        <AddHabit
          height={32}
          onAdded={(id) => {
            if (fx.welcomeHabitIds) set({ welcomeHabitIds: [...fx.welcomeHabitIds, id] });
            load();
          }}
        />
      </div>
    </div>
  );
}

/** A habit pill you can drag into a new place (a tap still ticks it). */
function SortablePill({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span ref={setNodeRef} {...attributes} {...listeners} role="presentation" className="touch-manipulation" style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: "relative", maxWidth: "100%", cursor: isDragging ? "grabbing" : undefined }}>
      {children}
    </span>
  );
}
