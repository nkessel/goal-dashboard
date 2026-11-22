import "server-only";
// The bodies of the quest and habit actions that pay or take back XP and coins, keyed by owner id.
// `src/app/actions.ts` ("use server") calls these after `requireProfileId()`; the Duet route
// (`src/lib/duet/`) calls them for the owner it was set up for. Never re-export anything from here
// out of a "use server" file: every function here takes an owner id, so none may be callable from a client.
import { revalidatePath } from "next/cache";
import { writeExtra } from "@/lib/data/extras";
import * as tasksData from "@/lib/data/tasks";
import * as profilesData from "@/lib/data/profiles";
import * as rewardsData from "@/lib/data/rewards";
import * as ritesData from "@/lib/data/rites";
import * as bossesData from "@/lib/data/bosses";
import * as xp from "@/lib/data/xp";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeLevelForXp } from "@/lib/levels";
import { coinsForXp } from "@/lib/coins";
import { earlyBirdBonus, earlyBirdCoins } from "@/lib/next-action";
import type { Task } from "@/lib/data/types";

/** Coins to add on completion so the quest pays exactly its custom coin value. */
export function customCoinAdjustment(task: { coin_value?: number | null; xp_value: number }) {
  if (task.coin_value == null) return 0;
  return Math.max(0, Math.round(task.coin_value)) - coinsForXp(task.xp_value);
}

/**
 * Complete a quest and pay what it still owes. A reward's own quest also
 * completes the reward and pays its bonus coins.
 */
export async function finishTaskForOwner(ownerId: string, taskId: string, completedAt?: string): Promise<Awaited<ReturnType<typeof finishTaskItself>>> {
  // A stand-in quest stays: checking it off finishes the assignment it speaks for right now.
  const t = await tasksData.getTask(taskId, ownerId);
  if (t?.stands_for) {
    const { currentAssignment } = await import("@/lib/data/standins");
    const current = await currentAssignment(ownerId, t);
    if (current) {
      await supabaseAdmin().from("tasks").update({ needs_review: false }).eq("id", current).eq("owner_id", ownerId);
      return finishTaskItself(ownerId, current, completedAt);
    }
  }
  return finishTaskItself(ownerId, taskId, completedAt);
}

/** A quest is done: the next one in its sequence steps into the same spot. */
async function releaseNext(ownerId: string, was: Task) {
  const { releaseFollowers } = await import("@/lib/data/sequences");
  const freed = await releaseFollowers(ownerId, was.id);
  if (!freed.length) return;
  const patch: Record<string, unknown> = { sort_order: (was as Task & { sort_order?: number }).sort_order ?? 0 };
  if (was.is_manual_priority) patch.is_manual_priority = true;
  if (was.queued_for) patch.queued_for = was.queued_for;
  await supabaseAdmin().from("tasks").update(patch).eq("owner_id", ownerId).eq("id", freed[0]);
}

