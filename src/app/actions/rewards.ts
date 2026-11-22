"use server";

import * as rewardsData from "@/lib/data/rewards";
import { revalidatePath } from "next/cache";
import * as xp from "@/lib/data/xp";
import * as tasksData from "@/lib/data/tasks";
import { finishTaskForOwner as finishTask } from "@/lib/data/quest-ops";
import { coinsForXp } from "@/lib/coins";
import { generateAndStoreImage, buildTreasureIconPrompt, visualSubjectFor, buildQuestScenePrompt } from "@/lib/ai-image";
import * as taskIconLibraryData from "@/lib/data/task-icon-library";
import { requireProfileId } from "./_shared";

// Rewards
/** A reward's sequence quests: trimmed, no blanks, at most 20. */
function cleanParts(parts?: string[]): string[] {
  return (parts ?? []).map((p) => p.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 20);
}

export async function createRewardAction(input: {
  title: string;
  description?: string;
  iconKey?: string | null;
  costCoins?: number;
  bonusXp?: number;
  bonusCoins?: number;
  prereqTitle?: string;
  prereqXp?: number;
  prereqMore?: string[];
  followups?: string[];
}) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give the reward a name first.");
  const reward = await rewardsData.createReward(ownerId, {
    title,
    description: input.description?.trim() || null,
    iconKey: input.iconKey,
    costCoins: input.costCoins,
    bonusXp: input.bonusXp,
    bonusCoins: input.bonusCoins,
    prereqTitle: input.prereqTitle?.trim() || null,
    prereqXp: input.prereqXp,
    prereqMore: cleanParts(input.prereqMore),
    followups: cleanParts(input.followups),
  });
  revalidatePath("/rewards");
  return reward.id;
}

export async function updateRewardAction(
  rewardId: string,
  input: {
    title: string;
    description: string;
    iconKey?: string | null;
    costCoins?: number;
    bonusXp?: number;
    bonusCoins?: number;
    prereqTitle?: string;
    prereqXp?: number;
    prereqMore?: string[];
    followups?: string[];
    confirmImport?: boolean;
  }
) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give the reward a name first.");
  await rewardsData.updateReward(rewardId, ownerId, {
    title,
    description: input.description.trim() || null,
    iconKey: input.iconKey,
    costCoins: input.costCoins,
    bonusXp: input.bonusXp,
    bonusCoins: input.bonusCoins,
    prereqTitle: input.prereqTitle === undefined ? undefined : input.prereqTitle.trim() || null,
    prereqXp: input.prereqXp,
    prereqMore: input.prereqMore === undefined ? undefined : cleanParts(input.prereqMore),
    followups: input.followups === undefined ? undefined : cleanParts(input.followups),
    needsReview: input.confirmImport ? false : undefined,
  });
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function deleteRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  await rewardsData.deleteReward(rewardId, ownerId);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

/** Your unclaimed rewards plus your coin balance (for the reward picker). */
export async function listAvailableRewardsAction() {
  const ownerId = await requireProfileId();
  const [all, coins] = await Promise.all([rewardsData.listRewards(ownerId), rewardsData.getCoins(ownerId)]);
  return { rewards: all.filter((r) => r.status === "available"), coins };
}

/** Pick a reward after finishing a reward-granting quest (or claim one directly). */
export async function claimRewardAction(rewardId: string, taskId: string | null, opts: { now?: boolean } = {}) {
  const ownerId = await requireProfileId();
  // Accepting spends the reward's coins; its bonus comes when you complete it.
  const { coins, reward } = await rewardsData.claimReward(rewardId, ownerId, taskId);
  if (opts.now) {
    // Received on the spot: complete it right away and pay its bonus.
    const done = await rewardsData.completeReward(rewardId, ownerId);
    const bonusXp = done.bonus_xp ?? 0;
    const bonusCoins = done.bonus_coins ?? 0;
    let totalXp: number | null = null;
    let coinsNow = coins;
    if (bonusXp > 0) {
      const award = await xp.awardXp(ownerId, bonusXp, "task_completed");
      totalXp = award.totalXp ?? null;
      coinsNow += award.coinsEarned ?? 0;
    }
    if (bonusCoins > 0) {
      await rewardsData.addCoins(ownerId, bonusCoins);
      coinsNow += bonusCoins;
    }
    revalidatePath("/rewards");
    revalidatePath("/", "layout");
    return { coins: coinsNow, received: true as const, bonusXp, bonusCoins, totalXp };
  }
  // It goes straight into Today's Battle as a quest sequence: the quests
  // before it in order (only the first shows; the rest wait in its stack),
  // then the reward's own quest, then any quests that follow it.
  if (reward.prereq_xp !== undefined) {
    let prereq: { id: string } | null = null;
    const before = reward.prereq_title ? [reward.prereq_title, ...(reward.prereq_more ?? [])] : [];
    for (const [i, title] of before.entries()) {
      prereq = await tasksData.createTask(ownerId, {
        title,
        description: i === 0 ? reward.prereq_description || `Do this first to unlock: ${reward.title}` : `On the way to: ${reward.title}`,
        xpValue: reward.prereq_xp ?? 10,
        isManualPriority: i === 0,
        lockedByTaskId: prereq?.id ?? null,
      });
    }
    const rewardQuest = await tasksData.createTask(ownerId, {
      title: reward.title,
      description: reward.description || "Your reward — enjoy it!",
      xpValue: reward.bonus_xp ?? 0,
      iconKey: reward.icon_key,
      iconSource: "library",
      rewardId: reward.id,
      lockedByTaskId: prereq?.id ?? null,
      isManualPriority: true,
    });
    let last = rewardQuest.id;
    for (const title of reward.followups ?? []) {
      const next = await tasksData.createTask(ownerId, { title, description: `After: ${reward.title}`, lockedByTaskId: last });
      last = next.id;
    }
  }
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
  return { coins, received: false as const, bonusXp: 0, bonusCoins: 0, totalXp: null as number | null };
}

