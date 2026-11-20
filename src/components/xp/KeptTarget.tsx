"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { loadFx, patchFx, subscribeFx } from "@/lib/celebration-fx";
import { moveKept, putAwayKept, readKept, subscribeKept } from "@/lib/toucan-kept";

/** Short lines to keep the day's one thing in view (hidable). Chosen by the day, so it stays put. */
const LINES = ["Do the thing in front of you, and do it well.", "One thing, done with care, is enough.", "Begin where you are.", "Small steps still travel far.", "Let the rest wait its turn."];

/**
 * The floating target after "Keep it" (owner, Nov 19): drag it anywhere; tap it to see your words. Like the
 * feedback box, – shrinks it back to the target and × puts it away (no asking, owner Nov 19). No other buttons. A wise line
 * sits under your words; "hide" turns it off (back on in Settings › Toucan Spirit › His look).
 */
export function KeptTarget() {
  const kept = useSyncExternalStore(subscribeKept, readKept, () => null);
  const quoteOn = useSyncExternalStore(subscribeFx, () => loadFx().toucanKeptQuote !== false, () => true);
  const [open, setOpen] = useState(false);
  // Shrinking back into the target (owner, Nov 19: "minimize with an animation"); then it closes.
  const [shrinking, setShrinking] = useState<null | "min" | "away">(null);
  const shrink = (then: "min" | "away") => {
    setShrinking(then);
    setTimeout(() => {
      setShrinking(null);
      setOpen(false);
      if (then === "away") putAwayKept();
    }, 280);
  };
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  if (!kept) return null;
  const size = 46;
  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const clampX = (x: number) => Math.max(6, Math.min(vw - size - 6, x));
  const clampY = (y: number) => Math.max(60, Math.min(vh - size - 110, y));
  const pos = drag ?? { x: clampX(kept.x ?? vw - size - 12), y: clampY(kept.y ?? Math.round(vh * 0.3)) };
  const left = pos.x < vw / 2;
  const line = LINES[[...kept.day].reduce((a, c) => a + c.charCodeAt(0), 0) % LINES.length];
  return (
    <>
      <button
        type="button"
        aria-label={open ? "Shrink what's most important today" : "What's most important today"}
        aria-expanded={open}
        title="Most important today (drag to move)"
        className="kept-target fixed z-[38] touch-none rounded-full p-0"
        style={{ left: pos.x, top: pos.y, width: size, height: size, filter: "drop-shadow(0 5px 8px rgba(0,0,0,.35))", cursor: drag ? "grabbing" : "grab", visibility: open && !drag ? "hidden" : undefined }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, moved: false };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.px;
          const dy = e.clientY - s.py;
          if (!s.moved && Math.hypot(dx, dy) < 6) return;
          s.moved = true;
          setDrag({ x: clampX(s.x + dx), y: clampY(s.y + dy) });
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (s?.moved && drag) {
            moveKept(drag.x, drag.y);
            setDrag(null);
            return;
          }
          setDrag(null);
          setOpen((o) => !o);
        }}
      >
        <TargetArrow size={size} />
      </button>
      {open && !drag && (
        <div
          className={`${shrinking ? "kept-shrink" : "card-pop-in"} parchment fixed z-[45] rounded-2xl px-3.5 pb-3 pt-2`}
          role="dialog"
          aria-label="Most important today"
          data-kept-card
          // Parchment (owner, Nov 19), opening where the target sits, with the target in its top corner.
          style={{ transformOrigin: left ? "22px 22px" : "calc(100% - 22px) 22px", top: pos.y, ...(left ? { left: Math.max(8, pos.x) } : { right: Math.max(8, vw - pos.x - size) }), width: "min(300px, calc(100vw - 16px))", border: "1.2px solid #b39a6a", boxShadow: "0 12px 28px rgba(40,25,5,.35)", color: "var(--t-ink, #2a1c10)" }}
        >
          <div className="relative z-[1] flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <TargetArrow size={30} />
              <span className="text-[11px] font-semibold uppercase tracking-[.16em]" style={{ color: "#8a6116" }}>
                Most important today
              </span>
            </span>
            <span className="flex items-center">
              <button type="button" aria-label="Shrink" title="Shrink to the target" onClick={() => shrink("min")} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px]" style={{ color: "#8a6116" }}>
                –
              </button>
              <button
                type="button"
                aria-label="Close"
                title="Put it away (it stays in today's journal)"
                onClick={() => shrink("away")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[18px]"
                style={{ color: "#8a6116" }}
              >
                ×
              </button>
            </span>
          </div>
          <div className="font-display relative z-[1] mt-1 text-[19px] leading-snug">{kept.text}</div>
          {quoteOn && (
              <div className="relative z-[1] mt-2.5 flex items-start gap-2 pt-2" style={{ borderTop: "1px solid rgba(139,112,64,.35)" }}>
                <span className="font-display flex-1 text-[14.5px] italic" style={{ color: "var(--t-ink-soft, #6b5631)" }}>
                  &ldquo;{line}&rdquo;
                </span>
                <button type="button" onClick={() => patchFx({ toucanKeptQuote: false })} className="text-[12px] underline underline-offset-2" style={{ color: "#8a6116" }}>
                  hide
                </button>
              </div>
          )}
        </div>
      )}
    </>
  );
}

/** A gilded bullseye with an arrow struck in its heart (owner, Nov 19: "a much better target and arrow icon"). */
function TargetArrow({ size }: { size: number }) {
  // Quieter colours (owner, Nov 19: "slightly less colorful"): parchment and gold rings, a deep-gold heart, an ink arrow.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {/* Softer still (owner, Nov 20: "slightly less contrast"): close golds, lighter rims. */}
      <circle cx="22" cy="26" r="19" fill="#f6ecd2" stroke="#9a7c45" strokeWidth="1.4" />
      <circle cx="22" cy="26" r="14.5" fill="#e8d6a6" stroke="#b0925a" strokeWidth=".9" />
      <circle cx="22" cy="26" r="10" fill="#f3e6c4" stroke="#b0925a" strokeWidth=".9" />
      <circle cx="22" cy="26" r="5.5" fill="#c9ad6e" stroke="#9a7c45" strokeWidth=".9" />
      <circle cx="22" cy="26" r="1.6" fill="#f6ecd2" />
      {/* The arrow, struck in the centre from the upper right, its feathers at the tail. */}
      <path d="M22 26L41 7" stroke="#5a4527" strokeWidth="2.1" strokeLinecap="round" />
      <path d="M34 14L39.5 8.5L44 10.5L38.5 16Z M34 14L39.5 8.5L37.5 4L32 9.5Z" fill="#9a7a4a" stroke="#5a4527" strokeWidth=".8" strokeLinejoin="round" />
    </svg>
  );
}
