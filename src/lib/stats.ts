/** Character stats a quest's XP can build. Anyone can add their own. */
export const DEFAULT_STATS = ["Strength", "Intelligence", "Charisma", "Wisdom", "Dexterity", "Constitution"] as const;

/** Percent of a quest's XP sent to each stat (0–100, summing to at most 100). */
export type StatSplit = Record<string, number>;

export function cleanStatName(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, 24);
}

/** Drops zeros and bad values; caps the total at 100 by trimming evenly. */
export function normalizeSplit(split: StatSplit): StatSplit {
  const out: StatSplit = {};
  for (const [k, v] of Object.entries(split ?? {})) {
    const n = Math.round(Number(v));
    const name = cleanStatName(k);
    if (name && Number.isFinite(n) && n > 0) out[name] = Math.min(100, n);
  }
  let total = Object.values(out).reduce((a, b) => a + b, 0);
  while (total > 100) {
    const keys = Object.keys(out).filter((k) => out[k] > 0);
    const each = Math.max(1, Math.floor((total - 100) / keys.length));
    for (const k of keys) {
      if (total <= 100) break;
      const cut = Math.min(out[k], each, total - 100);
      out[k] -= cut;
      total -= cut;
    }
  }
  for (const k of Object.keys(out)) if (out[k] <= 0) delete out[k];
  return out;
}

/**
 * Set one stat's share; if the total would pass 100%, the stat chosen most
 * recently gives up the difference, then the one before it (none goes below
 * zero). `picked` lists the stats in the order they were chosen.
 */
export function setShare(split: StatSplit, stat: string, pct: number, picked: string[] = []): StatSplit {
  const next: StatSplit = { ...split, [stat]: Math.max(0, Math.min(100, Math.round(pct))) };
  let over = Object.values(next).reduce((a, b) => a + b, 0) - 100;
  // Past 100%: take from the stat chosen most recently, then the one before it once that's drained.
  const at = (k: string) => picked.lastIndexOf(k);
  const others = Object.keys(next)
    .filter((k) => k !== stat)
    .reverse()
    .sort((a, b) => at(b) - at(a));
  for (const k of others) {
    if (over <= 0) break;
    const cut = Math.min(next[k], over);
    next[k] -= cut;
    over -= cut;
  }
  if (over > 0) next[stat] -= over;
  for (const k of Object.keys(next)) if (next[k] <= 0) delete next[k];
  return next;
}

/** A stat's level from its XP: gentle steps (50, 150, 300, 500, …). */
export function statLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let floor = 0;
  let step = 50;
  while (xp >= floor + step) {
    floor += step;
    level += 1;
    step += 50;
  }
  return { level, into: xp - floor, need: step };
}

/** Short marks for the built-in stats; others get their first letters. */
const ABBR: Record<string, string> = { Strength: "STR", Intelligence: "INT", Charisma: "CHA", Wisdom: "WIS", Dexterity: "DEX", Constitution: "CON" };
export const statAbbr = (name: string) => ABBR[name] ?? name.slice(0, 3).toUpperCase();
