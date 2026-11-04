"use client";

import type { Task } from "@/lib/data/types";
import { schedulerContextAction } from "@/app/actions";
import { SCHEDULER_DEFAULTS, localDayKey, planSchedule, type Busy, type SchedulerSettings } from "@/lib/auto-schedule";
import { habitBlocksOn } from "@/lib/timed-habits";

function local<T>(key: string, pick: (v: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? pick(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * The first free slot for one quest (owner, Nov 3: "a button for the next list item to be automatically placed
 * in an available slot"): around your calendars, quests already placed, habits with a time and the daily
 * essentials, by the planner's own rules. With `day`, only on that day. Null when nothing fits.
 */
export async function findSlot(task: Pick<Task, "id" | "title" | "estimate_minutes" | "effort" | "due_at" | "plan_by">, day?: Date): Promise<{ start: Date; end: Date } | null> {
  const now = new Date();
  let from = now;
  if (day) {
    const d0 = new Date(day);
    d0.setHours(0, 0, 0, 0);
    if (d0.getTime() > now.getTime()) from = d0;
  }
  const to = new Date(from);
  to.setDate(to.getDate() + (day ? 1 : 15));
  const hidden = local("calendar-layers", (v) => (v as { hidden?: string[] }).hidden ?? []) ?? [];
  const ctx = await schedulerContextAction(from.toISOString(), to.toISOString(), hidden, day ? localDayKey(from) : undefined);
  const settings: SchedulerSettings = { ...SCHEDULER_DEFAULTS, ...(local("auto-schedule", (v) => v as Partial<SchedulerSettings>) ?? {}), ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) };
  // Calendars that only inform (subscriptions, other people's) don't block time unless you've said so.
  const fyi = new Set(settings.fyi ?? (ctx.calendars ?? []).filter((c) => !c.writable && !c.primary).map((c) => c.id));
  const busy: Busy[] = ctx.busy.filter((b) => !b.cal || !fyi.has(b.cal)).map((b) => ({ start: b.start, end: b.end }));
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) busy.push(...habitBlocksOn(ctx.habits ?? [], d, ctx.busy).map((b) => ({ start: b.start, end: b.end })));
  const eff = day ? { ...settings, horizon: 1, maxPerDay: Math.max(settings.maxPerDay, 16 * 60), skipWeekends: false } : settings;
  const plan = planSchedule([{ id: task.id, title: task.title, minutes: task.estimate_minutes, effort: task.effort ?? null, dueAt: task.due_at ?? null, planBy: task.plan_by ?? null }], busy, eff, from);
  const p = plan.placed[0];
  return p ? { start: p.start, end: p.end } : null;
}