async function reverseRewardBonus(ownerId: string, was: Awaited<ReturnType<typeof rewardsData.uncompleteReward>>) {
  if (!was) return;
  if ((was.bonus_xp ?? 0) > 0) await xp.awardXp(ownerId, -(was.bonus_xp ?? 0), "task_completed");
  if ((was.bonus_coins ?? 0) > 0) await rewardsData.addCoins(ownerId, -(was.bonus_coins ?? 0));
}

/** You actually did it (got the haircut, bought the frames): pays the completion bonus. */
export async function completeRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  // Accepted with its own quest: completing that quest completes the reward.
  const quest = await tasksData.findOpenRewardTask(rewardId, ownerId);
  if (quest) {
    if (quest.locked_by_task_id) {
      const prereq = await tasksData.getTask(quest.locked_by_task_id, ownerId);
      if (prereq && prereq.status === "open") throw new Error(`Finish “${prereq.title}” first to unlock this reward.`);
    }
    const before = await rewardsData.listRewards(ownerId).then((rs) => rs.find((r) => r.id === rewardId));
    const done = await finishTask(ownerId, quest.id);
    const totalXp = (done as { totalXp?: number | null } | undefined)?.totalXp ?? null;
    return { bonusXp: quest.xp_value, bonusCoins: before?.bonus_coins ?? 0, bonusCoinsFromXp: coinsForXp(quest.xp_value), totalXp };
  }
  const reward = await rewardsData.completeReward(rewardId, ownerId);
  const bonusXp = reward.bonus_xp ?? 0;
  const bonusCoins = reward.bonus_coins ?? 0;
  const award = bonusXp > 0 ? await xp.awardXp(ownerId, bonusXp, "task_completed") : null;
  if (bonusCoins > 0) await rewardsData.addCoins(ownerId, bonusCoins);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
  return { bonusXp, bonusCoins, bonusCoinsFromXp: coinsForXp(bonusXp), totalXp: award?.totalXp ?? null };
}

/** Undo a completion (back to accepted) and take back its bonus. */
export async function uncompleteRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  await reverseRewardBonus(ownerId, await rewardsData.uncompleteReward(rewardId, ownerId));
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function unclaimRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  // A completed reward first gives back its bonus, then refunds as usual;
  // its still-open quests leave Today's Battle.
  await reverseRewardBonus(ownerId, await rewardsData.uncompleteReward(rewardId, ownerId));
  await tasksData.deleteOpenRewardTasks(rewardId, ownerId).catch(() => {});
  await rewardsData.unclaimReward(rewardId, ownerId);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function setTaskGrantsRewardAction(taskId: string, grantsReward: boolean) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskGrantsReward(taskId, ownerId, grantsReward);
  revalidatePath("/");
}

// Imports (quests/rewards added for you, reviewed one by one)
export async function listImportsAction() {
  const ownerId = await requireProfileId();
  return rewardsData.listImports(ownerId);
}

export async function confirmImportAction(kind: "quest" | "reward", id: string) {
  const ownerId = await requireProfileId();
  await rewardsData.markReviewed(kind, id, ownerId);
  revalidatePath("/", "layout");
}

/**
 * Makes the sketchbook portrait for ONE import that still needs one, and
 * returns what's left (the client calls this repeatedly, one image per
 * request, so no single request runs long).
 */
export async function generateNextImportIconAction(): Promise<{ done: boolean; id?: string; url?: string }> {
  const ownerId = await requireProfileId();
  const next = await rewardsData.nextImportNeedingIcon(ownerId);
  if (!next) return { done: true };
  // Quests: painted storybook object, cut out. Rewards: same style, kept on
  // a beaming golden background.
  const url =
    next.kind === "reward"
      ? await generateAndStoreImage(buildTreasureIconPrompt(await visualSubjectFor(next.prompt)), `rewards/${next.id}-${Date.now()}.jpg`)
      : await generateAndStoreImage(buildQuestScenePrompt(await visualSubjectFor(next.prompt)), `tasks/${next.id}-${Date.now()}.jpg`);
  await rewardsData.setImportIcon(next.kind, next.id, ownerId, url);
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: next.prompt });
  return { done: false, id: next.id, url };
}
