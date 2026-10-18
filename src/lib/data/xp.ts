import "server-only";
import * as statsData from "./stats";
import * as hpData from "./hp";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logLevelUpActivity } from "./activity";
import type { Profile } from "./types";

import { LEVEL_THRESHOLDS, computeLevelForXp, xpToNextLevel } from "@/lib/levels";
import * as bossesData from "./bosses";
import { coinsForXp } from "@/lib/coins";
export { LEVEL_THRESHOLDS, computeLevelForXp, xpToNextLevel };


// Levels 4-7 (functional tier): a streak-protection token, granted once,
// the moment that level is first reached.
const FUNCTIONAL_TIER_LEVELS = [4, 5, 6, 7];

export function getLevelPerks(level: number): string[] {
  const perks: string[] = [];
  if (level >= 1) perks.push("New avatar gear + minimal-mode color palettes unlock as you climb levels 1-3.");
  if (level >= 4) perks.push("A streak-protection token per level through 7 (guards one missed check-in day).");
  if (level >= 8) perks.push("Rare monster icons for tasks unlock.");
  if (level >= 8) perks.push(`Your feed flair: "Level ${level} Adventurer" next to comments/reactions.`);
  return perks;
}

function mondayOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

export function currentWeekStart(): string {
  return mondayOf(new Date());
}

/**
 * Total XP actually earned this week (sum of all xp_events amounts for the
 * given week_start) — the "XP this week" stat on the Today's Quest header.
 * Distinct from the old weekly XP *budget* concept (removed): this is just
 * a read of what was earned, with no cap or enforcement attached.
 */
