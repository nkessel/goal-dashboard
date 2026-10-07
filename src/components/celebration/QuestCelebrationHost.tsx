"use client";

import { useEffect, useState } from "react";
import { QuestComplete } from "./QuestComplete";
import { xpToNextLevel } from "@/lib/levels";

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
};

/** Play the quest-complete celebration (works even after the card unmounts). */
export function celebrateQuest(detail: QuestCelebration) {
  window.dispatchEvent(new CustomEvent("quest-complete", { detail }));
}

/** App-wide: shows the Quest Complete scene, then Choose a Reward / Continue. */
export function QuestCelebrationHost({ avatarSrc, totalXp: shellTotalXp }: { avatarSrc: string; totalXp: number }) {
  const [current, setCurrent] = useState<QuestCelebration | null>(null);

  useEffect(() => {
    const on = (e: Event) => setCurrent((e as CustomEvent<QuestCelebration>).detail);
    window.addEventListener("quest-complete", on);
    return () => window.removeEventListener("quest-complete", on);
  }, []);

  if (!current) return null;
  const total = current.totalXp ?? shellTotalXp + current.xp;
  const { level, xpIntoLevel, xpForNextLevel } = xpToNextLevel(total);

  return (
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
      onClose={() => setCurrent(null)}
    />
  );
}
