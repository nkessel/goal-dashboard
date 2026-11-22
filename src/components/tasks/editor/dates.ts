// The quest editor's small date and time helpers (moved out of QuestEditorDialog.tsx so the import page doesn't carry the whole editor).

export const pad = (n: number) => String(n).padStart(2, "0");
export function localDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** The due chip's label: "today", "tomorrow", "Fri", or "Nov 12". */
export function dueChipLabel(day: string) {
  const d = new Date(`${day}T12:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
/** One tap for the usual due dates: today, tomorrow, a week and two weeks from now. */
export function dueQuickPicks() {
  const at = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return localDate(d.toISOString());
  };
  // No "Next Friday"; two weeks instead (owner, Nov 7).
  return [
    { label: "Today", day: at(0) },
    { label: "Tomorrow", day: at(1) },
    { label: "In a week", day: at(7) },
    { label: "In 2 weeks", day: at(14) },
  ].filter((q, i, all) => all.findIndex((x) => x.day === q.day) === i);
}
/** "" for an end-of-day deadline (no particular time). */
export function localTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return t === "23:59" ? "" : t;
}
/** "3:30pm". */
export function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AaPp])\.?\s?[Mm]\.?$/, (_, p: string) => `${p.toLowerCase()}m`);
}
/** "Sat 3–3:30pm" this week, "Nov 20 3–3:30pm" further off. */
export function slotWords(s: { start: string; end: string }) {
  const d = new Date(s.start);
  const days = (d.getTime() - Date.now()) / 86_400_000;
  const day = days > -1 && days < 6 ? d.toLocaleDateString(undefined, { weekday: "short" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const a = shortTime(s.start).replace(":00", "");
  const b = shortTime(s.end).replace(":00", "");
  return `${day} ${a.slice(-2) === b.slice(-2) ? a.slice(0, -2) : a}–${b}`;
}
/** The plan-by for "Schedule within N days": the end of that day. */
export function planByIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}
export function dueIso(date: string, time: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || "23:59"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const ESTIMATE_PICKS = [5, 10, 15, 30];
