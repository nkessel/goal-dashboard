"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { createPortal } from "react-dom";
import { CoinIcon } from "@/components/ui/Icons";

export type ProgressCelebrationDetail = {
  title: string;
  /** XP paid out by this bit of progress. */
  xp: number;
  coinsEarned?: number;
  fromPct: number;
  toPct: number;
  /** When the quest has steps: how many are ticked now. */
  steps?: { done: number; total: number };
};

const CONFETTI_COLORS = ["#f2c94c", "#e2bf63", "#58a04a", "#c0503a", "#4d7fc0", "#f6e6bb"];
const PIECES = Array.from({ length: 24 }, (_, i) => {
  const angle = ((i * 360) / 24 + (i % 3) * 9) * (Math.PI / 180);
  const dist = 120 + ((i * 41) % 80);
  return {
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist * 0.8 - 30),
    rot: ((i * 97) % 540) - 270,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    round: i % 4 === 0,
    delay: (i % 5) * 30,
  };
});

/**
 * A small party for partial progress: confetti, the bar filling from where it
 * was to where it is now, and the XP counting up. Dismisses itself.
 */
export function ProgressCelebration({ title, xp, coinsEarned = 0, fromPct, toPct, steps, onClose }: ProgressCelebrationDetail & { onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [pinned, setPinned] = useState(false);
  const dismiss = useEffectEvent(() => onClose());

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start - 350) / 700);
      setShown(Math.round(Math.max(0, t) * xp));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xp]);

  // Fades away on its own, unless kept open.
  useEffect(() => {
    if (pinned) return;
    const fade = setTimeout(() => setLeaving(true), 2800);
    const done = setTimeout(() => dismiss(), 3300);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [pinned]);

  return createPortal(
    <div className={`pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6 ${leaving ? "pc-leave" : ""}`} role="status" aria-live="polite">
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
          {PIECES.map((p, i) => (
            <span
              key={i}
              className="pc-confetti absolute block"
              style={
                {
                  width: p.round ? 8 : 7,
                  height: p.round ? 8 : 12,
                  marginLeft: -4,
                  marginTop: -5,
                  borderRadius: p.round ? 999 : 2,
                  background: p.color,
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  "--rot": `${p.rot}deg`,
                  animationDelay: `${p.delay}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div
          className="pc-card parchment relative flex w-[290px] flex-col items-center gap-2 rounded-2xl px-6 pb-5 pt-5 text-center"
        >
          <p className="font-display m-0 text-[25px] leading-none" style={{ color: "var(--t-ink)" }}>
            Progress made!
          </p>
          <p className="m-0 line-clamp-2 text-[14.5px] italic leading-snug" style={{ color: "#5a4a30" }}>
            {title}
          </p>

          <div className="mt-1 w-full">
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.18)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.2)" }}>
              <div
                className="pc-fill h-full rounded-full"
                style={
                  {
                    "--from": `${fromPct}%`,
                    "--to": `${toPct}%`,
                    width: `${toPct}%`,
                    background: "linear-gradient(90deg, #b8913f, #e2bf63 60%, #8fc46a)",
                  } as React.CSSProperties
                }
              />
            </div>
            <p className="m-0 mt-1 text-[12.5px] tabular-nums" style={{ color: "#5a4a30" }}>
              {steps ? `${steps.done} of ${steps.total} steps · ${toPct}%` : `${fromPct}% → ${toPct}%`}
            </p>
          </div>

          <p className="pc-xp m-0 mt-1 text-[34px] font-bold leading-none tabular-nums" style={{ color: "var(--t-xp)" }}>
            +{shown} XP
          </p>
          {coinsEarned > 0 && (
            <p className="m-0 flex items-center gap-1.5 text-[14px]" style={{ color: "#5a4a30" }}>
              <CoinIcon size={16} /> +{coinsEarned} {coinsEarned === 1 ? "coin" : "coins"}
            </p>
          )}
          <button
            type="button"
            onClick={() => (pinned ? onClose() : (setPinned(true), setLeaving(false)))}
            className="pointer-events-auto mt-1 rounded-full border px-3 py-1 text-[13px]"
            style={{ borderColor: "#b39a6a", color: "#5a4a30" }}
          >
            {pinned ? "Close" : "Keep this open"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
