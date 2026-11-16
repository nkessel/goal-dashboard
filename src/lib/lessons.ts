/** "Complete lesson" buttons on habits (owner, Nov 16), kept in `life_wheel.lessons`: what a lesson pays, and each day's count. */
const ID = /^[0-9a-f-]{36}$/i;
export type LessonButton = { on: boolean; xp: number; coins: number };
export type LessonStore = { buttons: Record<string, LessonButton>; days: Record<string, Record<string, number>> };
export const LESSON_DEFAULT = { xp: 10, coins: 1 };
export function cleanLessons(raw: unknown): LessonStore {
  const r = (raw && typeof raw === "object" ? raw : {}) as { buttons?: unknown; days?: unknown };
  const num = (v: unknown, d: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : d);
  const buttons: Record<string, LessonButton> = {};
  for (const [k, v] of Object.entries((r.buttons && typeof r.buttons === "object" ? r.buttons : {}) as Record<string, unknown>)) {
    if (!ID.test(k) || !v || typeof v !== "object") continue;
    const b = v as Record<string, unknown>;
    buttons[k] = { on: b.on !== false, xp: num(b.xp, LESSON_DEFAULT.xp, 500), coins: num(b.coins, LESSON_DEFAULT.coins, 100) };
  }
  const days: LessonStore["days"] = {};
  for (const [d, v] of Object.entries((r.days && typeof r.days === "object" ? r.days : {}) as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !v || typeof v !== "object") continue;
    const row: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (ID.test(k) && num(n, 0, 99) > 0) row[k] = num(n, 0, 99);
    if (Object.keys(row).length) days[d] = row;
  }
  return { buttons, days };
}
