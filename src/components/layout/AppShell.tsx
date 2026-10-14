import { countUnread } from "@/lib/data/notifications";
import { getProfileById } from "@/lib/data/profiles";
import { TopRightAvatar } from "@/components/layout/TopRightAvatar";
import { ThemeOnBody } from "@/components/layout/ThemeOnBody";
import { NotificationsButton } from "@/components/layout/NotificationsButton";
import { DailyLogin } from "@/components/xp/DailyLogin";
import { ImportsAlert } from "@/components/imports/ImportsAlert";
import { QuestCelebrationHost } from "@/components/celebration/QuestCelebrationHost";
import { defaultPortraitFor } from "@/components/settings/Avatar";
import { countImports, countMissingPortraits } from "@/lib/data/rewards";
import { PortraitPainter } from "@/components/imports/PortraitPainter";
import { BottomNav } from "@/components/layout/BottomNav";
import { BackToToday } from "@/components/layout/BackToToday";

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
  const [unreadCount, profile, imports, missingPortraits] = await Promise.all([
    profileId ? countUnread(profileId) : Promise.resolve(0),
    profileId ? getProfileById(profileId) : Promise.resolve(null),
    profileId ? countImports(profileId) : Promise.resolve({ quests: 0, rewards: 0 }),
    profileId ? countMissingPortraits(profileId).catch(() => 0) : Promise.resolve(0),
  ]);
  const theme = profile?.theme === "adventure" ? "adventure" : "calm";
  const isAdventure = theme === "adventure";
  const iconColor = isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)";
  const widthClass = wide
    ? "max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-6xl"
    : "max-w-md sm:max-w-lg md:max-w-xl";

  return (
    <div data-theme={theme} className="flex min-h-screen flex-col items-center">
      <ThemeOnBody theme={theme} />
      {profileId && <DailyLogin />}
      {profileId && missingPortraits > 0 && <PortraitPainter missing={missingPortraits} />}
      {profileId && profile && (
        <QuestCelebrationHost
          avatarSrc={profile.avatar_image_url ?? defaultPortraitFor(profile.id)}
          totalXp={profile.total_xp}
        />
      )}
      <div className={`flex w-full flex-1 flex-col ${widthClass}`}>
        <div className="flex items-center gap-2.5 px-5 pt-3">
          {profileId && <BackToToday isAdventure={isAdventure} />}
          <span className="flex-1" />
          {profileId && (
            <NotificationsButton unreadCount={unreadCount} isAdventure={isAdventure} iconColor={iconColor} />
          )}
          {profileId && profile && (
            <div className="relative">
              <TopRightAvatar profile={profile} isAdventure={isAdventure} label={userLabel} />
              <ImportsAlert quests={imports.quests} rewards={imports.rewards} theme={theme} />
            </div>
          )}
        </div>

        <main className="flex-1 px-5 pb-36 pt-2">{children}</main>
      </div>

      {profileId && <BottomNav theme={theme} />}
    </div>
  );
}
