/**
 * Rituals of connection (a couples covenant, the wheel of consent…): not daily habits,
 * just things you do together now and then. Each keeps the days it was done, so you can
 * see how long it's been. Stored in `profiles.life_wheel.rituals`.
 */
export type Ritual = { id: string; title: string; note?: string | null; log: string[] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function cleanRituals(raw: unknown): Ritual[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      id: String(r.id ?? "").slice(0, 40),
      title: String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      note: typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 600) : null,
      log: [...new Set((Array.isArray(r.log) ? r.log : []).filter((d): d is string => typeof d === "string" && DAY.test(d)))].sort().reverse().slice(0, 400),
    }))
    .filter((r) => r.id && r.title)
    .slice(0, 40);
}

/** Whole days between two YYYY-MM-DD keys (b after a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** "Today", "Yesterday", "12 days ago", "3 months ago"… */
export function sinceLabel(last: string | undefined, today: string) {
  if (!last) return "Not yet";
  const d = daysBetween(last, today);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 45) return `${d} days ago`;
  if (d < 365) return `${Math.round(d / 30)} months ago`;
  const y = Math.floor(d / 365);
  return y === 1 ? "A year ago" : `${y} years ago`;
}
