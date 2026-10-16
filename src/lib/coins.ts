/** XP it takes to earn one coin. Coins are meant to feel special. */
export const XP_PER_COIN = 30;

/** Coins that come automatically with an XP award: 1 per 30 XP, rounded down. */
export function coinsForXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_COIN);
}