async function finishTaskItself(ownerId: string, taskId: string, completedAt?: string) {
  const was = await tasksData.getTask(taskId, ownerId);
  // Already done (a second tap while the first was still saving): it pays once, not twice.
  if (was?.status === "completed" && !was.failed_at) {
    return { totalXp: (await profilesData.getProfileById(ownerId))?.total_xp ?? null, coinsEarned: 0, rewardCompleted: false, earlyBird: 0 };
  }
  const completed = await tasksData.completeTask(taskId, ownerId, completedAt);
  // The next quest in its sequence steps forward (taking its place on Today).
  if (was) await releaseNext(ownerId, was).catch(() => {});
  // Partial progress may already have paid some of this quest's XP; pay the rest.
  const tracked = typeof completed.xp_awarded === "number";
  const payout = tracked ? completed.xp_value - (completed.xp_awarded ?? 0) : completed.xp_value;
  if (tracked) await tasksData.setTaskPayout(taskId, ownerId, { progress: 100, xpAwarded: completed.xp_value });
  let totalXp: number | null = null;
  let coinsEarned = 0;
  if (payout !== 0) {
    const award = await xp.awardXp(ownerId, payout, "task_completed", taskId);
    totalXp = award.totalXp;
    coinsEarned = award.coins === null ? 0 : award.coinsEarned;
  } else {
    totalXp = (await profilesData.getProfileById(ownerId))?.total_xp ?? null;
  }
  // A custom coin payout tops up (or trims) the automatic 1-per-10-XP coins.
  const coinAdjust = customCoinAdjustment(completed);
  if (coinAdjust !== 0) {
    await rewardsData.addCoins(ownerId, coinAdjust);
    coinsEarned += coinAdjust;
  }
  let rewardCompleted = false;
  if (completed.reward_id) {
    try {
      const reward = await rewardsData.completeReward(completed.reward_id, ownerId);
      rewardCompleted = true;
      if ((reward.bonus_coins ?? 0) > 0) {
        await rewardsData.addCoins(ownerId, reward.bonus_coins ?? 0);
        coinsEarned += reward.bonus_coins ?? 0;
      }
    } catch {
      /* reward already completed or removed — the quest still counts */
    }
    revalidatePath("/rewards");
  }
  // A boss's session quest counts toward defeating it.
  if (completed.boss_id) await bossStep(ownerId, completed.boss_id, 1).catch(() => {});
  // Done well before its deadline: the early-bird bonus.
  const early = earlyBirdBonus(completed, completedAt ? Date.parse(completedAt) : Date.now());
  if (early > 0) {
    const award = await xp.awardXp(ownerId, early, "early_bird", taskId).catch(() => null);
    if (award) {
      totalXp = award.totalXp;
      coinsEarned += award.coins === null ? 0 : award.coinsEarned;
    }
  }
  const earlyCoins = earlyBirdCoins(completed, completedAt ? Date.parse(completedAt) : Date.now());
  if (earlyCoins > 0) {
    await rewardsData.addCoins(ownerId, earlyCoins).catch(() => {});
    coinsEarned += earlyCoins;
  }
  // A project's next action is done: the next one takes its place.
  await supabaseAdmin().from("boards").update({ next_task_id: null }).eq("owner_id", ownerId).eq("next_task_id", taskId);
  revalidatePath("/");
  revalidatePath("/matrix");
  // Lets the quest-complete celebration fill the XP bar to the real total.
  return { totalXp, coinsEarned, rewardCompleted, earlyBird: early };
}

/** Move a boss's count by one (a session quest done or undone). Defeating it may level you up. */
async function bossStep(ownerId: string, bossId: string, delta: 1 | -1) {
  const boss = await bossesData.getBoss(ownerId, bossId);
  if (!boss) return null;
  const updated = await bossesData.setBossProgress(ownerId, bossId, boss.progress + delta, boss.target);
  if (!!updated.defeated_at !== !!boss.defeated_at) {
    // The level cap moved: settle the level the XP has already earned.
    const profile = await profilesData.getProfileById(ownerId);
    if (profile) {
      const level = Math.min(computeLevelForXp(profile.total_xp), await bossesData.levelCap(ownerId));
      if (level !== profile.level) await supabaseAdmin().from("profiles").update({ level }).eq("id", ownerId);
    }
  }
  return updated;
}

/** What a quest edit changes in the XP already earned for it. Returns the quest as it was. */
export async function adjustXpForEditForOwner(ownerId: string, taskId: string, newXpValue: number) {
  // Changing a quest's XP adjusts what you've already earned for it: all of
  // it for a finished quest, its progress share for one in progress.
  const before = await tasksData.getTask(taskId, ownerId);
  if (before && before.xp_value !== newXpValue) {
    if (typeof before.xp_awarded === "number") {
      const target =
        before.status === "completed"
          ? Math.max(0, Math.round(newXpValue))
          : Math.round((Math.max(0, newXpValue) * (before.progress ?? 0)) / 100);
      const delta = target - before.xp_awarded;
      if (delta !== 0) {
        await xp.awardXp(ownerId, delta, "task_completed", taskId);
        await tasksData.setTaskPayout(taskId, ownerId, { xpAwarded: target });
      }
    } else if (before.status === "completed") {
      await xp.awardXp(ownerId, newXpValue - before.xp_value, "task_completed", taskId);
    }
  }
  return before;
}

