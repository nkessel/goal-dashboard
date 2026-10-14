import Link from "next/link";
import type { Profile } from "@/lib/data/types";
import { xpToNextLevel } from "@/lib/data/xp";
import { Avatar, defaultPortraitFor } from "@/components/settings/Avatar";
import { BossLine, type BossView } from "./BossLine";
import { EnergyCheck } from "./EnergyCheck";

/** One flanking stat tile in the Adventure-theme header (Quests Complete,
 * Quest Streak, XP this week, Party Size) — icon + big number + caption,
 * mirrored to either side of the centered avatar/level/XP-bar column. Icons
 * are the real mockup assets from /public/design (same ones TaskRow already
 * uses for its own meta-row glyphs), not hand-drawn SVGs. */
function StatTile({
  iconSrc,
  value,
  label,
}: {
  iconSrc: string;
  value: number;
  label: React.ReactNode;
}) {
  // Sized to the Today's Quests reference: large painted icon, big serif number, two-line caption.
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- static /design asset */}
      <img src={iconSrc} alt="" width={42} height={42} className="h-8 w-8 shrink-0 object-contain sm:h-[42px] sm:w-[42px]" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }} />
      <div className="flex flex-col">
        <span className="font-display text-[21px] leading-none sm:text-[25px]" style={{ color: "var(--t-cream)" }}>
          {value}
        </span>
        <span className="mt-1 text-[12.5px] leading-[1.15] sm:text-[14px]" style={{ color: "var(--t-cream)", opacity: 0.9 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function XpSummary({
  profile,
  stats,
  boss = null,
  bossesEnabled = false,
  energyToday,
}: {
  /** Today's latest energy check-in (undefined = don't show the meter). */
  energyToday?: number | null;
  /** The boss standing in the way of the next level (null = none set). */
  boss?: BossView | null;
  /** False before the bosses table exists (no "set a boss" prompt then). */
  bossesEnabled?: boolean;
  profile: Profile;
  /** Adventure-theme header stats (Quests Complete / XP this week / Party
   * Size) — the calm theme's simpler layout doesn't use these. */
  stats?: { questsComplete: number; xpThisWeek: number; partySize: number };
}) {
  const { level, nextLevel, xpIntoLevel, xpForNextLevel, heldByBoss } = xpToNextLevel(profile.total_xp, boss?.level ?? 10);
  const pct = xpForNextLevel ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)) : 100;
  const isAdventure = profile.theme === "adventure";
  const streakLine = (
    <span>
      🔥 {profile.streak_count}-day streak
      {profile.streak_protection_tokens > 0 && ` · 🛡️ ${profile.streak_protection_tokens}`}
    </span>
  );

  if (isAdventure) {
    return (
      <div className="flex flex-col gap-2">
        {/* Equal side columns keep the avatar dead center and both stat pairs
            balanced around it, whatever the screen width. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 sm:gap-2">
          <div className="flex flex-col gap-5 justify-self-center sm:gap-6">
            <StatTile iconSrc="/design/ui-shield.png" value={stats?.questsComplete ?? 0} label={<>Quests<br />Complete</>} />
            <StatTile iconSrc="/design/ui-flame.png" value={profile.streak_count} label={<>Quest<br />Streak</>} />
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="relative h-[100px] w-[100px] sm:h-[124px] sm:w-[124px]">
              <Link
                href="/settings?open=appearance"
                aria-label="Edit avatar"
                className="hover-glow block h-full w-full overflow-hidden rounded-full"
                style={{
                  padding: 3,
                  background: "radial-gradient(circle at 35% 25%, #f6dc8e, #d9b45f 45%, #8a6c2c)",
                  boxShadow: "0 0 0 2px #3a2e14, 0 0 22px rgba(217,180,95,.35), 0 8px 18px rgba(0,0,0,.5)",
                }}
              >
                <span className="block h-full w-full overflow-hidden rounded-full" style={{ boxShadow: "inset 0 0 0 2px #3a2e14" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL or /design default */}
                  <img src={profile.avatar_image_url ?? defaultPortraitFor(profile.id)} alt="Avatar" className="h-full w-full object-cover" />
                </span>
              </Link>
              <div
                className="font-display absolute left-1/2 whitespace-nowrap rounded-full px-3 py-[2px] text-[14.5px] leading-tight sm:px-4 sm:py-[3px] sm:text-[16px]"
                style={{
                  bottom: -12,
                  transform: "translateX(-50%)",
                  background: "linear-gradient(180deg, #3f4c39, #222b20)",
                  color: "#f2d27e",
                  border: "2px solid var(--t-gold)",
                  boxShadow: "inset 0 1px 0 rgba(255,235,180,.2), 0 3px 8px rgba(0,0,0,.5)",
                }}
              >
                Lvl {level}
                {level >= 8 && " · Adventurer"}
              </div>
            </div>
            <div className="mt-3 flex w-[150px] flex-col gap-1.5 sm:w-[210px]">
              <div
                className="h-[14px] overflow-hidden rounded-full"
                style={{ background: "#141a13", border: "1.5px solid var(--t-gold-deep)", boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)",
                    boxShadow: "0 0 8px rgba(242,210,126,.55)",
                  }}
                />
              </div>
              <div className="text-center text-[13.5px] tabular-nums tracking-wide sm:text-[15px]" style={{ color: "var(--t-gold)" }}>
                {nextLevel
                  ? `${Math.min(xpIntoLevel, xpForNextLevel!).toLocaleString("en-US")} / ${xpForNextLevel!.toLocaleString("en-US")} XP`
                  : `${profile.total_xp.toLocaleString("en-US")} XP · Max level`}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 justify-self-center sm:gap-6">
            <StatTile iconSrc="/design/ui-xpshield.png" value={stats?.xpThisWeek ?? 0} label={<>XP this<br />week</>} />
            <StatTile iconSrc="/design/ui-party-simple.svg" value={stats?.partySize ?? 0} label={<>Party<br />Size</>} />
          </div>
        </div>

        {(boss || bossesEnabled) && nextLevel && <BossLine boss={boss && boss.level === level ? boss : null} level={level} heldByBoss={heldByBoss} />}
        {energyToday !== undefined && <EnergyCheck today={energyToday} />}

        {profile.streak_protection_tokens > 0 && (
          <div className="text-center text-xs" style={{ color: "var(--t-cream)", opacity: 0.75 }}>
            🛡️ {profile.streak_protection_tokens} streak-protection{" "}
            {profile.streak_protection_tokens === 1 ? "token" : "tokens"} banked
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/settings?open=appearance" aria-label="Edit avatar" className="hover-glow shrink-0 rounded-full">
          <Avatar profile={profile} size={18} />
        </Link>
        <div className="flex-1">
          <div className="text-base font-bold" style={{ color: "var(--t-ink)" }}>
            {level >= 8 ? "Adventurer" : "Good to see you"}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
              style={{ background: "var(--t-accent-soft)", color: "var(--t-accent)" }}
            >
              LV {level}
            </span>
            <div
              className="h-[5px] max-w-[100px] flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--t-card-border)" }}
            >
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--t-accent)" }} />
            </div>
            <span className="text-[11px]" style={{ color: "var(--t-ink-soft)" }}>
              {nextLevel ? `${xpIntoLevel}/${xpForNextLevel}` : `${profile.total_xp} XP`}
            </span>
          </div>
        </div>
      </div>

      <div className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
        {streakLine}
      </div>
    </div>
  );
}
