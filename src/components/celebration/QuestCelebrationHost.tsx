"use client";

import { useEffect, useState } from "react";
import { QuestComplete } from "./QuestComplete";
import { ProgressCelebration, type ProgressCelebrationDetail } from "./ProgressCelebration";
import { xpToNextLevel } from "@/lib/levels";
import { RewardCelebration, type RewardCelebrationDetail } from "./RewardCelebration";

export type QuestCelebration = {
  taskId: string;
  title: string;
  description?: string | null;
  tag?: string | null;
  xp: number;
  iconSrc?: string | null;
  /** Total XP after this quest's XP was added (null if unknown). */
  totalXp: number | null;
  coinsEarned?: number;
  /** Finishing a reward's own quest: celebrate the reward, no reward picker. */
  isReward?: boolean;
};

/** Play the quest-complete celebration (works even after the card unmounts). */
export function celebrateQuest(detail: QuestCelebration) {
  window.dispatchEvent(new CustomEvent("quest-complete", { detail }));
}

/** The server has answered: fill in the real totals (or cancel on failure). */
export function updateQuestCelebration(detail: { taskId: string; totalXp?: number | null; coinsEarned?: number; failed?: boolean }) {
  window.dispatchEvent(new CustomEvent("quest-complete-update", { detail }));
}

/** Play the small "progress made" party (XP from partial progress or steps). */
export function celebrateProgress(detail: ProgressCelebrationDetail) {
  window.dispatchEvent(new CustomEvent("quest-progress", { detail }));
}

/** App-wide: shows the Quest Complete scene, then Choose a Reward / Continue. */
export function QuestCelebrationHost({ avatarSrc, totalXp: shellTotalXp, levelCap = 10 }: { avatarSrc: string; totalXp: number; levelCap?: number }) {
  const [current, setCurrent] = useState<QuestCelebration | null>(null);
  const [progress, setProgress] = useState<(ProgressCelebrationDetail & { n: number }) | null>(null);
  const [reward, setReward] = useState<(RewardCelebrationDetail & { n: number }) | null>(null);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => setReward({ ...(e as CustomEvent<RewardCelebrationDetail>).detail, n: ++n });
    window.addEventListener("reward-celebrate", on);
    return () => window.removeEventListener("reward-celebrate", on);
  }, []);
  const rewardScene = reward ? <RewardCelebration key={reward.n} {...reward} levelCap={levelCap} onClose={() => setReward(null)} /> : null;

  useEffect(() => {
    const on = (e: Event) => setCurrent((e as CustomEvent<QuestCelebration>).detail);
    let n = 0;
    const onProgress = (e: Event) => setProgress({ ...(e as CustomEvent<ProgressCelebrationDetail>).detail, n: ++n });
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent<{ taskId: string; totalXp?: number | null; coinsEarned?: number; failed?: boolean }>).detail;
      setCurrent((c) => {
        if (!c || c.taskId !== d.taskId) return c;
        if (d.failed) return null;
        return { ...c, totalXp: d.totalXp ?? c.totalXp, coinsEarned: d.coinsEarned ?? c.coinsEarned };
      });
    };
    window.addEventListener("quest-complete", on);
    window.addEventListener("quest-complete-update", onUpdate);
    window.addEventListener("quest-progress", onProgress);
    return () => {
      window.removeEventListener("quest-complete", on);
      window.removeEventListener("quest-complete-update", onUpdate);
      window.removeEventListener("quest-progress", onProgress);
    };
  }, []);

  if (!current) {
    return (
      <>
        {progress ? <ProgressCelebration key={progress.n} {...progress} onClose={() => setProgress(null)} /> : null}
        {rewardScene}
      </>
    );
  }
  const total = current.totalXp ?? shellTotalXp + current.xp;
  const { level, xpIntoLevel, xpForNextLevel } = xpToNextLevel(total, levelCap);

  return (
    <>
    {rewardScene}
    <QuestComplete
      key={current.taskId}
      title={current.title}
      description={current.description}
      tag={current.tag || "Quest"}
      questXp={current.xp}
      level={level}
      xpIntoLevel={xpIntoLevel}
      xpForNextLevel={xpForNextLevel}
      iconSrc={current.iconSrc || undefined}
      avatarSrc={avatarSrc}
      taskId={current.taskId}
      coinsEarned={current.coinsEarned ?? 0}
      isReward={current.isReward}
      onClose={() => setCurrent(null)}
    />
    </>
  );
}
