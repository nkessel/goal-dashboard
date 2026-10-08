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
    <Link href="/settings" scroll={false} aria-label={`Menu — signed in as ${label}`} className="hover-glow rounded-full">
      <Avatar profile={profile} size={10} />
    </Link>
  );
}
