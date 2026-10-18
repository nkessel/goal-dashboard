/** Secret missions: private long quests with steps, kept in Settings. */
export type MissionStep = { id: string; title: string; done: boolean };
export type Mission = { id: string; title: string; notes: string; steps: MissionStep[]; createdAt: string; doneAt: string | null };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Tidy whatever was stored or sent into a safe list of missions. */
export function cleanMissions(raw: unknown): Mission[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const o = m as Record<string, unknown>;
    const title = str(o.title, 140);
    if (!title || typeof o.id !== "string") return [];
    const steps = Array.isArray(o.steps)
      ? o.steps.slice(0, 100).flatMap((s) => {
          const so = (s ?? {}) as Record<string, unknown>;
          const t = str(so.title, 200);
          return t && typeof so.id === "string" ? [{ id: so.id.slice(0, 64), title: t, done: so.done === true }] : [];
        })
      : [];
    return [{ id: o.id.slice(0, 64), title, notes: typeof o.notes === "string" ? o.notes.slice(0, 2000) : "", steps, createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(), doneAt: typeof o.doneAt === "string" ? o.doneAt : null }];
  });
}