export async function reopenTaskForOwner(ownerId: string, taskId: string) {
  const before = await tasksData.getTask(taskId, ownerId);
  await tasksData.reopenTask(taskId, ownerId);
  // Undo what the quest paid out so re-completing later doesn't farm points;
  // progress starts over.
  // A failed quest paid nothing and finished nothing: reopening it only reopens it.
  const failed = !!before?.failed_at;
  if (before?.status === "completed" && before.reward_id && !failed) {
    // Reopening a reward's quest puts the reward back to accepted (bonus coins back out).
    const was = await rewardsData.uncompleteReward(before.reward_id, ownerId);
    if (was && (was.bonus_coins ?? 0) > 0) await rewardsData.addCoins(ownerId, -(was.bonus_coins ?? 0));
    revalidatePath("/rewards");
  }
  if (before?.status === "completed" && before.boss_id && !failed) await bossStep(ownerId, before.boss_id, -1).catch(() => {});
  if (before?.status === "completed" && !failed) {
    const paid = typeof before.xp_awarded === "number" ? before.xp_awarded : before.xp_value;
    if (paid > 0) await xp.awardXp(ownerId, -paid, "task_completed", taskId);
    const coinAdjust = customCoinAdjustment(before);
    if (coinAdjust !== 0) await rewardsData.addCoins(ownerId, -coinAdjust);
    if (typeof before.xp_awarded === "number") await tasksData.setTaskPayout(taskId, ownerId, { progress: 0, xpAwarded: 0 });
  }
  revalidatePath("/");
  revalidatePath("/matrix");
}

export async function deleteTaskForOwner(ownerId: string, taskId: string) {
  const task = await tasksData.getTask(taskId, ownerId);
  // Reverse any XP already paid for this quest (completion or partial
  // progress) so deleting it can't be used to farm points.
  const paid = task ? (typeof task.xp_awarded === "number" ? task.xp_awarded : task.status === "completed" ? task.xp_value : 0) : 0;
  if (paid > 0) {
    await xp.awardXp(ownerId, -paid, "task_completed", taskId);
  }
  await tasksData.deleteTask(taskId, ownerId);
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
}

/**
 * Archive instead of delete (owner, Nov 3: "a record of deleted quests that can be recovered"): the quest and its
 * steps are kept whole in the account's extras (last 60), then the quest is removed. Restoring puts both back.
 */
export type ArchivedQuest = { at: string; task: Record<string, unknown>; steps: Record<string, unknown>[] };
export function archivedOf(extras: Record<string, unknown>): ArchivedQuest[] {
  return (Array.isArray(extras.archivedQuests) ? (extras.archivedQuests as ArchivedQuest[]) : []).filter((a) => a && a.task && typeof a.task.id === "string");
}

export async function readExtrasOf(ownerId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  return data?.life_wheel ?? {};
}

export async function archiveTaskForOwner(ownerId: string, taskId: string) {
  const db = supabaseAdmin();
  const { data: row } = await db.from("tasks").select("*").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<Record<string, unknown>>();
  if (!row) throw new Error("That quest isn't there any more.");
  const { data: steps } = await db.from("quest_steps").select("*").eq("owner_id", ownerId).eq("task_id", taskId);
  const extras = await readExtrasOf(ownerId);
  const list = [{ at: new Date().toISOString(), task: row, steps: (steps ?? []) as Record<string, unknown>[] }, ...archivedOf(extras).filter((a) => a.task.id !== taskId)].slice(0, 60);
  const { error } = await writeExtra(ownerId, "archivedQuests", list);
  if (error) throw new Error(`Couldn't archive it: ${error.message}`);
  await deleteTaskForOwner(ownerId, taskId);
}

export async function restoreArchivedQuestForOwner(ownerId: string, taskId: string) {
  const db = supabaseAdmin();
  const extras = await readExtrasOf(ownerId);
  const all = archivedOf(extras);
  const hit = all.find((a) => a.task.id === taskId);
  if (!hit) throw new Error("That quest isn't in the archive.");
  // Back as it was, open again (no XP is paid twice: deleting took back what it had paid).
  const task = { ...hit.task, owner_id: ownerId, status: hit.task.status === "completed" ? "open" : hit.task.status, completed_at: null, xp_awarded: null, locked_by_task_id: null };
  const { error } = await db.from("tasks").insert(task);
  if (error) throw new Error(`Couldn't bring it back: ${error.message}`);
  if (hit.steps.length) await db.from("quest_steps").insert(hit.steps.map((st) => ({ ...st, owner_id: ownerId }))).then(() => {}, () => {});
  await writeExtra(ownerId, "archivedQuests", all.filter((a) => a.task.id !== taskId));
  revalidatePath("/");
  revalidatePath("/boards", "layout");
  return { title: String(hit.task.title ?? "") };
}

