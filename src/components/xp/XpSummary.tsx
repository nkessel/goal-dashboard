import Link from "next/link";
import type { Profile } from "@/lib/data/types";
import { xpToNextLevel } from "@/lib/data/xp";
import { Avatar } from "@/components/settings/Avatar";

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
  // Sizes follow the Today's Quests mockup: 32px art icon, 19px number, 11px caption.
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- static /design asset */}
      <img src={iconSrc} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
      <div className="flex flex-col">
        <span className="font-display text-[19px] font-bold leading-none" style={{ color: "var(--t-cream)" }}>
          {value}
        </span>
        <span className="mt-[3px] text-[11px] leading-[1.2]" style={{ color: "var(--t-cream)", opacity: 0.85 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function XpSummary({
  profile,
  stats,
}: {
  profile: Profile;
  /** Adventure-theme header stats (Quests Complete / XP this week / Party
   * Size) — the calm theme's simpler layout doesn't use these. */
  stats?: { questsComplete: number; xpThisWeek: number; partySize: number };
}) {
  const { level, nextLevel, xpIntoLevel, xpForNextLevel } = xpToNextLevel(profile.total_xp);
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
        <div className="flex items-start justify-between gap-1">
          <div className="flex min-w-0 flex-1 flex-col gap-[18px] pt-2.5">
            <StatTile
              iconSrc="/design/ui-shield.png"
              value={stats?.questsComplete ?? 0}
              label={<>Quests<br />Complete</>}
            />
            <StatTile iconSrc="/design/ui-flame.png" value={profile.streak_count} label="Quest Streak" />
          </div>

          <div className="flex shrink-0 flex-col items-center gap-2.5">
            <div className="relative" style={{ width: 104, height: 104 }}>
              <Link
                href="/settings?open=appearance"
                aria-label="Edit avatar"
                className="hover-glow block overflow-hidden rounded-full"
                style={{ width: 104, height: 104, border: "3px solid var(--t-gold)", boxShadow: "0 0 0 2px var(--t-gold-deep) inset" }}
              >
                <Avatar profile={profile} size={26} />
              </Link>
              <div
                className="font-display absolute left-1/2 whitespace-nowrap rounded-full px-3.5 py-0.5 text-[13px] font-bold"
                style={{
                  bottom: -10,
                  transform: "translateX(-50%)",
                  background: "var(--t-gold)",
                  color: "#3b2a10",
                  border: "2px solid var(--t-panel-border)",
                }}
              >
                LVL {level}
                {level >= 8 && " · Adventurer"}
              </div>
            </div>
            <div className="mt-2 flex w-[166px] flex-col gap-[5px]">
              <div
                className="h-3 overflow-hidden rounded-full"
                style={{ background: "#1c231b", border: "1.5px solid var(--t-gold-deep)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--t-gold-deep), var(--t-gold))" }}
                />
              </div>
              <div className="text-center text-[12.5px] tracking-wide" style={{ color: "var(--t-gold)" }}>
                {nextLevel ? `${xpIntoLevel} / ${xpForNextLevel} XP` : `${profile.total_xp} XP · Max level`}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-end gap-[18px] pt-2.5">
            <div className="flex flex-col gap-[18px]">
              <StatTile iconSrc="/design/ui-xpshield.png" value={stats?.xpThisWeek ?? 0} label={<>XP this<br />week</>} />
              <StatTile iconSrc="/design/ui-partybig.png" value={stats?.partySize ?? 0} label="Party Size" />
            </div>
          </div>
        </div>

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
