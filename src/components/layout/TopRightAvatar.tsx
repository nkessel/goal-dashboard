"use client";

import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/data/types";
import { Avatar } from "@/components/settings/Avatar";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";

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
  if (pathname.startsWith("/settings")) return <CloseSettingsButton isAdventure={isAdventure} size={40} />;
  return (
    <ViewTransitionLink href="/settings" transition="settings-open" ariaLabel={`Settings — signed in as ${label}`} className="hover-glow rounded-full">
      <Avatar profile={profile} size={10} />
    </ViewTransitionLink>
  );
}
