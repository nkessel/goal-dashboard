"use client";

import { useEffect, useRef, useState } from "react";
import { resetFocusTimer, spentSeconds, toggleFocusTimer, useFocusTimer } from "@/lib/focus-timer";
import { FocusMode } from "./OneThing";

const POS_KEY = "focus-pill-pos";

/** A focus timer still going after you left focus mode: a small pill at the top. Tap to go back in; drag to move it. */
export function FocusTimerPill({ theme }: { theme: "calm" | "adventure" }) {
  const t = useFocusTimer();
  const [tick, setTick] = useState(0);
  const [reopen, setReopen] = useState(false);
  const running = t.runStart !== null;
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(POS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved spot is only readable after hydration
      if (raw) setPos(JSON.parse(raw));
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);

  if (reopen && t.task) return <FocusMode task={t.task} theme={theme} onClose={() => setReopen(false)} />;
  if (!t.task || t.open) return null;
  const spent = spentSeconds(t, running ? tick || t.runStart! : 0);
  if (!running && spent === 0) return null;
  const counting = t.mode === "countdown";
  const left = t.length * 60 - spent;
  const secs = Math.abs(Math.round(counting ? left : spent));
  const clock = `${counting && left < 0 ? "+" : ""}${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div
      className="card-pop-in fixed left-1/2 top-[max(10px,env(safe-area-inset-top))] z-[45] flex max-w-[calc(100%-24px)] -translate-x-1/2 cursor-grab touch-none select-none items-center gap-1 rounded-full py-1 pl-1 pr-1.5 shadow-xl"
      style={{ background: "rgba(14,16,30,.92)", border: "1.5px solid rgba(217,180,95,.7)", color: "#f1ead2", translate: `${pos.x}px ${pos.y}px` }}
      onPointerDown={(e) => {
        drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.hypot(e.clientX - d.px, e.clientY - d.py) > 5) {
          d.moved = true;
          // Capture only once it's really a drag, so taps still reach the buttons.
          e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (d.moved) setPos({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py });
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d?.moved) return;
        // A drag isn't a tap on whichever button it started on.
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
        try {
          window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
        } catch {
          /* storage unavailable */
        }
      }}
      onPointerCancel={() => (drag.current = null)}
      onClickCapture={(e) => {
        if (justDragged.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <button type="button" onClick={() => setReopen(true)} className="flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1" title="Back to focus mode">
        <span className="font-display text-[18px] tabular-nums" style={{ color: counting && left < 0 ? "#f3a58f" : "var(--t-gold)" }}>
          {clock}
        </span>
        <span className="max-w-[150px] truncate text-[13.5px]">{t.task.title}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          setTick(Date.now());
          toggleFocusTimer();
        }}
        className="h-8 rounded-full px-3 text-[13px] font-bold"
        style={{ background: "var(--t-gold)", color: "#2a1c10" }}
      >
        {running ? "Pause" : "Resume"}
      </button>
      <button type="button" onClick={resetFocusTimer} aria-label="Stop the timer" className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none" style={{ color: "rgba(241,234,210,.75)" }}>
        ×
      </button>
    </div>
  );
}
