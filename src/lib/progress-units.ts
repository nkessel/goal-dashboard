/**
 * How a quest's progress is counted. Percent by default; a quest can count something
 * instead ("12 of 32 pages"). Kept on the account (`life_wheel.progressUnits`, by quest id)
 * until it earns columns of its own; the quest's own `progress` (percent) stays the source
 * for XP, worked out from the count.
 */
export type ProgressUnit = { total: number; unit: string; done: number };

export function cleanUnit(raw: unknown): ProgressUnit | null {
  const r = (raw ?? {}) as Partial<ProgressUnit>;
  const total = Math.round(Number(r.total));
  if (!Number.isFinite(total) || total < 1 || total > 100000) return null;
  const done = Math.max(0, Math.min(total, Math.round(Number(r.done) || 0)));
  const unit = String(r.unit ?? "").replace(/\s+/g, " ").trim().slice(0, 24) || "pages";
  return { total, unit, done };
}

export function cleanUnits(raw: unknown): Record<string, ProgressUnit> {
  const out: Record<string, ProgressUnit> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const u = cleanUnit(v);
    if (u && /^[0-9a-f-]{36}$/i.test(k)) out[k] = u;
  }
  return out;
}

export const pctOf = (u: ProgressUnit) => Math.round((u.done / u.total) * 100);
/** "12 of 32 pages" */
export const unitLabel = (u: ProgressUnit) => `${u.done} of ${u.total} ${u.unit}`;
