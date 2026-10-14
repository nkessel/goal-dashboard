"use client";

import { useEffect, useState } from "react";
import { useEscape } from "@/lib/use-escape";
import { CreateSheet } from "@/components/create/CreateSheet";

// Which boards this peek has walked through (so × can step all the way back
// out) and how deep the last one was (so moving down zooms in, up zooms out).
let trail: string[] = [];
let lastDepth: number | null = null;
let resetTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_KEY = "board-peek-max";

function readMax() {
  try {
    return window.sessionStorage.getItem(MAX_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * A board as a large popup over whatever you were doing (like a Notion
 * peek). The trail along the top shows where you are and climbs back up;
 * ⤢ expands it to fill the screen; × (or Escape, or the backdrop) closes it.
 * Going into a sub-board zooms in, going up zooms out.
 */
export function BoardPeek({
  theme,
  boardId,
  depth,
  title,
  canAdd,
  trail: trailNode,
  children,
}: {
  theme: "calm" | "adventure";
  boardId: string;
  depth: number;
  title: string;
  canAdd: boolean;
  trail: React.ReactNode;
  children: React.ReactNode;
}) {
  const isAdventure = theme === "adventure";
  const [closing, setClosing] = useState(false);
  const [max, setMax] = useState(readMax);
  const [adding, setAdding] = useState(false);
  const [motion] = useState(() => (lastDepth === null ? "peek-open" : depth > lastDepth ? "peek-zoom-in" : depth < lastDepth ? "peek-zoom-out" : "peek-open"));
  const [opening] = useState(() => lastDepth === null);

  useEffect(() => {
    if (resetTimer) clearTimeout(resetTimer);
    const i = trail.indexOf(boardId);
    if (i >= 0) trail = trail.slice(0, i + 1);
    else trail = [...trail, boardId];
    lastDepth = depth;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      // Swapping to another board remounts within a moment; anything longer means it closed.
      resetTimer = setTimeout(() => {
        trail = [];
        lastDepth = null;
      }, 500);
    };
  }, [boardId, depth]);

  function close() {
    if (closing) return;
    setClosing(true);
    const steps = Math.max(1, trail.length);
    setTimeout(() => {
      trail = [];
      lastDepth = null;
      window.history.go(-steps);
    }, 200);
  }
  useEscape(close);

  function toggleMax() {
    const next = !max;
    setMax(next);
    try {
      window.sessionStorage.setItem(MAX_KEY, next ? "1" : "0");
    } catch {
      /* fine — just this visit */
    }
  }

  const frame = max
    ? { top: 0, bottom: 0, left: 0, right: 0, borderRadius: 0 }
    : { top: "max(10px, 3dvh)", bottom: "max(8px, 2dvh)", left: "max(6px, calc(50% - 390px))", right: "max(6px, calc(50% - 390px))", borderRadius: 18 };

  return (
    <div data-theme={theme} className="fixed inset-0 z-[47]" style={{ background: "transparent", minHeight: 0 }}>
      {opening && <div className={`absolute inset-0 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`} style={{ background: "rgba(6,9,5,.62)" }} onClick={close} />}
      {!opening && <div className={`absolute inset-0 ${closing ? "overlay-fade-out" : ""}`} style={{ background: "rgba(6,9,5,.62)" }} onClick={close} />}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`board-peek absolute flex flex-col overflow-hidden ${closing ? "peek-close" : opening ? "peek-open" : ""}`}
        style={{
          ...frame,
          transition: "top 280ms cubic-bezier(.2,.8,.2,1), bottom 280ms cubic-bezier(.2,.8,.2,1), left 280ms cubic-bezier(.2,.8,.2,1), right 280ms cubic-bezier(.2,.8,.2,1), border-radius 280ms",
          background: isAdventure
            ? "linear-gradient(180deg, rgba(58,63,46,.94), rgba(30,37,28,.98)), url(/design/bg-forest-wide.jpg) top center / cover"
            : "var(--t-bg)",
          border: max ? "none" : `2px solid ${isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`,
          boxShadow: "0 24px 60px rgba(0,0,0,.55)",
        }}
      >
        <header
          className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2"
          style={{ borderColor: isAdventure ? "rgba(217,180,95,.28)" : "var(--t-card-border)", background: isAdventure ? "rgba(15,19,13,.45)" : "var(--t-card)", paddingTop: max ? "max(8px, env(safe-area-inset-top))" : undefined }}
        >
          <div className="min-w-0 flex-1">{trailNode}</div>
          {canAdd && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="hover-glow flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13.5px] font-semibold"
              style={{ background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
              aria-label={`Add to ${title}`}
            >
              <span className="text-[17px] leading-none" aria-hidden>
                +
              </span>
              Add
            </button>
          )}
          <button
            type="button"
            onClick={toggleMax}
            aria-label={max ? "Shrink back to a popup" : "Expand to full screen"}
            title={max ? "Shrink" : "Expand"}
            className="hover-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              {max ? (
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="hover-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[26px] leading-none"
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div key={boardId} className={`mx-auto w-full max-w-3xl px-4 pb-10 pt-4 ${opening ? "" : motion}`}>
            {children}
          </div>
        </div>
      </div>
      {adding && <CreateSheet kinds={["quest", "subboard"]} boardId={boardId} theme={theme} onClose={() => setAdding(false)} />}
    </div>
  );
}
