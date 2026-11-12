"use client";

import { useRef, useState } from "react";

const WIDE = 96;

type Side = { label: string; icon?: React.ReactNode; background: string; color?: string; onAction: () => void };

/**
 * Swipe a row sideways on a touch screen to reveal an action behind it:
 * swipe right for the `left` action, left for the `right` one. Swipe back
 * or tap the row to close. Vertical scrolling is untouched.
 */
export function SwipeActions({ left, right, children, startOn, compact = false }: { left?: Side; right?: Side; children: React.ReactNode; /** Just the icon in a small round button, a short pull away (the welcome screen's Snooze). */ compact?: boolean; /** Only swipes that start on these targets count (e.g. a part's own button, not the sliders in its tray). */ startOn?: (target: EventTarget | null) => boolean }) {
  const REVEAL = compact ? 58 : WIDE;
  // Compact: the action sits right beside the button that was pulled, not at the row's far edge.
  const box = useRef<HTMLDivElement>(null);
  const [gap, setGap] = useState(0);
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState<"left" | "right" | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; dir: "x" | "y" | null } | null>(null);

  const close = () => {
    setOpen(null);
    setDx(0);
  };
  const base = open === "left" ? REVEAL : open === "right" ? -REVEAL : 0;

  const action = (side: "left" | "right", a: Side) => (
    <button
      type="button"
      onClick={() => {
        close();
        a.onAction();
      }}
      tabIndex={open === side ? 0 : -1}
      aria-hidden={open !== side}
      aria-label={a.label}
      title={a.label}
      className={compact ? `absolute top-1/2 ${side === "left" ? "left-1.5" : "right-1.5"} flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full` : `absolute inset-y-1 ${side === "left" ? "left-0" : "right-0"} flex items-center justify-center rounded-xl text-[13.5px] font-bold`}
      style={{ width: compact ? undefined : REVEAL - 8, ...(compact && side === "right" ? { right: Math.max(6, gap - 50) } : {}), background: a.background, color: a.color ?? "#fff", visibility: (side === "left" ? dx > 0 : dx < 0) ? "visible" : "hidden" }}
    >
      <span className="flex flex-col items-center gap-0.5">
        {a.icon}
        {!(compact && a.icon) && a.label}
      </span>
    </button>
  );

  return (
    <div ref={box} className="relative">
      {left && action("left", left)}
      {right && action("right", right)}
      <div
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          if (startOn && !open && !startOn(e.target)) return;
          start.current = { x: e.clientX, y: e.clientY, base, dir: null };
          const b = compact && !open ? (e.target as HTMLElement | null)?.closest?.("button") : null;
          if (b && box.current) setGap(box.current.getBoundingClientRect().right - b.getBoundingClientRect().right);
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
          const min = right ? -REVEAL - 24 : 0;
          const max = left ? REVEAL + 24 : 0;
          setDx(Math.max(min, Math.min(max, s.base + mx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.dir !== "x") return;
          if (dx > REVEAL / 2 && left) {
            setOpen("left");
            setDx(REVEAL);
          } else if (dx < -REVEAL / 2 && right) {
            setOpen("right");
            setDx(-REVEAL);
          } else close();
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setDx(base);
        }}
        onClickCapture={(e) => {
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
