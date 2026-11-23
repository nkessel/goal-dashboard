// The quest editor's "when" as one value (When 2, docs/plans/2026-11-17-due-and-scheduling-plan.md section 3).
// Pure: no React, no server; callers pass `now`. The editor keeps its fields as they were (a due date and time,
// "plan within N days", the picked slot) so Save and the drafts are unchanged; this file reads them as one
// WhenValue for the pill's words and turns a choice in the panel back into those fields.
//
//   Fixed    = a due date (due_at), and on the auto-scheduler's list aimed at that day (plan_by).
//   Flexible = plan_by only ("within N days" from today), no due date. It never reads as overdue.

import { addDaysYmd, whenWords, ymd, type WhenValue } from "@/lib/when";

/** The ranges, in the words the import card already uses (owner, Nov 18). */
export const WHEN_RANGES = [
  { label: "Within a week", days: 7 },
  { label: "Within 2 weeks", days: 14 },
  { label: "Within a month", days: 30 },
] as const;

export type EditorWhenFields = { dueDate: string; dueTime: string; planDays: number | null };
type Slot = { start: string; end: string };

const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T12:00`).getTime() - new Date(`${b}T12:00`).getTime()) / 86_400_000);

/** Days from today to a local YYYY-MM-DD (never below 0). */
export function daysTo(day: string, now: Date): number {
  return Math.max(0, dayDiff(day, ymd(now)));
}

export function isRange(days: number | null): boolean {
  return days != null && WHEN_RANGES.some((r) => r.days === days);
}

/** The editor's fields as one WhenValue. */
export function editorWhen(f: EditorWhenFields, slot: Slot | null, now: Date): WhenValue {
  const today = ymd(now);
  let by: WhenValue["by"] = null;
  if (f.dueDate) by = { firm: true, date: f.dueDate, ...(f.dueTime ? { time: f.dueTime } : {}) };
  else if (f.planDays != null) by = isRange(f.planDays) ? { firm: false, withinDays: f.planDays, from: today } : { firm: false, date: addDaysYmd(today, f.planDays) };
  return { by, sessions: slot ? [slot] : [] };
}

/** The pill's face ("Within a week", "By Fri · Thu 3pm", "Due today"), and whether it reads late (red). */
export function editorWhenFace(f: EditorWhenFields, slot: Slot | null, now: Date): { words: string; late: boolean } {
  const v = editorWhen(f, slot, now);
  let words = whenWords(v, now);
  // The ranges read as the panel names them ("Within a month", not "This month").
  if (v.by && !v.by.firm && "withinDays" in v.by && v.by.withinDays === 30) words = words.replace(/^This month/, "Within a month");
  const late = !!v.by?.firm && /^(Overdue|Due today)/.test(words);
  return { words: v.by || slot ? words : "When", late };
}

/** What a choice in the panel does to the fields. `firm` is the switch; null leaves it as it is. */
export type WhenChoice =
  | { kind: "day"; day: string }
  | { kind: "range"; days: number }
  | { kind: "firm"; firm: boolean }
  | { kind: "clear" };

export function applyWhenChoice(f: EditorWhenFields, c: WhenChoice, now: Date): EditorWhenFields {
  const today = ymd(now);
  const fixed = !!f.dueDate;
  switch (c.kind) {
    case "clear":
      return { dueDate: "", dueTime: "", planDays: null };
    case "range":
      // A range is a goal (Flexible), as on the import card.
      return { dueDate: "", dueTime: "", planDays: c.days };
    case "day":
      // A day keeps the switch where it is; with nothing set yet it starts Flexible.
      return fixed ? { dueDate: c.day, dueTime: f.dueTime, planDays: daysTo(c.day, now) } : { dueDate: "", dueTime: "", planDays: daysTo(c.day, now) };
    case "firm":
      if (c.firm === fixed) return f;
      if (c.firm) {
        // Flexible -> Fixed: a range becomes its last day ("Within a week" -> the day a week from today).
        if (f.planDays == null) return f;
        return { dueDate: addDaysYmd(today, f.planDays), dueTime: "", planDays: f.planDays };
      }
      // Fixed -> Flexible: "Around <that day>".
      return { dueDate: "", dueTime: "", planDays: daysTo(f.dueDate, now) };
  }
}
