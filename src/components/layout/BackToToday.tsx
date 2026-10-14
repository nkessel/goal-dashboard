"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Upper-left, on every screen but Today: a clear way back to Today's Quests. */
export function BackToToday({ isAdventure }: { isAdventure: boolean }) {
  const pathname = usePathname();
  if (pathname === "/") return <span />;
  return (
    <Link
      href="/"
      aria-label="Back to Today's Quests"
      className="back-today flex h-10 items-center gap-1 rounded-full pl-1.5 pr-3.5 text-[15px]"
      style={{
        background: isAdventure ? "rgba(14,18,10,.55)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`,
        color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M14.5 5.5 8 12l6.5 6.5" stroke={isAdventure ? "var(--t-gold)" : "currentColor"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={isAdventure ? "font-display" : "font-semibold"}>Today</span>
    </Link>
  );
}
