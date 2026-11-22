"use client";

import { celebrateQuest, updateQuestCelebration } from "@/components/celebration/QuestCelebrationHost";
import { coinsForXp } from "@/lib/coins";
import type { Task } from "@/lib/data/types";
import { clearQuestNow, holdOpenNow, markDoneNow, questMarkNow, questSig, releaseHoldNow } from "@/lib/failed-now";
import { saveOrQueue } from "@/lib/offline";

/**
 * Complete a quest from the calendar (its portrait or its menu): the celebration comes first and the check lands on
 * its card as the scene closes (owner, Nov 19: "The completed screen should show before the check goes onto the
 * quest card"); the server's totals fill in when it answers (owner, Nov 19: "completing a calendar quest is super
 * buggy": a tap showed nothing for seconds while the save waited behind the page's other requests, so a second tap
 * could complete it twice). If the save fails, the scene closes and the card stays open.
 * Resolves true once saved (or kept to send when back online).
 */
export async function completeQuestNow(task: Task, refresh: () => void): Promise<boolean> {
  const sig = questSig(task);
  let failed = false;
  // The card behind the scene stays open (even once fresh data says done) until the scene closes; then the check
  // slams on, unless Undo in the scene reopened it or the save failed.
  holdOpenNow(task.id);
  const closed = (e: Event) => {
    if ((e as CustomEvent<{ taskId: string }>).detail?.taskId !== task.id) return;
    window.removeEventListener("quest-complete-closed", closed);
    if (!failed && questMarkNow(task.id) !== "open") markDoneNow(task.id, sig);
    releaseHoldNow(task.id);
  };
  window.addEventListener("quest-complete-closed", closed);
  const req = saveOrQueue("completeQuest", { id: task.id, at: new Date().toISOString() }).then((r) => (r.queued ? null : r.result));
  celebrateQuest({
    taskId: task.id,
    title: task.title,
    description: task.description ?? null,
    xp: task.xp_value,
    iconSrc: (task.icon_source === "ai" || task.icon_source === "library") && task.icon_key ? task.icon_key : null,
    totalXp: null,
    coinsEarned: task.coin_value ?? coinsForXp(task.xp_value),
    isReward: Boolean(task.reward_id),
  });
  try {
    const res = await req;
    if (res) updateQuestCelebration({ taskId: task.id, totalXp: res.totalXp ?? null, coinsEarned: res.coinsEarned ?? 0 });
    refresh();
    return true;
  } catch {
    failed = true;
    clearQuestNow(task.id);
    updateQuestCelebration({ taskId: task.id, failed: true });
    // In case no scene was showing to close.
    window.removeEventListener("quest-complete-closed", closed);
    releaseHoldNow(task.id);
    return false;
  }
}
