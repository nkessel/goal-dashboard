"use client";

import { useRef, useState } from "react";

const REVEAL = 92;

/**
 * Swipe a card left (on a touch screen) to reveal a Delete button behind
 * it. Swipe back or tap elsewhere to close. A press-and-hold still starts a
 * drag; only a quick sideways swipe opens it.
 */
export function SwipeToDelete({ label, onDelete, children }: { label: string; onDelete: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; dir: "x" | "y" | null } | null>(null);

  function close() {
    setOpen(false);
    setDx(0);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          close();
          onDelete();
        }}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label={`Delete ${label}`}
        className="absolute inset-y-0 right-0 flex items-center justify-center rounded-2xl text-[14px] font-bold"
        style={{ width: REVEAL - 8, background: "linear-gradient(180deg,#c0503c,#8f2f22)", color: "#fff", visibility: dx < 0 ? "visible" : "hidden" }}
      >
        <span className="flex flex-col items-center gap-0.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Delete
        </span>
      </button>
      <div
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          start.current = { x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0, dir: null };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (!s.dir) {
            if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
            s.dir = Math.abs(mx) > Math.abs(my) ? "x" : "y";
            if (s.dir === "x") setDragging(true);
          }
          if (s.dir !== "x") return;
          setDx(Math.max(-REVEAL - 24, Math.min(0, s.base + mx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.dir !== "x") return;
          if (dx < -REVEAL / 2) {
            setOpen(true);
            setDx(-REVEAL);
          } else close();
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          if (open) setDx(-REVEAL);
          else close();
        }}
        onClickCapture={(e) => {
          // While open, a tap on the card just closes it.
          if (open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
