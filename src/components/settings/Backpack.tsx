"use client";

import { GearIcon, CloseIcon } from "@/components/ui/Icons";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { paintInventoryItemAction } from "@/app/actions";
import { isOffline, pendingFor, saveOrQueue } from "@/lib/offline";
import { POCKETS, type BringList, type Inventory, type InventoryItem, type ItemStatus, type PocketKey } from "@/lib/inventory";
import { CHECKIN_STYLES } from "@/lib/celebration-fx";
import { useEscape } from "@/lib/use-escape";
import { useFitAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { Fold, useClosing } from "@/components/ui/Fold";
import { openPackingWindow } from "./PackingLists";

const STATUS: { v: ItemStatus; label: string; hint: string }[] = [
  { v: "full", label: "Stocked", hint: "Full and ready" },
  { v: "low", label: "Running low", hint: "Refill soon" },
  { v: "empty", label: "Needs refill", hint: "Ran out" },
];

/** How see-through the "Refill" band is by default (the portrait shows through it); set from the backpack's gear. */
const REFILL_ALPHA = 0.6;
const ALPHA_KEY = "inv-refill-alpha";

/** One slot: an item's portrait, or an empty leather square to fill. */
function Slot({ item, painting, failed = false, onTap, moving, at, onGrab, lifted = false, refillAlpha = REFILL_ALPHA }: { item: InventoryItem | null; painting: boolean; failed?: boolean; onTap: (rect: DOMRect) => void; moving: boolean; at: string; onGrab?: (e: React.PointerEvent) => void; lifted?: boolean; refillAlpha?: number }) {
  const empty = item?.status === "empty";
  return (
    <button
      type="button"
      data-inv-slot={at}
      onPointerDown={onGrab}
      onContextMenu={(e) => item && e.preventDefault()}
      onClick={(e) => onTap(e.currentTarget.getBoundingClientRect())}
      style={{ WebkitTouchCallout: "none", opacity: lifted ? 0.35 : undefined }}
      aria-haspopup={item ? "menu" : undefined}
      aria-label={item ? `${item.name}${empty ? " — needs refilling" : item.status === "low" ? " — running low" : ""}` : moving ? "Move it here" : "Empty slot: add an item"}
      className={`inv-slot group relative flex aspect-square w-full select-none items-center justify-center overflow-hidden rounded-lg transition-opacity ${moving ? "inv-slot-target" : ""}`}
    >
      {item ? (
        <>
          {item.icon ? (
            // eslint-disable-next-line @next/next/no-img-element -- item portrait
            <img src={item.icon} alt="" draggable={false} decoding="async" className="h-full w-full object-cover transition-[filter] duration-300" style={empty ? { filter: "grayscale(.6) brightness(.75)" } : undefined} />
          ) : (
            <span className={`flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-center text-[12px] font-semibold leading-tight ${painting ? "inv-painting" : ""}`} style={{ color: "#f2d27e" }}>
              {painting ? (
                <>
                  <span aria-hidden>🖌</span>
                  Painting…
                </>
              ) : (
                <>
                  {item.name}
                  {failed && <span className="text-[10.5px] font-bold uppercase tracking-[.05em]" style={{ color: "#e8c873" }}>↻ paint again</span>}
                </>
              )}
            </span>
          )}
          {empty && (
            <span className="inv-refill absolute inset-x-0 bottom-0 py-[3px] text-center text-[11px] font-bold uppercase tracking-[.06em]" style={{ background: `rgba(150,36,20,${refillAlpha})`, color: "#fff1e0", boxShadow: "0 -1px 0 rgba(242,210,126,.6)", textShadow: "0 1px 2px rgba(60,10,5,.9)" }}>
              ↻ Refill
            </span>
          )}
          {item.status === "low" && <span aria-hidden className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full" style={{ background: "#e8a33c", boxShadow: "0 0 0 2px rgba(42,26,16,.8)" }} />}
        </>
      ) : (
        <span aria-hidden className="text-[22px] leading-none transition-opacity" style={{ color: "rgba(242,210,126,.28)" }}>
          +
        </span>
      )}
    </button>
  );
}

/**
 * The backpack, classic RPG style: a utility pocket on top and the main
 * pocket below, one item per slot, each with its portrait. Mark what's run
 * out, and it waits at the top until it's refilled.
 */
export function Backpack({ initial }: { initial: Inventory }) {
  const [inv, setInv] = useState(initial);
  // Changed offline and not synced yet: this device's backpack wins over the (kept) page's.
  useEffect(() => {
    const waiting = pendingFor<Inventory>("inventory");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the waiting offline copy lives in browser storage, read after hydration
    if (waiting) setInv(waiting);
  }, []);
  const [editing, setEditing] = useState<{ item: InventoryItem; isNew: boolean } | null>(null);
  const [painting, setPainting] = useState<Set<string>>(new Set());
  // Portraits that could not be painted (offline or failed): the slot says so and the menu offers to try again.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<InventoryItem | null>(null);
  // Tapping an item opens a small menu by it.
  const [menu, setMenu] = useState<{ item: InventoryItem; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [undo, setUndo] = useState<(() => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [bringOpen, setBringOpen] = useState(false);
  // The view's own settings, opened from its gear (above the pack).
  const [arranging, setArranging] = useState(false);
  const [refillAlpha, setRefillAlpha] = useState(REFILL_ALPHA);
  useEffect(() => {
    const v = Number(window.localStorage.getItem(ALPHA_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
    if (window.localStorage.getItem(ALPHA_KEY) !== null && Number.isFinite(v)) setRefillAlpha(Math.max(0.15, Math.min(1, v)));
  }, []);
  function changeAlpha(v: number) {
    setRefillAlpha(v);
    try {
      window.localStorage.setItem(ALPHA_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  }
  // Per device: how tall each pocket shows (dragged by its bottom seam; the rest scrolls),
  // which pockets are folded to their title, the packing lists' pills and whether they're open.
  const [heights, setHeights] = useState<Partial<Record<PocketKey, number>>>({});
  const [folded, setFolded] = useState<Partial<Record<PocketKey, boolean>>>({});
  useEffect(() => {
    try {
      const ls = window.localStorage;
      /* eslint-disable react-hooks/set-state-in-effect -- browser storage is only readable after hydration */
      setHeights(JSON.parse(ls.getItem("inv-heights") ?? "{}") as Partial<Record<PocketKey, number>>);
      setFolded(JSON.parse(ls.getItem("inv-folded") ?? "{}") as Partial<Record<PocketKey, boolean>>);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* storage unavailable */
    }
  }, []);
  const store = (key: string, v: unknown) => {
    try {
      window.localStorage.setItem(key, typeof v === "string" ? v : JSON.stringify(v));
    } catch {
      /* storage unavailable */
    }
  };
  function setHeight(pocket: PocketKey, h: number | null) {
    const next = { ...heights };
    if (h == null) delete next[pocket];
    else next[pocket] = h;
    setHeights(next);
    store("inv-heights", next);
  }
  function toggleFold(pocket: PocketKey) {
    const next = { ...folded, [pocket]: !folded[pocket] };
    setFolded(next);
    store("inv-folded", next);
  }
  // The ☰ menu at the pack's top right.
  const [packMenu, setPackMenu] = useState<{ x: number; y: number } | null>(null);
  // The settings gear sits beside the screen's × (or its title on the full page), so it takes no row of its own.
  const rootRef = useRef<HTMLDivElement>(null);
  const [toolsHost, setToolsHost] = useState<Element | null | undefined>(undefined);
  useEffect(() => {
    const host = rootRef.current?.closest('[role="dialog"]')?.querySelector("[data-modal-tools]") ?? document.querySelector("[data-modal-tools]");
    setToolsHost(host);
  }, []);
  // Fewer or more slots (4 at a time). Taking slots away moves what's in them into free slots higher up.
  const maxSlots = (p: PocketKey) => (p === "top" ? 16 : 32);
  function canShrink(p: PocketKey) {
    const n = inv.slots[p] - 4;
    if (n < 4) return false;
    const mine = inv.items.filter((i) => i.pocket === p);
    return mine.filter((i) => i.slot >= n).length <= n - mine.filter((i) => i.slot < n).length;
  }
  function changeSlots(p: PocketKey, delta: 4 | -4) {
    const n = inv.slots[p] + delta;
    if (delta > 0) {
      if (n > maxSlots(p)) return;
      persist({ ...inv, slots: { ...inv.slots, [p]: n } });
      return;
    }
    if (!canShrink(p)) return flash("No room: take something out first");
    const mine = inv.items.filter((i) => i.pocket === p);
    const free = Array.from({ length: n }, (_, k) => k).filter((k) => !mine.some((i) => i.slot === k));
    const moved = new Map(mine.filter((i) => i.slot >= n).map((i, k) => [i.id, free[k]]));
    persist({ ...inv, slots: { ...inv.slots, [p]: n }, items: inv.items.map((i) => (moved.has(i.id) ? { ...i, slot: moved.get(i.id)! } : i)) });
  }
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  // Dragging an item to another slot (press and hold on a phone, then drag).
  const [drag, setDrag] = useState<{ item: InventoryItem; x: number; y: number; over: string | null } | null>(null);
  const dragging = useRef(false);
  const skipClick = useRef(false);
  useEffect(() => {
    // While an item is being carried, the page mustn't scroll under the finger.
    const block = (e: TouchEvent) => dragging.current && e.preventDefault();
    window.addEventListener("touchmove", block, { passive: false });
    return () => window.removeEventListener("touchmove", block);
  }, []);
  const slotUnder = (x: number, y: number) => document.elementFromPoint(x, y)?.closest("[data-inv-slot]")?.getAttribute("data-inv-slot") ?? null;

  function grab(e: React.PointerEvent, item: InventoryItem | null) {
    if (!item || e.button !== 0 || moving) return;
    const touch = e.pointerType !== "mouse";
    const x0 = e.clientX;
    const y0 = e.clientY;
    const id = e.pointerId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const begin = (x: number, y: number) => {
      dragging.current = true;
      setDrag({ item, x, y, over: null });
      try {
        navigator.vibrate?.(12);
      } catch {}
    };
    if (touch) timer = setTimeout(() => begin(x0, y0), 280);
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!dragging.current) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
        // On a phone, moving before the hold is a scroll, not a drag.
        if (touch) return cleanup();
        begin(ev.clientX, ev.clientY);
      }
      ev.preventDefault();
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, over: slotUnder(ev.clientX, ev.clientY) } : d));
    };
    const finish = (x: number, y: number, drop: boolean) => {
      cleanup();
      if (!dragging.current) return;
      dragging.current = false;
      skipClick.current = true;
      setTimeout(() => (skipClick.current = false), 50);
      setDrag(null);
      const target = drop ? slotUnder(x, y) : null;
      if (!target) return;
      const [pocket, slotStr] = target.split(":") as [PocketKey, string];
      const slot = Number(slotStr);
      if (pocket === item.pocket && slot === item.slot) return;
      const there = at(pocket, slot);
      persist({ ...inv, items: inv.items.map((i) => (i.id === item.id ? { ...i, pocket, slot } : there && i.id === there.id ? { ...i, pocket: item.pocket, slot: item.slot } : i)) });
    };
    const up = (ev: PointerEvent) => ev.pointerId === id && finish(ev.clientX, ev.clientY, true);
    const cancel = (ev: PointerEvent) => ev.pointerId === id && finish(ev.clientX, ev.clientY, false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  function persist(next: Inventory) {
    const prev = inv;
    setInv(next);
    start(async () => {
      try {
        await saveOrQueue("saveInventory", next, "inventory");
      } catch (e) {
        setInv(prev);
        setError(e instanceof Error ? e.message : "Couldn't save the backpack.");
      }
    });
  }
  const at = (pocket: PocketKey, slot: number) => inv.items.find((i) => i.pocket === pocket && i.slot === slot) ?? null;
  const flash = (t: string, undoFn?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    setUndo(() => undoFn ?? null);
    toastTimer.current = setTimeout(() => (setToast(null), setUndo(null)), undoFn ? 5000 : 3000);
  };

  function tapSlot(pocket: PocketKey, slot: number, rect?: DOMRect) {
    if (skipClick.current) return;
    const item = at(pocket, slot);
    if (moving) {
      // Move there (swapping with whatever is in the way).
      const next = inv.items.map((i) => (i.id === moving.id ? { ...i, pocket, slot } : item && i.id === item.id ? { ...i, pocket: moving.pocket, slot: moving.slot } : i));
      setMoving(null);
      persist({ ...inv, items: next });
      return;
    }
    if (item) setMenu({ item, x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2, y: rect ? rect.bottom + 6 : 120 });
    else setEditing({ item: { id: `i${crypto.randomUUID().slice(0, 8)}`, name: "", pocket, slot, icon: null, status: "full" }, isNew: true });
  }

  function save(item: InventoryItem, isNew: boolean, paintReq: { description?: string } | null = null) {
    const stamp = new Date().toISOString();
    const before = inv.items.find((i) => i.id === item.id);
    const withDates = {
      ...item,
      emptiedAt: item.status === "empty" && before?.status !== "empty" ? stamp : (item.emptiedAt ?? null),
      refilledAt: item.status === "full" && before?.status === "empty" ? stamp : (item.refilledAt ?? null),
    };
    const items = isNew ? [...inv.items, withDates] : inv.items.map((i) => (i.id === item.id ? withDates : i));
    const next = { ...inv, items };
    persist(next);
    setEditing(null);
    // Only a brand-new item, or a portrait asked for, is painted: toggling Refill must never start a paint.
    if ((isNew && !item.icon) || paintReq) paint({ ...withDates, icon: null }, next, paintReq?.description?.trim() || undefined);
  }
  function paint(item: InventoryItem, base: Inventory, description?: string) {
    // Painting needs the connection; the item keeps its plain look until it's painted later.
    if (isOffline()) {
      setFailed((f) => new Set(f).add(item.id));
      flash("No connection: its picture can be painted once you're back online");
      return;
    }
    setFailed((f) => {
      const n = new Set(f);
      n.delete(item.id);
      return n;
    });
    setPainting((p) => new Set(p).add(item.id));
    paintInventoryItemAction(item.name, description ?? null)
      .then((url) => {
        setInv((cur) => {
          const next = { ...cur, items: cur.items.map((i) => (i.id === item.id ? { ...i, icon: url } : i)) };
          void saveOrQueue("saveInventory", next, "inventory").catch(() => {});
          return next;
        });
      })
      .catch(() => {
        setFailed((f) => new Set(f).add(item.id));
        flash("The painter dropped the brush. Tap the slot, then “Paint a picture”, to try again.");
      })
      .finally(() => setPainting((p) => {
        const n = new Set(p);
        n.delete(item.id);
        return n;
      }));
    void base;
  }
  function setStatus(item: InventoryItem, status: ItemStatus) {
    save({ ...item, status }, false);
    flash(status === "full" ? `${item.name} refilled ✓` : `${item.name}: needs a refill`);
  }
  function remove(item: InventoryItem) {
    persist({ ...inv, items: inv.items.filter((i) => i.id !== item.id) });
    setEditing(null);
  }
  function refillQuest(item: InventoryItem) {
    start(async () => {
      try {
        const r = await saveOrQueue("refillQuest", item.name);
        flash(r.queued ? "Added to your quests once you're online" : "Added to your quests");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that quest.");
      }
    });
  }


  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {moving && (
        <p className="fade-in m-0 flex items-center gap-2 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
          Tap a slot to move <b>{moving.name}</b> there.
          <button type="button" onClick={() => setMoving(null)} className="underline" style={{ color: "var(--t-ink-soft)" }}>
            Cancel
          </button>
        </p>
      )}

      {/* Its gear: this view's settings, beside the ×; they open in a panel above the pack. */}
      {(() => {
        const gear = (
          <button type="button" onClick={() => setArranging((v) => !v)} aria-pressed={arranging} aria-label="Inventory settings" title="Inventory settings" className="settings-gear flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)", opacity: arranging ? 1 : 0.7 }}>
            <GearIcon size={16} />
          </button>
        );
        // No header slot (shouldn't happen): the gear keeps its old place above the pack.
        return toolsHost ? createPortal(gear, toolsHost) : toolsHost === null ? <div className="-mb-2 flex justify-end">{gear}</div> : null;
      })()}
      <Fold open={arranging}>
        <div className="parchment flex flex-col gap-2 rounded-2xl p-3" style={{ border: "1.5px solid #a88a3f", color: "#2a1c10" }}>
          <div className="flex items-center gap-3">
            {/* A live sample of the band over a portrait-like square. */}
            <span aria-hidden className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg" style={{ background: "linear-gradient(135deg,#c9a24a,#6b8a4a 55%,#3d5a7a)" }}>
              <span className="absolute inset-x-0 bottom-0 py-[2px] text-center text-[9px] font-bold uppercase" style={{ background: `rgba(150,36,20,${refillAlpha})`, color: "#fff1e0", textShadow: "0 1px 2px rgba(60,10,5,.9)" }}>
                ↻ Refill
              </span>
            </span>
            <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13.5px] font-semibold">
              <span className="flex items-baseline justify-between">
                Refill band
                <span className="text-[12px] font-normal tabular-nums" style={{ color: "#6b5631" }}>
                  {Math.round((1 - refillAlpha) * 100)}% see-through
                </span>
              </span>
              <input type="range" min={0.15} max={1} step={0.05} value={refillAlpha} onChange={(e) => changeAlpha(Number(e.target.value))} aria-label="How solid the Refill band is" className="h-7 w-full" style={{ accentColor: "#a88a3f" }} />
            </label>
          </div>
          <button type="button" onClick={() => setArranging(false)} className="relative z-[1] ml-auto h-8 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Done
          </button>
        </div>
      </Fold>

      {/* The pack, with the gilded bring-from-home tab tucked against its right edge (no column of its own) */}
      <div className="relative mx-auto w-full max-w-[460px]">
      <div className="backpack min-w-0">
        <span aria-hidden className="backpack-strap backpack-strap-l" />
        <span aria-hidden className="backpack-strap backpack-strap-r" />
        <span aria-hidden className="backpack-handle" />
        {/* ☰ at the pack's top right: packing lists and bring from home. */}
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPackMenu((m) => (m ? null : { x: r.right, y: r.bottom + 6 }));
          }}
          aria-haspopup="menu"
          aria-expanded={!!packMenu}
          aria-label="Backpack menu"
          title="Packing lists and more"
          className="absolute right-3 top-1.5 z-[2] flex h-7 w-7 items-center justify-center rounded-full"
          style={{ color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {POCKETS.map((p) => (
          <section key={p.key} aria-label={p.label} className={`backpack-pocket ${p.key === "top" ? "backpack-flap" : "backpack-main"}`}>
            <div className={`flex items-center justify-between gap-2 transition-[margin] ${folded[p.key] ? "" : "mb-2"}`}>
              {/* Tapping the title folds the pocket down to just its title. */}
              <button type="button" onClick={() => toggleFold(p.key)} aria-expanded={!folded[p.key]} title={folded[p.key] ? "Open this pocket" : "Fold this pocket away"} className="font-display -ml-1 flex min-h-8 min-w-0 items-center gap-1 rounded-lg px-1 text-[15px]" style={{ color: "#f2d27e" }}>
                <span className="truncate">{p.label}</span>
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="shrink-0 transition-transform duration-200" style={{ transform: folded[p.key] ? "rotate(-90deg)" : undefined, opacity: 0.7 }}>
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="flex shrink-0 items-center gap-1">
                <SlotButton label="− 4 slots" aria={`Remove 4 slots from the ${p.label.toLowerCase()}`} disabled={!canShrink(p.key)} onClick={() => changeSlots(p.key, -4)} />
                <SlotButton label="+ 4 slots" aria={`Add 4 slots to the ${p.label.toLowerCase()}`} disabled={inv.slots[p.key] >= maxSlots(p.key)} onClick={() => changeSlots(p.key, 4)} />
              </span>
            </div>
            <Fold open={!folded[p.key]}>
            <PocketWindow height={heights[p.key]} onHeight={(h) => setHeight(p.key, h)} label={p.label}>
              {Array.from({ length: inv.slots[p.key] }, (_, slot) => {
                const item = at(p.key, slot);
                return (
                  <div key={slot} className="flex min-w-0 flex-col items-center gap-1">
                    <Slot
                      item={item}
                      at={`${p.key}:${slot}`}
                      painting={!!item && painting.has(item.id)}
                      failed={!!item && failed.has(item.id)}
                      moving={!!moving || (!!drag && drag.over === `${p.key}:${slot}` && drag.item.id !== item?.id)}
                      lifted={!!drag && drag.item.id === item?.id}
                      onGrab={(e) => grab(e, item)}
                      onTap={(r) => tapSlot(p.key, slot, r)}
                      refillAlpha={refillAlpha}
                    />
                    {/* The whole name, on up to three short lines (tap for the full menu). */}
                    <span title={item?.name} className="line-clamp-3 block w-full break-words text-center text-[10.5px] leading-[1.15]" style={{ color: item ? "rgba(246,236,210,.85)" : "transparent", hyphens: "auto" }}>
                      {item?.name ?? "·"}
                    </span>
                  </div>
                );
              })}
            </PocketWindow>
            </Fold>
          </section>
        ))}
      </div>
        <button
          type="button"
          onClick={() => setBringOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={bringOpen}
          title={inv.bring.place ? `Bring from home to ${inv.bring.place}` : "Bring from home"}
          className="bring-tab font-display absolute right-0 top-[92px] z-[2] block whitespace-nowrap rounded-l-xl py-3 pl-[4px] pr-[2px] text-[12px] leading-none"
          style={{ writingMode: "vertical-rl" }}
        >
          <span aria-hidden className="mb-1 inline-block">🏠</span>
          Bring from home
        </button>
      </div>

      <p className="m-0 text-center text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
        Tap an item for its menu · hold and drag to move it
      </p>
      {packMenu && (
        <PackMenu
          x={packMenu.x}
          y={packMenu.y}
          onClose={() => setPackMenu(null)}
          onPacking={() => (setPackMenu(null), openPackingWindow())}
          onBring={() => (setPackMenu(null), setBringOpen(true))}
        />
      )}
      {drag &&
        createPortal(
          <div aria-hidden className="cursor-grabbing pointer-events-none fixed z-[90] h-16 w-16 overflow-hidden rounded-xl" style={{ left: drag.x - 32, top: drag.y - 40, transform: "scale(1.08) rotate(-4deg)", boxShadow: "0 14px 28px rgba(0,0,0,.55), 0 0 0 2px #f2d27e", background: "#2a1a10" }}>
            {drag.item.icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- item portrait
              <img src={drag.item.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-semibold" style={{ color: "#f2d27e" }}>
                {drag.item.name}
              </span>
            )}
          </div>,
          document.body
        )}
      {error && (
        <p className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      {toast && (
        <div role="status" className="card-pop-in fixed bottom-24 left-1/2 z-[80] flex w-max max-w-[92vw] -translate-x-1/2 items-center rounded-full px-4 py-2 text-[14px]" style={{ background: "rgba(20,14,6,.92)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.5)" }}>
          {toast}
          {undo && (
            <button type="button" onClick={() => (undo(), setToast(null), setUndo(null))} className="ml-3 rounded-full px-2.5 py-0.5 text-[13px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
              Undo
            </button>
          )}
        </div>
      )}
      {menu && (
        <ItemMenu
          item={menu.item}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => (setMenu(null), setEditing({ item: menu.item, isNew: false }))}
          onToggle={() => {
            const it = menu.item;
            setMenu(null);
            setStatus(it, it.status === "full" ? "empty" : "full");
          }}
          onQuest={() => (setMenu(null), refillQuest(menu.item))}
          onPaint={() => (paint(menu.item, inv), setMenu(null))}
          onGone={() => {
            const it = menu.item;
            setMenu(null);
            remove(it);
            flash(`${it.name} taken out`, () => persist({ ...inv, items: [...inv.items.filter((i) => i.id !== it.id), it] }));
          }}
        />
      )}
      {bringOpen && <BringDrawer list={inv.bring} onChange={(bring) => persist({ ...inv, bring })} onClose={() => setBringOpen(false)} />}
      {editing && (
        <ItemSheet
          initial={editing.item}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(i, paintReq) => save(i, editing.isNew, paintReq)}
          onRemove={() => remove(editing.item)}
          onMove={() => {
            setMoving(editing.item);
            setEditing(null);
          }}
          onQuest={() => refillQuest(editing.item)}
        />
      )}
    </div>
  );
}

/**
 * The bring-from-home side drawer: a packing list for a trip (name the place,
 * e.g. Natick), ticked off as things go in the bag. Clear the ticked ones, or
 * untick them all to keep the list for next time.
 */
function BringDrawer({ list, onChange, onClose }: { list: BringList; onChange: (l: BringList) => void; onClose: () => void }) {
  useEscape(onClose);
  const [draft, setDraft] = useState("");
  const [place, setPlace] = useState(list.place);
  const addRef = useRef<HTMLInputElement>(null);
  const ticked = list.items.filter((i) => i.done).length;
  const add = () => {
    const name = draft.replace(/\s+/g, " ").trim();
    if (!name) return;
    onChange({ ...list, items: [...list.items, { id: `b${crypto.randomUUID().slice(0, 8)}`, name, done: false }] });
    setDraft("");
    addRef.current?.focus();
  };
  const savePlace = () => place.trim() !== list.place && onChange({ ...list, place: place.trim() });
  const link = "text-[13.5px] underline underline-offset-2";
  return createPortal(
    <div className="drawer-fade-in fixed inset-0 z-[56] flex justify-end overscroll-contain" style={{ background: "rgba(10,8,4,.35)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Bring from home" onClick={(e) => e.stopPropagation()} className="drawer-slide-in parchment parchment-framed flex h-full w-[min(360px,88vw)] flex-col gap-3 overflow-y-auto overscroll-contain rounded-l-2xl p-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]" style={{ background: "var(--t-card)" }}>
        <div className="relative z-[1] flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-display m-0 text-[20px]" style={{ color: "var(--t-ink)" }}>
              Bring from home
            </h3>
            <label className="mt-1 flex items-center gap-1.5 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
              to
              <input value={place} onChange={(e) => setPlace(e.target.value)} onBlur={savePlace} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())} placeholder="where? (e.g. Natick)" maxLength={40} aria-label="Where you're bringing it" autoComplete="off" className="bare-input place-input h-8 min-w-0 flex-1 px-1 text-[16px] font-semibold" style={{ color: "var(--t-ink)" }} />
            </label>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[24px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <ul className="relative z-[1] m-0 flex list-none flex-col p-0">
          {list.items.map((it) => (
            <li key={it.id} className="group flex min-h-11 items-center gap-2.5" style={{ borderBottom: "1px solid rgba(139,112,64,.2)" }}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1.5">
                <input type="checkbox" checked={it.done} onChange={() => onChange({ ...list, items: list.items.map((i) => (i.id === it.id ? { ...i, done: !i.done } : i)) })} className="h-5 w-5 shrink-0 cursor-pointer" style={{ accentColor: "#b8913f" }} />
                <span className="min-w-0 break-words text-[15.5px] transition-opacity" style={{ color: "var(--t-ink)", textDecoration: it.done ? "line-through" : undefined, opacity: it.done ? 0.55 : 1 }}>
                  {it.name}
                </span>
              </label>
              <button type="button" onClick={() => onChange({ ...list, items: list.items.filter((i) => i.id !== it.id) })} aria-label={`Take ${it.name} off the list`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px] opacity-50 hover:bg-black/[.06] hover:opacity-100" style={{ color: "#9a3b26" }}>
                <CloseIcon size={10} />
              </button>
            </li>
          ))}
        </ul>

        <div className="relative z-[1] flex items-center gap-2">
          <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add something to bring" maxLength={80} aria-label="Add something to bring" className="h-11 min-w-0 flex-1 rounded-lg border px-3 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "var(--t-ink)" }} />
          <button type="button" onClick={add} disabled={!draft.trim()} className="hover-glow font-display h-11 shrink-0 rounded-full px-4 text-[14.5px] disabled:opacity-50" style={CHECKIN_STYLES[0].style}>
            Add
          </button>
        </div>

        {ticked > 0 && (
          <div className="relative z-[1] flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => onChange({ ...list, items: list.items.filter((i) => !i.done) })} className={link} style={{ color: "var(--t-ink)" }}>
              Clear what&apos;s packed
            </button>
            <button type="button" onClick={() => onChange({ ...list, items: list.items.map((i) => ({ ...i, done: false })) })} className={link} style={{ color: "var(--t-ink)" }}>
              Keep it all for next time
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** The little menu by a tapped item: edit it, mark it refilled or empty, or make it a quest. */
function ItemMenu({ item, x, y, onClose, onEdit, onToggle, onQuest, onGone, onPaint }: { item: InventoryItem; x: number; y: number; onClose: () => void; onEdit: () => void; onToggle: () => void; onQuest: () => void; onGone: () => void; onPaint?: () => void }) {
  useEscape(onClose);
  const W = 196;
  const left = Math.max(8, Math.min(x - W / 2, (typeof window === "undefined" ? 400 : window.innerWidth) - W - 8));
  const top = Math.min(y, (typeof window === "undefined" ? 800 : window.innerHeight) - 270);
  const empty = item.status !== "full";
  const row = "relative z-[1] flex min-h-11 items-center gap-2.5 px-4 text-left text-[15px] hover:bg-black/5";
  return createPortal(
    <div className="fixed inset-0 z-[57]" onClick={onClose}>
      <div role="menu" data-menu="inventory" aria-label={item.name} onClick={(e) => e.stopPropagation()} className="card-pop-in parchment fixed flex flex-col overflow-hidden py-1" style={{ left, top, width: W, borderRadius: 14, boxShadow: "0 12px 28px rgba(0,0,0,.45)" }}>
        <span className="relative z-[1] truncate px-4 pb-1 pt-1.5 text-[12px] font-bold uppercase tracking-[.1em]" style={{ color: "#8a6116" }}>
          {item.name}
        </span>
        <button type="button" role="menuitem" data-mi="refill" onClick={onToggle} className={row} style={{ color: "var(--t-ink)" }}>
          <span aria-hidden className="w-5 text-center">{empty ? "✓" : "⚗"}</span>
          {empty ? "Refilled" : "Needs a refill"}
        </button>
        <button type="button" role="menuitem" data-mi="quest" onClick={onQuest} className={row} style={{ color: "var(--t-ink)", borderTop: "1px solid rgba(139,112,64,.2)" }}>
          <span aria-hidden className="w-5 text-center">＋</span>
          Make it a quest
        </button>
        {!item.icon && onPaint && (
          <button type="button" role="menuitem" data-mi="paint" onClick={onPaint} className={row} style={{ color: "var(--t-ink)", borderTop: "1px solid rgba(139,112,64,.2)" }}>
            <span aria-hidden className="w-5 text-center">🖌</span>
            Paint a picture
          </button>
        )}
        <button type="button" role="menuitem" data-mi="edit" onClick={onEdit} className={row} style={{ color: "var(--t-ink)", borderTop: "1px solid rgba(139,112,64,.2)" }}>
          <span aria-hidden className="w-5 text-center">✎</span>
          Edit
        </button>
        <button type="button" role="menuitem" data-mi="gone" onClick={onGone} className={row} style={{ color: "#9a3b26", borderTop: "1px solid rgba(139,112,64,.2)" }}>
          <span aria-hidden className="w-5 text-center">✕</span>
          Gone (take it out)
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Shrink a photo before sending it (phones take huge ones). */
async function shrink(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

function ItemSheet({
  initial,
  isNew,
  onClose: closeNow,
  onSave,
  onRemove,
  onMove,
  onQuest,
}: {
  initial: InventoryItem;
  isNew: boolean;
  onClose: () => void;
  /** Save; `paint` asks for a painted portrait (with an optional description). */
  onSave: (i: InventoryItem, paint: { description?: string } | null) => void;
  onRemove: () => void;
  onMove: () => void;
  onQuest: () => void;
}) {
  const { closing, close: onClose } = useClosing(closeNow);
  useEscape(onClose);
  const [item, setItem] = useState(initial);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<null | "photo" | "illustrate">(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // A new portrait is wanted: none yet, or asked for with "Paint a new one".
  const [repaint, setRepaint] = useState(false);
  // The description box opens from "Paint it"; the note stays folded until asked for.
  const [describing, setDescribing] = useState(false);
  const [noting, setNoting] = useState(!!initial.note);
  // The sheet sits in the strip above the on-screen keyboard, so it can't be covered or stretched.
  const kb = useFitAboveKeyboard(true);
  const field = "h-11 w-full rounded-lg border px-3 text-[16px]";
  const fieldStyle = { borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "var(--t-ink)" };
  const pocket = POCKETS.find((p) => p.key === item.pocket)!;

  async function fromPhoto(file: File, mode: "photo" | "illustrate") {
    setPhotoError(null);
    setBusy(mode);
    try {
      const fd = new FormData();
      fd.append("file", await shrink(file));
      fd.append("mode", mode);
      fd.append("name", item.name || "an item");
      const r = await fetch("/api/inventory/photo", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
      if (!r.ok || !j.ok || !j.url) throw new Error(j.error ?? "Couldn't use that photo.");
      setItem((it) => ({ ...it, icon: j.url! }));
      setRepaint(false);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Couldn't use that photo.");
    } finally {
      setBusy(null);
    }
  }
  // Put the keyboard away before iOS shows its file menu; otherwise it comes back up when the menu closes.
  const dropKeyboard = () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && a !== document.body) a.blur();
  };
  const pick = (mode: "photo" | "illustrate") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void fromPhoto(f, mode);
  };
  const chip = "flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold";
  const wantsPaint = !item.icon || repaint;
  // Bring the keyboard up only once the sheet has slid in, so the two don't fight.
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 280);
    return () => clearTimeout(t);
  }, [isNew]);

  return createPortal(
    <div data-kb-fit data-kb-self className={`${closing ? "overlay-fade-out pointer-events-none" : "overlay-fade-in"} fixed inset-0 z-[56] flex justify-center overscroll-contain ${kb ? "items-start p-2" : "items-end sm:items-center sm:p-4"}`} style={{ background: "rgba(10,8,4,.3)", ...(kb ? { top: kb.top, height: kb.height, bottom: "auto" } : {}) }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add an item" : item.name} onClick={(e) => e.stopPropagation()} className={`${kb ? "" : "sheet-up max-h-[92svh]"} parchment parchment-framed flex w-full max-w-md flex-col gap-3 overflow-y-auto overscroll-contain ${kb ? "rounded-2xl" : "rounded-t-2xl sm:rounded-2xl"} p-4 pb-[max(16px,env(safe-area-inset-bottom))]`} style={kb ? { maxHeight: kb.height - 16 } : undefined}>
        <div className="relative z-[1] flex items-start gap-3">
          <span className="inv-slot relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full" aria-hidden>
            {item.icon && !repaint ? (
              // eslint-disable-next-line @next/next/no-img-element -- item portrait
              <img src={item.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className={`flex h-full w-full items-center justify-center px-1 text-center text-[11.5px] ${busy ? "inv-painting" : ""}`} style={{ color: "rgba(242,210,126,.75)" }}>
                {busy === "illustrate" ? "Painting your photo…" : busy === "photo" ? "Adding…" : "🖌 Painted when you save"}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
              {pocket.label} · slot {item.slot + 1}
            </span>
            <input ref={nameRef} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && item.name.trim() && onSave(item, wantsPaint ? { description } : null)} placeholder="What's in this slot?" maxLength={48} className={`${field} mt-1 font-semibold`} style={fieldStyle} aria-label="Item name" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[24px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
            <CloseIcon size={14} />
          </button>
        </div>

        {/* The picture, always in view: painted from its name, painted from your words, your photo as it is, or your photo painted. */}
        <div className="relative z-[1] flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="The picture">
            <button type="button" data-open={wantsPaint ? "true" : "false"} onClick={() => (setRepaint(true), setDescribing((v) => (wantsPaint ? !v : true)))} className={`qe-fact ${chip}`} title="Paint a picture from its name (or describe it)">
              ✨ Paint it
            </button>
            <label className={`qe-fact ${chip}`} title="Use your photo as the picture" onPointerDown={dropKeyboard}>
              📷 My photo
              <input type="file" accept="image/*" className="sr-only" onChange={pick("photo")} disabled={!!busy} />
            </label>
            <label className={`qe-fact ${chip}`} title="Paint your photo as an illustration" onPointerDown={dropKeyboard}>
              🎨 Paint my photo
              <input type="file" accept="image/*" className="sr-only" onChange={pick("illustrate")} disabled={!!busy} />
            </label>
          </div>
          <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
            {busy ? (busy === "illustrate" ? "Painting your photo…" : "Adding your photo…") : wantsPaint ? "Painted from its name when you save." : "Keeping this picture."}
          </span>
          <Fold open={wantsPaint && describing}>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe it (optional), e.g. a green pouch of fizzy tablets" maxLength={160} className={field} style={fieldStyle} aria-label="Describe the portrait" />
          </Fold>
          {photoError && (
            <span className="text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
              {photoError}
            </span>
          )}
        </div>

        <div className="relative z-[1] flex flex-col gap-1">
          <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            How full is it?
          </span>
          <div role="radiogroup" aria-label="How full" className="flex rounded-full p-1" style={{ background: "rgba(120,90,40,.12)" }}>
            {STATUS.map((o) => (
              <button
                key={o.v}
                type="button"
                role="radio"
                aria-checked={item.status === o.v}
                title={o.hint}
                onClick={() => setItem({ ...item, status: o.v })}
                className="h-11 flex-1 rounded-full text-[13.5px] font-semibold"
                style={item.status === o.v ? { background: o.v === "empty" ? "#9a3b26" : o.v === "low" ? "#c98a2a" : "var(--t-gold)", color: o.v === "full" ? "#2a1c10" : "#fff" } : { color: "var(--t-ink-soft)" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {!noting && (
          <button type="button" onClick={() => setNoting(true)} className="relative z-[1] -mt-1 self-start text-[13.5px] underline" style={{ color: "var(--t-ink)" }}>
            + Add a note
          </button>
        )}
        <Fold open={noting}>
          <textarea value={item.note ?? ""} onChange={(e) => setItem({ ...item, note: e.target.value })} placeholder="A note (where to buy it, which kind…)" rows={2} maxLength={200} className="relative z-[1] w-full rounded-lg border px-3 py-2 text-[16px]" style={fieldStyle} aria-label="Note" />
        </Fold>
        {!isNew && (
          <div className="relative z-[1] flex flex-wrap gap-x-4 gap-y-0 text-[13.5px]">
            <button type="button" onClick={onMove} className="min-h-11 underline" style={{ color: "var(--t-ink)" }}>
              Move to another slot
            </button>
            <button type="button" onClick={onQuest} className="min-h-11 underline" style={{ color: "var(--t-ink)" }}>
              Make a refill quest
            </button>
            <button type="button" onClick={onRemove} className="min-h-11 underline" style={{ color: "#9a3b26" }}>
              Take it out
            </button>
          </div>
        )}
        <div className="relative z-[1] flex justify-end">
          <button type="button" disabled={!item.name.trim() || !!busy} onClick={() => onSave({ ...item, name: item.name.trim(), icon: repaint ? null : item.icon }, wantsPaint ? { description } : null)} className="hover-glow h-11 rounded-full px-6 text-[15px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            {isNew ? "Put it in the pack" : "Save"}
          </button>
        </div>
        <div className="relative z-[1] -mt-2 flex justify-end">
          <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
            {busy ? "One moment, your picture is on its way…" : wantsPaint ? "Its picture is painted in a moment." : ""}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A small labelled pill by a pocket's title: take away or sew on 4 slots. */
function SlotButton({ label, aria, disabled, onClick }: { label: string; aria: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={aria} title={disabled ? (label.startsWith("+") ? "As many as fit" : "No empty slots to take away") : aria} className="flex h-7 items-center whitespace-nowrap rounded-full px-2 text-[11.5px] font-semibold disabled:opacity-35" style={{ border: "1px solid rgba(242,210,126,.45)", color: "#f2d27e", background: "rgba(20,12,4,.25)" }}>
      {label}
    </button>
  );
}

/** The ☰ menu from the pack's top right corner. */
function PackMenu({ x, y, onClose, onPacking, onBring }: { x: number; y: number; onClose: () => void; onPacking: () => void; onBring: () => void }) {
  useEscape(onClose);
  const W = 214;
  const left = Math.max(8, Math.min(x - W, (typeof window === "undefined" ? 400 : window.innerWidth) - W - 8));
  const row = "relative z-[1] flex min-h-11 items-center gap-2.5 px-4 text-left text-[15px] hover:bg-black/5";
  return createPortal(
    <div className="fixed inset-0 z-[57]" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())}>
      <div role="menu" data-menu="backpack" aria-label="Backpack menu" onClick={(e) => e.stopPropagation()} className="card-pop-in parchment fixed flex flex-col overflow-hidden py-1" style={{ left, top: y, width: W, borderRadius: 14, boxShadow: "0 12px 28px rgba(0,0,0,.45)" }}>
        <button type="button" role="menuitem" onClick={onPacking} className={row} style={{ color: "var(--t-ink)" }}>
          <span aria-hidden className="w-5 text-center">🧳</span>
          Packing lists
        </button>
        <button type="button" role="menuitem" onClick={onBring} className={row} style={{ color: "var(--t-ink)", borderTop: "1px solid rgba(139,112,64,.2)" }}>
          <span aria-hidden className="w-5 text-center">🏠</span>
          Bring from home
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * The pocket's grid, shown at the height you drag its bottom seam to (the
 * slots don't change; the rest scrolls). Dragging past the last row shows it
 * all again; double-click the seam to reset.
 */
function PocketWindow({ height, onHeight, label, children }: { height?: number; onHeight: (h: number | null) => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number | null>(null);
  const h = live ?? height ?? null;
  const bounds = () => {
    const el = ref.current!;
    const row = (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? 60;
    return { min: Math.min(row, el.scrollHeight), full: el.scrollHeight };
  };
  function grab(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !ref.current) return;
    e.preventDefault();
    const bar = e.currentTarget;
    const id = e.pointerId;
    bar.setPointerCapture(id);
    const y0 = e.clientY;
    const start = ref.current.getBoundingClientRect().height;
    const { min, full } = bounds();
    let last = start;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      last = Math.max(min, Math.min(full, start + ev.clientY - y0));
      setLive(last);
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", end);
      bar.removeEventListener("pointercancel", end);
      setLive(null);
      if (Math.abs(last - start) > 2) onHeight(last >= full - 4 ? null : Math.round(last));
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }
  function key(e: React.KeyboardEvent) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const { min, full } = bounds();
    const cur = ref.current!.getBoundingClientRect().height;
    const next = Math.max(min, Math.min(full, cur + (e.key === "ArrowDown" ? 24 : -24)));
    onHeight(next >= full - 4 ? null : Math.round(next));
  }
  return (
    <>
      <div ref={ref} className="grid grid-cols-4 gap-2 overflow-y-auto overscroll-contain" style={h ? { maxHeight: h } : undefined}>
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Drag to show more or less of the ${label.toLowerCase()}`}
        title="Drag to show more or less · double-click to show all"
        tabIndex={0}
        onPointerDown={grab}
        onDoubleClick={() => onHeight(null)}
        onKeyDown={key}
        className="inv-seam"
        data-dragging={live != null ? "true" : undefined}
      />
    </>
  );
}
