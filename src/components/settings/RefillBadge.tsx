"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveInventoryAction } from "@/app/actions";
import type { Inventory } from "@/lib/inventory";
import { BackpackIcon } from "./BackpackIcon";

/**
 * Beside your portrait on Today when something in the backpack has run out:
 * a small pack with a red count. Tap it for the short list of what to refill.
 */
export function RefillBadge({ inventory }: { inventory: Inventory }) {
  const router = useRouter();
  const [inv, setInv] = useState(inventory);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const items = inv.items.filter((i) => i.status === "empty");

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function refilled(id: string) {
    const next = { ...inv, items: inv.items.map((i) => (i.id === id ? { ...i, status: "full" as const, refilledAt: new Date().toISOString() } : i)) };
    setInv(next);
    if (next.items.every((i) => i.status !== "empty")) setOpen(false);
    start(() => saveInventoryAction(next).then(() => router.refresh(), () => setInv(inv)));
  }

  if (!items.length) return null;
  return (
    <div ref={box} className="absolute -right-2 bottom-2 z-[5] sm:-right-1.5 sm:bottom-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${items.length} ${items.length === 1 ? "item needs" : "items need"} refilling`}
        className="card-pop-in relative flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.6))" }}
      >
        <BackpackIcon size={30} />
        <span className="absolute -right-1.5 top-0 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[10px] font-bold leading-none tabular-nums" style={{ background: "#d23a2a", color: "#fff", boxShadow: "0 0 0 1.5px #2a1c10" }}>
          {items.length}
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label="Needs refilling" className="card-pop-in parchment absolute left-1/2 top-9 flex w-[240px] -translate-x-1/2 flex-col gap-1 p-2.5" style={{ borderRadius: 14, boxShadow: "0 12px 28px rgba(0,0,0,.45)" }}>
          <span className="relative z-[1] px-1 text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
            Needs refilling
          </span>
          <ul className="relative z-[1] m-0 flex list-none flex-col gap-1 p-0">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-md" style={{ background: "#2a1a10", border: "1px solid #8a6c2c" }}>
                  {i.icon && (
                    // eslint-disable-next-line @next/next/no-img-element -- item portrait
                    <img src={i.icon} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: "#2a1c10" }}>
                  {i.name}
                </span>
                <button type="button" onClick={() => refilled(i.id)} className="h-7 shrink-0 rounded-full px-2.5 text-[12px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                  ✓
                </button>
              </li>
            ))}
          </ul>
          <Link href="/settings/inventory" className="relative z-[1] self-end px-1 pt-0.5 text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
            Open the backpack
          </Link>
        </div>
      )}
    </div>
  );
}
