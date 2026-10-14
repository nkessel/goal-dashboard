// ---------------------------------------------------------------------------
// Leveling curve (1-10) — cumulative total_xp required to *reach* each level.
// Tuned so early levels come quickly (cosmetic tier hooks users fast) and
// the prestige tier (8-10) takes real sustained use.
// ---------------------------------------------------------------------------
export const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 0,
  2: 750,
  3: 1500,
  4: 3000,
  5: 5000,
  6: 7500,
  7: 10500,
  8: 14000,
  9: 18000,
  10: 20000,
};

export function computeLevelForXp(totalXp: number): number {
  let level = 1;
  for (let l = 1; l <= 10; l++) {
    if (totalXp >= LEVEL_THRESHOLDS[l]) level = l;
  }
  return level;
}

export function xpToNextLevel(
  totalXp: number,
  /** Highest level allowed right now (an undefeated boss holds you there). */
  cap = 10
): { level: number; nextLevel: number | null; xpIntoLevel: number; xpForNextLevel: number | null; heldByBoss: boolean } {
  const earned = computeLevelForXp(totalXp);
  const level = Math.min(earned, Math.max(1, cap));
  const nextLevel = level < 10 ? level + 1 : null;
  return {
    level,
    nextLevel,
    xpIntoLevel: totalXp - LEVEL_THRESHOLDS[level],
    xpForNextLevel: nextLevel ? LEVEL_THRESHOLDS[nextLevel] - LEVEL_THRESHOLDS[level] : null,
    heldByBoss: earned > level,
  };
}
