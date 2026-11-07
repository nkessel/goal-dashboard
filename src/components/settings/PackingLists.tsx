"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BringItem, PackItem, PackSection, PackingList } from "@/lib/inventory";
import { packingListsAction } from "@/app/actions";
import { isNetworkError, isOffline, offlineOwner, pendingFor, saveOrQueue } from "@/lib/offline";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon, GearIcon } from "@/components/ui/Icons";
import { useFitAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

const keptKey = () => `offline-packing:${offlineOwner() ?? ""}`;
const keep = (lists: PackingList[]) => write(keptKey(), lists);

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
    if (next) saveOrQueue("savePacking", next, "packing").then(() => setError(null), () => setError("Couldn't save just now; it'll try again with your next change."));
  };
  const change = (next: PackingList[]) => {
    setLists(next);
    keep(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  const setMode = (m: Mode) => {
    if (m !== "open") flush();
    setModeState(m);
    write(MODE_KEY, m);
  };
  // Offline (owner, Nov 6), the lists come from this device: what's waiting to sync, else the copy
  // kept the last time they were open.
  const kept = () => pendingFor<PackingList[]>("packing") ?? read<PackingList[] | null>(keptKey(), null);
  const load = () => {
    if (isOffline()) return setLists(kept() ?? []);
    packingListsAction().then(
      (server) => {
        const waiting = pendingFor<PackingList[]>("packing");
        setLists(waiting ?? server);
        keep(waiting ?? server);
      },
      (e) => {
        const local = kept();
        if (isNetworkError(e)) setLists(local ?? []);
        else if (local) setLists(local);
        else setError("Couldn't load your lists.");
      }
    );
  };

  useEffect(() => {
    const m = read<Mode>(MODE_KEY, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the window as it was left (browser storage, after hydration)
    setModeState(m === "open" || m === "min" ? m : null);
    // After AppShell has said whose lists these are (its effect runs after this one).
    if (m === "open" || m === "min") setTimeout(load, 0);
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

type PackedMode = "sink" | "stay" | "hide";
const PACKED_KEY = "inv-pack-packed";

/** Every item name used in any list, most used first: the quick-add suggestions. */
function knownItems(lists: PackingList[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const l of lists)
    for (const s of l.sections)
      for (const i of s.items) {
        const k = i.name.toLowerCase();
        const c = count.get(k);
        if (c) c.n++;
        else count.set(k, { name: i.name, n: 1 });
      }
  return [...count.values()].sort((a, b) => b.n - a.n).map((c) => c.name);
}

/**
 * The open packing list (owner, Nov 7: "more user friendly, like Listry"). One way of working, no
 * edit mode: tap the circle to pack it, tap its name to open its details right under it (name, how
 * many, a note, sub-items, which section, remove), hold and drag to reorder. Adding suggests what
 * your other lists already have; commas add several at once. Packed things sink to the bottom.
 */
function Lists({ lists, onChange, onMin, onClose, error }: { lists: PackingList[]; onChange: (l: PackingList[]) => void; onMin: () => void; onClose: () => void; error: string | null }) {
  const [activeId, setActiveId] = useState<string | null>(() => read<string | null>(ACTIVE_KEY, null));
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const [pillMode, setPillMode] = useState<PillMode>(() => (read<string>(PILL_MODE_KEY, "scroll") === "wrap" ? "wrap" : "scroll"));
  const [packed, setPacked] = useState<PackedMode>(() => {
    const v = read<string>(PACKED_KEY, "sink");
    return v === "stay" || v === "hide" ? v : "sink";
  });
  const [settings, setSettings] = useState(false);
  const [naming, setNaming] = useState(false);
  const [more, setMore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [focusSec, setFocusSec] = useState<string | null>(null);
  const [folded, setFolded] = useState<Record<string, boolean>>(() => read(FOLDED_KEY, {}));
  const [undo, setUndo] = useState<{ label: string; lists: PackingList[] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const pick = (id: string) => {
    setActiveId(id);
    write(ACTIVE_KEY, id);
    setMore(false);
    setConfirmDelete(false);
    setOpenItem(null);
  };
  const update = (l: PackingList) => onChange(lists.map((x) => (x.id === l.id ? l : x)));
  const setSections = (sections: PackSection[]) => active && update({ ...active, sections });
  const setSection = (s: PackSection) => active && setSections(active.sections.map((x) => (x.id === s.id ? s : x)));
  const fold = (id: string) => {
    const next = { ...folded, [id]: !folded[id] };
    setFolded(next);
    write(FOLDED_KEY, next);
  };
  /** A change that can be taken back for a few seconds (removing things). */
  const undoable = (label: string, apply: () => void) => {
    const before = lists;
    apply();
    clearTimeout(undoTimer.current);
    setUndo({ label, lists: before });
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };
  const moveItem = (it: PackItem, from: string, to: string) => {
    if (!active || from === to) return;
    setSections(active.sections.map((s) => (s.id === from ? { ...s, items: s.items.filter((i) => i.id !== it.id) } : s.id === to ? { ...s, items: [...s.items, it] } : s)));
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
      sections: active.sections.map((s) => ({ id: newId("s"), name: s.name, items: s.items.map((i) => ({ ...i, id: newId("b"), done: false, subs: i.subs.map((u) => ({ id: newId("b"), name: u.name, done: false })) })) })),
    };
    const at = lists.findIndex((x) => x.id === active.id);
    onChange([...lists.slice(0, at + 1), l, ...lists.slice(at + 1)]);
    pick(l.id);
  }
  function deleteList() {
    if (!active) return;
    const at = lists.findIndex((x) => x.id === active.id);
    const rest = lists.filter((x) => x.id !== active.id);
    undoable(`Deleted “${active.name}”`, () => onChange(rest));
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
    setFocusSec(s.id);
  }

  const known = knownItems(lists);
  const all = active ? active.sections.flatMap((s) => s.items) : [];
  const left = all.filter((i) => !i.done).length;
  const share = all.length ? (all.length - left) / all.length : 0;

  const gear = (
    <button type="button" onClick={() => setSettings((v) => !v)} aria-pressed={settings} aria-label="Packing list settings" title="Settings" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: SOFT, background: settings ? "rgba(217,180,95,.35)" : undefined }}>
      <GearIcon size={15} />
    </button>
  );
  const seg = (on: boolean) => (on ? { background: "var(--t-gold)", color: INK } : { color: SOFT });
  const pill = "flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold";
  return (
    <>
      <Header onMin={onMin} onClose={onClose} gear={gear} />
      <Fold open={settings}>
        <div className="mx-3 mb-2 flex flex-col gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold" style={{ background: "rgba(120,90,40,.08)" }}>
          <div className="flex flex-wrap items-center gap-2">
            List pills
            <span role="radiogroup" aria-label="List pills" className="ml-auto flex rounded-full p-0.5" style={{ background: "rgba(120,90,40,.12)" }}>
              {(["scroll", "wrap"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={pillMode === m} onClick={() => (setPillMode(m), write(PILL_MODE_KEY, m))} className="h-7 rounded-full px-3 text-[12.5px] font-semibold" style={seg(pillMode === m)}>
                  {m === "scroll" ? "Scroll sideways" : "Show all"}
                </button>
              ))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            Packed things
            <span role="radiogroup" aria-label="Packed things" className="ml-auto flex rounded-full p-0.5" style={{ background: "rgba(120,90,40,.12)" }}>
              {(["sink", "stay", "hide"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={packed === m} onClick={() => (setPacked(m), write(PACKED_KEY, m))} className="h-7 rounded-full px-3 text-[12.5px] font-semibold" style={seg(packed === m)}>
                  {m === "sink" ? "Go to the bottom" : m === "stay" ? "Stay put" : "Fold away"}
                </button>
              ))}
            </span>
          </div>
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
            {/* The name is edited where it sits; the bar under it fills as things are packed. */}
            <div className="flex items-center gap-1 pt-2">
              <TextField value={active.name} onSave={(v) => update({ ...active, name: v || active.name })} label="List name (tap to rename)" className="font-display text-[18px]" plain />
              <button type="button" onClick={() => (setMore((v) => !v), setConfirmDelete(false))} aria-expanded={more} aria-label="More for this list" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px] leading-none hover:bg-black/[.06]" style={{ color: SOFT }}>
                ⋯
              </button>
            </div>
            {all.length > 0 && (
              <div className="flex items-center gap-2 pb-1 pt-0.5">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(120,90,40,.15)" }}>
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%`, background: "linear-gradient(90deg,#e2bb5c,#a88a3f)" }} />
                </span>
                <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: SOFT }}>
                  {left ? `${left} to pack` : "✓ All packed"}
                </span>
              </div>
            )}
            <Fold open={more}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-[13px]">
                <button type="button" onClick={() => (copyList(), setMore(false))} className="h-8 underline underline-offset-2">
                  ⧉ Copy list
                </button>
                {all.length > left && (
                  <button type="button" onClick={untickAll} className="h-8 underline underline-offset-2">
                    Unpack all (start fresh)
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
                sections={active.sections}
                first={k === 0}
                folded={!!folded[s.id]}
                onFold={() => fold(s.id)}
                packed={packed}
                openItem={openItem}
                setOpenItem={setOpenItem}
                focusName={focusSec === s.id}
                known={known}
                onChange={setSection}
                onMove={(it, to) => moveItem(it, s.id, to)}
                onRemoveItem={(it) => undoable(`Removed ${it.name}`, () => setSection({ ...s, items: s.items.filter((i) => i.id !== it.id) }))}
                onRemove={active.sections.length > 1 ? () => undoable(`Removed the section ${s.name || "Items"}`, () => setSections(active.sections.filter((x) => x.id !== s.id))) : undefined}
              />
            ))}
            <button type="button" onClick={addSection} className="mt-3 self-start text-[12.5px] underline underline-offset-2" style={{ color: SOFT }}>
              + Add a section (Suitcase, Backpack…)
            </button>
          </div>
        )}
        {error && (
          <p className="m-0 pt-2 text-[13px] font-semibold" style={{ color: "#9a3b26" }}>
            {error}
          </p>
        )}
      </div>
      {undo && (
        <div role="status" className="card-pop-in mx-3 mb-3 flex items-center gap-2 rounded-full px-4 py-1.5 text-[13.5px]" style={{ background: "rgba(42,28,16,.9)", color: "#f6ecd2" }}>
          <span className="min-w-0 flex-1 truncate">{undo.label}</span>
          <button type="button" onClick={() => (onChange(undo.lists), setUndo(null))} className="h-7 shrink-0 font-bold underline underline-offset-2" style={{ color: "#f2d27e" }}>
            Undo
          </button>
        </div>
      )}
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

/** A name edited where it sits (no box; a thin gold line, only while typing when `plain`). Saves on Enter or leaving it. */
function TextField({ value, onSave, label, className = "", autoFocus = false, placeholder, plain = false, maxLength = 80 }: { value: string; onSave: (v: string) => void; label: string; className?: string; autoFocus?: boolean; placeholder?: string; plain?: boolean; maxLength?: number }) {
  return (
    <input
      key={value}
      defaultValue={value}
      autoFocus={autoFocus}
      onBlur={(e) => tidy(e.target.value) !== value && onSave(tidy(e.target.value))}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      maxLength={maxLength}
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      className={`bare-input place-input ${plain ? "pack-add" : ""} h-8 min-w-0 flex-1 px-1 text-[16px] outline-none focus:outline-none focus-visible:outline-none ${className}`}
      style={{ color: INK }}
    />
  );
}

/**
 * "+ Add item": a quiet line at a section's end. Enter adds and stays for the next; commas add
 * several at once; while it has focus, pills offer what your other lists already have.
 */
function AddField({ placeholder, onAdd, autoFocus = false, small = false, suggest = [] }: { placeholder: string; onAdd: (names: string[]) => void; autoFocus?: boolean; small?: boolean; suggest?: string[] }) {
  const [v, setV] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const commit = () => {
    const names = v.split(/[,;\n]/).map(tidy).filter(Boolean).map((n) => n.slice(0, 80));
    if (names.length) onAdd(names);
    setV("");
  };
  const q = tidy(v).toLowerCase();
  const offers = suggest.filter((n) => (q ? n.toLowerCase().includes(q) && n.toLowerCase() !== q : true)).slice(0, q ? 6 : 8);
  return (
    <div>
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        onBlur={() => {
          // A tap on a suggestion lands first (pointerdown keeps the focus); then the field lets go.
          setTimeout(() => {
            if (document.activeElement !== ref.current) {
              setFocused(false);
              commit();
            }
          }, 120);
        }}
        placeholder={placeholder}
        maxLength={200}
        aria-label={placeholder}
        autoComplete="off"
        enterKeyHint="next"
        className={`bare-input place-input pack-add w-full px-1 outline-none focus:outline-none focus-visible:outline-none ${small ? "h-8" : "h-9"} text-[16px]`}
        style={{ color: INK }}
      />
      {focused && offers.length > 0 && (
        <div className="reveal flex flex-wrap gap-1 px-1 pb-1.5 pt-0.5" aria-label="From your other lists">
          {offers.map((n) => (
            <button
              key={n}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onAdd([n]);
                setV("");
                ref.current?.focus();
              }}
              className="h-7 rounded-full px-2.5 text-[12.5px] font-semibold"
              style={{ border: "1px solid #b39a6a", background: "rgba(255,250,238,.6)", color: INK }}
            >
              + {n}
            </button>
          ))}
        </div>
      )}
    </div>
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

function Section({
  section,
  sections,
  first,
  folded,
  onFold,
  packed,
  openItem,
  setOpenItem,
  focusName,
  known,
  onChange,
  onMove,
  onRemoveItem,
  onRemove,
}: {
  section: PackSection;
  sections: PackSection[];
  first: boolean;
  folded: boolean;
  onFold: () => void;
  packed: PackedMode;
  openItem: string | null;
  setOpenItem: (id: string | null) => void;
  focusName: boolean;
  known: string[];
  onChange: (s: PackSection) => void;
  onMove: (it: PackItem, to: string) => void;
  onRemoveItem: (it: PackItem) => void;
  onRemove?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(focusName);
  const [showPacked, setShowPacked] = useState(false);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));
  const setItems = (items: PackItem[]) => onChange({ ...section, items });
  const setItem = (it: PackItem) => setItems(section.items.map((i) => (i.id === it.id ? it : i)));
  // Just packed: it stays where it is a moment (so you see the tick), then glides down.
  const [settling, setSettling] = useState<string[]>([]);
  const settle = (id: string) => {
    setSettling((s) => [...s, id]);
    setTimeout(() => setSettling((s) => s.filter((x) => x !== id)), 1100);
  };
  const todo = section.items.filter((i) => !i.done || settling.includes(i.id));
  const done = section.items.filter((i) => i.done && !settling.includes(i.id));
  // Rows glide to their new places when the order changes (FLIP).
  const listRef = useRef<HTMLUListElement>(null);
  const rects = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const next = new Map<string, number>();
    for (const li of Array.from(ul.children) as HTMLElement[]) {
      const id = li.dataset.packItem;
      if (!id) continue;
      const top = li.getBoundingClientRect().top;
      next.set(id, top);
      const was = rects.current.get(id);
      if (was !== undefined && Math.abs(was - top) > 2 && !li.style.transform) li.animate([{ translate: `0 ${was - top}px` }, { translate: "0 0" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    rects.current = next;
  });
  // What shows, in order: packed things at the bottom (or folded away) unless they stay put.
  const shown = packed === "stay" ? section.items : packed === "sink" ? [...todo, ...done] : [...todo, ...(showPacked ? done : [])];
  const allDone = section.items.length > 0 && !todo.length;
  // Suggestions skip anything already on this list (any section).
  const here = new Set(sections.flatMap((x) => x.items).map((i) => i.name.toLowerCase()));
  const named = !!section.name || !first || renaming;
  const onEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = shown.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const order = arrayMove(shown, from, to);
    const hidden = section.items.filter((i) => !order.includes(i));
    setItems([...order, ...hidden]);
  };
  return (
    <section aria-label={section.name || "Items"} className={first ? "mt-1" : "mt-3"}>
      {named && (
        <div className="flex min-h-9 items-center gap-1" style={{ borderBottom: "1px solid rgba(139,112,64,.3)" }}>
          {renaming ? (
            <TextField value={section.name} onSave={(v) => (onChange({ ...section, name: v }), setRenaming(false))} label="Section name" placeholder="Section name (Suitcase…)" autoFocus className="font-display text-[15px]" maxLength={40} />
          ) : (
            <button type="button" onClick={onFold} aria-expanded={!folded} className="font-display flex min-h-9 min-w-0 flex-1 items-center gap-1.5 text-left text-[15px]">
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="shrink-0 transition-transform duration-200" style={{ transform: folded ? "rotate(-90deg)" : undefined, color: SOFT }}>
                <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate">{section.name || "Items"}</span>
              <span className="ml-auto shrink-0 pr-1 font-sans text-[12px]" style={{ color: SOFT }}>
                {allDone ? "✓ packed" : folded && todo.length ? `${todo.length} to pack` : ""}
              </span>
            </button>
          )}
          <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label={`More for the section ${section.name || "Items"}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px] leading-none hover:bg-black/[.06]" style={{ color: SOFT }}>
            ⋯
          </button>
        </div>
      )}
      <Fold open={menu}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1 text-[13px]">
          <button type="button" onClick={() => (setRenaming(true), setMenu(false))} className="h-8 underline underline-offset-2">
            ✎ Rename
          </button>
          {done.length > 0 && (
            <button type="button" onClick={() => (setItems(section.items.map((i) => ({ ...i, done: false, subs: i.subs.map((u) => ({ ...u, done: false })) }))), setMenu(false))} className="h-8 underline underline-offset-2">
              Unpack this section
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={() => (onRemove(), setMenu(false))} className="h-8 underline underline-offset-2" style={{ color: "#9a3b26" }}>
              Remove section
            </button>
          )}
        </div>
      </Fold>
      <Fold open={!folded}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd} onDragStart={() => setOpenItem(null)}>
          <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul ref={listRef} className="m-0 list-none p-0">
              {shown.map((it) => (
                <Item
                  key={it.id}
                  item={it}
                  open={openItem === it.id}
                  onOpen={() => setOpenItem(openItem === it.id ? null : it.id)}
                  sections={sections}
                  sectionId={section.id}
                  onChange={(n) => (n.done && !it.done && packed !== "stay" && settle(it.id), setItem(n))}
                  onMove={(to) => (onMove(it, to), setOpenItem(null))}
                  onRemove={() => (onRemoveItem(it), setOpenItem(null))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {packed === "hide" && done.length > 0 && (
          <button type="button" onClick={() => setShowPacked((v) => !v)} className="mt-1 h-8 text-[12.5px] underline underline-offset-2" style={{ color: SOFT }}>
            {showPacked ? "Fold packed things away" : `✓ ${done.length} packed · show`}
          </button>
        )}
        <AddField placeholder="+ Add item" suggest={known.filter((n) => !here.has(n.toLowerCase()))} onAdd={(names) => setItems([...section.items, ...names.map((name) => ({ id: newId("b"), name, done: false, subs: [] }))])} />
      </Fold>
    </section>
  );
}

function Item({ item, open, onOpen, sections, sectionId, onChange, onMove, onRemove }: { item: PackItem; open: boolean; onOpen: () => void; sections: PackSection[]; sectionId: string; onChange: (i: PackItem) => void; onMove: (to: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const qty = item.qty ?? 1;
  const toggle = () => {
    const done = !item.done;
    onChange({ ...item, done, subs: item.subs.map((u) => ({ ...u, done })) });
  };
  const toggleSub = (u: BringItem) => {
    const subs = item.subs.map((x) => (x.id === u.id ? { ...x, done: !x.done } : x));
    onChange({ ...item, subs, done: subs.length > 0 && subs.every((x) => x.done) });
  };
  const step = "flex h-7 w-7 items-center justify-center rounded-full text-[15px] leading-none disabled:opacity-35";
  return (
    <li ref={setNodeRef} data-pack-item={item.id} className="due-in" style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined, opacity: isDragging ? 0.85 : 1, borderBottom: "1px solid rgba(139,112,64,.15)" }}>
      {/* Hold and drag anywhere on the row to move it; the circle packs it; the name opens its details. */}
      <div {...attributes} {...listeners} role="group" aria-label={item.name} className="flex min-h-10 select-none items-center gap-1" style={{ WebkitTouchCallout: "none", touchAction: "pan-y" }}>
        <button type="button" role="checkbox" aria-checked={item.done} aria-label={item.done ? `Unpack ${item.name}` : `Pack ${item.name}`} onClick={toggle} className="flex h-10 w-9 shrink-0 items-center justify-center">
          <Check on={item.done} />
        </button>
        <button type="button" onClick={onOpen} aria-expanded={open} aria-label={`${item.name}: details`} className="flex min-h-10 min-w-0 flex-1 flex-col justify-center py-1 text-left">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 break-words text-[15.5px] transition-opacity" style={{ opacity: item.done ? 0.5 : 1, textDecoration: item.done ? "line-through" : undefined, textDecorationColor: "rgba(42,28,16,.4)" }}>
              {item.name}
            </span>
            {qty > 1 && (
              <span className="shrink-0 rounded-full px-1.5 text-[12px] font-bold" style={{ background: "rgba(217,180,95,.3)", color: "#4a3913", opacity: item.done ? 0.6 : 1 }}>
                ×{qty}
              </span>
            )}
          </span>
          {item.note && (
            <span className="truncate text-[12.5px] italic" style={{ color: SOFT, opacity: item.done ? 0.6 : 1 }}>
              {item.note}
            </span>
          )}
        </button>
      </div>

      {/* Its details, right under it (no popup). */}
      <Fold open={open}>
        <div className="mb-2 ml-9 flex flex-col gap-1.5 rounded-xl px-2.5 py-2" style={{ background: "rgba(120,90,40,.08)" }}>
          <div className="flex items-center gap-1.5">
            <TextField value={item.name} onSave={(v) => (v ? onChange({ ...item, name: v }) : onRemove())} label="Item name" />
            <span className="flex shrink-0 items-center gap-0.5 rounded-full px-0.5" style={{ border: "1px solid #b39a6a" }} aria-label="How many">
              <button type="button" className={step} disabled={qty <= 1} onClick={() => onChange({ ...item, qty: qty - 1 })} aria-label="One fewer">
                −
              </button>
              <span className="min-w-[1.6em] text-center text-[13.5px] font-bold tabular-nums">×{qty}</span>
              <button type="button" className={step} disabled={qty >= 99} onClick={() => onChange({ ...item, qty: qty + 1 })} aria-label="One more">
                +
              </button>
            </span>
          </div>
          <TextField value={item.note ?? ""} onSave={(v) => onChange({ ...item, note: v || undefined })} label="Note" placeholder="A note (which one, where it is…)" className="text-[14px] italic" plain maxLength={120} />
          {sections.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 text-[12.5px]" style={{ color: SOFT }}>
              In
              {sections.map((s) => (
                <button key={s.id} type="button" onClick={() => onMove(s.id)} className="h-7 rounded-full px-2.5 font-semibold" style={s.id === sectionId ? { background: "var(--t-gold)", color: INK, border: "1px solid #8a6116" } : { border: "1px solid #b39a6a", color: INK }}>
                  {s.name || "Items"}
                </button>
              ))}
            </div>
          )}
          {item.subs.length > 0 && (
            <ul className="m-0 list-none p-0">
              {item.subs.map((u) => (
                <li key={u.id} className="due-in flex min-h-8 items-center gap-1.5">
                  <TextField value={u.name} onSave={(v) => onChange({ ...item, subs: v ? item.subs.map((x) => (x.id === u.id ? { ...x, name: v } : x)) : item.subs.filter((x) => x.id !== u.id) })} label="Sub-item name" plain />
                  <button type="button" onClick={() => onChange({ ...item, subs: item.subs.filter((x) => x.id !== u.id) })} aria-label={`Remove ${u.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: "#9a3b26" }}>
                    <CloseIcon size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AddField small placeholder="↳ Add a sub-item" onAdd={(names) => onChange({ ...item, done: false, subs: [...item.subs, ...names.map((name) => ({ id: newId("b"), name, done: false }))] })} />
          <div className="flex items-center justify-between">
            <button type="button" onClick={onRemove} className="h-8 text-[13px] underline underline-offset-2" style={{ color: "#9a3b26" }}>
              Remove {item.name}
            </button>
            <button type="button" onClick={onOpen} className="h-8 rounded-full px-4 text-[13px] font-semibold" style={{ background: "var(--t-gold)", color: INK, border: "1px solid #8a6116" }}>
              Done
            </button>
          </div>
        </div>
      </Fold>

      {/* Sub-items tick on their own; all ticked packs the item. */}
      {item.subs.length > 0 && !open && (
        <ul className="m-0 list-none pb-1 pl-9 pr-0">
          {item.subs.map((u) => (
            <li key={u.id}>
              <button type="button" role="checkbox" aria-checked={u.done} onClick={() => toggleSub(u)} className="flex min-h-8 w-full items-center gap-2 py-0.5 text-left">
                <Check on={u.done} small />
                <span className="min-w-0 break-words text-[14.5px]" style={{ opacity: u.done ? 0.5 : 1, textDecoration: u.done ? "line-through" : undefined, textDecorationColor: "rgba(42,28,16,.4)" }}>
                  {u.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
