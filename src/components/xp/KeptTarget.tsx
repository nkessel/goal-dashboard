"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLongPress } from "@/lib/use-long-press";
import { loadFx, patchFx, subscribeFx } from "@/lib/celebration-fx";
import { moveKept, putAwayKept, readKept, subscribeKept } from "@/lib/toucan-kept";

/** Short lines to keep the day's one thing in view (hidable). Chosen by the day, so it stays put. */
const LINES = ["Do the thing in front of you, and do it well.", "One thing, done with care, is enough.", "Begin where you are.", "Small steps still travel far.", "Let the rest wait its turn."];

/**
 * The floating target after "Keep it" (owner, Nov 19): drag it anywhere; tap it to see your words. Like the
 * feedback box, – shrinks it back to the target and × puts it away (no asking, owner Nov 19). No other buttons. A wise line
 * sits under your words; hold it (or right-click it) to like it, skip to another or hide quotes (owner, Nov 21;
 * back on in Settings › Toucan Spirit › His look).
 */
export function KeptTarget() {
  const kept = useSyncExternalStore(subscribeKept, readKept, () => null);
  const quoteOn = useSyncExternalStore(subscribeFx, () => loadFx().toucanKeptQuote !== false, () => true);
  const liked = useSyncExternalStore(subscribeFx, () => loadFx().toucanKeptLiked, () => undefined);
  const skip = useSyncExternalStore(subscribeFx, () => loadFx().toucanKeptSkip, () => undefined);
  const [open, setOpen] = useState(false);
  const [quoteMenu, setQuoteMenu] = useState(false);
  const press = useLongPress(() => setQuoteMenu(true));
  // The quote's menu closes on a tap anywhere else.
  useEffect(() => {
    if (!quoteMenu) return;
    const off = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[role=menu][aria-label='The wise line']")) setQuoteMenu(false);
    };
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [quoteMenu]);
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
  // Liked lines come round twice as often; a skip moves to the next one for today.
  const pool = [...LINES, ...(liked ?? []).filter((l) => LINES.includes(l))];
  const skips = skip && skip.day === kept.day ? skip.n : 0;
  const line = pool[([...kept.day].reduce((a, c) => a + c.charCodeAt(0), 0) + skips) % pool.length];
  const isLiked = (liked ?? []).includes(line);
  return (
    <>
      <button
        type="button"
        aria-label={open ? "Shrink what's most important today" : "What's most important today"}
        aria-expanded={open}
        title="Most important today (drag to move)"
        className="kept-target fixed z-[38] touch-none rounded-full p-0"
        style={{ left: pos.x, top: pos.y, width: size, height: size, filter: "drop-shadow(0 5px 8px rgba(0,0,0,.35))", cursor: drag ? "grabbing" : "grab" }}
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
          className="card-pop-in fixed z-[38] rounded-2xl px-4 pb-3 pt-2.5"
          role="dialog"
          aria-label="Most important today"
          data-kept-card
          style={{ top: pos.y + size + 8, ...(left ? { left: Math.max(8, pos.x) } : { right: Math.max(8, vw - pos.x - size) }), width: "min(300px, calc(100vw - 16px))", background: "linear-gradient(160deg, rgba(18,51,47,.96), rgba(10,32,29,.98))", border: "1.2px solid rgba(217,180,95,.75)", boxShadow: "0 12px 28px rgba(0,0,0,.4)", color: "#f3e7c6" }}
        >
          <div className="flex items-center justify-between">
            {/* T1 (owner, Nov 21: "less in your face (smaller and possibly sans serif)"): small, faint, sans-serif. */}
            <span className="text-[9.5px] font-semibold uppercase tracking-[.1em]" style={{ color: "rgba(217,180,95,.75)", fontFamily: "Inter, system-ui, sans-serif" }}>
              Most important today
            </span>
            <span className="flex items-center">
              <button type="button" aria-label="Shrink" title="Shrink to the target" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px]" style={{ color: "#d9b45f" }}>
                –
              </button>
              <button
                type="button"
                aria-label="Close"
                title="Put it away (it stays in today's journal)"
                onClick={() => {
                  setOpen(false);
                  putAwayKept();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[18px]"
                style={{ color: "#d9b45f" }}
              >
                ×
              </button>
            </span>
          </div>
          <div className="font-display mt-0.5 text-[19px] leading-snug">{kept.text}</div>
          {quoteOn && (
            <div className="relative mt-2.5 pt-2" style={{ borderTop: "1px solid rgba(217,180,95,.3)" }}>
              <span {...press.handlers} title="Hold for more" className="font-display block select-none text-[14.5px] italic" style={{ color: "rgba(243,231,198,.82)", WebkitTouchCallout: "none" } as React.CSSProperties} data-kept-quote>
                &ldquo;{line}&rdquo;
              </span>
              {quoteMenu && (
                <div role="menu" aria-label="The wise line" className="card-pop-in parchment absolute right-0 top-full z-[2] mt-1 flex min-w-[170px] flex-col overflow-hidden rounded-xl py-1" style={{ border: "1px solid #b39a6a", boxShadow: "0 10px 22px rgba(0,0,0,.4)", color: "var(--t-ink)" }}>
                  <button type="button" role="menuitem" className="flex min-h-10 items-center gap-2 px-3 text-left text-[14px] hover:bg-black/5" onClick={() => (patchFx({ toucanKeptLiked: isLiked ? (liked ?? []).filter((l) => l !== line) : [...(liked ?? []), line] }), setQuoteMenu(false))}>
                    <Heart on={isLiked} /> {isLiked ? "Liked" : "Like it"}
                  </button>
                  <button type="button" role="menuitem" className="flex min-h-10 items-center gap-2 px-3 text-left text-[14px] hover:bg-black/5" onClick={() => (patchFx({ toucanKeptSkip: { day: kept.day, n: skips + 1 } }), setQuoteMenu(false))}>
                    <SkipIcon /> Skip to another
                  </button>
                  <button type="button" role="menuitem" className="flex min-h-10 items-center border-t px-3 text-left text-[14px] hover:bg-black/5" style={{ borderColor: "rgba(139,112,64,.25)" }} onClick={() => (patchFx({ toucanKeptQuote: false }), setQuoteMenu(false))}>
                    Hide quotes
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** A gilded bullseye with an arrow struck in its heart (owner, Nov 19: "a much better target and arrow icon"). */
function TargetArrow({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <circle cx="22" cy="26" r="19" fill="#fbf3dc" stroke="#6b4a14" strokeWidth="1.6" />
      <circle cx="22" cy="26" r="14.5" fill="#d9b45f" stroke="#8a6116" strokeWidth="1" />
      <circle cx="22" cy="26" r="10" fill="#fbf3dc" stroke="#8a6116" strokeWidth="1" />
      <circle cx="22" cy="26" r="5.5" fill="#b5452e" stroke="#6b2a1a" strokeWidth="1" />
      <circle cx="22" cy="26" r="1.6" fill="#fbf3dc" />
      {/* The arrow, struck in the centre from the upper right: its shaft, and two pairs of red feathers at the tail. */}
      <path d="M22 26L41 7" stroke="#3b2a14" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M34 14L39.5 8.5L44 10.5L38.5 16Z M34 14L39.5 8.5L37.5 4L32 9.5Z" fill="#b5452e" stroke="#6b2a1a" strokeWidth=".8" strokeLinejoin="round" />
    </svg>
  );
}

function Heart({ on }: { on: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  );
}
function SkipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" />
    </svg>
  );
}
