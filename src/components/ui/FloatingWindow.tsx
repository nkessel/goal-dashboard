"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Pos = { x: number; y: number };

/**
 * A small window that floats over the page: drag it by anything marked `data-drag-handle`
 * (never by its buttons or fields), and minimize it to a chip that stays where it was
 * (drag the chip too; a tap opens it again). Where it sits and whether it's minimized are
 * remembered per `storageKey`. Used for "To schedule" on the calendar (owner, Nov 2).
 */
export function FloatingWindow({ storageKey, width, minimized, onRestore, chip, children, z = 40, at, label = "Open the scheduling list (drag to move)" }: { storageKey: string; width: number; minimized: boolean; onRestore: () => void; /** What the minimized chip says. */ chip: React.ReactNode; children: React.ReactNode; /** Stacking (the language window sits over the welcome screen). */ z?: number; /** Where it starts before you move it. */ at?: () => Pos; /** The chip's name for screen readers. */ label?: string }) {
  const [pos, setPos] = useState<Pos | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const clamp = (p: Pos): Pos => {
    const w = box.current?.offsetWidth ?? width;
    const h = box.current?.offsetHeight ?? 60;
    return { x: Math.max(8, Math.min(window.innerWidth - w - 8, p.x)), y: Math.max(8, Math.min(window.innerHeight - Math.min(h, 120) - 8, p.y)) };
  };
  useEffect(() => {
    let p: Pos | null = null;
    try {
      p = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved spot is only readable in the browser
    setPos(clamp(p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : at ? at() : { x: window.innerWidth - width - 24, y: 150 }));
    const resized = () => setPos((q) => (q ? clamp(q) : q));
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const save = (p: Pos) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
  };
  const down = (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (!minimized && (!t.closest("[data-drag-handle]") || t.closest("button:not([data-drag-handle]),input,textarea,select,a"))) return;
    if (!pos) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    setPos(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && pos) save(pos);
    else if (minimized) onRestore();
  };
  if (!pos) return null;
  return createPortal(
    <div
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (drag.current = null)}
      // A window opened from inside a card mustn't also tap the card (React carries events up through portals).
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}
      className={`fixed ${minimized ? "card-pop-in" : "reveal"}`}
      style={{ zIndex: z, left: pos.x, top: pos.y, width: minimized ? undefined : `min(${width}px, calc(100vw - 16px))`, maxHeight: `calc(100dvh - ${pos.y}px - 16px)`, display: "flex", touchAction: minimized ? "none" : undefined }}
    >
      {minimized ? (
        <button type="button" data-drag-handle className="hover-glow flex h-10 cursor-grab touch-none select-none items-center gap-1.5 whitespace-nowrap rounded-full pl-3 pr-4 text-[14px] font-bold shadow-lg" style={{ background: "radial-gradient(circle at 35% 25%, #f6e3a8, #d9b45f 60%, #a88a3f)", border: "2px solid #4a3913", color: "#2a1c10" }} aria-label={label}>
          {chip}
        </button>
      ) : (
        <div className="flex min-h-0 w-full flex-col shadow-2xl" style={{ borderRadius: 16 }}>
          {children}
        </div>
      )}
    </div>,
    document.body
  );
}
