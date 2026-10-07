"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";
import { CoinIcon, DiamondIcon } from "@/components/ui/Icons";

/** Diamond + coin purse in the top bar → Rewards; becomes the close (X) on that screen. */
export function RewardsButton({ isAdventure, coins }: { isAdventure: boolean; coins: number | null }) {
  const pathname = usePathname();
  if (pathname.startsWith("/rewards")) {
    return <CloseSettingsButton isAdventure={isAdventure} size={40} label="Close rewards" />;
  }
  return (
    <Link
      href="/rewards"
      prefetch={true}
      aria-label={coins === null ? "Rewards" : `Rewards — ${coins} coins`}
      title="Rewards"
      className="hover-glow flex h-10 items-center gap-2 rounded-full pl-2 pr-3"
      style={{
        background: isAdventure ? "linear-gradient(180deg, rgba(40,48,36,.85), rgba(20,26,18,.85))" : "var(--t-card)",
        border: isAdventure ? "1.5px solid rgba(217,180,95,.55)" : "1px solid var(--t-card-border)",
        boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,235,180,.12), 0 2px 6px rgba(0,0,0,.35)" : undefined,
      }}
    >
      <DiamondIcon size={24} />
      {coins !== null && (
        <span
          className="flex items-center gap-1 text-[15px] font-semibold tabular-nums"
          style={{ color: isAdventure ? "#f2d27e" : "var(--t-ink)" }}
        >
          <CoinIcon size={16} />
          {coins}
        </span>
      )}
    </Link>
  );
}
