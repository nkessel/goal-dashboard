"use client";

import { useIsAfternoon } from "./evening-clock";
import { useFlipToEvening } from "./DayNightFlip";

function Moon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" fill="#f6e7b0" stroke="#8a6c2c" strokeWidth="1.1" />
      <circle cx="11" cy="14" r="1.1" fill="#d9c27a" />
      <circle cx="14.5" cy="17.5" r=".8" fill="#d9c27a" />
    </svg>
  );
}

/** Appears after 2:30pm, between Additional Quests and Victories Today. */
export function BeginEveningButton() {
  const afternoon = useIsAfternoon();
  const flip = useFlipToEvening();
  if (!afternoon) return null;
  return (
    <button
      type="button"
      onClick={() => flip(true)}
      className="hover-glow evening-cta flex min-h-[58px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[21px]"
    >
      <Moon size={26} />
      <span className="font-display">Begin Evening Routine</span>
    </button>
  );
}

export { Moon };
