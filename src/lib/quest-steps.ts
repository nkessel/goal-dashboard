/** A quest's steps (a checklist that can nest): order, weights, and what they add up to. Shared by the editor and the card's steps tray. */

export type StepDraft = { key: string; id?: string; title: string; done: boolean; xp?: number; weight?: number | null; progress?: number; state?: "skipped" | "failed" | null; parentKey?: string | null };

/** Steps that hold sub-tasks of their own (they count through those). */
export const parentKeys = (list: StepDraft[]) => new Set(list.map((st) => st.parentKey).filter(Boolean) as string[]);
/** A step and everything inside it. */
export function descendants(list: StepDraft[], key: string): Set<string> {
  const out = new Set<string>([key]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const st of list) if (st.parentKey && out.has(st.parentKey) && !out.has(st.key)) (out.add(st.key), (grew = true));
  }
  return out;
}
/** In the order you'd do them: each step, then whatever sits inside it. */
export function treeOrder<T extends { key: string; parentKey?: string | null }>(list: T[]): T[] {
  const keys = new Set(list.map((st) => st.key));
  const kids = new Map<string | null, T[]>();
  for (const st of list) {
    const p = st.parentKey && keys.has(st.parentKey) ? st.parentKey : null;
    kids.set(p, [...(kids.get(p) ?? []), st]);
  }
  const out: T[] = [];
  const walk = (p: string | null) => {
    for (const st of kids.get(p) ?? []) {
      out.push(st);
      walk(st.key);
    }
  };
  walk(null);
  return out;
}

/** What each step is worth (0–1): its own percent, or an equal share of what's left. Steps holding sub-tasks count through them. */
export function stepWeights(list: StepDraft[]): number[] {
  // A skipped step is left out: the others share the quest between them.
  const holders = parentKeys(list);
  const live = list.filter((st) => st.state !== "skipped" && !holders.has(st.key));
  const fixed = live.reduce((n, st) => n + (st.weight ?? 0), 0);
  const free = live.filter((st) => !st.weight).length;
  const rest = Math.max(0, 100 - fixed);
  const total = fixed + (free ? rest : 0) || 1;
  return list.map((st) => (st.state === "skipped" || holders.has(st.key) ? 0 : (st.weight ?? (free ? rest / free : 0)) / total));
}
/** How much of the quest the steps add up to (0–100). */
export function stepsShare(list: StepDraft[]): number {
  const w = stepWeights(list);
  return Math.round(list.reduce((n, st, i) => n + w[i] * (st.done ? 1 : (st.progress ?? 0) / 100), 0) * 100);
}
export const stepPayload = (list: StepDraft[]) => treeOrder(list).map(({ key, id, title, done, xp, weight, progress, state, parentKey }) => ({ key, id, parentKey: parentKey ?? null, title, done, xp: xp ?? 0, weight: weight ?? null, progress: done ? 100 : (progress ?? 0), state: done ? null : (state ?? null) }));
