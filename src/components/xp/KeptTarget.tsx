"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { loadFx, patchFx, subscribeFx } from "@/lib/celebration-fx";
import { moveKept, putAwayKept, readKept, subscribeKept } from "@/lib/toucan-kept";

/** Short lines to keep the day's one thing in view (hidable). Chosen by the day, so it stays put. */
const LINES = ["Do the thing in front of you, and do it well.", "One thing, done with care, is enough.", "Begin where you are.", "Small steps still travel far.", "Let the rest wait its turn."];

/**
 * The floating target after "Keep it" (owner, Nov 19): drag it anywhere; tap it to see your words. Like the
 * feedback box, – shrinks it back to the target and × closes it (asking once first). No other buttons. A wise line
 * sits under your words; "hide" turns it off (back on in Settings › Toucan Spirit › His look).
 */
export function KeptTarget() {
  const kept = useSyncExternalStore(subscribeKept, readKept, () => null);
  const quoteOn = useSyncExternalStore(subscribeFx, () => loadFx().toucanKeptQuote !== false, () => true);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
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
        className="kept-target fixed z-[60] touch-none rounded-full"
        style={{ left: pos.x, top: pos.y, width: size, height: size, background: "radial-gradient(circle, #fbf3dc 0 22%, #d9b45f 23% 30%, #fbf3dc 31% 48%, #d9b45f 49% 56%, #fbf3dc 57%)", border: "1.5px solid #8a6116", boxShadow: "0 6px 14px rgba(0,0,0,.35)", cursor: drag ? "grabbing" : "grab" }}
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
          setAsking(false);
          setOpen((o) => !o);
        }}
      />
      {open && !drag && (
        <div
          className="card-pop-in fixed z-[60] rounded-2xl px-4 pb-3 pt-2.5"
          role="dialog"
          aria-label="Most important today"
          data-kept-card
          style={{ top: pos.y + size + 8, ...(left ? { left: Math.max(8, pos.x) } : { right: Math.max(8, vw - pos.x - size) }), width: "min(300px, calc(100vw - 16px))", background: "linear-gradient(160deg, rgba(18,51,47,.96), rgba(10,32,29,.98))", border: "1.2px solid rgba(217,180,95,.75)", boxShadow: "0 12px 28px rgba(0,0,0,.4)", color: "#f3e7c6" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[.16em]" style={{ color: "#d9b45f" }}>
              Most important today
            </span>
            <span className="flex items-center">
              <button type="button" aria-label="Shrink" title="Shrink to the target" onClick={() => (setOpen(false), setAsking(false))} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px]" style={{ color: "#d9b45f" }}>
                –
              </button>
              <button
                type="button"
                aria-label={asking ? "Put it away" : "Close"}
                onClick={() => {
                  if (!asking) return setAsking(true);
                  setOpen(false);
                  setAsking(false);
                  putAwayKept();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[18px]"
                style={{ color: "#d9b45f", background: asking ? "rgba(217,180,95,.2)" : undefined }}
              >
                ×
              </button>
            </span>
          </div>
          <div className="font-display mt-0.5 text-[19px] leading-snug">{kept.text}</div>
          {asking ? (
            <p className="reveal m-0 mt-2 text-[12.5px]" style={{ color: "rgba(243,231,198,.75)" }}>
              Tap × again to put it away. It stays in today&rsquo;s journal.
            </p>
          ) : (
            quoteOn && (
              <div className="mt-2.5 flex items-start gap-2 pt-2" style={{ borderTop: "1px solid rgba(217,180,95,.3)" }}>
                <span className="font-display flex-1 text-[14.5px] italic" style={{ color: "rgba(243,231,198,.82)" }}>
                  &ldquo;{line}&rdquo;
                </span>
                <button type="button" onClick={() => patchFx({ toucanKeptQuote: false })} className="text-[12px] underline underline-offset-2" style={{ color: "rgba(217,180,95,.85)" }}>
                  hide
                </button>
              </div>
            )
          )}
        </div>
      )}
    </>
  );
}
