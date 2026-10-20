/**
 * The toucan's watchful eye: which important quests are slipping. Pure, so
 * it can be tested and run anywhere.
 *
 * A quest is worth a nudge when it matters (important, or due soon) and
 * nothing is moving it along: it isn't on the calendar ahead, and it hasn't
 * been touched in a while. The nudge says why, in a few words, and the next
 * move is always the same small ladder: estimate it, schedule it, do it.
 */

export type GuideTask = {
  id: string;
  title: string;
  importance: number | null;
  urgency: number | null;
  due_at: string | null;
  estimate_minutes: number | null;
  scheduled_start: string | null;
  is_on_calendar?: boolean | null;
  updated_at: string | null;
  created_at: string | null;
  reschedule_count?: number | null;
  board?: string | null;
};

export type Nudge = {
  id: string;
  title: string;
  /** Why it's being raised, e.g. "due Thursday, not on your calendar". */
  why: string;
  /** The rung of the ladder it's on. */
  step: "estimate" | "schedule" | "do";
  estimate: number | null;
  dueAt: string | null;
  board: string | null;
  score: number;
};

const DAY = 86_400_000;

function dayWord(due: Date, now: Date) {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(due);
  b.setHours(0, 0, 0, 0);
  const days = Math.round((b.getTime() - a.getTime()) / DAY);
  if (days < 0) return days === -1 ? "was due yesterday" : `was due ${-days} days ago`;
  if (days === 0) return "is due today";
  if (days === 1) return "is due tomorrow";
  if (days < 7) return `is due ${due.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `is due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Score every open quest and return the ones worth raising, most pressing first. */
export function neglected(tasks: GuideTask[], now = new Date(), snoozed: Record<string, string> = {}, limit = 3): Nudge[] {
  const out: Nudge[] = [];
  for (const t of tasks) {
    const until = snoozed[t.id];
    if (until && Date.parse(until) > now.getTime()) continue;
    const scheduledAhead = !!t.scheduled_start && Date.parse(t.scheduled_start) > now.getTime() - 3_600_000;
    if (scheduledAhead) continue;
    const imp = t.importance ?? 3;
    const due = t.due_at ? new Date(t.due_at) : null;
    const daysToDue = due ? (due.getTime() - now.getTime()) / DAY : null;
    const touched = Date.parse(t.updated_at ?? t.created_at ?? "") || now.getTime();
    const idle = Math.max(0, (now.getTime() - touched) / DAY);

    let score = 0;
    if (daysToDue !== null) score += daysToDue < 0 ? 6 : daysToDue < 1 ? 5 : daysToDue < 3 ? 4 : daysToDue < 7 ? 2.5 : daysToDue < 14 ? 1 : 0;
    score += Math.max(0, imp - 2) * 1.1;
    score += Math.min(3, idle / 4);
    score += Math.min(1.5, (t.reschedule_count ?? 0) * 0.5);
    // Only what genuinely matters: important or due within two weeks.
    if (imp < 4 && (daysToDue === null || daysToDue > 14)) continue;
    if (score < 3.2) continue;

    const parts: string[] = [];
    if (due) parts.push(dayWord(due, now));
    else if (imp >= 4) parts.push("is one of your important ones");
    parts.push("isn't on your calendar");
    if (idle >= 5) parts.push(`untouched for ${Math.floor(idle)} days`);
    out.push({
      id: t.id,
      title: t.title,
      why: parts.join(", "),
      step: t.estimate_minutes ? "schedule" : "estimate",
      estimate: t.estimate_minutes,
      dueAt: t.due_at,
      board: t.board ?? null,
      score,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The open quests as compact lines for the toucan to reason about. */
export function contextLines(tasks: GuideTask[], now = new Date(), max = 50): string[] {
  const scored = tasks
    .map((t) => {
      const due = t.due_at ? Date.parse(t.due_at) : null;
      const s = (t.importance ?? 3) * 2 + (due ? Math.max(0, 14 - (due - now.getTime()) / DAY) : 0);
      return { t, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, max);
  return scored.map(({ t }) => {
    const bits = [`"${t.title}"`];
    if (t.board) bits.push(`board: ${t.board}`);
    bits.push(`importance ${t.importance ?? 3}/5`);
    if (t.due_at) bits.push(`due ${new Date(t.due_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}`);
    bits.push(t.estimate_minutes ? `about ${t.estimate_minutes} min` : "no time estimate");
    if (t.scheduled_start && Date.parse(t.scheduled_start) > now.getTime()) bits.push(`scheduled ${new Date(t.scheduled_start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}`);
    else bits.push("not scheduled");
    const touched = Date.parse(t.updated_at ?? t.created_at ?? "");
    if (touched) bits.push(`last touched ${Math.max(0, Math.floor((now.getTime() - touched) / DAY))} days ago`);
    if ((t.reschedule_count ?? 0) > 1) bits.push(`rescheduled ${t.reschedule_count} times`);
    return `- ${bits.join(" · ")}`;
  });
}

/** Quests the reply names (by exact title, case aside), so they can get a "Plan it" button. */
export function mentioned(reply: string, tasks: { id: string; title: string }[]): { id: string; title: string }[] {
  const low = reply.toLowerCase();
  return tasks
    .filter((t) => t.title.trim().length >= 4 && low.includes(t.title.trim().toLowerCase()))
    .sort((a, b) => low.indexOf(a.title.toLowerCase()) - low.indexOf(b.title.toLowerCase()))
    .slice(0, 3);
}
