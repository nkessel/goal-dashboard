"use client";

import { useRef, useState } from "react";
import type { BringItem, PackingList } from "@/lib/inventory";
import { GoldCheck } from "@/components/xp/WelcomeArrange";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { CHECKIN_STYLES } from "@/lib/celebration-fx";

export type PillMode = "scroll" | "wrap";
export const PILL_MODE_KEY = "inv-pack-pills";
const ACTIVE_KEY = "inv-pack-active";

const newId = (p: string) => `${p}${crypto.randomUUID().slice(0, 8)}`;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

function readActive(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function keepActive(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Packing lists (owner, Nov 6): as many as you like, one per kind of trip,
 * picked from pills at the top. The open list's name is edited where it sits
 * (rename), ⧉ copies it (ticks cleared), and its items tick off as they go in.
 */
export function PackingLists({ lists, onChange, pillMode, onClose }: { lists: PackingList[]; onChange: (l: PackingList[]) => void; pillMode: PillMode; onClose: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(() => (typeof window === "undefined" ? null : readActive()));
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const pick = (id: string) => {
    setActiveId(id);
    keepActive(id);
    setConfirmDelete(false);
  };
  const update = (l: PackingList) => onChange(lists.map((x) => (x.id === l.id ? l : x)));
  const setItems = (items: BringItem[]) => active && update({ ...active, items });

  function newList() {
    const l: PackingList = { id: newId("p"), name: "New list", items: [] };
    onChange([...lists, l]);
    pick(l.id);
    // Name it straight away: the title is selected, so typing replaces "New list".
    setTimeout(() => {
      nameRef.current?.focus({ preventScroll: true });
      nameRef.current?.select();
    }, 60);
  }
  function copyList() {
    if (!active) return;
    const l: PackingList = { id: newId("p"), name: `${active.name} (copy)`.slice(0, 40), items: active.items.map((i) => ({ id: newId("b"), name: i.name, done: false })) };
    const at = lists.findIndex((x) => x.id === active.id);
    onChange([...lists.slice(0, at + 1), l, ...lists.slice(at + 1)]);
    pick(l.id);
  }
  function deleteList() {
    if (!active) return;
    const at = lists.findIndex((x) => x.id === active.id);
    const rest = lists.filter((x) => x.id !== active.id);
    onChange(rest);
    const next = rest[Math.min(at, rest.length - 1)];
    if (next) pick(next.id);
    setConfirmDelete(false);
  }
  function rename(name: string) {
    if (!active) return;
    const clean = tidy(name).slice(0, 40) || active.name;
    if (clean !== active.name) update({ ...active, name: clean });
  }
  function add() {
    const name = tidy(draft).slice(0, 80);
    if (!name || !active) return;
    setItems([...active.items, { id: newId("b"), name, done: false }]);
    setDraft("");
    addRef.current?.focus();
  }

  const ticked = active ? active.items.filter((i) => i.done).length : 0;
  const pill = "flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold transition-colors";
  const link = "text-[13px] underline underline-offset-2";
  return (
    <section aria-label="Packing lists" data-packing-lists className="parchment relative flex flex-col gap-2.5 rounded-2xl p-3" style={{ border: "1.5px solid #a88a3f", color: "#2a1c10" }}>
      <div className="relative z-[1] flex items-center gap-2">
        <h3 className="font-display m-0 flex-1 text-[17px]">🧳 Packing lists</h3>
        <button type="button" onClick={onClose} aria-label="Close packing lists" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "#6b5631" }}>
          <CloseIcon size={13} />
        </button>
      </div>

      {/* The lists, as pills: a row that scrolls sideways, or all of them wrapped (set in the inventory's gear). */}
      <div role="tablist" aria-label="Your packing lists" className={`relative z-[1] -mx-1 flex gap-1.5 px-1 ${pillMode === "scroll" ? "no-scrollbar flex-nowrap overflow-x-auto overscroll-x-contain" : "flex-wrap"}`}>
        {lists.map((l) => {
          const on = l.id === active?.id;
          return (
            <button key={l.id} type="button" role="tab" aria-selected={on} onClick={() => pick(l.id)} className={pill} style={on ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { border: "1px solid #b39a6a", color: "#2a1c10", background: "rgba(255,250,238,.5)" }}>
              {l.name}
            </button>
          );
        })}
        <button type="button" onClick={newList} className={pill} style={{ border: "1px dashed #a88a3f", color: "#6b5631" }}>
          + New list
        </button>
      </div>

      {!active ? (
        <p className="relative z-[1] m-0 text-[13.5px]" style={{ color: "#6b5631" }}>
          Make a list for each kind of trip: a weekend away, the gym, a beach day. Copy one to start the next.
        </p>
      ) : (
        <div key={active.id} className="fade-in relative z-[1] flex flex-col gap-2">
          {/* The name is edited where it sits: that's renaming. */}
          <div className="flex items-center gap-2">
            <input
              ref={nameRef}
              defaultValue={active.name}
              key={active.name}
              onBlur={(e) => rename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = active.name;
                  e.currentTarget.blur();
                }
              }}
              maxLength={40}
              aria-label="List name (type to rename)"
              title="Tap to rename"
              autoComplete="off"
              className="bare-input place-input font-display h-8 min-w-0 flex-1 px-1 text-[16px]"
              style={{ color: "#2a1c10" }}
            />
            <button type="button" onClick={copyList} title="Copy this list" className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold hover:bg-black/[.06]" style={{ color: "#4a3913" }}>
              <span aria-hidden>⧉</span> Copy
            </button>
          </div>

          <ul className="m-0 flex list-none flex-col p-0">
            {active.items.map((it) => (
              <li key={it.id} className="due-in flex min-h-10 items-center gap-2" style={{ borderBottom: "1px solid rgba(139,112,64,.2)" }}>
                <div className="min-w-0 flex-1 py-1" style={{ opacity: it.done ? 0.6 : 1 }}>
                  <GoldCheck checked={it.done} onChange={(v) => setItems(active.items.map((i) => (i.id === it.id ? { ...i, done: v } : i)))}>
                    <span className="break-words text-[15px]">{it.name}</span>
                  </GoldCheck>
                </div>
                <button type="button" onClick={() => setItems(active.items.filter((i) => i.id !== it.id))} aria-label={`Take ${it.name} off the list`} className="flex h-8 w-8 shrink-0 self-start items-center justify-center rounded-full opacity-50 hover:bg-black/[.06] hover:opacity-100" style={{ color: "#9a3b26" }}>
                  <CloseIcon size={11} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={`Add to ${active.name}`} maxLength={80} aria-label="Add something to pack" className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
            <button type="button" onClick={add} disabled={!draft.trim()} className="hover-glow font-display h-10 shrink-0 rounded-full px-4 text-[14px] disabled:opacity-50" style={CHECKIN_STYLES[0].style}>
              Add
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {ticked > 0 && (
              <button type="button" onClick={() => setItems(active.items.map((i) => ({ ...i, done: false })))} className={link} style={{ color: "#2a1c10" }}>
                Untick all for next time
              </button>
            )}
            <button type="button" onClick={() => setConfirmDelete((v) => !v)} aria-expanded={confirmDelete} className={`${link} ml-auto`} style={{ color: "#9a3b26" }}>
              Delete list
            </button>
          </div>
          <Fold open={confirmDelete}>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[13.5px]">
              Delete “{active.name}” for good?
              <button type="button" onClick={deleteList} className="h-8 rounded-full px-3 font-semibold" style={{ background: "#9a3b26", color: "#fff" }}>
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-8 rounded-full px-3 font-semibold" style={{ border: "1px solid #b39a6a" }}>
                Keep it
              </button>
            </div>
          </Fold>
        </div>
      )}
    </section>
  );
}
