"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";

/** Bell in the top bar; on the Notifications screen it becomes the close (X). */
export function NotificationsButton({
  unreadCount,
  isAdventure,
  iconColor,
}: {
  unreadCount: number;
  isAdventure: boolean;
  iconColor: string;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/notifications")) {
    return <CloseSettingsButton isAdventure={isAdventure} size={40} label="Close notifications" />;
  }
  return (
    <Link
      href="/notifications"
      data-bell
      prefetch={true}
      aria-label="Notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-full"
      style={{
        background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)",
        border: isAdventure ? "1px solid rgba(209,161,60,.35)" : "1px solid var(--t-card-border)",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5.5 2 6.5H4c1-1 2-3 2-6.5z" stroke={iconColor} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 0 0 4 0" stroke={iconColor} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
