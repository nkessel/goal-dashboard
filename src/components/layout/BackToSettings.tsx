"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** Upper-left on a page opened from Settings (?from=settings): back to Settings. */
export function BackToSettings({ isAdventure }: { isAdventure: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  if (params.get("from") !== "settings") return null;
  return (
    <>
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/settings"))}
      aria-label="Back to Settings"
      className="hover-glow flex h-10 items-center gap-1 rounded-full pl-1.5 pr-3.5 text-[15px]"
      style={{
        background: isAdventure ? "rgba(10,12,32,.6)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`,
        color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M14.5 5.5 8 12l6.5 6.5" stroke={isAdventure ? "var(--t-gold)" : "currentColor"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={isAdventure ? "font-display" : "font-semibold"}>Settings</span>
    </button>
    {/* Skip the Settings menu: straight back to the page you were on before it. */}
    <button
      type="button"
      onClick={() => (window.history.length > 2 ? window.history.go(-2) : router.push("/"))}
      className="hover-glow absolute left-[calc(50%+8px)] top-3 flex h-10 -translate-x-1/2 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] sm:left-1/2 sm:px-3.5 sm:text-[14px]"
      style={{
        background: isAdventure ? "rgba(10,12,32,.6)" : "var(--t-card)",
        border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`,
        color: isAdventure ? "var(--t-cream)" : "var(--t-ink)",
      }}
    >
      <span className={isAdventure ? "font-display" : "font-semibold"}>Return to main view</span>
    </button>
    </>
  );
}
