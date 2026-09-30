import Link from "next/link";
import { countUnread } from "@/lib/data/notifications";
import { getProfileById } from "@/lib/data/profiles";
import { TopRightAvatar } from "@/components/layout/TopRightAvatar";
import { BottomNav } from "@/components/layout/BottomNav";

/**
 * App shell for the mobile-app-style redesign (matches the Productivity RPG
 * mockups). No more desktop sidebar: a themed full-bleed background, a
 * mobile-width centered column, and a fixed bottom tab bar. Each page owns
 * its own mockup-specific header (title + level badge, avatar + XP, etc.);
 * this shell only adds a thin utility strip for notifications/settings
 * access, since the mockups don't depict a persistent app-chrome header.
 */
export async function AppShell({
  children,
  userLabel,
  profileId,
  wide,
}: {
  children: React.ReactNode;
  userLabel: string;
  /** Optional: when given, shows an unread-notifications badge. */
  profileId?: string;
  /**
   * Let content use more of the screen on larger viewports — for grid or
   * calendar-style pages that have real width to fill, rather than the
   * single-column mobile-card pages that stay comfortable narrow. The
   * bottom nav and FABs are unaffected (fixed, independently centered), so
   * they stay a consistent tappable width regardless.
   */
  wide?: boolean;
}) {
  const [unreadCount, profile] = await Promise.all([
    profileId ? countUnread(profileId) : Promise.resolve(0),
    profileId ? getProfileById(profileId) : Promise.resolve(null),
  ]);
  const theme = profile?.theme === "adventure" ? "adventure" : "calm";
  const isAdventure = theme === "adventure";
  const iconColor = isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)";
  const widthClass = wide
    ? "max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-6xl"
    : "max-w-md sm:max-w-lg md:max-w-xl";

  return (
    <div data-theme={theme} className="flex min-h-screen flex-col items-center">
      <div className={`flex w-full flex-1 flex-col ${widthClass}`}>
        <div className="flex items-center justify-end gap-2.5 px-5 pt-3">
          {profileId && (
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)",
                border: isAdventure ? "1px solid rgba(209,161,60,.35)" : "1px solid var(--t-card-border)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5.5 2 6.5H4c1-1 2-3 2-6.5z"
                  stroke={iconColor}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M10 19a2 2 0 0 0 4 0" stroke={iconColor} strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}
          {profileId && profile && (
            <TopRightAvatar profile={profile} isAdventure={isAdventure} label={userLabel} />
          )}
        </div>

        <main className="flex-1 px-5 pb-28 pt-2">{children}</main>
      </div>

      {profileId && <BottomNav theme={theme} />}
    </div>
  );
}