export async function getWeeklyXpEarned(ownerId: string, weekStart: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("xp_events")
    .select("amount")
    .eq("owner_id", ownerId)
    .eq("week_start", weekStart);

  if (error) throw new Error(`Failed to load weekly XP: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}

export type XpAwardResult = {
  totalXp: number;
  level: number;
  leveledUp: boolean;
  unlockedPerks: string[];
  /** Coin balance after this award (null before the coins migration). */
  coins: number | null;
  coinsEarned: number;
};

/**
 * Awards XP (task completion, check-in bonus, streak bonus, ...), applies
 * any level-up perks crossed, and logs a public level_up activity when it
 * happens so friends can cheer it in the feed.
 */
export async function awardXp(
  ownerId: string,
  amount: number,
  kind: "task_completed" | "daily_check_in" | "streak_bonus" | "planning_ritual",
  taskId?: string
): Promise<XpAwardResult> {
  const db = supabaseAdmin();
  // Coins follow the whole award; a quest may send part of its XP to
  // character stats instead of the main meter.
  const fullAmount = amount;
  if (taskId && kind === "task_completed" && amount !== 0) {
    amount = await statsData.splitTaskXp(ownerId, taskId, amount).catch(() => amount);
  }
  // Quests restore a little HP.
  if (taskId && kind === "task_completed" && fullAmount > 0) await hpData.heal(ownerId).catch(() => {});

  if (amount !== 0) {
    const { error } = await db.from("xp_events").insert({
      owner_id: ownerId,
      task_id: taskId ?? null,
      kind,
      amount,
      week_start: currentWeekStart(),
    });
    if (error) throw new Error(`Failed to log XP event: ${error.message}`);
  }

  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("*")
    .eq("id", ownerId)
    .single<Profile>();
  if (profileErr) throw new Error(`Failed to load profile: ${profileErr.message}`);

  const newTotal = profile.total_xp + amount;
  // An undefeated boss holds you at its level, however much XP you have.
  const newLevel = Math.min(computeLevelForXp(newTotal), await bossesData.levelCap(ownerId));
  const leveledUp = newLevel > profile.level;

  let tokenDelta = 0;
  const unlockedPerks: string[] = [];
  if (leveledUp) {
    for (let l = profile.level + 1; l <= newLevel; l++) {
      if (FUNCTIONAL_TIER_LEVELS.includes(l)) {
        tokenDelta += 1;
      }
    }
    unlockedPerks.push(...getLevelPerks(newLevel));
  }

  // Coins follow XP at 1 per XP_PER_COIN, rounded down per award (and the
  // same amount back out when an award is reversed).
  const coinDelta = Math.sign(fullAmount) * coinsForXp(Math.abs(fullAmount));
  const hasCoins = typeof profile.coins === "number";
  const { error: updateErr } = await db
    .from("profiles")
    .update({
      total_xp: newTotal,
      level: newLevel,
      streak_protection_tokens: profile.streak_protection_tokens + tokenDelta,
      ...(hasCoins ? { coins: Math.max(0, (profile.coins ?? 0) + coinDelta) } : {}),
    })
    .eq("id", ownerId);
  if (updateErr) throw new Error(`Failed to update profile XP: ${updateErr.message}`);

  if (leveledUp) {
    await logLevelUpActivity(ownerId, profile.is_public);
  }

  return {
    totalXp: newTotal,
    level: newLevel,
    leveledUp,
    unlockedPerks,
    coins: hasCoins ? Math.max(0, (profile.coins ?? 0) + coinDelta) : null,
    coinsEarned: coinDelta,
  };
}

export type CheckInResult = {
  alreadyCheckedInToday: boolean;
  streakCount: number;
  usedProtectionToken: boolean;
  xpAwarded: number;
  award?: XpAwardResult;
};

const CHECK_IN_BONUS = 5;
const STREAK_MILESTONE_BONUS = 15;
const STREAK_MILESTONE_EVERY = 7;

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Small daily login/check-in bonus (spec: "avoid punishing multi-day tasks
 * or days where the user is busy living life"). A missed day breaks the
 * streak unless the user has a streak-protection token banked (a level 4-7
 * perk), in which case one token is spent to preserve it instead.
 */
/**
 * The app's day for an instant: the viewer's local date, where the day turns
 * over at 5:30am (late nights still count toward the evening before).
 * `tzOffsetMinutes` is the browser's getTimezoneOffset() (minutes behind UTC).
 */
function appDay(iso: string, tzOffsetMinutes: number): string {
  return new Date(Date.parse(iso) - tzOffsetMinutes * 60_000 - 330 * 60_000).toISOString().slice(0, 10);
}

export async function dailyCheckIn(ownerId: string, tzOffsetMinutes = 0): Promise<CheckInResult> {
  const db = supabaseAdmin();
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", ownerId)
    .single<Profile>();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);

  const todayStr = appDay(new Date().toISOString(), tzOffsetMinutes);
  if (profile.last_check_in_at && appDay(profile.last_check_in_at, tzOffsetMinutes) === todayStr) {
    return { alreadyCheckedInToday: true, streakCount: profile.streak_count, usedProtectionToken: false, xpAwarded: 0 };
  }

  let newStreak: number;
  let usedProtectionToken = false;
  let tokenDelta = 0;

  if (!profile.last_check_in_at) {
    newStreak = 1;
  } else {
    const last = new Date(appDay(profile.last_check_in_at, tzOffsetMinutes) + "T00:00:00Z");
    const today = new Date(todayStr + "T00:00:00Z");
    const daysSince = Math.round((today.getTime() - last.getTime()) / 86_400_000);

    if (daysSince === 1) {
      newStreak = profile.streak_count + 1;
    } else if (profile.streak_protection_tokens > 0) {
      newStreak = profile.streak_count + 1;
      usedProtectionToken = true;
      tokenDelta = -1;
    } else {
      newStreak = 1;
    }
  }

  const { error: updateErr } = await db
    .from("profiles")
    .update({
      last_check_in_at: new Date().toISOString(),
      streak_count: newStreak,
      streak_protection_tokens: profile.streak_protection_tokens + tokenDelta,
    })
    .eq("id", ownerId);
  if (updateErr) throw new Error(`Failed to record check-in: ${updateErr.message}`);

  let xpAwarded = CHECK_IN_BONUS;
  let award = await awardXp(ownerId, CHECK_IN_BONUS, "daily_check_in");

  if (newStreak > 0 && newStreak % STREAK_MILESTONE_EVERY === 0) {
    xpAwarded += STREAK_MILESTONE_BONUS;
    award = await awardXp(ownerId, STREAK_MILESTONE_BONUS, "streak_bonus");
  }

  return { alreadyCheckedInToday: false, streakCount: newStreak, usedProtectionToken, xpAwarded, award };
}
