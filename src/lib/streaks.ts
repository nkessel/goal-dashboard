/**
 * Streaks of keeping away from something ("anti-habits"). Each one counts the
 * time since its last slip. A slip is any event (check-in note) that mentions
 * the streak's word, as #word or plain text, so events logged before the
 * streak existed count too.
 */

export type StreakDef = {
  id: string;
  /** What it's called, e.g. "No weed". */
  name: string;
  /** The word(s) that mark a slip in an event, e.g. "weed" or "weed, thc". */
  word: string;
  /** When counting began (the start if there's no slip since). */
  since: string;
};

export type StreakNote = { id: string; body: string; created_at: string };

/** Matches an event mentioning any of the words (comma-separated), as #word or plain text. */
export function slipMatcher(words: string) {
  const res = words
    .split(",")
    .map((w) => w.trim().toLowerCase().replace(/^#/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .map((w) => new RegExp(`(^|[^\\p{L}\\p{N}])#?${w}($|[^\\p{L}\\p{N}])`, "iu"));
  if (!res.length) return () => false;
  return (body: string) => res.some((re) => re.test(body));
}

export type StreakState = {
  start: number;
  /** Milliseconds since the start. */
  ms: number;
  days: number;
  best: number;
  slips: { id: string; at: number }[];
};

export const MILESTONES = [1, 3, 7, 14, 21, 30, 60, 90, 180, 365];

export function streakState(def: StreakDef, notes: StreakNote[], now = Date.now()): StreakState {
  const is = slipMatcher(def.word);
  const slips = notes
    .filter((n) => is(n.body))
    .map((n) => ({ id: n.id, at: Date.parse(n.created_at) }))
    .filter((s) => s.at <= now)
    .sort((a, b) => a.at - b.at);
  const since = Date.parse(def.since);
  const last = slips.length ? slips[slips.length - 1].at : null;
  const start = last ?? since;
  const ms = Math.max(0, now - start);
  // The longest clean run: between slips, and from the start to the first.
  const marks = [Math.min(since, slips[0]?.at ?? since), ...slips.map((s) => s.at), now];
  let best = 0;
  for (let i = 1; i < marks.length; i++) best = Math.max(best, marks[i] - marks[i - 1]);
  return { start, ms, days: Math.floor(ms / 86_400_000), best: Math.floor(best / 86_400_000), slips };
}

/** "18 hours", "1 day", "12 days". */
export function streakLabel(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  if (h < 24) return h <= 1 ? (ms < 3_600_000 ? "Just started" : "1 hour") : `${h} hours`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day" : `${d} days`;
}
