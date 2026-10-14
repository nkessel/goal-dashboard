import Link from "next/link";
import { EveningRoutineTile } from "./EveningRoutineTile";
import { notFound } from "next/navigation";
import { auth, signOut } from "@/auth";
import { ImportsInboxRow } from "@/components/imports/ImportsInboxRow";
import { countImports } from "@/lib/data/rewards";
import { Avatar } from "@/components/settings/Avatar";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { ExportDataButton } from "@/components/settings/ExportDataButton";
import { PrivacyToggle } from "@/components/settings/PrivacyToggle";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { BoltIcon, CoinIcon, DiamondIcon } from "@/components/ui/Icons";
import { InlineNameEditor } from "@/components/settings/InlineNameEditor";
import { CelebrationSettings } from "@/components/settings/CelebrationSettings";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { getProfileById } from "@/lib/data/profiles";
import { xpToNextLevel } from "@/lib/data/xp";

const ICON_STROKE = { strokeWidth: 1.6, fill: "none" as const };

/** Everything in Settings below its title — shared by the Settings page and the slide-out menu. */
export async function SettingsContent({ userId, open }: { userId: string; open?: string }) {
  const [session, profile, imports] = await Promise.all([
    auth(),
    getProfileById(userId),
    countImports(userId).catch(() => ({ quests: 0, rewards: 0 })),
  ]);
  if (!profile) notFound();
  const openAppearance = open === "appearance";
  const isAdventure = profile.theme === "adventure";
  const iconColor = isAdventure ? "#7a5f2a" : "var(--t-accent)";
  const { level, nextLevel, xpIntoLevel, xpForNextLevel } = xpToNextLevel(profile.total_xp);
  const pct = xpForNextLevel ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)) : 100;
  const themeLabel = isAdventure ? "Adventure" : "Calm (Default)";

  return (
    <>
        {/* Profile header — avatar, name, level + XP bar */}
        <section
          className={`flex flex-col items-center gap-2.5 rounded-2xl p-5 ${isAdventure ? "parchment parchment-framed" : ""}`}
          style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
        >
          <div className="relative" style={{ width: 120, height: 120 }}>
            <Link
              href="/settings/avatar"
              aria-label="Edit avatar"
              className="hover-glow group relative block overflow-hidden rounded-full"
              style={{
                width: 120,
                height: 120,
                border: `3px solid ${isAdventure ? "var(--t-gold)" : iconColor}`,
                boxShadow: isAdventure ? "0 0 0 2px #3a2e14, 0 0 18px rgba(217,180,95,.35), 0 6px 14px rgba(0,0,0,.35)" : undefined,
              }}
            >
              <Avatar profile={profile} size={30} />
              <span
                className="absolute inset-0 flex items-center justify-center gap-1 rounded-full text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ background: "rgba(20,16,8,.55)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                Edit
              </span>
            </Link>
            <div
              className="font-display absolute left-1/2 whitespace-nowrap rounded-full px-3.5 py-0.5 text-[15px]"
              style={
                isAdventure
                  ? {
                      bottom: -10,
                      transform: "translateX(-50%)",
                      background: "linear-gradient(180deg, #3f4c39, #222b20)",
                      color: "#f2d27e",
                      border: "2px solid var(--t-gold)",
                      boxShadow: "0 3px 8px rgba(0,0,0,.4)",
                    }
                  : { bottom: -6, transform: "translateX(-50%)", background: iconColor, color: "#fff", border: "2px solid var(--t-card)" }
              }
            >
              {isAdventure ? `Lvl ${level}` : `LV ${level}`}
            </div>
          </div>
          <InlineNameEditor initialName={profile.name ?? session?.user?.email ?? ""} isAdventure={isAdventure} />
          <div className="flex w-full max-w-[240px] flex-col gap-1">
            <div
              className="h-3 overflow-hidden rounded-full"
              style={{ background: isAdventure ? "#1c231b" : "var(--t-card-border)", border: isAdventure ? "1.5px solid var(--t-gold-deep)" : undefined }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: isAdventure ? "linear-gradient(90deg, var(--t-gold-deep), var(--t-gold))" : "var(--t-accent)",
                }}
              />
            </div>
            <div
              className="text-center text-[13px] font-medium"
              style={{ color: "var(--t-ink-soft)" }}
            >
              {nextLevel ? `${xpIntoLevel} / ${xpForNextLevel} XP` : `${profile.total_xp} XP · Max level`}
            </div>
          </div>
        </section>

        {/* Quick ways in: Power-ups and the Treasure Chest */}
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/power-ups?from=settings"
            className={`hover-glow flex items-center gap-2.5 px-3.5 py-3 ${isAdventure ? "parchment" : ""}`}
            style={isAdventure ? { borderRadius: 14 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }}
          >
            <BoltIcon size={22} />
            <span className="flex flex-col leading-tight">
              <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
                Power-ups
              </span>
              <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                Quick wins
              </span>
            </span>
          </Link>
          <Link
            href="/rewards?from=settings"
            className={`hover-glow flex items-center gap-2.5 px-3.5 py-3 ${isAdventure ? "parchment" : ""}`}
            style={isAdventure ? { borderRadius: 14 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }}
          >
            <DiamondIcon size={22} />
            <span className="flex flex-col leading-tight">
              <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
                Rewards
              </span>
              <span className="flex items-center gap-1 text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                <CoinIcon size={13} /> {profile.coins ?? 0} coins
              </span>
            </span>
          </Link>
          <EveningRoutineTile isAdventure={isAdventure} />
          <Link
            href="/journal?from=settings"
            className={`hover-glow flex items-center gap-2.5 px-3.5 py-3 ${isAdventure ? "parchment" : ""}`}
            style={isAdventure ? { borderRadius: 14 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }}
          >
            <span aria-hidden className="text-[20px] leading-none">
              ✒️
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
                Journal
              </span>
              <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                Your entries
              </span>
            </span>
          </Link>
        </div>

        {/* Expandable settings rows */}
        <div className="flex flex-col gap-2.5">
          <ImportsInboxRow quests={imports.quests} rewards={imports.rewards} theme={profile.theme} />
          <SettingsRow
            theme={profile.theme}
            label="Account"
            rightLabel={session?.user?.email ?? undefined}
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" {...ICON_STROKE} stroke={iconColor}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>
            }
          >
            <div className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
              Signed in with Google as {session?.user?.email}
            </div>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="hover-glow rounded-lg border px-3 py-1.5 text-xs font-medium"
                style={{
                  borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
                  color: "var(--t-ink)",
                }}
              >
                Sign out
              </button>
            </form>
          </SettingsRow>


          <Link
            href="/notifications?from=settings"
            className={`hover-glow flex w-full items-center gap-3 px-4 py-3.5 ${isAdventure ? "parchment" : ""}`}
            style={
              isAdventure
                ? { borderRadius: 14 }
                : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }
            }
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: isAdventure ? "rgba(209,161,60,.16)" : "var(--t-accent-soft)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" {...ICON_STROKE} stroke={iconColor}>
                <path d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5.5 2 6.5H4c1-1 2-3 2-6.5z" strokeLinejoin="round" />
                <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
              </svg>
            </span>
            <span className="flex-1 text-[16px] font-medium" style={{ color: "var(--t-ink)" }}>
              Notifications
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M9 5l7 7-7 7" stroke="var(--t-ink-soft)" strokeWidth="2" fill="none" />
            </svg>
          </Link>

          <SettingsRow
            theme={profile.theme}
            label="Calendar Sync"
            rightLabel={session?.googleAccessToken ? "Google Calendar ✓" : "Not connected"}
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" {...ICON_STROKE} stroke={iconColor}>
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 3v4M16 3v4" />
              </svg>
            }
          >
            <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
              {session?.googleAccessToken
                ? "Your Google Calendar is connected — appointments show on the Calendar view, and scheduling a quest adds it to your calendar too."
                : "Sign in with Google again to connect your calendar."}
            </p>
          </SettingsRow>

          <SettingsRow
            theme={profile.theme}
            label="Theme"
            rightLabel={themeLabel}
            defaultOpen={openAppearance}
            icon={<span style={{ fontSize: 14 }}>🎨</span>}
          >
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-xs" style={{ color: "var(--t-ink-soft)" }}>
                  Calm keeps things quiet and minimal. Adventure turns your day into a battle —
                  bouncier animations, monster icons, and level-up fanfare.
                </p>
                <ThemeToggle theme={profile.theme} />
              </div>
              <ViewTransitionLink
                href="/settings/avatar"
                className="hover-glow inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{
                  background: isAdventure ? "var(--t-gold)" : "var(--t-accent)",
                  color: isAdventure ? "#2a1c10" : "#fff",
                }}
              >
                Edit avatar
              </ViewTransitionLink>
            </div>
          </SettingsRow>

          <SettingsRow
            theme={profile.theme}
            label="Celebration Effects"
            rightLabel="Quest complete"
            icon={<span style={{ fontSize: 14 }}>✨</span>}
          >
            <p className="mb-2 text-xs" style={{ color: "var(--t-ink-soft)" }}>
              The dust and sparks that fly when you complete a quest. Saved on this device.
            </p>
            <CelebrationSettings />
          </SettingsRow>


          <SettingsRow
            theme={profile.theme}
            label="Privacy & Security"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" {...ICON_STROKE} stroke={iconColor}>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            }
          >
            <PrivacyToggle initialIsPublic={profile.is_public} theme={profile.theme} />
          </SettingsRow>

          <SettingsRow
            theme={profile.theme}
            label="Your Data"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" {...ICON_STROKE} stroke={iconColor}>
                <path d="M12 3v13m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
              </svg>
            }
          >
            <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
              Download everything tied to your account — boards, goals, tasks, friends, activity,
              and XP history — as one JSON file.
            </p>
            <ExportDataButton theme={profile.theme} />
          </SettingsRow>

          <SettingsRow
            theme={profile.theme}
            label="Help & Support"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" {...ICON_STROKE} stroke={iconColor}>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" strokeLinecap="round" />
                <path d="M12 17.5h.01" strokeLinecap="round" />
              </svg>
            }
          >
            <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
              Something not working, or an idea for the app? Reach out at{" "}
              <a href="mailto:support@example.com" className="underline" style={{ color: iconColor }}>
                support@example.com
              </a>
              .
            </p>
          </SettingsRow>
        </div>
    </>
  );
}
