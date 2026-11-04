/**
 * Friends to keep in touch with (owner, Nov 4): each has a 0–10 bar of how much reaching out is due.
 * A friend can rise on their own at a set pace (full after `fullDays`), or only when moved by hand.
 * `need` was set on `at` (YYYY-MM-DD); today's level adds what it's risen since. Kept in life_wheel.keepInTouch.
 */
export type Friend = { id: string; name: string; need: number; at: string; fullDays: number | null };

export const PACES: { days: number | null; label: string }[] = [
  { days: null, label: "Only by hand" },
  { days: 7, label: "A week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "A month" },
  { days: 90, label: "3 months" },
];

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today's level: what was set plus what it's risen since, at most 10. */
export function needOn(f: Friend, day: string): number {
  if (!f.fullDays) return f.need;
  const days = Math.max(0, (Date.parse(`${day}T12:00:00`) - Date.parse(`${f.at}T12:00:00`)) / 86_400_000);
  return Math.min(10, f.need + (days * 10) / f.fullDays);
}

export function normalizeFriends(raw: unknown): Friend[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Friend => !!x && typeof x === "object" && typeof (x as Friend).name === "string")
    .slice(0, 100)
    .map((x) => ({
      id: String(x.id).slice(0, 40),
      name: x.name.slice(0, 60),
      need: Math.max(0, Math.min(10, Number(x.need) || 0)),
      at: /^\d{4}-\d{2}-\d{2}$/.test(String(x.at)) ? x.at : dayKeyOf(new Date()),
      fullDays: x.fullDays && Number(x.fullDays) > 0 ? Math.min(365, Number(x.fullDays)) : null,
    }));
}
