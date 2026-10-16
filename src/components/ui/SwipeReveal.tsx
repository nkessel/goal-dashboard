"use client";

import { useRef, useState } from "react";

const REVEAL = 104;

/**
 * Swipe a card sideways (on a touch screen) to reveal one action behind it:
 * swipe right to uncover an action on the left (`side="left"`), or left for
 * one on the right. Swipe back, or tap the card, to close. A press-and-hold
 * still starts a drag; only a quick sideways swipe opens it.
 */
export function SwipeReveal({
  side,
  label,
  icon,
  background,
  color = "#fff",
  onAction,
  disabled = false,
  children,
}: {
  side: "left" | "right";
  /** The action's name, e.g. "Snooze". */
  label: string;
  icon?: React.ReactNode;
  background: string;
  color?: string;
  onAction: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; dir: "x" | "y" | null } | null>(null);
  const sign = side === "left" ? 1 : -1;

  function close() {
    setOpen(false);
    setDx(0);
  }

  if (disabled) return <>{children}</>;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          close();
          onAction();
        }}
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} flex items-center justify-center rounded-2xl text-[14px] font-bold`}
        style={{ width: REVEAL - 8, background, color, visibility: dx * sign > 0 ? "visible" : "hidden" }}
      >
        <span className="flex flex-col items-center gap-0.5 px-1 text-center leading-tight">
          {icon}
          {label}
        </span>
      </button>
      <div
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          start.current = { x: e.clientX, y: e.clientY, base: open ? sign * REVEAL : 0, dir: null };
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
          const next = s.base + mx;
          setDx(sign > 0 ? Math.max(0, Math.min(REVEAL + 24, next)) : Math.max(-REVEAL - 24, Math.min(0, next)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s || s.dir !== "x") return;
          if (dx * sign > REVEAL / 2) {
            setOpen(true);
            setDx(sign * REVEAL);
          } else close();
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          if (open) setDx(sign * REVEAL);
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
