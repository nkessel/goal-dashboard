"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";
import { BoltIcon } from "@/components/ui/Icons";

/** ⚡ in the top bar → Power-ups (quick wins); becomes the close (X) on that screen. */
export function PowerUpsButton({ isAdventure, count }: { isAdventure: boolean; count: number }) {
  const pathname = usePathname();
  if (pathname.startsWith("/power-ups")) {
    return <CloseSettingsButton isAdventure={isAdventure} size={40} label="Close power-ups" />;
  }
  return (
    <Link
      href="/power-ups"
      prefetch={true}
      aria-label={`Power-ups${count ? ` — ${count} ready` : ""}`}
      title="Power-ups: quick wins"
      className="hover-glow relative flex h-10 w-10 items-center justify-center rounded-full"
      style={{
        background: isAdventure ? "linear-gradient(180deg, rgba(40,48,36,.85), rgba(20,26,18,.85))" : "var(--t-card)",
        border: isAdventure ? "1.5px solid rgba(217,180,95,.55)" : "1px solid var(--t-card-border)",
        boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,235,180,.12), 0 2px 6px rgba(0,0,0,.35)" : undefined,
      }}
    >
      <BoltIcon size={24} />
      {count > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
          style={{ background: "#2a2416", color: "#f8e3a0", border: "1px solid #d9b45f" }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
