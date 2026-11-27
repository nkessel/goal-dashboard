import "server-only";
import * as tasksData from "@/lib/data/tasks";
import * as ritesData from "@/lib/data/rites";
import { supabaseAdmin } from "@/lib/supabase/server";
import { appDayKey } from "@/lib/data/tomorrow";
import { inDueWindow, byDuePriority, DEFAULT_DUE_HOURS } from "@/lib/due-soon";
import { oneStepPerProject } from "@/lib/next-action";
import { cleanRepeat, repeatIsUp } from "@/lib/habit-repeat";
import { readExtrasOf } from "@/lib/data/quest-ops";
import { DuetError, dayNames, isDay, weekdayOf } from "./pure";
import { habits as loadHabits, loadBoards, openQuests, pick, slotOf, type Row } from "./load";
import type { Args, Out } from "./types";

const NYC = "America/New_York";
const dueLabel = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: NYC, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

export const questView = (t: Row, boardLabel: (id: string | null | undefined) => string | null) => ({
  id: t.id,
  title: t.title,
  board: boardLabel(t.board_id),
  due: t.due_at ?? null,
  due_ny: dueLabel(t.due_at),
  importance: t.importance,
  urgency: t.urgency,
  xp: t.xp_value,
  minutes: t.estimate_minutes ?? null,
  ...(t.is_tiny ? { tiny: true } : {}),
  ...(t.is_aspiration ? { aspiration: true } : {}),
});

/** Today's Quests in order (as the Today screen lists them), the Additional count, and the day's habits and evening rites. */
export async function today(ownerId: string, args: Args): Promise<Out> {
  if (args.day !== undefined && args.day !== null && !isDay(args.day)) throw new DuetError("day must look like 2026-11-27.");
  const day = isDay(args.day) ? args.day : appDayKey();
  const [tasks, bl] = await Promise.all([tasksData.listOpenTasksForOwner(ownerId), loadBoards(ownerId)]);
  const nowMs = Date.now();
  const onToday = tasks.filter((t) => !t.needs_review);
  const awake = (t: { snoozed_until?: string | null }) => !t.snoozed_until || Date.parse(t.snoozed_until) <= nowMs;
  // The same split as the Today screen: due soon first (what's due next, then what slipped), then the chosen priorities.
  const dueTasks = onToday.filter((t) => awake(t) && !t.is_manual_priority && inDueWindow(t.due_at, nowMs, DEFAULT_DUE_HOURS) && !t.reward_id).sort(byDuePriority(nowMs));
  const rest = onToday.filter((t) => awake(t) && !dueTasks.includes(t));
  const priorities = rest.filter((t) => t.is_manual_priority);
  const extras = oneStepPerProject(rest.filter((t) => !t.is_manual_priority && t.in_additional !== false), bl.boards, tasks);
  const quests = [
    ...dueTasks.map((t) => ({ section: "due_soon", ...questView(t as Row, bl.label) })),
    ...priorities.map((t) => ({ section: "chosen", ...questView(t as Row, bl.label) })),
  ].map((q, i) => ({ n: i + 1, ...q }));

  // Habits and rites for that day.
  const [rows, extras2] = await Promise.all([loadHabits(ownerId), readExtrasOf(ownerId)]);
  const plan = (extras2.habitPlan ?? {}) as { core?: unknown; days?: Record<string, unknown> };
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const core = new Set(ids(plan.core));
  const picked = new Set(ids(plan.days?.[day]));
  const since = new Date(Date.parse(`${day}T12:00:00Z`) - 800 * 86_400_000).toISOString().slice(0, 10);
  const [done, skips, stepChecks] = await Promise.all([
    ritesData.listCompletionsFor(ownerId, rows.map((r) => r.id), since),
    ritesData.listHabitSkips(ownerId, since).then((s) => s ?? []),
    ritesData.listRiteStepChecks(ownerId, day).then((c) => (c ?? []).filter((x) => x.day === day)),
  ]);
  const wd = weekdayOf(day);
  const view = (h: (typeof rows)[number]) => {
    const rep = cleanRepeat(h.repeat);
    const mine = done.filter((c) => c.rite_id === h.id).map((c) => c.day);
    const mineSkips = skips.filter((c) => c.rite_id === h.id).map((c) => c.day);
    const steps = ritesData.cleanRiteSteps(h.steps);
    const ticked = new Set(stepChecks.filter((c) => c.rite_id === h.id).map((c) => c.step_id));
    const due = slotOf(h) !== "day" ? true : rep ? repeatIsUp(rep, day, mine, mineSkips) : !h.days || h.days.length === 0 || h.days.includes(wd);
    return {
      id: h.id,
      title: h.title,
      due_today: due,
      done: mine.includes(day),
      skipped: mineSkips.includes(day),
      xp: h.xp_value,
      repeats: rep ? `every ${rep.every} ${rep.unit}${rep.every === 1 ? "" : "s"}` : dayNames(h.days),
      time: h.due_time ?? null,
      // Sub-habits (tick_subhabit): ticking the last required one completes the habit.
      ...(steps.length ? { sub_habits: steps.map((st) => ({ id: st.id, title: st.title, done: ticked.has(st.id), ...(st.optional ? { optional: true } : {}), ...(st.xp ? { xp: st.xp } : {}) })) } : {}),
      ...(slotOf(h) === "day" ? { in_todays_quests: core.has(h.id) || picked.has(h.id) } : {}),
    };
  };
  const dayHabits = rows.filter((h) => slotOf(h) === "day").map(view).filter((h) => h.due_today);
  const evening = rows.filter((h) => slotOf(h) === "evening").map(view);
  return {
    summary: `${day}: ${quests.length} in Today's Quests, ${extras.length} in Additional Quests; ${dayHabits.filter((h) => h.done).length}/${dayHabits.length} daily habits done; ${evening.filter((h) => h.done).length}/${evening.length} evening rites done.`,
    data: { day, todays_quests: quests, additional_quests_count: extras.length, daily_habits: dayHabits, evening_rites: evening },
  };
}

