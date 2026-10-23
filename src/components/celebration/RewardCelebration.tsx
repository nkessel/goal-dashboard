"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CoinIcon } from "@/components/ui/Icons";
import { xpToNextLevel } from "@/lib/levels";
import { loadFx } from "@/lib/celebration-fx";

export type RewardCelebrationDetail = {
  title: string;
  iconSrc?: string | null;
  xp: number;
  coins: number;
  /** Total XP after the award, when known — the bar fills to it. */
  totalXp?: number | null;
};

/** Play the reward ceremony from anywhere — only when chosen in Settings (classic is the default). */
export function celebrateReward(detail: RewardCelebrationDetail) {
  if (loadFx().rewardStyle !== "ceremony") return;
  window.dispatchEvent(new CustomEvent("reward-celebrate", { detail }));
}

const RAYS = Array.from({ length: 16 }, (_, i) => i * (360 / 16));
const COINS = Array.from({ length: 14 }, (_, i) => ({
  x: Math.round(Math.cos((i / 14) * Math.PI * 2) * (90 + (i % 3) * 30)),
  y: Math.round(Math.sin((i / 14) * Math.PI * 2) * (70 + (i % 4) * 22) - 40),
  d: 900 + (i % 5) * 110,
  r: ((i * 83) % 360) - 180,
}));
const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 53) % 100, d: (i % 7) * 260, s: 4 + (i % 3) * 3 }));

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A reward's payout as a small ceremony (about three seconds): golden rays
 * turn behind the reward's portrait, coins burst out, the XP counts up and
 * the level bar fills. It stays until tapped, so it can be enjoyed.
 */
export function RewardCelebration({ title, iconSrc, xp, coins, totalXp, levelCap = 10, onClose }: RewardCelebrationDetail & { levelCap?: number; onClose: () => void }) {
  const [t, setT] = useState(0);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no motion wanted: jump to the end
      setT(1);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const v = Math.min(1, (now - start) / 3000);
      setT(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, reduce]);

  // Timeline: 0–.25 the portrait arrives; .2–.75 XP counts; .45–1 the bar fills.
  const count = (a: number, b: number) => ease(Math.max(0, Math.min(1, (t - a) / (b - a))));
  const xpShown = Math.round(xp * count(0.2, 0.75));
  const coinsShown = Math.round(coins * count(0.3, 0.8));
  const after = totalXp ?? null;
  const lv = after !== null ? xpToNextLevel(after, levelCap) : null;
  const beforeInto = lv ? Math.max(0, lv.xpIntoLevel - xp) : 0;
  const fill = lv && lv.xpForNextLevel ? (beforeInto + (lv.xpIntoLevel - beforeInto) * count(0.45, 1)) / lv.xpForNextLevel : null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Reward: ${title}`} onClick={onClose} className="reward-cele fixed inset-0 z-[70] flex items-center justify-center overflow-hidden p-6" style={{ background: "radial-gradient(circle at 50% 42%, rgba(60,44,12,.92), rgba(8,10,6,.94) 70%)" }}>
      {/* drifting starlight */}
      {STARS.map((s, i) => (
        <span key={i} aria-hidden className="reward-star pointer-events-none absolute" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animationDelay: `${s.d}ms` }} />
      ))}
      <div className="relative flex w-full max-w-sm flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
        {/* turning rays */}
        <svg aria-hidden viewBox="-100 -100 200 200" className="reward-rays pointer-events-none absolute left-1/2 top-[70px] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2" style={{ opacity: 0.85 * count(0, 0.3) }}>
          <defs>
            <radialGradient id="ray-fade">
              <stop offset="0" stopColor="#ffe9a3" stopOpacity=".9" />
              <stop offset="1" stopColor="#ffe9a3" stopOpacity="0" />
            </radialGradient>
          </defs>
          {RAYS.map((a) => (
            <path key={a} d="M0 0L-7 -100L7 -100Z" fill="url(#ray-fade)" transform={`rotate(${a})`} />
          ))}
        </svg>
        {/* the reward */}
        <div
          className="relative z-[1] flex h-[132px] w-[132px] items-center justify-center overflow-hidden rounded-full"
          style={{
            transform: `scale(${0.4 + 0.6 * count(0, 0.25) + 0.06 * Math.sin(Math.min(1, t / 0.4) * Math.PI)})`,
            opacity: count(0, 0.15),
            background: "radial-gradient(circle at 35% 30%, #fff1c2, #e2bb5c 60%, #a88a3f)",
            border: "3px solid #f6dc8e",
            boxShadow: "0 0 0 3px #4a3913, 0 0 40px rgba(255,221,128,.7), 0 12px 30px rgba(0,0,0,.6)",
          }}
        >
          {iconSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- reward portrait
            <img src={iconSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[56px]" aria-hidden>
              🎁
            </span>
          )}
        </div>
        {/* coins bursting out */}
        {coins > 0 &&
          COINS.map((c, i) => (
            <span
              key={i}
              aria-hidden
              className="reward-coin pointer-events-none absolute left-1/2 top-[66px] z-[2]"
              style={{ "--cx": `${c.x}px`, "--cy": `${c.y}px`, "--cr": `${c.r}deg`, animationDuration: `${c.d}ms`, animationDelay: `${250 + (i % 4) * 60}ms` } as React.CSSProperties}
            >
              <CoinIcon size={18} />
            </span>
          ))}

        <p className="font-display relative z-[1] m-0 mt-5 text-[13px] font-bold uppercase tracking-[.22em]" style={{ color: "#f2d27e", opacity: count(0.1, 0.3) }}>
          Reward claimed
        </p>
        <h2 className="font-display relative z-[1] m-0 mt-1 text-[26px] leading-tight" style={{ color: "#fbf3df", opacity: count(0.12, 0.32), textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
          {title}
        </h2>

        <div className="relative z-[1] mt-4 flex items-center gap-4" style={{ opacity: count(0.18, 0.3) }}>
          {xp > 0 && (
            <span className="font-display text-[34px] font-bold tabular-nums" style={{ color: "#ffe39a", textShadow: "0 0 18px rgba(255,214,102,.75)" }}>
              +{xpShown} XP
            </span>
          )}
          {coins > 0 && (
            <span className="flex items-center gap-1.5 text-[24px] font-bold tabular-nums" style={{ color: "#f6dc8e" }}>
              <CoinIcon size={24} />+{coinsShown}
            </span>
          )}
        </div>

        {lv && fill !== null && (
          <div className="relative z-[1] mt-4 w-full max-w-[260px]" style={{ opacity: count(0.4, 0.5) }}>
            <div className="h-3.5 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1.5px solid #a88a3f", boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, fill * 100)}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)", boxShadow: "0 0 10px rgba(242,210,126,.7)" }} />
            </div>
            <p className="m-0 mt-1 text-[13px] tabular-nums" style={{ color: "rgba(246,236,210,.8)" }}>
              Level {lv.level} · {Math.round(beforeInto + (lv.xpIntoLevel - beforeInto) * count(0.45, 1)).toLocaleString()} / {lv.xpForNextLevel!.toLocaleString()} XP
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="relative z-[1] mt-6 h-11 rounded-full px-7 text-[15px] font-bold"
          style={{ opacity: count(0.7, 0.9), background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "0 4px 14px rgba(0,0,0,.45)" }}
        >
          Enjoy it!
        </button>
      </div>
    </div>,
    document.body
  );
}
