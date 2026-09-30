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
  align,
}: {
  iconSrc: string;
  value: number;
  label: string;
  align: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static /design asset */}
      <img src={iconSrc} alt="" width={22} height={22} className="shrink-0" />
      <div className="flex flex-col leading-tight">
        <span className="font-display text-[15px] font-bold" style={{ color: "var(--t-cream)" }}>
          {value}
        </span>
        <span className="text-[9.5px] leading-tight" style={{ color: "var(--t-cream)", opacity: 0.65 }}>
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
          <div className="flex flex-col gap-3 pt-2">
            <StatTile iconSrc="/design/ui-shield.png" value={stats?.questsComplete ?? 0} label="Quests Complete" align="left" />
            <StatTile iconSrc="/design/ui-flame.png" value={profile.streak_count} label="Quest Streak" align="left" />
          </div>

          <div className="flex flex-col items-center gap-2.5">
            <div className="relative" style={{ width: 84, height: 84 }}>
              <Link
                href="/settings?open=appearance"
                aria-label="Edit avatar"
                className="hover-glow block overflow-hidden rounded-full"
                style={{ width: 84, height: 84, border: "4px solid var(--t-gold)" }}
              >
                <Avatar profile={profile} size={21} />
              </Link>
              <div
                className="font-display absolute left-1/2 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-bold"
                style={{
                  bottom: -6,
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
            <div className="flex w-full max-w-[160px] flex-col gap-1">
              <div
                className="h-2.5 overflow-hidden rounded-full border"
                style={{ background: "#0e170f", borderColor: "#000" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--t-gold-deep), var(--t-gold))" }}
                />
              </div>
              <div className="text-center text-[10px] tracking-wide" style={{ color: "var(--t-cream)" }}>
                {nextLevel ? `${xpIntoLevel} / ${xpForNextLevel} XP` : `${profile.total_xp} XP · Max level`}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <StatTile iconSrc="/design/ui-xpshield.png" value={stats?.xpThisWeek ?? 0} label="XP this week" align="right" />
            <StatTile iconSrc="/design/ui-partybig.png" value={stats?.partySize ?? 0} label="Party Size" align="right" />
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
          <Avatar profile={profile} size={13} />
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
