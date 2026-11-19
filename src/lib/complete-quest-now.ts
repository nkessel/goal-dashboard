"use client";

import { celebrateQuest, updateQuestCelebration } from "@/components/celebration/QuestCelebrationHost";
import { coinsForXp } from "@/lib/coins";
import type { Task } from "@/lib/data/types";
import { clearQuestNow, markDoneNow, questSig } from "@/lib/failed-now";
import { saveOrQueue } from "@/lib/offline";

/**
 * Complete a quest from the calendar (its portrait or its menu): the check lands on its card at once, the
 * celebration follows, and the server's totals fill in when it answers (owner, Nov 19: "completing a calendar
 * quest is super buggy": a tap showed nothing for seconds while the save waited behind the page's other requests,
 * so a second tap could complete it twice). If the save fails, the card goes back and the scene closes.
 * Resolves true once saved (or kept to send when back online).
 */
export async function completeQuestNow(task: Task, refresh: () => void): Promise<boolean> {
  markDoneNow(task.id, questSig(task));
  const req = saveOrQueue("completeQuest", { id: task.id, at: new Date().toISOString() }).then((r) => (r.queued ? null : r.result));
  // Let the check slam onto the card before the scene covers it.
  await new Promise((r) => setTimeout(r, 520));
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
    clearQuestNow(task.id);
    updateQuestCelebration({ taskId: task.id, failed: true });
    return false;
  }
}
