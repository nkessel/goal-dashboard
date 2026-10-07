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
