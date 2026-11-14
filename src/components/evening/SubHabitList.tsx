"use client";

import { useEffect, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CoinIcon } from "@/components/ui/Icons";
import { InlineNumber } from "@/components/ui/InlineNumber";

export type SubHabit = { id: string; title: string; xp?: number; coins?: number; /** Not needed to finish the habit (owner, Nov 14). */ optional?: boolean };

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * A habit's sub-habits, the way the owner asked (repeat ask 15), drawn like the quest
 * editor's sub-quests (owner, Nov 14: no white box, no dotted tray): bare rows on the
 * editor's own parchment, each dragged by itself to reorder (no arrows, no grips),
 * renamed in place, its XP and coins on its row (tap the number to type over it), and
 * a ⋯ menu (right-click too) for Give XP, Give coins, Required to finish, and Remove.
 * A line at the bottom adds one.
 */
export function SubHabitList({ list, onChange, autoFocus = false, noun = "sub-habit", coins = true }: { list: SubHabit[]; onChange: (next: SubHabit[]) => void; autoFocus?: boolean; noun?: string; /** False where a row pays XP only (a quest's sub-quests). */ coins?: boolean }) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const onEnd = (e: DragEndEvent) => {
    const from = list.findIndex((s) => s.id === e.active.id);
    const to = e.over ? list.findIndex((s) => s.id === e.over!.id) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onChange(arrayMove(list, from, to));
  };
  const add = () => {
    const t = draft.replace(/\s+/g, " ").trim();
    if (!t) return;
    onChange([...list, { id: newId(), title: t }]);
    setDraft("");
  };
  const set = (id: string, patch: Partial<SubHabit>) => onChange(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  // The menu closes on a press outside it, or Esc (which then doesn't close the editor too).
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.("[data-sub-menu]") || t?.closest?.("[data-feedback-root]")) return;
      setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setMenu(null);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [menu]);
  return (
    <div className="flex flex-col gap-0.5" role="list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd} onDragStart={() => setMenu(null)}>
        <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {list.map((s) => (
            <Row
              key={s.id}
              sub={s}
              noun={noun}
              coins={coins}
              menuOpen={menu === s.id}
              onMenu={() => setMenu((m) => (m === s.id ? null : s.id))}
              onChange={(patch) => set(s.id, patch)}
              onRemove={() => (setMenu(null), onChange(list.filter((x) => x.id !== s.id)))}
              closeMenu={() => setMenu(null)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2 px-1.5">
        <span aria-hidden className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed text-[11px]" style={{ borderColor: "#a58c66", color: "var(--t-ink-soft)" }}>
          +
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 120))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          autoFocus={autoFocus}
          placeholder={list.length ? `Another ${noun}` : noun === "sub-habit" ? "Add a sub-habit (e.g. Food and water)" : `Add a ${noun}`}
          aria-label={`Add a ${noun}`}
          className="bare-input h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-[16px] sm:text-[15px]"
          style={{ color: "var(--t-ink)" }}
        />
      </div>
    </div>
  );
}

function Row({ sub, noun, coins, menuOpen, onMenu, closeMenu, onChange, onRemove }: { sub: SubHabit; noun: string; coins: boolean; menuOpen: boolean; onMenu: () => void; closeMenu: () => void; onChange: (patch: Partial<SubHabit>) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });
  const whole = noun === "sub-habit" ? "the habit" : "the rite";
  const hold = (e: React.SyntheticEvent) => e.stopPropagation();
  const items: [string, React.ReactNode, string][] = [
    ...(!sub.xp ? [["xp", <span key="i" style={{ color: "var(--t-xp)" }}>✦</span>, "Give XP"] as [string, React.ReactNode, string]] : []),
    ...(coins && !sub.coins ? [["coins", <CoinIcon key="i" size={14} />, "Give coins"] as [string, React.ReactNode, string]] : []),
    ["remove", "−", "Remove"],
  ];
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : menuOpen ? 4 : undefined, position: "relative" }} className="due-in">
      <div
        {...attributes}
        {...listeners}
        role="listitem"
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu();
        }}
        className={`flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors ${isDragging ? "cursor-grabbing" : "cursor-grab hover:bg-black/[.035]"}`}
        style={isDragging ? { background: "rgba(255,248,228,.92)", boxShadow: "0 8px 18px rgba(0,0,0,.18)" } : undefined}
      >
        {/* The round check it gets on its card, drawn empty here; dashed when it isn't needed to finish. */}
        <span aria-hidden className="h-[16px] w-[16px] shrink-0 rounded-full" style={{ border: `1.5px ${sub.optional ? "dashed" : "solid"} #a58c66` }} />
        <input
          value={sub.title}
          onChange={(e) => onChange({ title: e.target.value.slice(0, 120) })}
          onKeyDown={hold}
          onPointerDown={hold}
          onMouseDown={hold}
          onTouchStart={hold}
          aria-label={noun === "sub-habit" ? "Sub-habit" : `Name of this ${noun}`}
          className="bare-input h-8 min-w-0 flex-1 cursor-text border-0 bg-transparent px-1 text-[16px] sm:text-[15px]"
          style={{ color: "var(--t-ink)" }}
        />
        {sub.optional && (
          <span className="shrink-0 text-[12px] italic" style={{ color: "var(--t-ink-soft)" }} title={`Not needed to finish ${whole}`}>
            optional
          </span>
        )}
        {/* Its XP and coins on its row, like a sub-quest's: tap the number to type over it (0 takes it off). */}
        {(sub.xp ?? 0) > 0 && (
          <span onPointerDown={hold} onMouseDown={hold} onTouchStart={hold} className="flex h-7 shrink-0 items-center text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--t-xp)" }} title={`XP this ${noun} brings (tap to change; 0 takes it off)`}>
            <InlineNumber value={sub.xp ?? 0} min={0} max={100} suffix=" XP" label={`XP for ${sub.title}`} onChange={(n) => onChange({ xp: n || undefined })} />
          </span>
        )}
        {coins && (sub.coins ?? 0) > 0 && (
          <span onPointerDown={hold} onMouseDown={hold} onTouchStart={hold} className="flex h-7 shrink-0 items-center gap-0.5 text-[12.5px] font-semibold tabular-nums" style={{ color: "#8a6116" }} title={`Coins this ${noun} brings (tap to change; 0 takes them off)`}>
            <InlineNumber value={sub.coins ?? 0} min={0} max={50} suffix="" label={`Coins for ${sub.title}`} onChange={(n) => onChange({ coins: n || undefined })} />
            <CoinIcon size={13} />
          </span>
        )}
        <span className="relative shrink-0" data-sub-menu>
          <button
            type="button"
            onClick={onMenu}
            onPointerDown={hold}
            onMouseDown={hold}
            onTouchStart={hold}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Options for ${sub.title}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]"
            style={{ color: "var(--t-ink-soft)", background: menuOpen ? "rgba(217,180,95,.3)" : undefined }}
          >
            ⋯
          </button>
          {menuOpen && (
            <span
              role="menu"
              // Opens upward when the editor's pinned Save row would cover it.
              ref={(el) => {
                if (!el || el.dataset.placed) return;
                el.dataset.placed = "1";
                const box = el.closest("[role=dialog]") ?? document.documentElement;
                const foot = box.querySelector("[data-editor-foot]");
                const limit = Math.min(window.innerHeight, foot ? foot.getBoundingClientRect().top : box.getBoundingClientRect().bottom) - 8;
                if (el.getBoundingClientRect().bottom > limit) {
                  el.style.top = "auto";
                  el.style.bottom = "36px";
                }
              }}
              onPointerDown={hold} onMouseDown={hold} onTouchStart={hold} className="card-pop-in parchment absolute right-0 top-9 z-30 flex w-[228px] flex-col overflow-hidden py-1" style={{ borderRadius: 12, boxShadow: "0 10px 24px rgba(0,0,0,.3)" }}>
              {/* Needed to finish the habit, or not (owner, Nov 14): some habits are done with one sub-habit, or none. */}
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={!sub.optional}
                onClick={() => onChange({ optional: sub.optional ? undefined : true })}
                className="relative z-[1] flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[14.5px] hover:bg-black/5"
                style={{ color: "var(--t-ink)" }}
              >
                <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ border: `1.5px solid ${sub.optional ? "#a58c66" : "var(--t-good)"}`, background: sub.optional ? "transparent" : "var(--t-good)" }}>
                  {!sub.optional && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                Required to finish {whole}
              </button>
              {items.map(([k, icon, label]) => (
                <button
                  key={k}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (k === "remove") return onRemove();
                    closeMenu();
                    if (k === "xp") onChange({ xp: 5 });
                    if (k === "coins") onChange({ coins: 1 });
                  }}
                  className="relative z-[1] flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[14.5px] hover:bg-black/5"
                  style={{ color: "var(--t-ink)" }}
                >
                  <span aria-hidden className="flex w-4 justify-center">{icon}</span>
                  {label}
                </button>
              ))}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
