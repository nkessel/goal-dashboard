"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FOCUS_POP_OUT, closeFocusMode, focusPipApi, openFocusMode, resetFocusTimer, spentSeconds, toggleFocusTimer, useFocusTimer } from "@/lib/focus-timer";
import { FocusMode } from "./OneThing";

const POS_KEY = "focus-pill-pos";


/** A focus timer still going after you left focus mode: a small pill at the top. Tap to go back in; drag to move it. */
export function FocusTimerPill({ theme }: { theme: "calm" | "adventure" }) {
  const t = useFocusTimer();
  const [tick, setTick] = useState(0);
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

  // The popped-out timer window (opened from focus mode's "Pop out").
  const [pip, setPip] = useState<Window | null>(null);
  useEffect(() => {
    const open = () => {
      const api = focusPipApi();
      if (!api) return;
      api
        .requestWindow({ width: 300, height: 132 })
        .then((w) => {
          w.document.title = "Focus timer";
          w.document.body.style.cssText = "margin:0;background:#1d2617;color:#f1ead2;font-family:Georgia,serif;";
          w.addEventListener("pagehide", () => setPip(null));
          setPip(w);
        })
        .catch(() => {});
    };
    window.addEventListener(FOCUS_POP_OUT, open);
    return () => window.removeEventListener(FOCUS_POP_OUT, open);
  }, []);
  // Done with the timer: the little window goes too.
  useEffect(() => {
    if (pip && !t.task) pip.close();
  }, [pip, t.task]);
  const popped = pip && t.task ? createPortal(<PipTimer />, pip.document.body) : null;

  // App-wide host for focus mode (opened from any quest's menu, or this pill).
  if (t.showing && t.task)
    return (
      <>
        <FocusMode key={t.task.id} task={t.task} theme={theme} onClose={closeFocusMode} />
        {popped}
      </>
    );
  if (!t.task || t.open || pip) return popped;
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
      <button type="button" onClick={() => t.task && openFocusMode(t.task)} className="flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1" title="Back to focus mode">
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

/** The timer in its own window: the quest, the clock, and pause or resume. */
function PipTimer() {
  const t = useFocusTimer();
  const [tick, setTick] = useState(0);
  const running = t.runStart !== null;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [running]);
  if (!t.task) return null;
  const spent = spentSeconds(t, running ? tick || t.runStart! : 0);
  const counting = t.mode === "countdown";
  const left = t.length * 60 - spent;
  const secs = Math.abs(Math.round(counting ? left : spent));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const clock = `${counting && left < 0 ? "+" : ""}${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div style={{ display: "flex", height: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px", boxSizing: "border-box", background: "radial-gradient(ellipse at 50% 30%, rgba(217,180,95,.18), transparent 70%), linear-gradient(180deg,#232b22,#141a10)" }}>
      <div style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, opacity: 0.8 }}>{t.task.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 34, fontVariantNumeric: "tabular-nums", color: counting && left < 0 ? "#f3a58f" : "#f2d27e" }}>{clock}</span>
        <button
          type="button"
          onClick={() => {
            setTick(Date.now());
            toggleFocusTimer();
          }}
          style={{ height: 34, padding: "0 14px", borderRadius: 999, border: "1.5px solid #4a3913", background: "linear-gradient(180deg,#f6dc8e,#d9b45f 55%,#a88a3f)", color: "#2a1c10", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          {running ? "Pause" : "Resume"}
        </button>
      </div>
    </div>
  );
}
