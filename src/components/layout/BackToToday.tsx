"use client";

import { usePathname } from "next/navigation";
import { useEveningMode } from "@/components/evening/evening-clock";

/** Asks the Today screen to turn back over to its day side (see DayNightFlip). */
export function requestDaySide() {
  window.dispatchEvent(new CustomEvent("day-night-flip", { detail: { toEvening: false } }));
}

/**
 * Upper-left on the evening side of Today: a clear way back to the day.
 * (Other screens are reached and left through the bottom nav.)
 */
export function BackToToday({ isAdventure }: { isAdventure: boolean }) {
  const pathname = usePathname();
  const evening = useEveningMode();
  if (pathname !== "/" || !evening) return <span />;
  return (
    <button
      type="button"
      onClick={requestDaySide}
      aria-label="Back to the day side"
      className="back-today hover-glow flex h-10 items-center gap-1 rounded-full pl-1.5 pr-3.5 text-[15px]"
      style={{
        background: isAdventure ? "rgba(10,12,32,.6)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`,
        color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M14.5 5.5 8 12l6.5 6.5" stroke={isAdventure ? "var(--t-gold)" : "currentColor"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={isAdventure ? "font-display" : "font-semibold"}>Today</span>
    </button>
  );
}
