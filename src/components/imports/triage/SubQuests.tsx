"use client";

import { useContext, useEffect, useRef, useState } from "react";
import type { ImportCard } from "@/lib/data/import-cards";
import { StepsGlyph } from "@/components/tasks/editor/glyphs";
import { InlineNumber } from "@/components/ui/InlineNumber";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CoinIcon } from "@/components/ui/Icons";
import { Attrs, BoardsCtx, XP_DEFAULT, withAttrs } from "./types";

/** Whether sub-quests show on import cards, one choice for every card (owner, Nov 12: "a hide button if the user wants to hide those steps"). */
export function useStepsShown(): [boolean, (v: boolean) => void] {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the device's choice once after mount (no localStorage on the server)
      if (localStorage.getItem("import-steps-hidden") === "1") setShown(false);
    } catch {}
    const on = (e: Event) => setShown((e as CustomEvent<boolean>).detail);
    window.addEventListener("import-steps-shown", on);
    return () => window.removeEventListener("import-steps-shown", on);
  }, []);
  const set = (v: boolean) => {
    try {
      localStorage.setItem("import-steps-hidden", v ? "0" : "1");
    } catch {}
    window.dispatchEvent(new CustomEvent("import-steps-shown", { detail: v }));
  };
  return [shown, set];
}

/**
 * A card's sub-quests (a buy list's items), shown in both views with Hide / Show. ✎ turns the list into the
 * app's own editable list (owner, Nov 12: "full editing privileges"): rename in place, hold and drag to reorder,
 * a row's dot (or right-click) for its XP and Remove, a line at the foot to add one.
 */
/**
 * A card's sub-quests, drawn and edited exactly like the quest editor's Sub-quests (owner, Nov 12:
 * "use the current design language"): the same label with its fold caret, the gold "+ Add" pill,
 * rows you rename where they sit (bare, no wash), each one's XP on its row (tap it to type over it),
 * a ⋯ for Remove, and the dashed "+" line to add the next. Hold a row and drag it to reorder.
 */
