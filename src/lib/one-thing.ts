import type { Task } from "@/lib/data/types";

/**
 * "One Thing": the single quest most worth doing next, scored as
 * urgency × importance ÷ effort. A close deadline raises urgency; an unrated
 * quest counts as low on both; effort falls back to the time estimate.
 */

/** 1–5 effort, from the rating or (failing that) the time estimate. */
export function effortOf(t: Pick<Task, "effort" | "estimate_minutes">): number {
  if (t.effort && t.effort > 0) return t.effort;
  const m = t.estimate_minutes;
  if (m == null) return 2.5;
  if (m <= 15) return 1;
  if (m <= 30) return 2;
  if (m <= 60) return 3;
  if (m <= 120) return 4;
  return 5;
}

/** Urgency 0–5, raised when a deadline is near or past. */
export function urgencyOf(t: Pick<Task, "urgency" | "due_at">, now: number): number {
  let u = t.urgency || 0;
  if (t.due_at) {
    const hours = (new Date(t.due_at).getTime() - now) / 3_600_000;
    if (hours < 0) u = Math.max(u, 5);
    else if (hours < 24) u = Math.max(u, 4.5);
    else if (hours < 72) u = Math.max(u, 3.5);
  }
  return u;
}

export function oneThingScore(t: Task, now: number): number {
  const u = Math.max(0.5, urgencyOf(t, now));
  const i = Math.max(0.5, t.importance || 0);
  const pinned = t.is_manual_priority ? 1.15 : 1;
  return ((u * i) / effortOf(t)) * pinned;
}

/** Quests that can actually be done right now. */
export function isActionable(t: Task): boolean {
  return t.status === "open" && !t.needs_review && !t.is_aspiration && !t.locked_by_task_id && !t.reward_id;
}

export function rankOneThing<T extends Task>(tasks: T[], now: number): T[] {
  return tasks
    .filter(isActionable)
    .map((t) => ({ t, s: oneThingScore(t, now) }))
    .sort((a, b) => b.s - a.s || (a.t.due_at ?? "9").localeCompare(b.t.due_at ?? "9"))
    .map((x) => x.t);
}

/** A short, plain reason this quest came up. */
export function whyThisOne(t: Task, now: number): string {
  const parts: string[] = [];
  const u = urgencyOf(t, now);
  const i = t.importance || 0;
  if (t.due_at) {
    const hours = (new Date(t.due_at).getTime() - now) / 3_600_000;
    if (hours < 0) parts.push("It's past due");
    else if (hours < 24) parts.push("It's due within a day");
    else if (hours < 72) parts.push("It's due in the next few days");
  }
  if (!parts.length) {
    if (u >= 4 && i >= 4) parts.push("It's urgent and important");
    else if (i >= 4) parts.push("It matters a lot");
    else if (u >= 4) parts.push("It's pressing");
    else if (!u && !i) parts.push("It hasn't been rated yet, but it's next in line");
    else parts.push("It's your best balance of payoff and effort");
  }
  const e = effortOf(t);
  if (t.estimate_minutes != null && t.estimate_minutes <= 30) parts.push(`it only takes about ${t.estimate_minutes} minutes`);
  else if (e <= 1.5) parts.push("it's light work");
  return parts.length > 1 ? `${parts[0]}, and ${parts.slice(1).join(", ")}.` : `${parts[0]}.`;
}
