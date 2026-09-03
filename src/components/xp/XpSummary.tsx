import type { Profile } from "@/lib/data/types";
import { xpToNextLevel } from "@/lib/data/xp";
import { CheckInButton } from "./CheckInButton";

export function XpSummary({
  profile,
  weeklyAllocated,
  alreadyCheckedInToday,
}: {
  profile: Profile;
  weeklyAllocated: number;
  alreadyCheckedInToday: boolean;
}) {
  const { level, nextLevel, xpIntoLevel, xpForNextLevel } = xpToNextLevel(profile.total_xp);
  const pct = xpForNextLevel ? Math.min(100, Math.round((xpIntoLevel / xpForNextLevel) * 100)) : 100;
  const remaining = Math.max(0, profile.weekly_xp_budget - weeklyAllocated);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
          Level {level}
          {level >= 8 && <span className="ml-1 text-amber-500">Adventurer</span>}
        </span>
        <span className="text-xs text-zinc-500">
          {profile.total_xp} XP total · 🔥 {profile.streak_count}-day streak
          {profile.streak_protection_tokens > 0 && ` · 🛡️ ${profile.streak_protection_tokens}`}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400">
        {nextLevel ? `${xpIntoLevel}/${xpForNextLevel} XP to level ${nextLevel}` : "Max level reached"}
      </span>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-900">
        <span>
          Weekly budget: {weeklyAllocated}/{profile.weekly_xp_budget} XP assigned ({remaining} left)
        </span>
        <CheckInButton alreadyCheckedInToday={alreadyCheckedInToday} />
      </div>
    </div>
  );
}
