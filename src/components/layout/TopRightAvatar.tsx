"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Profile } from "@/lib/data/types";
import { Avatar } from "@/components/settings/Avatar";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";
import Link from "next/link";

/** Top-right corner: your avatar opens Settings; inside Settings it turns into
 * the close (X) button, which returns to the screen you came from. */
export function TopRightAvatar({
  profile,
  isAdventure,
  label,
}: {
  profile: Pick<Profile, "id" | "avatar_color" | "avatar_image_url">;
  isAdventure: boolean;
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Preload Settings (and the avatar editor) so opening it is instant;
  // re-preload whenever that copy goes stale.
  useEffect(() => {
    const load = (href: string): void =>
      router.prefetch(href, { kind: "full", onInvalidate: () => load(href) } as Parameters<typeof router.prefetch>[1]);
    load("/settings");
    load("/settings/avatar");
  }, [router]);
  if (pathname.startsWith("/settings")) return <CloseSettingsButton isAdventure={isAdventure} size={40} />;
  return (
    <Link
      href="/settings"
      scroll={false}
      aria-label={`Menu — signed in as ${label}`}
      className="avatar-link flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
      style={
        pathname === "/"
          ? {
              background: isAdventure ? "rgba(14,18,10,.55)" : "var(--t-card)",
              border: `1.5px solid ${isAdventure ? "rgba(217,180,95,.55)" : "var(--t-card-border)"}`,
            }
          : undefined
      }
    >
      {pathname === "/" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink)"} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : (
        <Avatar profile={profile} size={10} />
      )}
    </Link>
  );
}