export type NewQuestInput = {
  title: string;
  description?: string;
  importance: number;
  urgency: number;
  xpValue: number;
  estimateMinutes?: number | null;
  boardId?: string | null;
  effort?: number;
  energyGain?: number;
  iconKey?: string | null;
  iconSource?: "library" | "ai";
  pinToBattle?: boolean;
  grantsReward?: boolean;
  schedule?: { startISO: string; endISO: string; googleEventId?: string };
  dueAt?: string | null;
  chunkMinutes?: number | null;
  coinValue?: number | null;
  earlyBonusXp?: number | null;
  earlyBonusCoins?: number | null;
  earlyBonusPerDay?: number | null;
  /** Where it shows on Today ("none" = just on its board). */
  placement?: "today" | "additional" | "none";
  /** A tiny task (half height on Today, just a check box). */
  isTiny?: boolean;
};

/**
 * Create a quest from the quest editor dialog. `onSchedule` is the part that needs the signed-in user's
 * Google token (placing it on the calendar); the Duet route passes none and leaves `schedule` out.
 */
export async function createQuestForOwner(ownerId: string, input: NewQuestInput, onSchedule?: (task: Task) => Promise<void>): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new Error("Give your quest a title first.");
  const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n * 10) / 10));
  const task = await tasksData.createTask(ownerId, {
    title,
    description: input.description?.trim() || undefined,
    importance: clamp(input.importance),
    urgency: clamp(input.urgency),
    xpValue: Math.max(0, Math.round(input.xpValue)),
    boardId: input.boardId ?? null,
    effort: input.effort,
    energyGain: input.energyGain,
    estimateMinutes: input.estimateMinutes ?? null,
    iconKey: input.iconKey ?? null,
    iconSource: input.iconSource,
    dueAt: input.dueAt ?? null,
    chunkMinutes: input.chunkMinutes ?? null,
    coinValue: input.coinValue ?? null,
    earlyBonusXp: input.earlyBonusXp ?? null,
    earlyBonusCoins: input.earlyBonusCoins ?? null,
    earlyBonusPerDay: input.earlyBonusPerDay ?? null,
    isTiny: input.isTiny,
  });
  revalidatePath("/power-ups");
  if (input.schedule && onSchedule) await onSchedule(task);
  if (input.pinToBattle) {
    // Today's Quests full: it simply lands in Additional Quests.
    await tasksData.setManualPriority(task.id, ownerId, true).catch(() => null);
  }
  if (input.placement === "none") await tasksData.setTaskInAdditional(task.id, ownerId, false).catch(() => null);
  if (input.grantsReward) {
    await tasksData.setTaskGrantsReward(task.id, ownerId, true);
  }
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/calendar");
  if (input.boardId) revalidatePath(`/boards/${input.boardId}`);
  return task.id;
}

/** Where a quest shows on the Today screen: Today's Quests, Additional Quests, or neither. */
export async function setTaskPlacementForOwner(ownerId: string, taskId: string, placement: "today" | "additional" | "none") {
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  if (placement === "today") {
    if (!task.is_manual_priority) await tasksData.setManualPriority(taskId, ownerId, true);
    if (task.in_additional === false) await tasksData.setTaskInAdditional(taskId, ownerId, true).catch(() => null);
  } else {
    if (task.is_manual_priority) await tasksData.setManualPriority(taskId, ownerId, false);
    if ((placement === "none") !== (task.in_additional === false)) await tasksData.setTaskInAdditional(taskId, ownerId, placement !== "none");
  }
  revalidatePath("/");
  revalidatePath("/boards", "layout");
}

export function assertDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Bad day.");
}

/** Complete a rite for `day`; `pct` below 100 marks it done in part, for that share of its XP. */
export async function completeRiteForOwner(ownerId: string, riteId: string, day: string, pct = 100) {
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That rite isn't here anymore.");
  const share = Math.max(1, Math.min(100, Math.round(Number(pct) || 100)));
  const earned = Math.round((rite.xp_value * share) / 100);
  // A habit with its own coin value pays exactly that (on top of or instead of the automatic coins); done in part, just the automatic coins.
  const coinAdjust = rite.coin_value == null || share < 100 ? 0 : Math.max(0, rite.coin_value) - coinsForXp(rite.xp_value);
  const added = await ritesData.addRiteCompletion(ownerId, riteId, day, earned, coinAdjust);
  let coinsEarned = 0;
  if (added && earned > 0) coinsEarned = (await xp.awardXp(ownerId, earned, "task_completed")).coinsEarned;
  if (added && coinAdjust !== 0) {
    await rewardsData.addCoins(ownerId, coinAdjust);
    coinsEarned += coinAdjust;
  }
  revalidatePath("/");
  return { xp: added ? earned : 0, coinsEarned };
}

