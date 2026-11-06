"use client";

import { useEffect, useRef, useState } from "react";
import type { BringItem, PackItem, PackSection, PackingList } from "@/lib/inventory";
import { packingListsAction, savePackingListsAction } from "@/app/actions";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon, GearIcon } from "@/components/ui/Icons";
import { useFitAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { useLongPress } from "@/lib/use-long-press";

export type PillMode = "scroll" | "wrap";
const PILL_MODE_KEY = "inv-pack-pills";
const ACTIVE_KEY = "inv-pack-active";
const MODE_KEY = "packing-window";
const FOLDED_KEY = "inv-pack-folded";

const newId = (p: string) => `${p}${crypto.randomUUID().slice(0, 8)}`;
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const INK = "#2a1c10";
const SOFT = "#6b5631";

function read<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    if (v == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** Opens the packing window (from the backpack's ☰ menu). */
export const openPackingWindow = () => window.dispatchEvent(new Event("packing-window"));

type Mode = "open" | "min" | null;

/**
 * Packing lists in a floating window (owner, Nov 6: "a floating list that is resizable and optimized
 * for check lists and sub-checklists … can be minimized or exited (saved)"). Mounted once in the root
 * layout, so it stays across screens like the language window. Everything saves as you go.
 */
export function PackingWindow() {
  const [mode, setModeState] = useState<Mode>(null);
  const [lists, setLists] = useState<PackingList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kb = useFitAboveKeyboard(mode === "open");
  const pending = useRef<PackingList[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = () => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) savePackingListsAction(next).then(() => setError(null), () => setError("Couldn't save just now; it'll try again with your next change."));
  };
  const change = (next: PackingList[]) => {
    setLists(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  const setMode = (m: Mode) => {
    if (m !== "open") flush();
    setModeState(m);
    write(MODE_KEY, m);
  };
  const load = () => {
    packingListsAction().then(setLists, () => setError("Couldn't load your lists."));
  };

  useEffect(() => {
    const m = read<Mode>(MODE_KEY, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the window as it was left (browser storage, after hydration)
    setModeState(m === "open" || m === "min" ? m : null);
    if (m === "open" || m === "min") load();
    const open = () => {
      setModeState("open");
      write(MODE_KEY, "open");
      load();
    };
    const away = () => flush();
    window.addEventListener("packing-window", open);
    window.addEventListener("pagehide", away);
    return () => {
      window.removeEventListener("packing-window", open);
      window.removeEventListener("pagehide", away);
    };
  }, []);

  if (!mode) return null;
  return (
    <FloatingWindow
      storageKey="packing-window-at"
      width={360}
      z={96}
      resizable
      fit={kb}
      minimized={mode === "min"}
      onRestore={() => setMode("open")}
      label="Open packing lists (drag to move)"
      at={() => ({ x: Math.max(8, window.innerWidth - 376), y: Math.max(140, Math.min(180, window.innerHeight * 0.18)) })}
      chip={<>🧳 Packing</>}
    >
      <div role="dialog" aria-label="Packing lists" data-no-ghost data-kb-fit data-packing-window className="parchment flex min-h-0 w-full flex-1 flex-col rounded-2xl" style={{ maxHeight: kb ? undefined : "min(78dvh, 720px)", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", border: "1.5px solid #a88a3f", boxShadow: "0 12px 36px rgba(0,0,0,.4)", color: INK }}>
        {lists ? <Lists lists={lists} onChange={change} onMin={() => setMode("min")} onClose={() => setMode(null)} error={error} /> : <Header onMin={() => setMode("min")} onClose={() => setMode(null)} />}
        {!lists && (
          <p className="m-0 px-4 pb-4 text-[14px]" style={{ color: SOFT }}>
            {error ?? "Opening your lists…"}
          </p>
        )}
      </div>
    </FloatingWindow>
  );
}

function Header({ onMin, onClose, gear }: { onMin: () => void; onClose: () => void; gear?: React.ReactNode }) {
  const btn = "flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]";
  return (
    <div data-drag-handle className="flex cursor-grab touch-none select-none items-center gap-0.5 px-3 pb-1 pt-2 active:cursor-grabbing" title="Drag to move">
      <h2 className="font-display m-0 flex-1 text-[17px]">🧳 Packing lists</h2>
      {gear}
      <button type="button" onClick={onMin} aria-label="Minimize" title="Minimize to a button you can move" className={`${btn} text-[18px] leading-none`} style={{ color: SOFT }}>
        –
      </button>
      <button type="button" onClick={onClose} aria-label="Close" title="Close (everything is saved)" className={btn} style={{ color: SOFT }}>
        <CloseIcon size={13} />
      </button>
    </div>
  );
}

function Lists({ lists, onChange, onMin, onClose, error }: { lists: PackingList[]; onChange: (l: PackingList[]) => void; onMin: () => void; onClose: () => void; error: string | null }) {
  const [activeId, setActiveId] = useState<string | null>(() => read<string | null>(ACTIVE_KEY, null));
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const [pillMode, setPillMode] = useState<PillMode>(() => (read<string>(PILL_MODE_KEY, "scroll") === "wrap" ? "wrap" : "scroll"));
  const [settings, setSettings] = useState(false);
  const [naming, setNaming] = useState(false);
  const [more, setMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Edit mode: names become fields, rows get ↳ (sub-item) and ×. Out of it, a tap ticks.
  const [editing, setEditing] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>(() => read(FOLDED_KEY, {}));

  const pick = (id: string) => {
    setActiveId(id);
    write(ACTIVE_KEY, id);
    setMore(false);
    setConfirmDelete(false);
  };
  const update = (l: PackingList) => onChange(lists.map((x) => (x.id === l.id ? l : x)));
  const setSections = (sections: PackSection[]) => active && update({ ...active, sections });
  const setSection = (s: PackSection) => active && setSections(active.sections.map((x) => (x.id === s.id ? s : x)));
  const fold = (id: string) => {
    const next = { ...folded, [id]: !folded[id] };
    setFolded(next);
    write(FOLDED_KEY, next);
  };

  function createList(name: string) {
    const l: PackingList = { id: newId("p"), name: tidy(name).slice(0, 40) || "New list", sections: [{ id: newId("s"), name: "", items: [] }] };
    onChange([...lists, l]);
    pick(l.id);
    setNaming(false);
  }
  function copyList() {
    if (!active) return;
    const l: PackingList = {
      id: newId("p"),
      name: `${active.name} (copy)`.slice(0, 40),
      sections: active.sections.map((s) => ({ id: newId("s"), name: s.name, items: s.items.map((i) => ({ id: newId("b"), name: i.name, done: false, subs: i.subs.map((u) => ({ id: newId("b"), name: u.name, done: false })) })) })),
    };
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
    setMore(false);
  }
  function untickAll() {
    if (!active) return;
    setSections(active.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, done: false, subs: i.subs.map((u) => ({ ...u, done: false })) })) })));
    setMore(false);
  }
  function addSection() {
    if (!active) return;
    const s: PackSection = { id: newId("s"), name: "", items: [] };
    setSections([...active.sections, s]);
    setEditing(true);
    setFocusId(`sec:${s.id}`);
  }

  const gear = (
    <button type="button" onClick={() => setSettings((v) => !v)} aria-pressed={settings} aria-label="Packing list settings" title="Settings" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: SOFT, background: settings ? "rgba(217,180,95,.35)" : undefined }}>
      <GearIcon size={15} />
    </button>
  );
  const pill = "flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold";
  const anyTicked = !!active?.sections.some((s) => s.items.some((i) => i.done || i.subs.some((u) => u.done)));
  return (
    <>
      <Header onMin={onMin} onClose={onClose} gear={gear} />
      <Fold open={settings}>
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-semibold" style={{ background: "rgba(120,90,40,.08)" }}>
          List pills
          <span role="radiogroup" aria-label="List pills" className="ml-auto flex rounded-full p-0.5" style={{ background: "rgba(120,90,40,.12)" }}>
            {(["scroll", "wrap"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={pillMode === m} onClick={() => (setPillMode(m), write(PILL_MODE_KEY, m))} className="h-7 rounded-full px-3 text-[12.5px] font-semibold" style={pillMode === m ? { background: "var(--t-gold)", color: INK } : { color: SOFT }}>
                {m === "scroll" ? "Scroll sideways" : "Show all"}
              </button>
            ))}
          </span>
        </div>
      </Fold>

      {/* The lists, as pills; + names a new one right in the row. */}
      <div role="tablist" aria-label="Your packing lists" className={`flex shrink-0 gap-1.5 px-3 pb-2 ${pillMode === "scroll" ? "no-scrollbar flex-nowrap overflow-x-auto overscroll-x-contain" : "flex-wrap"}`}>
        {lists.map((l) => {
          const on = l.id === active?.id;
          return (
            <button key={l.id} type="button" role="tab" aria-selected={on} onClick={() => pick(l.id)} className={pill} style={on ? { background: "var(--t-gold)", color: INK, border: "1px solid #8a6116" } : { border: "1px solid #b39a6a", color: INK, background: "rgba(255,250,238,.5)" }}>
              {l.name}
            </button>
          );
        })}
        {naming ? (
          <NewListField onDone={(name) => (name ? createList(name) : setNaming(false))} />
        ) : (
          <button type="button" onClick={() => setNaming(true)} aria-label="New list" title="New list" className={pill} style={{ border: "1px dashed #a88a3f", color: SOFT }}>
            {lists.length ? "+" : "+ New list"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3" style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}>
        {!active ? (
          <p className="m-0 py-3 text-[14px]" style={{ color: SOFT }}>
            Make a list for each kind of trip (a weekend away, the gym, a beach day), with sections like Suitcase and Backpack.
          </p>
        ) : (
          <div key={active.id} className="fade-in flex flex-col">
            <div className="flex items-center gap-1 pt-2">
              {editing ? (
                <TextField value={active.name} onSave={(v) => update({ ...active, name: v || active.name })} label="List name" className="font-display text-[18px]" />
              ) : (
                <h3 className="font-display m-0 min-w-0 flex-1 truncate text-[18px]">{active.name}</h3>
              )}
              <button type="button" onClick={() => setEditing((v) => !v)} aria-pressed={editing} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={editing ? { background: "var(--t-gold)", color: INK, border: "1px solid #8a6116" } : { color: SOFT }}>
                {editing ? "Done" : "✎ Edit"}
              </button>
              <button type="button" onClick={() => (setMore((v) => !v), setConfirmDelete(false))} aria-expanded={more} aria-label="More for this list" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px] leading-none hover:bg-black/[.06]" style={{ color: SOFT }}>
                ⋯
              </button>
            </div>
            <Fold open={more}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-[13px]">
                <button type="button" onClick={() => (copyList(), setMore(false))} className="h-8 underline underline-offset-2">
                  ⧉ Copy list
                </button>
                {anyTicked && (
                  <button type="button" onClick={untickAll} className="h-8 underline underline-offset-2">
                    Untick all
                  </button>
                )}
                {confirmDelete ? (
                  <span className="flex items-center gap-2">
                    Delete it?
                    <button type="button" onClick={deleteList} className="h-7 rounded-full px-3 font-semibold" style={{ background: "#9a3b26", color: "#fff" }}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="h-7 rounded-full px-3" style={{ border: "1px solid #b39a6a" }}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="h-8 underline underline-offset-2" style={{ color: "#9a3b26" }}>
                    Delete list
                  </button>
                )}
              </div>
            </Fold>

            {active.sections.map((s, k) => (
              <Section
                key={s.id}
                section={s}
                first={k === 0}
                folded={!!folded[s.id]}
                onFold={() => fold(s.id)}
                editing={editing}
                onEdit={(id) => (setEditing(true), setFocusId(id))}
                focusId={focusId}
                onChange={setSection}
                onRemove={() => setSections(active.sections.filter((x) => x.id !== s.id))}
                canRemove={active.sections.length > 1}
              />
            ))}
            {editing && (
              <button type="button" onClick={addSection} className="mt-2 h-9 self-start rounded-full px-3 text-[13.5px] font-semibold" style={{ border: "1px dashed #a88a3f", color: SOFT }}>
                + Section
              </button>
            )}
            {!editing && active.sections.length === 1 && !active.sections[0].name && (
              <button type="button" onClick={addSection} className="mt-2 self-start text-[12.5px] underline underline-offset-2" style={{ color: SOFT }}>
                + Add a section (Suitcase, Backpack…)
              </button>
            )}
          </div>
        )}
        {error && (
          <p className="m-0 pt-2 text-[13px] font-semibold" style={{ color: "#9a3b26" }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** The new list's name, typed right in the pill row. */
function NewListField({ onDone }: { onDone: (name: string) => void }) {
  const [v, setV] = useState("");
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(tidy(v))}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(tidy(v));
        if (e.key === "Escape") onDone("");
      }}
      placeholder="Name it…"
      maxLength={40}
      aria-label="New list's name"
      autoComplete="off"
      className="bare-input h-8 w-36 shrink-0 rounded-full px-3 text-[16px]"
      style={{ border: "1px dashed #a88a3f", color: INK }}
    />
  );
}

/** A name edited where it sits (no box, a thin gold line). Saves on Enter or leaving it. */
function TextField({ value, onSave, label, className = "", autoFocus = false, placeholder, onEnter }: { value: string; onSave: (v: string) => void; label: string; className?: string; autoFocus?: boolean; placeholder?: string; onEnter?: () => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
      autoFocus={autoFocus}
      onBlur={(e) => tidy(e.target.value) !== value && onSave(tidy(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
          onEnter?.();
        }
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      maxLength={80}
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      className={`bare-input place-input h-8 min-w-0 flex-1 px-1 text-[16px] outline-none focus:outline-none focus-visible:outline-none ${className}`}
      style={{ color: INK }}
    />
  );
}

/** "+ Add item": a quiet line at a section's (or an item's) end; Enter adds and stays for the next. */
function AddField({ placeholder, onAdd, autoFocus = false, small = false }: { placeholder: string; onAdd: (name: string) => void; autoFocus?: boolean; small?: boolean }) {
  const [v, setV] = useState("");
  return (
    <input
      autoFocus={autoFocus}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && tidy(v)) {
          onAdd(tidy(v).slice(0, 80));
          setV("");
        }
      }}
      onBlur={() => {
        if (tidy(v)) {
          onAdd(tidy(v).slice(0, 80));
          setV("");
        }
      }}
      placeholder={placeholder}
      maxLength={80}
      aria-label={placeholder}
      autoComplete="off"
      enterKeyHint="next"
      className={`bare-input place-input pack-add w-full px-1 outline-none focus:outline-none focus-visible:outline-none ${small ? "h-8 text-[16px]" : "h-9 text-[16px]"}`}
      style={{ color: INK }}
    />
  );
}

function Check({ on, small = false }: { on: boolean; small?: boolean }) {
  const s = small ? 17 : 21;
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full transition-all duration-200"
      style={{
        width: s,
        height: s,
        ...(on
          ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 6px rgba(242,210,126,.5)" }
          : { background: "rgba(255,250,238,.85)", border: "1.5px solid #b39a6a" }),
      }}
    >
      {on && (
        <svg width={s - 8} height={s - 8} viewBox="0 0 12 12">
          <path d="M2.5 6.5 5 9l4.5-5.5" fill="none" stroke="#2a1c10" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function Section({ section, first, folded, onFold, editing, onEdit, focusId, onChange, onRemove, canRemove }: { section: PackSection; first: boolean; folded: boolean; onFold: () => void; editing: boolean; onEdit: (focusId: string) => void; focusId: string | null; onChange: (s: PackSection) => void; onRemove: () => void; canRemove: boolean }) {
  const setItems = (items: PackItem[]) => onChange({ ...section, items });
  const setItem = (it: PackItem) => setItems(section.items.map((i) => (i.id === it.id ? it : i)));
  const all = section.items.length > 0 && section.items.every((i) => i.done);
  const left = section.items.filter((i) => !i.done).length;
  const named = !!section.name || !first || editing;
  return (
    <section aria-label={section.name || "Items"} className={first ? "mt-1" : "mt-3"}>
      {named && (
        <div className="flex min-h-9 items-center gap-1" style={{ borderBottom: "1px solid rgba(139,112,64,.3)" }}>
          {editing ? (
            <>
              <TextField value={section.name} onSave={(v) => onChange({ ...section, name: v })} label="Section name" placeholder="Section name (Suitcase…)" autoFocus={focusId === `sec:${section.id}`} className="font-display text-[15px]" />
              {canRemove && (
                <button type="button" onClick={onRemove} aria-label={`Remove the section ${section.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "#9a3b26" }}>
                  <CloseIcon size={11} />
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={onFold} aria-expanded={!folded} className="font-display flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left text-[15px]">
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="shrink-0 transition-transform duration-200" style={{ transform: folded ? "rotate(-90deg)" : undefined, color: SOFT }}>
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate">{section.name || "Items"}</span>
              <span className="ml-auto shrink-0 pr-1 font-sans text-[12px]" style={{ color: SOFT }}>
                {all ? "✓ packed" : folded && left ? `${left} to pack` : ""}
              </span>
            </button>
          )}
        </div>
      )}
      <Fold open={editing || !folded}>
        <ul className="m-0 list-none p-0">
          {section.items.map((it) => (
            <Item key={it.id} item={it} editing={editing} onEdit={() => onEdit(it.id)} focusSub={focusId === `sub:${it.id}`} onAddSub={() => onEdit(`sub:${it.id}`)} onChange={setItem} onRemove={() => setItems(section.items.filter((i) => i.id !== it.id))} />
          ))}
        </ul>
        <AddField placeholder="+ Add item" onAdd={(name) => setItems([...section.items, { id: newId("b"), name, done: false, subs: [] }])} />
      </Fold>
    </section>
  );
}

function Item({ item, editing, onEdit, focusSub, onAddSub, onChange, onRemove }: { item: PackItem; editing: boolean; onEdit: () => void; focusSub: boolean; onAddSub: () => void; onChange: (i: PackItem) => void; onRemove: () => void }) {
  // Hold (or right-click) a row to edit the list.
  const { handlers, wasLong } = useLongPress(onEdit);
  const toggle = () => {
    const done = !item.done;
    onChange({ ...item, done, subs: item.subs.map((u) => ({ ...u, done })) });
  };
  const toggleSub = (u: BringItem) => {
    const subs = item.subs.map((x) => (x.id === u.id ? { ...x, done: !x.done } : x));
    onChange({ ...item, subs, done: subs.length > 0 && subs.every((x) => x.done) });
  };
  const showSubAdd = editing && (item.subs.length > 0 || focusSub);
  return (
    <li className="due-in">
      <div className="flex min-h-10 items-center gap-2" style={{ borderBottom: item.subs.length || showSubAdd ? undefined : "1px solid rgba(139,112,64,.15)" }}>
        {editing ? (
          <>
            <button type="button" onClick={toggle} aria-label={item.done ? `Untick ${item.name}` : `Tick ${item.name}`} className="flex h-8 w-6 shrink-0 items-center justify-center">
              <Check on={item.done} />
            </button>
            <TextField value={item.name} onSave={(v) => (v ? onChange({ ...item, name: v }) : onRemove())} label="Item name" />
            <button type="button" onClick={onAddSub} aria-label={`Add a sub-item under ${item.name}`} title="Add a sub-item" className="flex h-8 shrink-0 items-center rounded-full px-2 text-[12.5px] font-semibold hover:bg-black/[.06]" style={{ color: SOFT }}>
              ↳ Sub
            </button>
            <button type="button" onClick={onRemove} aria-label={`Remove ${item.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "#9a3b26" }}>
              <CloseIcon size={11} />
            </button>
          </>
        ) : (
          <button type="button" role="checkbox" aria-checked={item.done} {...handlers} onClick={() => !wasLong() && toggle()} style={{ WebkitTouchCallout: "none" }} className="flex min-h-10 w-full select-none items-center gap-2.5 py-1.5 text-left">
            <Check on={item.done} />
            <span className="min-w-0 break-words text-[15.5px] transition-opacity" style={{ opacity: item.done ? 0.5 : 1, textDecoration: item.done ? "line-through" : undefined, textDecorationColor: "rgba(42,28,16,.4)" }}>
              {item.name}
            </span>
          </button>
        )}
      </div>
      {(item.subs.length > 0 || showSubAdd) && (
        <ul className="m-0 list-none pb-1 pl-7 pr-0" style={{ borderBottom: "1px solid rgba(139,112,64,.15)" }}>
          {item.subs.map((u) => (
            <li key={u.id} className="due-in flex min-h-8 items-center gap-2">
              {editing ? (
                <>
                  <button type="button" onClick={() => toggleSub(u)} aria-label={u.done ? `Untick ${u.name}` : `Tick ${u.name}`} className="flex h-8 w-5 shrink-0 items-center justify-center">
                    <Check on={u.done} small />
                  </button>
                  <TextField value={u.name} onSave={(v) => onChange({ ...item, subs: v ? item.subs.map((x) => (x.id === u.id ? { ...x, name: v } : x)) : item.subs.filter((x) => x.id !== u.id) })} label="Sub-item name" className="text-[16px]" />
                  <button type="button" onClick={() => onChange({ ...item, subs: item.subs.filter((x) => x.id !== u.id) })} aria-label={`Remove ${u.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "#9a3b26" }}>
                    <CloseIcon size={10} />
                  </button>
                </>
              ) : (
                <button type="button" role="checkbox" aria-checked={u.done} {...handlers} onClick={() => !wasLong() && toggleSub(u)} style={{ WebkitTouchCallout: "none" }} className="flex min-h-8 w-full select-none items-center gap-2 py-1 text-left">
                  <Check on={u.done} small />
                  <span className="min-w-0 break-words text-[14.5px]" style={{ opacity: u.done ? 0.5 : 1, textDecoration: u.done ? "line-through" : undefined, textDecorationColor: "rgba(42,28,16,.4)" }}>
                    {u.name}
                  </span>
                </button>
              )}
            </li>
          ))}
          {showSubAdd && <AddField small autoFocus={focusSub} placeholder="+ Sub-item" onAdd={(name) => onChange({ ...item, done: false, subs: [...item.subs, { id: newId("b"), name, done: false }] })} />}
        </ul>
      )}
    </li>
  );
}