export function SubQuests({ card, small = false, attrs, onAttrs }: { card: ImportCard; small?: boolean; attrs: Attrs; onAttrs: (a: Attrs) => void }) {
  const { resteps } = useContext(BoardsCtx);
  const [shown, setShown] = useStepsShown();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  useEffect(() => {
    if (menu === null) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-step-menu]")) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const steps = card.steps;
  const n = steps.length;
  const items = card.kind === "shopping";
  const editable = withAttrs(card.kind);
  if (!n && !editable) return null;
  const label = items ? "Items" : "Sub-quests";
  const noun = items ? "item" : "sub-quest";
  // Each sub-quest's XP: an equal share of the quest's XP plus any extra you gave it (as the editor counts it).
  const share = n ? Math.round((attrs.xp ?? XP_DEFAULT) / n) : 0;
  const save = (next: string[], xp: Record<string, number> = attrs.stepXp ?? {}, coins: Record<string, number> = attrs.stepCoins ?? {}) => {
    const clean = next.map((t) => t.trim()).filter(Boolean);
    resteps(card.id, clean);
    const keep = (m: Record<string, number>) => {
      const k = Object.fromEntries(Object.entries(m).filter(([t, v]) => v > 0 && clean.includes(t)));
      return Object.keys(k).length ? k : undefined;
    };
    onAttrs({ ...attrs, stepXp: keep(xp), stepCoins: keep(coins) });
  };
  const rename = (i: number, title: string) => {
    const t = title.trim();
    if (t === steps[i]) return;
    if (!t) return save(steps.filter((_, j) => j !== i));
    const move = (m: Record<string, number>) => {
      const out = { ...m };
      if (out[steps[i]] != null) {
        out[t] = out[steps[i]];
        delete out[steps[i]];
      }
      return out;
    };
    save(steps.map((s, j) => (j === i ? t : s)), move(attrs.stepXp ?? {}), move(attrs.stepCoins ?? {}));
  };
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    save([...steps, t]);
  };
  const ids = steps.map((s, i) => `${i}:${s}`);
  const onDragEnd = (e: DragEndEvent) => {
    const from = ids.indexOf(String(e.active.id));
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    save(arrayMove(steps, from, to));
  };
  const open = shown && (n > 0 || adding);
  return (
    <div className="flex flex-col gap-1" data-import-steps>
      <div className="flex items-center gap-2.5">
        <StepsGlyph size={small ? 16 : 18} />
        {n > 0 ? (
          <button type="button" onClick={() => setShown(!shown)} aria-expanded={shown} className="flex items-center gap-1.5" title={shown ? `Fold the ${noun}s away` : `Show the ${noun}s`}>
            <span className={small ? "text-[12.5px] font-semibold" : "text-[13px] font-semibold"}>{label}</span>
            {!shown && <span className="text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft, #6b5631)" }}>{n}</span>}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: shown ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft, #6b5631)" }}>
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className={small ? "text-[12.5px] font-semibold" : "text-[13px] font-semibold"}>{label}</span>
        )}
        {editable && !adding && (
          <button
            type="button"
            aria-label={`Add a ${noun}`}
            onClick={() => (setAdding(true), setShown(true), requestAnimationFrame(() => newRef.current?.focus()))}
            className={`hover-glow ml-auto flex items-center gap-1 rounded-full px-3 font-bold ${small ? "h-7 text-[12.5px]" : "h-8 text-[13px]"}`}
            style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", color: "#2a1c10", border: "1px solid #8a6116", boxShadow: "0 1px 3px rgba(60,40,10,.3)" }}
          >
            <span aria-hidden className="text-[16px] leading-none">+</span> {n ? "Add" : items ? "Add items" : "Add sub-quests"}
          </button>
        )}
      </div>
      <div className="drawer-body" data-open={open || undefined}>
        <div className="drawer-inner">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className="m-0 flex list-none flex-col p-0 pl-[22px]">
                {steps.map((s, i) => (
                  <StepRow
                    key={ids[i]}
                    id={ids[i]}
                    title={s}
                    small={small}
                    editable={editable}
                    xp={items ? null : share + (attrs.stepXp?.[s] ?? 0)}
                    onXp={(v) => save(steps, { ...(attrs.stepXp ?? {}), [s]: Math.max(0, v - share) })}
                    coins={items ? null : (attrs.stepCoins?.[s] ?? 0)}
                    onCoins={(v) => (setMenu(null), save(steps, attrs.stepXp ?? {}, { ...(attrs.stepCoins ?? {}), [s]: v }))}
                    onRename={(t) => rename(i, t)}
                    onEnter={() => (setAdding(true), requestAnimationFrame(() => newRef.current?.focus()))}
                    menuOpen={menu === i}
                    onMenu={() => setMenu(menu === i ? null : i)}
                    onRemove={() => (setMenu(null), save(steps.filter((_, j) => j !== i)))}
                  />
                ))}
                {editable && adding && (
                  <li className="reveal quest-step flex items-start gap-2 rounded-md py-0.5 pl-1">
                    {/* Same box and type as the quest editor's add line. */}
                    <span aria-hidden className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-dashed text-[13px] leading-none" style={{ borderColor: "#8a6c2c", color: "var(--t-ink-soft, #6b5631)" }}>
                      +
                    </span>
                    <input
                      ref={newRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          add();
                          requestAnimationFrame(() => newRef.current?.focus());
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraft("");
                          setAdding(false);
                        }
                      }}
                      onBlur={() => {
                        add();
                        setTimeout(() => {
                          if (document.activeElement !== newRef.current) setAdding(false);
                        }, 0);
                      }}
                      enterKeyHint="enter"
                      placeholder={`Add a ${noun}, then Enter`}
                      aria-label={`Add a ${noun}`}
                      className={`bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] leading-snug focus:outline-none ${small ? "text-[14.5px]" : "text-[16px]"}`}
                      style={{ color: "var(--t-ink, #2a1c10)" }}
                    />
                  </li>
                )}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

