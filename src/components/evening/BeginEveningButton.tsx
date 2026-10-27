"use client";

import { hideEveningPrompt, useEveningPrompt, useIsAfternoon } from "./evening-clock";
import { useFlipToEvening } from "./DayNightFlip";
import { useVisualFx, type VisualFx } from "@/lib/visual-fx";

function Moon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" fill="#f6e7b0" stroke="#8a6c2c" strokeWidth="1.1" />
      <circle cx="11" cy="14" r="1.1" fill="#d9c27a" />
      <circle cx="14.5" cy="17.5" r=".8" fill="#d9c27a" />
    </svg>
  );
}

const frac = (n: number) => n - Math.floor(n);

/**
 * A fixed field of tiny stars, scattered with low-discrepancy (golden-ratio)
 * sequences so they spread evenly without clumping — deterministic, so the
 * sky is identical on every render and on server and client alike.
 */
const DUST = Array.from({ length: 54 }, (_, i) => {
  const r = frac(i * 0.4142136 + 0.29);
  return {
    left: frac(i * 0.618034 + 0.07) * 100,
    top: 6 + frac(i * 0.7548777 + 0.41) * 88,
    size: r < 0.55 ? 1 : r < 0.85 ? 1.5 : 2.2,
    opacity: 0.35 + frac(i * 0.5698403 + 0.18) * 0.55,
    delay: -frac(i * 0.381966 + 0.5) * 7,
    duration: 3.4 + frac(i * 0.2360680) * 3.6,
  };
});

/** A few brighter four-point sparkles, kept mostly toward the ends so the label stays clear. */
const SPARKLES = [
  { left: 5.5, top: 30, size: 11, delay: -0.6, duration: 5.2 },
  { left: 14, top: 74, size: 7, delay: -3.1, duration: 6.4 },
  { left: 25, top: 22, size: 6, delay: -1.8, duration: 5.8 },
  { left: 77, top: 76, size: 6.5, delay: -4.2, duration: 6 },
  { left: 86, top: 24, size: 10, delay: -2.4, duration: 5.4 },
  { left: 95, top: 64, size: 7, delay: -0.2, duration: 6.8 },
];

function NightSky() {
  return (
    <span aria-hidden className="evening-sky">
      {DUST.map((d, i) => (
        <span
          key={i}
          className="evening-star"
          style={
            {
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              "--o": d.opacity,
              "--tw-delay": `${d.delay}s`,
              "--tw-dur": `${d.duration}s`,
              // The shimmer wave runs left to right across the sky.
              "--sh-delay": `${(d.left / 100) * 1.6 - 5}s`,
            } as React.CSSProperties
          }
        />
      ))}
      {SPARKLES.map((s, i) => (
        <svg
          key={`s${i}`}
          className="evening-sparkle"
          width={s.size}
          height={s.size}
          viewBox="0 0 20 20"
          style={{ left: `${s.left}%`, top: `${s.top}%`, "--tw-delay": `${s.delay}s`, "--tw-dur": `${s.duration}s`, "--sh-delay": `${(s.left / 100) * 1.6 - 5}s` } as React.CSSProperties}
        >
          <path d="M10 0C10.6 6.4 13.6 9.4 20 10 13.6 10.6 10.6 13.6 10 20 9.4 13.6 6.4 10.6 0 10 6.4 9.4 9.4 6.4 10 0Z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

/** The button's look, with the effects chosen in Settings → Visual Effects. */
function fxProps(fx: VisualFx) {
  return {
    className: `evening-cta relative flex min-h-[58px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[21px] ${fx.eveningBorderShimmer ? "shimmer-edge" : ""}`,
    "data-star-twinkle": fx.eveningStarTwinkle ? "" : undefined,
    "data-star-shimmer": fx.eveningStarShimmer ? "" : undefined,
  };
}

function Face() {
  return (
    <>
      <NightSky />
      <span className="relative flex items-center gap-3">
        <Moon size={26} />
        <span className="font-display">Evening Routine</span>
      </span>
    </>
  );
}

/** Appears after 2:30pm, between Additional Quests and Victories Today (unless it's already at the top). */
export function BeginEveningButton() {
  const afternoon = useIsAfternoon();
  const atTop = useEveningPrompt();
  const flip = useFlipToEvening();
  const fx = useVisualFx();
  if (!afternoon || atTop) return null;
  const { className, ...data } = fxProps(fx);
  return (
    <button type="button" onClick={() => flip(true)} className={`hover-glow ${className}`} {...data}>
      <Face />
    </button>
  );
}

/**
 * From 5pm (or the time chosen in Settings) the evening routine sits at the
 * top of Today, in place of any planning invitation, with a small "hide".
 */
export function EveningPromptOr({ children }: { children?: React.ReactNode }) {
  const showing = useEveningPrompt();
  const flip = useFlipToEvening();
  const fx = useVisualFx();
  if (!showing) return <>{children}</>;
  const { className, ...data } = fxProps(fx);
  return (
    <div className="relative">
      <button type="button" onClick={() => flip(true)} className={`hover-glow ${className}`} {...data}>
        <Face />
      </button>
      <button type="button" onClick={hideEveningPrompt} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[12.5px] underline underline-offset-2" style={{ color: "rgba(246,236,210,.8)" }} title="Hide until tomorrow evening">
        hide
      </button>
    </div>
  );
}

/** A live, non-clickable copy of the button for the settings screen. */
export function EveningButtonPreview({ fx }: { fx: VisualFx }) {
  const { className, ...data } = fxProps(fx);
  return (
    <div aria-hidden className={className} {...data}>
      <Face />
    </div>
  );
}

export { Moon };
