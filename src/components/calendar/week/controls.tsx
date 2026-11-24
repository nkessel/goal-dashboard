"use client";

import { MAX_SPAN } from "./zoom-store";

/** "3 days", "2½ days". */
function spanWords(s: number): string {
  const r = Math.round(s * 2) / 2;
  return `${Math.floor(r)}${r % 1 ? "½" : ""} day${r === 1 ? "" : "s"}`;
}

/**
 * The days' zoom: a gilded slider from 1 day to 14 (log scale, so the close-ups get the room), partway too,
 * with a magnifier at each end that glides a day in or out.
 */
export function DaysZoom({ span, isAdventure, onChange, onStep }: { span: number; isAdventure: boolean; onChange: (s: number) => void; onStep: (s: number) => void }) {
  const LOG = Math.log(MAX_SPAN);
  const v = Math.round((Math.log(span) / LOG) * 1000);
  const btn = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full";
  const ink = isAdventure ? "#6b5531" : "var(--t-ink-soft)";
  const glass = (plus: boolean) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2" />
      <path d="M15.5 15.5L20 20M7.5 10.5h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {plus && <path d="M10.5 7.5v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
  return (
    <span data-days-zoom className="ml-auto flex shrink-0 items-center gap-1" style={{ color: ink }}>
      {/* Farther on the left, closer on the right (owner, Nov 17: "reverse the directionality"). */}
      <button type="button" className={btn} aria-label="More days (farther)" title="More days (farther)" onClick={() => onStep(Math.min(MAX_SPAN, Math.floor(span + 0.01) + 1))}>
        {glass(false)}
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={1000 - v}
        aria-label="Days shown"
        aria-valuetext={spanWords(span)}
        title="Slide right to come closer, left for more days"
        onChange={(e) => onChange(Math.exp(((1000 - Number(e.target.value)) / 1000) * LOG))}
        className="gilded-range w-24 sm:w-36 lg:w-48"
        style={{ "--p": `${(1000 - v) / 10}%` } as React.CSSProperties}
      />
      <button type="button" className={btn} aria-label="Fewer days (closer)" title="Fewer days (closer)" onClick={() => onStep(Math.max(1, Math.ceil(span - 0.01) - 1))}>
        {glass(true)}
      </button>
      <span className="w-[58px] text-right text-[12.5px] font-semibold tabular-nums">{spanWords(span)}</span>
    </span>
  );
}

/** On the time bar, just above its first mark or below its last: shows the early-morning or late-night hours, or folds them away. */
export function HoursButton({ side, open, hidden, isAdventure, top, onToggle }: { side: "early" | "late"; open: boolean; hidden: number; isAdventure: boolean; top: number; onToggle: () => void }) {
  const words = side === "early" ? (open ? "Hide before 7 AM" : "Show before 7 AM") : open ? "Hide after 10:30 PM" : "Show after 10:30 PM";
  const up = side === "early" ? !open : open;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={words}
      title={words}
      onClick={onToggle}
      data-hours={side}
      className="absolute left-[3px] z-[31] flex h-[22px] w-[34px] items-center justify-center gap-0.5 rounded-full"
      style={{ top, color: "var(--t-ink-soft)", border: `1px solid ${isAdventure ? "rgba(168,138,63,.6)" : "var(--t-card-border)"}`, background: isAdventure ? "rgba(251,240,212,.85)" : "var(--t-card)" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: up ? undefined : "rotate(180deg)" }}>
        <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!open && hidden > 0 && (
        <span className="rounded-full px-1 text-[10px] font-bold leading-[14px]" style={{ background: "#d9b45f", color: "#2a1c10" }}>
          {hidden}
        </span>
      )}
    </button>
  );
}

/** "Today" beside the + button: brings today and now's hour back to the middle of the screen. */
export function GoToday({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-go-today
      data-hide-when-typing
      aria-label="Go to today"
      title="Go to today"
      className="card-pop-in fixed bottom-[92px] z-[46] flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-semibold"
      style={{ left: "calc(var(--fab-x, 50%) + 36px)", background: "radial-gradient(circle at 35% 25%, #fbefcb, #ead49a 70%)", border: "1px solid #a88a3f", color: "#2a1c10", boxShadow: "0 3px 10px rgba(0,0,0,.25)" }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="15" r="1.8" fill="currentColor" />
      </svg>
      Today
    </button>
  );
}

/** The little gilded shield over today's column. */
export function TodayCrest() {
  return (
    <svg aria-hidden width="18" height="21" viewBox="0 0 18 21" className="absolute left-1/2 top-0 -translate-x-1/2">
      <path d="M9 1l7 2.6v6.1c0 4.6-3 8-7 9.8-4-1.8-7-5.2-7-9.8V3.6z" fill="url(#crest-g)" stroke="#5a4214" strokeWidth="1.1" />
      <path d="M9 5.2c1.6 1.5 2.4 3 2.4 4.6 0 1.6-1 2.9-2.4 3.6-1.4-.7-2.4-2-2.4-3.6 0-1.6.8-3.1 2.4-4.6z" fill="#fbecc0" opacity=".9" />
      <defs>
        <linearGradient id="crest-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dc8e" />
          <stop offset=".55" stopColor="#d9b45f" />
          <stop offset="1" stopColor="#a88a3f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
