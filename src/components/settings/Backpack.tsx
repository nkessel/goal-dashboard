"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { makeRefillQuestAction, paintInventoryItemAction, saveInventoryAction } from "@/app/actions";
import { POCKETS, needsRefill, type Inventory, type InventoryItem, type ItemStatus, type PocketKey } from "@/lib/inventory";
import { useEscape } from "@/lib/use-escape";

const STATUS: { v: ItemStatus; label: string; hint: string }[] = [
  { v: "full", label: "Stocked", hint: "Full and ready" },
  { v: "low", label: "Running low", hint: "Refill soon" },
  { v: "empty", label: "Needs refill", hint: "Ran out" },
];
const SUGGESTIONS = ["Electrolyte mix pod", "Water bottle", "Snacks", "Lip balm", "Hand sanitizer", "Tissues", "Phone charger", "Pain reliever", "Sunscreen", "Gum", "Pens", "Bandages"];

/** One slot: an item's portrait, or an empty leather square to fill. */
function Slot({ item, painting, onTap, moving }: { item: InventoryItem | null; painting: boolean; onTap: () => void; moving: boolean }) {
  const empty = item?.status === "empty";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={item ? `${item.name}${empty ? " — needs refilling" : item.status === "low" ? " — running low" : ""}` : moving ? "Move it here" : "Empty slot: add an item"}
      className={`inv-slot group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg ${moving ? "inv-slot-target" : ""}`}
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
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

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

  function tapSlot(pocket: PocketKey, slot: number) {
    const item = at(pocket, slot);
    if (moving) {
      // Move there (swapping with whatever is in the way).
      const next = inv.items.map((i) => (i.id === moving.id ? { ...i, pocket, slot } : item && i.id === item.id ? { ...i, pocket: moving.pocket, slot: moving.slot } : i));
      setMoving(null);
      persist({ ...inv, items: next });
      return;
    }
    if (item) setEditing({ item, isNew: false });
    else setEditing({ item: { id: `i${crypto.randomUUID().slice(0, 8)}`, name: "", pocket, slot, icon: null, status: "full" }, isNew: true });
  }

  function save(item: InventoryItem, isNew: boolean) {
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
    if (!item.icon) paint(withDates, next);
  }
  function paint(item: InventoryItem, base: Inventory) {
    setPainting((p) => new Set(p).add(item.id));
    paintInventoryItemAction(item.name)
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
    if (status === "full") flash(`${item.name} refilled ✓`);
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

  const refill = needsRefill(inv);

  return (
    <div className="flex flex-col gap-4">
      {refill.length > 0 && (
        <section aria-label="Needs refilling" className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5" style={{ background: "rgba(140,40,24,.12)", border: "1.5px solid rgba(160,60,36,.45)" }}>
          <h3 className="m-0 text-[14px] font-bold" style={{ color: "var(--t-ink)" }}>
            Needs refilling ({refill.length})
          </h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {refill.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-md" style={{ background: "#2a1a10", border: "1px solid #8a6c2c" }}>
                  {i.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- item portrait
                    <img src={i.icon} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                    {i.name}
                  </span>
                  <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                    {POCKETS.find((p) => p.key === i.pocket)?.label}
                    {i.emptiedAt ? ` · out since ${new Date(i.emptiedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                  </span>
                </span>
                <button type="button" onClick={() => refillQuest(i)} className="h-8 shrink-0 rounded-full px-2.5 text-[12.5px] font-semibold" style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }} title="Add a quest to go refill it">
                  + Quest
                </button>
                <button type="button" onClick={() => setStatus(i, "full")} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                  Refilled ✓
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
                    <Slot item={item} painting={!!item && painting.has(item.id)} moving={!!moving} onTap={() => tapSlot(p.key, slot)} />
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
      {editing && (
        <ItemSheet
          initial={editing.item}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(i) => save(i, editing.isNew)}
          onRemove={() => remove(editing.item)}
          onMove={() => {
            setMoving(editing.item);
            setEditing(null);
          }}
          onQuest={() => refillQuest(editing.item)}
          onRepaint={() => {
            const i = { ...editing.item, icon: null };
            setEditing(null);
            const next = { ...inv, items: inv.items.map((x) => (x.id === i.id ? i : x)) };
            setInv(next);
            paint(i, next);
          }}
        />
      )}
    </div>
  );
}

function ItemSheet({
  initial,
  isNew,
  onClose,
  onSave,
  onRemove,
  onMove,
  onQuest,
  onRepaint,
}: {
  initial: InventoryItem;
  isNew: boolean;
  onClose: () => void;
  onSave: (i: InventoryItem) => void;
  onRemove: () => void;
  onMove: () => void;
  onQuest: () => void;
  onRepaint: () => void;
}) {
  useEscape(onClose);
  const [item, setItem] = useState(initial);
  const field = "h-11 w-full rounded-lg border px-3 text-[16px]";
  const fieldStyle = { borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "var(--t-ink)" };
  const pocket = POCKETS.find((p) => p.key === item.pocket)!;
  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? "Add an item" : item.name} onClick={(e) => e.stopPropagation()} className="card-pop-in parchment parchment-framed flex max-h-[92svh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl p-4 sm:rounded-2xl">
        <div className="relative z-[1] flex items-start gap-3">
          <span className="inv-slot relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
            {item.icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- item portrait
              <img src={item.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center px-1 text-center text-[11.5px]" style={{ color: "rgba(242,210,126,.7)" }}>
                {isNew ? "A portrait is painted when you add it" : "No portrait yet"}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
              {pocket.label} · slot {item.slot + 1}
            </span>
            <input autoFocus={isNew} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && item.name.trim() && onSave(item)} placeholder="What's in this slot?" maxLength={48} className={`${field} mt-1 font-semibold`} style={fieldStyle} aria-label="Item name" />
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
            <button type="button" onClick={onRepaint} className="underline" style={{ color: "var(--t-ink)" }}>
              Paint a new portrait
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
          <button type="button" disabled={!item.name.trim()} onClick={() => onSave({ ...item, name: item.name.trim() })} className="hover-glow h-11 rounded-full px-6 text-[15px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            {isNew ? "Put it in the pack" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
