import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logLevelUpActivity } from "./activity";
import type { Profile } from "./types";

// ---------------------------------------------------------------------------
// Leveling curve (1-10) — cumulative total_xp required to *reach* each level.
// Tuned so early levels come quickly (cosmetic tier hooks users fast) and
// the prestige tier (8-10) takes real sustained use.
// ---------------------------------------------------------------------------
export const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 100,
  3: 250,
  4: 450,
  5: 700,
  6: 1000,
  7: 1400,
  8: 1900,
  9: 2500,
  10: 3200,
};

export function computeLevelForXp(totalXp: number): number {
  let level = 1;
  for (let l = 1; l <= 10; l++) {
    if (totalXp >= LEVEL_THRESHOLDS[l]) level = l;
  }
  return level;
}

export function xpToNextLevel(totalXp: number): { level: number; nextLevel: number | null; xpIntoLevel: number; xpForNextLevel: number | null } {
  const level = computeLevelForXp(totalXp);
  const nextLevel = level < 10 ? level + 1 : null;
  return {
    level,
    nextLevel,
    xpIntoLevel: totalXp - LEVEL_THRESHOLDS[level],
    xpForNextLevel: nextLevel ? LEVEL_THRESHOLDS[nextLevel] - LEVEL_THRESHOLDS[level] : null,
  };
}

// Levels 4-7 (functional tier): weekly budget bump + a streak-protection
// token, each granted once, the moment that level is first reached.
const FUNCTIONAL_TIER_BUDGET_BONUS = 20;
const FUNCTIONAL_TIER_LEVELS = [4, 5, 6, 7];

export function getLevelPerks(level: number): string[] {
  const perks: string[] = [];
  if (level >= 1) perks.push("New avatar gear + minimal-mode color palettes unlock as you climb levels 1-3.");
  if (level >= 4) perks.push(`+${FUNCTIONAL_TIER_BUDGET_BONUS} weekly XP budget per level through 7.`);
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

export async function getWeeklyAllocated(ownerId: string, weekStart: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("xp_events")
    .select("amount")
    .eq("owner_id", ownerId)
    .eq("kind", "task_assigned")
    .eq("week_start", weekStart);

  if (error) throw new Error(`Failed to load weekly XP allocation: ${error.message}`);
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Enforces the weekly XP budget (spec: "users have a fixed pool of points
 * to distribute across tasks per week") before letting a new task claim
 * XP. Throws if the assignment would exceed the remaining budget.
 */
export async function recordTaskXpAssignment(
  ownerId: string,
  taskId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  const db = supabaseAdmin();
  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("weekly_xp_budget")
    .eq("id", ownerId)
    .single();
  if (profileErr) throw new Error(`Failed to load profile budget: ${profileErr.message}`);

  const weekStart = currentWeekStart();
  const allocated = await getWeeklyAllocated(ownerId, weekStart);
  const remaining = profile.weekly_xp_budget - allocated;

  if (amount > remaining) {
    throw new Error(
      `That task's XP (${amount}) would exceed your weekly budget — you have ${Math.max(remaining, 0)} XP left to assign this week.`
    );
  }

  const { error } = await db.from("xp_events").insert({
    owner_id: ownerId,
    task_id: taskId,
    kind: "task_assigned",
    amount,
    week_start: weekStart,
  });
  if (error) throw new Error(`Failed to record XP assignment: ${error.message}`);
}

export type XpAwardResult = {
  totalXp: number;
  level: number;
  leveledUp: boolean;
  unlockedPerks: string[];
};

/**
 * Awards XP (task completion, check-in bonus, streak bonus, ...), applies
 * any level-up perks crossed, and logs a public level_up activity when it
 * happens so friends can cheer it in the feed.
 */
export async function awardXp(
  ownerId: string,
  amount: number,
  kind: "task_completed" | "daily_check_in" | "streak_bonus",
  taskId?: string
): Promise<XpAwardResult> {
  const db = supabaseAdmin();

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
  const newLevel = computeLevelForXp(newTotal);
  const leveledUp = newLevel > profile.level;

  let budgetDelta = 0;
  let tokenDelta = 0;
  const unlockedPerks: string[] = [];
  if (leveledUp) {
    for (let l = profile.level + 1; l <= newLevel; l++) {
      if (FUNCTIONAL_TIER_LEVELS.includes(l)) {
        budgetDelta += FUNCTIONAL_TIER_BUDGET_BONUS;
        tokenDelta += 1;
      }
    }
    unlockedPerks.push(...getLevelPerks(newLevel));
  }

  const { error: updateErr } = await db
    .from("profiles")
    .update({
      total_xp: newTotal,
      level: newLevel,
      weekly_xp_budget: profile.weekly_xp_budget + budgetDelta,
      streak_protection_tokens: profile.streak_protection_tokens + tokenDelta,
    })
    .eq("id", ownerId);
  if (updateErr) throw new Error(`Failed to update profile XP: ${updateErr.message}`);

  if (leveledUp) {
    await logLevelUpActivity(ownerId, profile.is_public);
  }

  return { totalXp: newTotal, level: newLevel, leveledUp, unlockedPerks };
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
export async function dailyCheckIn(ownerId: string): Promise<CheckInResult> {
  const db = supabaseAdmin();
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", ownerId)
    .single<Profile>();
  if (error) throw new Error(`Failed to load profile: ${error.message}`);

  const todayStr = dateOnly(new Date().toISOString());
  if (profile.last_check_in_at && dateOnly(profile.last_check_in_at) === todayStr) {
    return { alreadyCheckedInToday: true, streakCount: profile.streak_count, usedProtectionToken: false, xpAwarded: 0 };
  }

  let newStreak: number;
  let usedProtectionToken = false;
  let tokenDelta = 0;

  if (!profile.last_check_in_at) {
    newStreak = 1;
  } else {
    const last = new Date(dateOnly(profile.last_check_in_at) + "T00:00:00Z");
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
