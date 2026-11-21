/**
 * One look for every occurrence of a repeating calendar event (owner, Nov 18: "give recurring events …
 * the same portrait for each occurrence … after filling in the portrait/other info for one, it asks if you
 * want to save that for all occurrences, or all future occurrences, or just this one").
 *
 * A series is keyed by where it comes from: `g:<Google recurring event id>`. Its look is a list of
 * entries, each starting on a day (`from`, YYYY-MM-DD) or from the start (`from: null`); the latest entry
 * that has started is the one a day wears. "All" replaces the list, "This and later" adds an entry.
 * Kept in `profiles.life_wheel.seriesLooks`; which quest belongs to which series in `life_wheel.questSeries`.
 */

export type SeriesLook = {
  iconKey?: string | null;
  iconSource?: "monster" | "library" | "ai" | null;
  xp?: number;
  coins?: number | null;
  boardId?: string | null;
  color?: string | null;
  /** The calendar card's own colour or picture (`life_wheel.calCardLooks`). */
  card?: { color?: string; image?: string } | null;
};

export type SeriesEntry = { from: string | null; look: SeriesLook };
export type SeriesScope = "one" | "following" | "all";

export const SCOPE_LABELS: Record<SeriesScope, string> = {
  one: "Just this one",
  following: "This and later",
  all: "All",
};

/** The look a day of the series wears, or null when none was saved. */
export function lookFor(entries: SeriesEntry[] | null | undefined, day: string): SeriesLook | null {
  let best: SeriesEntry | null = null;
  for (const e of entries ?? []) {
    if (e.from && e.from > day) continue;
    if (!best || (e.from ?? "") >= (best.from ?? "")) best = e;
  }
  return best?.look ?? null;
}

/** The series' entries after saving a look with the scope chosen ("one" changes nothing here). */
export function withLook(entries: SeriesEntry[] | null | undefined, look: SeriesLook, scope: SeriesScope, day: string): SeriesEntry[] {
  const list = [...(entries ?? [])];
  if (scope === "all") return [{ from: null, look }];
  if (scope === "following") return [...list.filter((e) => !e.from || e.from < day), { from: day, look }].slice(-20);
  return list;
}

/** Two looks the same? (Fields left out on either side don't count.) */
export function sameLook(a: SeriesLook, b: SeriesLook): boolean {
  const keys: (keyof SeriesLook)[] = ["iconKey", "xp", "coins", "boardId", "color", "card"];
  return keys.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}