/** One sub-quest row, as in the quest editor: its name edited in place, its XP, its ⋯. */
export function StepRow({ id, title, small, editable, xp, onXp, coins, onCoins, onRename, onEnter, menuOpen, onMenu, onRemove }: { id: string; title: string; small: boolean; editable: boolean; xp: number | null; onXp: (v: number) => void; coins: number | null; onCoins: (v: number) => void; onRename: (t: string) => void; onEnter: () => void; menuOpen: boolean; onMenu: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editable });
  const [text, setText] = useState(title);
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="listitem"
      tabIndex={-1}
      className="quest-step flex items-start gap-1.5 rounded-md py-0.5 pl-1"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1, zIndex: isDragging ? 5 : undefined, position: "relative", touchAction: "pan-y" }}
    >
      {/* The editor's tick box, faded: it's ticked once it's a quest. */}
      <span aria-hidden className="mt-[5px] h-[18px] w-[18px] shrink-0 rounded-[5px]" style={{ border: "1.5px solid #8a6c2c", opacity: 0.5 }} />
      {editable ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onRename(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRename(text);
              onEnter();
            } else if (e.key === "Escape") setText(title);
          }}
          aria-label="Sub-quest"
          className={`bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] leading-snug focus:outline-none ${small ? "text-[14.5px]" : "text-[16px]"}`}
          style={{ color: "var(--t-ink, #2a1c10)" }}
        />
      ) : (
        <span className={`min-w-0 flex-1 px-1 py-[3px] leading-snug [overflow-wrap:anywhere] ${small ? "text-[14.5px]" : "text-[16px]"}`}>{title}</span>
      )}
      {xp !== null && (
        <span className="mt-[3px] flex h-7 shrink-0 items-center text-[12.5px] font-semibold" style={{ color: "var(--t-xp, #8a6116)" }} title="XP this sub-quest brings (tap to change)">
          {editable ? <InlineNumber value={xp} min={0} max={500} suffix=" XP" label={`XP for ${title}`} onChange={onXp} /> : `${xp} XP`}
        </span>
      )}
      {/* Its own coins, once given (⋯ › Give coins), as in the quest editor (owner, Nov 14). */}
      {coins ? (
        <span className="mt-[3px] flex h-7 shrink-0 items-center gap-0.5 text-[12.5px] font-semibold" style={{ color: "#8a6116" }} title="Coins this sub-quest brings (tap to change; 0 takes them off)">
          {editable ? <InlineNumber value={coins} min={0} max={100} suffix="" label={`Coins for ${title}`} onChange={onCoins} /> : coins}
          <CoinIcon size={13} />
        </span>
      ) : null}
      {editable && (
        <span className="relative shrink-0" data-step-menu>
          <button type="button" onClick={onMenu} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`More for ${title}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft, #6b5631)" }}>
            ⋯
          </button>
          {menuOpen && (
            <span role="menu" className="card-pop-in parchment absolute right-0 top-8 z-30 flex w-[170px] flex-col overflow-hidden py-1" style={{ borderRadius: 12, boxShadow: "0 10px 24px rgba(0,0,0,.3)" }}>
              {coins === 0 && (
                <button type="button" role="menuitem" onClick={() => onCoins(1)} className="relative z-[1] flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[14.5px] hover:bg-black/5" style={{ color: "var(--t-ink, #2a1c10)" }}>
                  <span aria-hidden className="w-4 text-center">🪙</span>
                  Give coins
                </button>
              )}
              <button type="button" role="menuitem" onClick={onRemove} className="relative z-[1] flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[14.5px] hover:bg-black/5" style={{ color: "var(--t-ink, #2a1c10)" }}>
                <span aria-hidden className="w-4 text-center">−</span>
                Remove
              </button>
            </span>
          )}
        </span>
      )}
    </li>
  );
}
