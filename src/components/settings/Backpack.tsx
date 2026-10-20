"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { makeRefillQuestAction, paintInventoryItemAction, saveInventoryAction } from "@/app/actions";
import { POCKETS, type Inventory, type InventoryItem, type ItemStatus, type PocketKey } from "@/lib/inventory";
import { useEscape } from "@/lib/use-escape";

const STATUS: { v: ItemStatus; label: string; hint: string }[] = [
  { v: "full", label: "Stocked", hint: "Full and ready" },
  { v: "low", label: "Running low", hint: "Refill soon" },
  { v: "empty", label: "Needs refill", hint: "Ran out" },
];
const SUGGESTIONS = ["Electrolyte mix pod", "Water bottle", "Snacks", "Lip balm", "Hand sanitizer", "Tissues", "Phone charger", "Pain reliever", "Sunscreen", "Gum", "Pens", "Bandages"];

/** One slot: an item's portrait, or an empty leather square to fill. */
function Slot({ item, painting, onTap, moving, at, onGrab, lifted = false }: { item: InventoryItem | null; painting: boolean; onTap: (rect: DOMRect) => void; moving: boolean; at: string; onGrab?: (e: React.PointerEvent) => void; lifted?: boolean }) {
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
            <img src={item.icon} alt="" draggable={false} className="h-full w-full object-cover transition-[filter] duration-300" style={empty ? { filter: "grayscale(.85) brightness(.6)" } : undefined} />
          ) : (
            <span className={`flex h-full w-full items-center justify-center px-1 text-center text-[12px] font-semibold leading-tight ${painting ? "inv-painting" : ""}`} style={{ color: "#f2d27e" }}>
              {painting ? "Painting…" : item.name}
            </span>
          )}
          {empty && (
            <span className="inv-refill absolute inset-x-0 bottom-0 py-[2px] text-center text-[10px] font-bold uppercase tracking-[.08em]" style={{ background: "rgba(140,40,24,.9)", color: "#ffe9d6" }}>
              Refill
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
  const [editing, setEditing] = useState<{ item: InventoryItem; isNew: boolean } | null>(null);
  const [painting, setPainting] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<InventoryItem | null>(null);
  // Tapping an item opens a small menu by it.
  const [menu, setMenu] = useState<{ item: InventoryItem; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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
        await saveInventoryAction(next);
      } catch (e) {
        setInv(prev);
        setError(e instanceof Error ? e.message : "Couldn't save the backpack.");
      }
    });
  }
  const at = (pocket: PocketKey, slot: number) => inv.items.find((i) => i.pocket === pocket && i.slot === slot) ?? null;
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
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
    if (!item.icon || paintReq) paint({ ...withDates, icon: null }, next, paintReq?.description?.trim() || undefined);
  }
  function paint(item: InventoryItem, base: Inventory, description?: string) {
    setPainting((p) => new Set(p).add(item.id));
    paintInventoryItemAction(item.name, description ?? null)
      .then((url) => {
        setInv((cur) => {
          const next = { ...cur, items: cur.items.map((i) => (i.id === item.id ? { ...i, icon: url } : i)) };
          void saveInventoryAction(next).catch(() => {});
          return next;
        });
      })
      .catch(() => flash("Couldn't paint a portrait just now."))
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
        await makeRefillQuestAction(item.name);
        flash("Added to your quests");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that quest.");
      }
    });
  }


  return (
    <div className="flex flex-col gap-4">
      {moving && (
        <p className="fade-in m-0 flex items-center gap-2 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
          Tap a slot to move <b>{moving.name}</b> there.
          <button type="button" onClick={() => setMoving(null)} className="underline" style={{ color: "var(--t-ink-soft)" }}>
            Cancel
          </button>
        </p>
      )}

      {/* The pack */}
      <div className="backpack mx-auto w-full max-w-[420px]">
        <span aria-hidden className="backpack-strap backpack-strap-l" />
        <span aria-hidden className="backpack-strap backpack-strap-r" />
        <span aria-hidden className="backpack-handle" />
        {POCKETS.map((p) => (
          <section key={p.key} aria-label={p.label} className={`backpack-pocket ${p.key === "top" ? "backpack-flap" : "backpack-main"}`}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display m-0 text-[15px]" style={{ color: "#f2d27e" }}>
                {p.label}
              </h3>
              <span className="text-[11.5px]" style={{ color: "rgba(242,210,126,.6)" }}>
                {inv.items.filter((i) => i.pocket === p.key).length}/{inv.slots[p.key]}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: inv.slots[p.key] }, (_, slot) => {
                const item = at(p.key, slot);
                return (
                  <div key={slot} className="flex min-w-0 flex-col items-center gap-1">
                    <Slot
                      item={item}
                      at={`${p.key}:${slot}`}
                      painting={!!item && painting.has(item.id)}
                      moving={!!moving || (!!drag && drag.over === `${p.key}:${slot}` && drag.item.id !== item?.id)}
                      lifted={!!drag && drag.item.id === item?.id}
                      onGrab={(e) => grab(e, item)}
                      onTap={(r) => tapSlot(p.key, slot, r)}
                    />
                    <span className="block w-full truncate text-center text-[11px] leading-tight" style={{ color: item ? "rgba(246,236,210,.85)" : "transparent" }}>
                      {item?.name ?? "·"}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => persist({ ...inv, slots: { ...inv.slots, [p.key]: Math.min(p.key === "top" ? 16 : 32, inv.slots[p.key] + 4) } })}
              className="mt-1 self-center text-[11.5px] underline underline-offset-2"
              style={{ color: "rgba(242,210,126,.55)" }}
            >
              + Sew on 4 more slots
            </button>
          </section>
        ))}
      </div>

      <p className="m-0 text-center text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
        Tap an item for its menu · hold and drag to move it
      </p>
      {drag &&
        createPortal(
          <div aria-hidden className="pointer-events-none fixed z-[90] h-16 w-16 overflow-hidden rounded-xl" style={{ left: drag.x - 32, top: drag.y - 40, transform: "scale(1.08) rotate(-4deg)", boxShadow: "0 14px 28px rgba(0,0,0,.55), 0 0 0 2px #f2d27e", background: "#2a1a10" }}>
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
        <div role="status" className="card-pop-in fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full px-4 py-2 text-[14px]" style={{ background: "rgba(20,14,6,.92)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.5)" }}>
          {toast}
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
        />
      )}
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

/** The little menu by a tapped item: edit it, mark it refilled or empty, or make it a quest. */
function ItemMenu({ item, x, y, onClose, onEdit, onToggle, onQuest }: { item: InventoryItem; x: number; y: number; onClose: () => void; onEdit: () => void; onToggle: () => void; onQuest: () => void }) {
  useEscape(onClose);
  const W = 196;
  const left = Math.max(8, Math.min(x - W / 2, (typeof window === "undefined" ? 400 : window.innerWidth) - W - 8));
  const top = Math.min(y, (typeof window === "undefined" ? 800 : window.innerHeight) - 170);
  const empty = item.status !== "full";
  const row = "relative z-[1] flex min-h-11 items-center gap-2.5 px-4 text-left text-[15px] hover:bg-black/5";
  return createPortal(
    <div className="fixed inset-0 z-[57]" onClick={onClose}>
      <div role="menu" aria-label={item.name} onClick={(e) => e.stopPropagation()} className="card-pop-in parchment fixed flex flex-col overflow-hidden py-1" style={{ left, top, width: W, borderRadius: 14, boxShadow: "0 12px 28px rgba(0,0,0,.45)" }}>
        <span className="relative z-[1] truncate px-4 pb-1 pt-1.5 text-[12px] font-bold uppercase tracking-[.1em]" style={{ color: "#8a6116" }}>
          {item.name}
        </span>
        <button type="button" role="menuitem" onClick={onToggle} className={row} style={{ color: "var(--t-ink)" }}>
          <span aria-hidden className="w-5 text-center">{empty ? "✓" : "⚗"}</span>
          {empty ? "Refilled" : "Needs a refill"}
        </button>
        <button type="button" role="menuitem" onClick={onQuest} className={row} style={{ color: "var(--t-ink)", borderTop: "1px solid rgba(139,112,64,.2)" }}>
          <span aria-hidden className="w-5 text-center">＋</span>
          Make it a quest
        </button>
        <button type="button" role="menuitem" onClick={onEdit} className={row} style={{ color: "var(--t-ink)", borderTop: "1px solid rgba(139,112,64,.2)" }}>
          <span aria-hidden className="w-5 text-center">✎</span>
          Edit
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
  onClose,
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
  useEscape(onClose);
  const [item, setItem] = useState(initial);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<null | "photo" | "illustrate">(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // A new portrait is wanted: none yet, or asked for with "Paint a new one".
  const [repaint, setRepaint] = useState(false);
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
  const pick = (mode: "photo" | "illustrate") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void fromPhoto(f, mode);
  };
  const chip = "flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold";
  const chipStyle = { border: "1px solid #b39a6a", color: "var(--t-ink)", background: "rgba(255,250,238,.5)" };
  const wantsPaint = !item.icon || repaint;
  // Bring the keyboard up only once the sheet has slid in, so the two don't fight.
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 280);
    return () => clearTimeout(t);
  }, [isNew]);

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[56] flex items-end justify-center overscroll-contain sm:items-center sm:p-4" style={{ background: "rgba(10,8,4,.3)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add an item" : item.name} onClick={(e) => e.stopPropagation()} className="sheet-up parchment parchment-framed flex max-h-[92svh] w-full max-w-md flex-col gap-3 overflow-y-auto overscroll-contain rounded-t-2xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="relative z-[1] flex items-start gap-3">
          <span className="inv-slot relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
            {item.icon && !repaint ? (
              // eslint-disable-next-line @next/next/no-img-element -- item portrait
              <img src={item.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className={`flex h-full w-full items-center justify-center px-1 text-center text-[11.5px] ${busy ? "inv-painting" : ""}`} style={{ color: "rgba(242,210,126,.75)" }}>
                {busy === "illustrate" ? "Painting your photo…" : busy === "photo" ? "Adding…" : "A portrait is painted when you save"}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
              {pocket.label} · slot {item.slot + 1}
            </span>
            <input ref={nameRef} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && item.name.trim() && onSave(item, wantsPaint ? { description } : null)} placeholder="What's in this slot?" maxLength={48} className={`${field} mt-1 font-semibold`} style={fieldStyle} aria-label="Item name" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[24px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        {isNew && !item.name && (
          <div className="relative z-[1] flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setItem({ ...item, name: s })} className="rounded-full px-2.5 py-1 text-[13px]" style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* The picture: a photo as it is, a photo painted as an illustration, or painted from words. */}
        <div className="relative z-[1] flex flex-col gap-1.5">
          <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            Picture
          </span>
          <div className="flex flex-wrap gap-1.5">
            <label className={chip} style={chipStyle} title="Use your photo as the picture">
              📷 Use my photo
              <input type="file" accept="image/*" className="sr-only" onChange={pick("photo")} disabled={!!busy} />
            </label>
            <label className={chip} style={chipStyle} title="Paint your photo as an illustration">
              🎨 Paint my photo
              <input type="file" accept="image/*" className="sr-only" onChange={pick("illustrate")} disabled={!!busy} />
            </label>
            {item.icon && !repaint && (
              <button type="button" onClick={() => setRepaint(true)} className={chip} style={chipStyle}>
                ✨ Paint a new one
              </button>
            )}
          </div>
          {wantsPaint && (
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the picture (optional), e.g. a green pouch of fizzy tablets" maxLength={160} className={field} style={fieldStyle} aria-label="Describe the portrait" />
          )}
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
                className="h-9 flex-1 rounded-full text-[13.5px] font-semibold"
                style={item.status === o.v ? { background: o.v === "empty" ? "#9a3b26" : o.v === "low" ? "#c98a2a" : "var(--t-gold)", color: o.v === "full" ? "#2a1c10" : "#fff" } : { color: "var(--t-ink-soft)" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <textarea value={item.note ?? ""} onChange={(e) => setItem({ ...item, note: e.target.value })} placeholder="A note (where to buy it, which kind…)" rows={2} maxLength={200} className="relative z-[1] w-full rounded-lg border px-3 py-2 text-[16px]" style={fieldStyle} aria-label="Note" />
        {!isNew && (
          <div className="relative z-[1] flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
            <button type="button" onClick={onMove} className="underline" style={{ color: "var(--t-ink)" }}>
              Move to another slot
            </button>
            <button type="button" onClick={onQuest} className="underline" style={{ color: "var(--t-ink)" }}>
              Make a refill quest
            </button>
            <button type="button" onClick={onRemove} className="underline" style={{ color: "#9a3b26" }}>
              Take it out
            </button>
          </div>
        )}
        <div className="relative z-[1] flex justify-end">
          <button type="button" disabled={!item.name.trim() || !!busy} onClick={() => onSave({ ...item, name: item.name.trim(), icon: repaint ? null : item.icon }, wantsPaint ? { description } : null)} className="hover-glow h-11 rounded-full px-6 text-[15px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            {isNew ? "Put it in the pack" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
