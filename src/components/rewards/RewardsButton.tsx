"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";

/** Treasure chest in the top bar → Rewards; becomes the close (X) on that screen. */
export function RewardsButton({ isAdventure }: { isAdventure: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/rewards")) {
    return <CloseSettingsButton isAdventure={isAdventure} size={40} label="Close rewards" />;
  }
  return (
    <Link
      href="/rewards"
      prefetch={true}
      aria-label="Rewards"
      title="Rewards"
      className="hover-glow flex h-10 w-10 items-center justify-center rounded-full"
      style={{
        background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)",
        border: isAdventure ? "1px solid rgba(209,161,60,.35)" : "1px solid var(--t-card-border)",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1H3z" fill={isAdventure ? "#a8742f" : "var(--t-accent-soft)"} stroke={isAdventure ? "#d9b45f" : "var(--t-ink-soft)"} strokeWidth="1.5" />
        <rect x="3" y="11" width="18" height="8" rx="1.5" fill={isAdventure ? "#8a5a22" : "var(--t-card)"} stroke={isAdventure ? "#d9b45f" : "var(--t-ink-soft)"} strokeWidth="1.5" />
        <rect x="10.5" y="9.5" width="3" height="4" rx="0.8" fill={isAdventure ? "#f2d27e" : "var(--t-accent)"} />
      </svg>
    </Link>
  );
}