/** Undo a rite completion for `day` and take back its XP. */
export async function uncompleteRiteForOwner(ownerId: string, riteId: string, day: string) {
  assertDay(day);
  const paid = await ritesData.removeRiteCompletion(ownerId, riteId, day);
  if (paid && paid.xp > 0) await xp.awardXp(ownerId, -paid.xp, "task_completed");
  if (paid && paid.coins !== 0) await rewardsData.addCoins(ownerId, -paid.coins);
  revalidatePath("/");
}

export function cleanRepeatInput(r: unknown) {
  const u = (r ?? null) as { every?: unknown; unit?: unknown; from?: unknown } | null;
  if (!u) return null;
  const every = Math.round(Number(u.every));
  const unit = u.unit === "day" || u.unit === "week" || u.unit === "month" || u.unit === "year" ? u.unit : null;
  const from = typeof u.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(u.from) ? u.from : null;
  return every >= 1 && every <= 999 && unit && from ? { every, unit: unit as "day" | "week" | "month" | "year", from } : null;
}

type RiteFields = { title?: string; description?: string; isCore?: boolean; xpValue?: number; days?: number[] | null; dueTime?: string | null } & ritesData.HabitExtras;

export async function createRiteForOwner(ownerId: string, input: { title: string; description?: string; isCore: boolean; xpValue?: number; slot?: "evening" | "day"; days?: number[] | null; dueTime?: string | null } & ritesData.HabitExtras) {
  const title = input.title.trim();
  if (!title) throw new Error(input.slot === "day" ? "Name the habit first." : "Name the rite first.");
  const rite = await ritesData.createRite(ownerId, {
    title,
    description: input.description?.trim() || null,
    isCore: input.isCore,
    xpValue: input.xpValue,
    slot: input.slot,
    days: input.days,
    dueTime: input.dueTime,
    iconKey: input.iconKey,
    iconSource: input.iconSource,
    coinValue: input.coinValue,
    estimateMinutes: input.estimateMinutes,
    windowTo: input.windowTo,
    ...(input.repeat !== undefined ? { repeat: cleanRepeatInput(input.repeat) } : {}),
  });
  revalidatePath("/");
  return rite.id;
}

export async function updateRiteForOwner(ownerId: string, riteId: string, input: RiteFields) {
  if (input.title !== undefined && !input.title.trim()) throw new Error("Name the rite first.");
  await ritesData.updateRite(riteId, ownerId, {
    title: input.title?.trim(),
    description: input.description === undefined ? undefined : input.description.trim() || null,
    isCore: input.isCore,
    xpValue: input.xpValue,
    days: input.days,
    dueTime: input.dueTime,
    iconKey: input.iconKey,
    iconSource: input.iconSource,
    coinValue: input.coinValue,
    estimateMinutes: input.estimateMinutes,
    windowTo: input.windowTo,
    ...(input.repeat !== undefined ? { repeat: cleanRepeatInput(input.repeat) } : {}),
  });
  revalidatePath("/");
}

/**
 * Habits in the day's plan (owner, Nov 14): `life_wheel.habitPlan` = { core: ids, days: { "YYYY-MM-DD": ids } }.
 * Core habits always come up; the ones picked for a day join Today's Quests that day.
 */
export type HabitPlan = { core: string[]; days: Record<string, string[]> };
export function cleanHabitPlan(raw: unknown): HabitPlan {
  const r = (raw && typeof raw === "object" ? raw : {}) as { core?: unknown; days?: unknown };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : []);
  const days = r.days && typeof r.days === "object" ? Object.fromEntries(Object.entries(r.days as Record<string, unknown>).filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k)).map(([k, v]) => [k, ids(v)])) : {};
  return { core: ids(r.core), days };
}
export async function saveHabitPlan(ownerId: string, plan: HabitPlan) {
  // Keep only the last few days.
  const days = Object.fromEntries(Object.entries(plan.days).sort(([a], [b]) => b.localeCompare(a)).slice(0, 5));
  const { error } = await writeExtra(ownerId, "habitPlan", { core: plan.core, days });
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
}

/** Make a daily habit "core" (it always comes up in Today's Quests) or not. */
export async function setCoreHabitForOwner(ownerId: string, riteId: string, core: boolean) {
  const plan = cleanHabitPlan((await readExtrasOf(ownerId)).habitPlan);
  const next = plan.core.filter((id) => id !== riteId);
  if (core) next.push(riteId);
  await saveHabitPlan(ownerId, { ...plan, core: next });
  revalidatePath("/");
}