/** Open quests, unarchived habits and boards whose names contain `q`. */
export async function find(ownerId: string, args: Args): Promise<Out> {
  const q = typeof args.q === "string" ? args.q.trim().toLowerCase() : "";
  const kind = args.kind === undefined ? null : String(args.kind);
  if (kind && !["quest", "habit", "board"].includes(kind)) throw new DuetError("kind must be quest, habit or board.");
  const has = (s: string) => !q || s.toLowerCase().includes(q);
  const bl = await loadBoards(ownerId);
  const out: Record<string, unknown[]> = {};
  if (!kind || kind === "quest") out.quests = (await openQuests(ownerId)).filter((t) => has(t.title)).slice(0, 40).map((t) => ({ ...questView(t, bl.label), status: t.status, where: t.is_manual_priority ? "today" : t.in_additional === false ? "board_only" : "additional" }));
  if (!kind || kind === "habit") out.habits = (await loadHabits(ownerId)).filter((h) => has(h.title)).slice(0, 40).map((h) => ({ id: h.id, title: h.title, slot: slotOf(h), days: dayNames(h.days), time: h.due_time ?? null, xp: h.xp_value }));
  if (!kind || kind === "board") out.boards = bl.boards.filter((b) => has(b.title)).slice(0, 40).map((b) => ({ id: b.id, title: b.title, path: bl.label(b.id), parent: bl.label(b.parent_board_id) }));
  const n = Object.values(out).reduce((a, l) => a + l.length, 0);
  return { summary: `${n} match${n === 1 ? "" : "es"}${q ? ` for "${args.q}"` : ""}.`, data: out };
}

/** A board's open quests in board order, and its sub-boards. */
export async function board(ownerId: string, args: Args): Promise<Out> {
  const bl = await loadBoards(ownerId);
  const b = pick(bl.boards, args.board, "board", (x) => bl.label(x.parent_board_id));
  const { data, error } = await supabaseAdmin().from("tasks").select("*").eq("owner_id", ownerId).eq("board_id", b.id).eq("status", "open").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw new DuetError(`Couldn't read the board: ${error.message}`);
  const quests = ((data ?? []) as Row[]).map((t, i) => ({ n: i + 1, ...questView(t, bl.label), where: t.is_manual_priority ? "today" : t.in_additional === false ? "board_only" : "additional" }));
  const subs = bl.boards.filter((x) => x.parent_board_id === b.id).map((x) => ({ id: x.id, title: x.title }));
  return { summary: `${bl.label(b.id)}: ${quests.length} open quest${quests.length === 1 ? "" : "s"}, ${subs.length} sub-board${subs.length === 1 ? "" : "s"}.`, data: { id: b.id, title: b.title, path: bl.label(b.id), quests, sub_boards: subs } };
}
