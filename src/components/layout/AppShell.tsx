import { after } from "next/server";
import { countUnread, syncImportsNotification } from "@/lib/data/notifications";
import { getProfileById } from "@/lib/data/profiles";
import { levelCap } from "@/lib/data/bosses";
import { WeatherSync } from "@/components/ui/WeatherSync";
import { TopRightAvatar } from "@/components/layout/TopRightAvatar";
import { isPalette } from "@/lib/palettes";
import { ThemeOnBody } from "@/components/layout/ThemeOnBody";
import { SettingsDefaultsSeed } from "@/components/settings/SettingsDefaultsSeed";
import { NotificationsButton } from "@/components/layout/NotificationsButton";
import { DailyLogin } from "@/components/xp/DailyLogin";
import { OwnWordsSync } from "@/components/settings/OwnWordsSync";
import { FOG_SHELL_SCRIPT } from "@/lib/welcome-fog";
import { QuestCelebrationHost } from "@/components/celebration/QuestCelebrationHost";
import { defaultPortraitFor } from "@/components/settings/Avatar";
import { countImports, countMissingPortraits } from "@/lib/data/rewards";
import { PortraitPainter } from "@/components/imports/PortraitPainter";
import { BottomNav } from "@/components/layout/BottomNav";
import { BackToToday } from "@/components/layout/BackToToday";
import { BackToSettings } from "@/components/layout/BackToSettings";
import { FocusTimerPill } from "@/components/one-thing/FocusTimerPill";
import { FeedbackDock } from "@/components/feedback/FeedbackDock";
import { NotificationPreview } from "@/components/notifications/NotificationPreview";
import { Suspense } from "react";

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
  // Only what the shell needs to draw waits (the profile for the theme, the level cap);
  // the rest streams in behind it or runs after the response, so screens open sooner.
  const [profile, cap] = await Promise.all([
    profileId ? getProfileById(profileId) : Promise.resolve(null),
    // An undefeated boss holds the level shown in celebrations, however much XP there is.
    profileId ? levelCap(profileId).catch(() => 10) : Promise.resolve(10),
  ]);
  // Imports waiting to be sorted show up as a notification (no popup, no badge on the avatar).
  if (profileId) after(() => countImports(profileId).then((i) => syncImportsNotification(profileId, i.quests + i.rewards)).catch(() => {}));
  const theme = profile?.theme === "adventure" ? "adventure" : "calm";
  const rawPalette = (profile?.life_wheel as { palette?: unknown } | null | undefined)?.palette;
  const palette = isPalette(rawPalette) && rawPalette !== "forest" ? rawPalette : undefined;
  const isAdventure = theme === "adventure";
  const iconColor = isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)";
  const widthClass = wide
    ? "max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-6xl"
    : "max-w-md sm:max-w-lg md:max-w-xl";

  return (
    <div data-app-shell data-theme={theme} data-palette={palette} className="flex min-h-screen flex-col items-center">
      {/* Before anything paints: fog, if the day's welcome screen is about to come through it. */}
      {profileId && <script dangerouslySetInnerHTML={{ __html: FOG_SHELL_SCRIPT }} />}
      <ThemeOnBody theme={theme} palette={palette ?? null} />
      {profileId && <SettingsDefaultsSeed />}
      {profileId && <DailyLogin levelCap={cap} />}
      {profileId && <OwnWordsSync />}
      {profileId && (
        <Suspense fallback={null}>
          <MissingPortraits profileId={profileId} />
        </Suspense>
      )}
      {profileId && profile && (
        <QuestCelebrationHost
          avatarSrc={profile.avatar_image_url ?? defaultPortraitFor(profile.id)}
          totalXp={profile.total_xp}
          levelCap={cap}
        />
      )}
      <div className={`flex w-full flex-1 flex-col ${widthClass}`}>
        <div className="relative flex items-center gap-2.5 px-5 pt-3">
          {profileId && <BackToToday isAdventure={isAdventure} />}
          {profileId && (
            <Suspense fallback={null}>
              <BackToSettings isAdventure={isAdventure} />
            </Suspense>
          )}
          <span className="flex-1" />
          {profileId && (
            <Suspense fallback={<NotificationsButton unreadCount={0} isAdventure={isAdventure} iconColor={iconColor} />}>
              <Notifications profileId={profileId} isAdventure={isAdventure} iconColor={iconColor} />
            </Suspense>
          )}
          {/* Room for the menu button, which floats (below) so it stays put as the page scrolls. */}
          {profileId && profile && <span aria-hidden className="h-10 w-10 shrink-0" />}
        </div>

        <main className="page-enter flex-1 px-5 pb-36 pt-2">{children}</main>
      </div>

      {profileId && profile && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center">
          <div className={`flex w-full justify-end px-5 ${widthClass}`}>
            <div className="pointer-events-auto relative">
              <TopRightAvatar profile={profile} isAdventure={isAdventure} label={userLabel} />
            </div>
          </div>
        </div>
      )}

      {profileId && <FocusTimerPill theme={theme} />}
      {profileId && <WeatherSync place={profile?.life_wheel?.weather ?? null} />}
      {profileId && <BottomNav theme={theme} name={profile?.name ?? null} toucan={profile?.toucan ?? null} />}
      {profileId && <FeedbackDock theme={theme} />}
      {profileId && <NotificationPreview />}
    </div>
  );
}

async function MissingPortraits({ profileId }: { profileId: string }) {
  const missing = await countMissingPortraits(profileId).catch(() => 0);
  return missing > 0 ? <PortraitPainter missing={missing} /> : null;
}

async function Notifications({ profileId, isAdventure, iconColor }: { profileId: string; isAdventure: boolean; iconColor: string }) {
  const unreadCount = await countUnread(profileId).catch(() => 0);
  return <NotificationsButton unreadCount={unreadCount} isAdventure={isAdventure} iconColor={iconColor} />;
}
