/**
 * Habits done more than once a day (owner, Nov 16: "every tick of the checkbox gives another completion"),
 * kept in `life_wheel.habitTicks`: which habits count every tick, and each day's ticks after the first
 * (the first is the habit's usual completion) with what each one paid, so an undo takes back exactly that.
 */
const ID = /^[0-9a-f-]{36}$/i;
export type HabitTicks = { many: string[]; days: Record<string, Record<string, [number, number][]>> };
/** What the page sends with Today: the habits that count every tick, and today's extra ticks. */
export type HabitTicksSeed = { many: string[]; today: Record<string, number> };

export function cleanHabitTicks(raw: unknown): HabitTicks {
  const r = (raw && typeof raw === "object" ? raw : {}) as { many?: unknown; days?: unknown };
  const many = Array.isArray(r.many) ? [...new Set(r.many.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, 200) : [];
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-max, Math.min(max, Math.round(v))) : 0);
  const days: HabitTicks["days"] = {};
  for (const [d, v] of Object.entries((r.days && typeof r.days === "object" ? r.days : {}) as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !v || typeof v !== "object") continue;
    const row: Record<string, [number, number][]> = {};
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (!ID.test(k) || !Array.isArray(list)) continue;
      const paid = list.filter((p) => Array.isArray(p)).slice(0, 50).map((p) => [n((p as unknown[])[0], 1000), n((p as unknown[])[1], 1000)] as [number, number]);
      if (paid.length) row[k] = paid;
    }
    if (Object.keys(row).length) days[d] = row;
  }
  return { many, days };
}

export function habitTicksSeed(raw: unknown, day: string): HabitTicksSeed {
  const t = cleanHabitTicks(raw);
  return { many: t.many, today: Object.fromEntries(Object.entries(t.days[day] ?? {}).map(([k, v]) => [k, v.length])) };
}
