"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { completeRiteForOwner, uncompleteRiteForOwner, createRiteForOwner, updateRiteForOwner, setTaskPlacementForOwner, finishTaskForOwner as finishTask } from "@/lib/data/quest-ops";
import * as ritesData from "@/lib/data/rites";
import { revalidatePath } from "next/cache";
import * as winsData from "@/lib/data/wins";
import { listEvents, deleteCalendarEvent } from "@/lib/google-calendar";
import * as tasksData from "@/lib/data/tasks";
import { sessionRef, sessionIdOf } from "@/lib/calendar-task-window";
import * as xp from "@/lib/data/xp";
import { readEventQuestSettings as readEventQuestSettingsOf } from "@/lib/data/event-quests";
import * as boardsData from "@/lib/data/boards";
import * as bossesData from "@/lib/data/bosses";
import * as profilesData from "@/lib/data/profiles";
import { computeLevelForXp } from "@/lib/levels";
import * as energyData from "@/lib/data/energy";
import * as tomorrowData from "@/lib/data/tomorrow";
import { writeExtra } from "@/lib/data/extras";
import { byDuePriority } from "@/lib/due-soon";
import { cleanRepeat, repeatIsUp } from "@/lib/habit-repeat";
import { signIn, CALENDAR_AUTH_PARAMS } from "@/auth";
import * as schedulingData from "@/lib/data/scheduling";
import { requireProfileId, assertDay, requireSessionMaybeGoogle, moveSession, attachCalendarEvent, readExtras, guideTasks, cleanPriorities, type Priority } from "./_shared";
import { deleteTaskAction } from "./quests";

/** Complete a rite for your local `day` (YYYY-MM-DD); pays its XP once per day. */
/** Complete a rite for `day`; `pct` below 100 marks it done in part, for that share of its XP. */
/** When a habit was done that day, changed after the fact (owner, Nov 9: "including changing the completion time"). */
export async function setRiteDoneTimeAction(riteId: string, day: string, at: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const when = new Date(at);
  if (!Number.isFinite(when.getTime())) throw new Error("That time doesn't look right.");
  if (when.getTime() > Date.now() + 60_000) throw new Error("That's in the future.");
  const { data, error } = await supabaseAdmin().from("rite_completions").update({ completed_at: when.toISOString() }).eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day).select("id");
  if (error) throw new Error(`Couldn't change the time: ${error.message}`);
  if (!data?.length) throw new Error("That habit isn't marked done that day.");
}

export async function completeRiteAction(riteId: string, day: string, pct = 100) {
  const ownerId = await requireProfileId();
  return completeRiteForOwner(ownerId, riteId, day, pct);
}

/** Undo a rite completion for `day` and take back its XP. */
export async function uncompleteRiteAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  await uncompleteRiteForOwner(ownerId, riteId, day);
}

export async function createRiteAction(input: { title: string; description?: string; isCore: boolean; xpValue?: number; slot?: "evening" | "day"; days?: number[] | null; dueTime?: string | null } & ritesData.HabitExtras) {
  const ownerId = await requireProfileId();
  return createRiteForOwner(ownerId, input);
}

export async function updateRiteAction(riteId: string, input: { title?: string; description?: string; isCore?: boolean; xpValue?: number; days?: number[] | null; dueTime?: string | null } & ritesData.HabitExtras) {
  const ownerId = await requireProfileId();
  await updateRiteForOwner(ownerId, riteId, input);
}

export async function reorderRitesAction(ids: string[]) {
  const ownerId = await requireProfileId();
  await ritesData.reorderRites(ownerId, ids.slice(0, 100));
  revalidatePath("/");
}

export async function removeRiteAction(riteId: string) {
  const ownerId = await requireProfileId();
  await ritesData.archiveRite(riteId, ownerId);
  revalidatePath("/");
}

/** Undo a just-removed rite. */
export async function restoreRiteAction(riteId: string) {
  const ownerId = await requireProfileId();
  await ritesData.restoreRite(riteId, ownerId);
  revalidatePath("/");
}

/** Skip a habit for `day` on purpose (ends its streak). */
export async function skipHabitAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  await ritesData.addHabitSkip(ownerId, riteId, day);
  revalidatePath("/");
}

export async function unskipHabitAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  await ritesData.removeHabitSkip(ownerId, riteId, day);
  revalidatePath("/");
}

/** Wins since `sinceISO` (at most 31 days back) for the evening's "Appreciate recent wins". */
export async function listRecentWinsAction(sinceISO: string) {
  const ownerId = await requireProfileId();
  const since = new Date(sinceISO);
  if (Number.isNaN(since.getTime())) throw new Error("Bad date.");
  const floor = Date.now() - 31 * 86_400_000;
  return winsData.listWinsSince(ownerId, new Date(Math.max(since.getTime(), floor)).toISOString());
}

// Planning tomorrow's day (the evening's "Plan tomorrow's day" rite)
export type DayPlan = {
  events: { id: string; title: string; start: string; end: string; isAllDay: boolean; location?: string | null; description?: string | null; calendarName?: string | null }[];
  quests: { id: string; title: string; start: string; end: string; icon_key: string | null; icon_source: string | null; status: string }[];
  calendarConnected: boolean;
};

/** What's already on a day: Google appointments (when connected) and quests placed there. */
export async function getDayPlanAction(startISO: string, endISO: string): Promise<DayPlan> {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Bad day.");
  const [events, tasks] = await Promise.all([
    accessToken ? listEvents(accessToken, start, end).catch(() => []) : Promise.resolve([]),
    tasksData.listCalendarTasksForOwner(profileId, start, end),
  ]);
  const linked = new Set(tasks.map((t) => t.google_calendar_event_id).filter(Boolean));
  return {
    calendarConnected: !!accessToken,
    events: events.filter((e) => !linked.has(e.id)).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, isAllDay: e.isAllDay, location: e.location ?? null, description: e.description ? e.description.slice(0, 600) : null, calendarName: e.calendarName ?? null })),
    quests: tasks
      .filter((t) => t.scheduled_start && t.scheduled_end)
      .map((t) => ({ id: sessionRef(t), title: t.title, start: t.scheduled_start!, end: t.scheduled_end!, icon_key: t.icon_key ?? null, icon_source: t.icon_source ?? null, status: t.status })),
  };
}

/** Place (or move) a quest in a day plan. Planning moves don't count as reschedules. */
export async function planQuestAtAction(taskId: string, startISO: string, endISO: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const sid = sessionIdOf(taskId);
  if (sid) {
    await moveSession(accessToken, profileId, sid, new Date(startISO), new Date(endISO));
    revalidatePath("/");
    revalidatePath("/calendar");
    return;
  }
  const task = await tasksData.getTask(taskId, profileId);
  if (!task) throw new Error("That quest isn't here anymore.");
  await attachCalendarEvent(accessToken, profileId, task, new Date(startISO), new Date(endISO), false);
  revalidatePath("/");
  revalidatePath("/calendar");
}

/**
 * A planning item (a meal, a workout…) placed straight onto tomorrow's plan
 * as a small quest. Planning it pays `planXp` now (taken back if it comes
 * off the plan); doing it tomorrow pays its own `xp`.
 */
export async function planQuickEventAction(input: { title: string; startISO: string; endISO: string; xp?: number; planXp?: number }) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const title = input.title.trim().slice(0, 80);
  if (!title) throw new Error("Name it first.");
  const minutes = Math.round((new Date(input.endISO).getTime() - new Date(input.startISO).getTime()) / 60_000);
  const task = await tasksData.createTask(profileId, { title, xpValue: Math.max(0, Math.round(input.xp ?? 5)), estimateMinutes: minutes > 0 ? minutes : null });
  // Lives on the calendar, not in Additional Quests.
  await tasksData.setTaskInAdditional(task.id, profileId, false).catch(() => null);
  await attachCalendarEvent(accessToken, profileId, task, new Date(input.startISO), new Date(input.endISO), false);
  const planXp = Math.max(0, Math.min(100, Math.round(input.planXp ?? 0)));
  let coinsEarned = 0;
  const { error: markErr } = await supabaseAdmin().from("tasks").update({ plan_xp: planXp }).eq("id", task.id).eq("owner_id", profileId);
  if (!markErr && planXp > 0) coinsEarned = (await xp.awardXp(profileId, planXp, "task_completed")).coinsEarned;
  revalidatePath("/");
  revalidatePath("/calendar");
  return { id: task.id, xp: markErr ? 0 : planXp, coinsEarned };
}

/**
 * Take a quest back off the calendar (and off Google Calendar, when
 * connected). A planning item made from the planner goes away entirely, and
 * the XP its planning paid is taken back.
 */
export async function unscheduleTaskAction(taskId: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  // One of a quest's further sessions: only that session comes off.
  const sid = sessionIdOf(taskId);
  if (sid) {
    const sess = await tasksData.getTaskSession(sid, profileId);
    if (sess?.google_calendar_event_id && accessToken) await deleteCalendarEvent(accessToken, sess.google_calendar_event_id).catch(() => {});
    await tasksData.deleteTaskSession(sid, profileId);
    revalidatePath("/");
    revalidatePath("/calendar");
    return;
  }
  const { data: t } = await supabaseAdmin().from("tasks").select("plan_xp, status").eq("id", taskId).eq("owner_id", profileId).maybeSingle<{ plan_xp: number | null; status: string }>();
  const eventId = await tasksData.unscheduleTask(taskId, profileId);
  // A quest made from a calendar event leaves that event where it was (it may be a meeting someone else
  // set up); only quests the app put on Google take their event with them.
  const fromEvent = eventId ? !!readEventQuestSettingsOf(await readExtras(profileId)).made?.[eventId] : false;
  if (eventId && accessToken && !fromEvent) await deleteCalendarEvent(accessToken, eventId).catch(() => {});
  if (t && t.plan_xp !== null && t.plan_xp !== undefined && t.status === "open") {
    await tasksData.deleteTask(taskId, profileId);
    if (t.plan_xp > 0) await xp.awardXp(profileId, -t.plan_xp, "task_completed");
  }
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** A planning item: what it is, how long it takes, and the XP planning it earns. */
export type QuickEvent = { label: string; emoji: string; minutes: number; xp?: number };

const DEFAULT_QUICK_EVENTS: QuickEvent[] = [
  { label: "Breakfast", emoji: "🍳", minutes: 30, xp: 5 },
  { label: "Lunch", emoji: "🥪", minutes: 45, xp: 5 },
  { label: "Dinner", emoji: "🍲", minutes: 60, xp: 5 },
  { label: "Exercise", emoji: "🏃", minutes: 45, xp: 5 },
  { label: "Visit Dad", emoji: "🏡", minutes: 120, xp: 5 },
  { label: "Couples check-in", emoji: "💞", minutes: 30, xp: 5 },
];

export async function getQuickEventsAction(): Promise<QuickEvent[]> {
  const profileId = await requireProfileId();
  const { data, error } = await supabaseAdmin().from("profiles").select("quick_events").eq("id", profileId).maybeSingle<{ quick_events: QuickEvent[] | null }>();
  return !error && Array.isArray(data?.quick_events) ? data.quick_events : DEFAULT_QUICK_EVENTS;
}

export async function saveQuickEventsAction(list: QuickEvent[]) {
  const profileId = await requireProfileId();
  const clean = list
    .slice(0, 16)
    .map((q) => ({
      label: String(q.label).trim().slice(0, 40),
      emoji: String(q.emoji || "📌").slice(0, 8),
      minutes: Math.max(5, Math.min(600, Math.round(Number(q.minutes) || 30))),
      xp: Math.max(0, Math.min(100, Math.round(Number(q.xp ?? 5)))),
    }))
    .filter((q) => q.label);
  const { error } = await supabaseAdmin().from("profiles").update({ quick_events: clean }).eq("id", profileId);
  if (error) throw new Error("Saving quick events needs a quick database update first.");
}

/** Drag a quest onto another board. */
export async function moveTaskToBoardAction(taskId: string, boardId: string | null) {
  const ownerId = await requireProfileId();
  if (boardId) {
    const board = await boardsData.getBoard(boardId, ownerId);
    if (!board) throw new Error("That board isn't here anymore.");
  }
  await tasksData.setTaskBoard(taskId, ownerId, boardId);
  revalidatePath("/boards", "layout");
  revalidatePath("/");
}

/** Where a quest shows on the Today screen: Today's Quests, Additional Quests, or neither. */
export async function setTaskPlacementAction(taskId: string, placement: "today" | "additional" | "none") {
  const ownerId = await requireProfileId();
  await setTaskPlacementForOwner(ownerId, taskId, placement);
}

/** Chip away at the current level's boss (+1 / −1). Beating it lets you level up. */
export async function bossProgressAction(bossId: string, delta: number) {
  const ownerId = await requireProfileId();
  const boss = await bossesData.getBoss(ownerId, bossId);
  if (!boss) throw new Error("That boss isn't here anymore.");
  const wasDefeated = !!boss.defeated_at;
  const updated = await bossesData.setBossProgress(ownerId, bossId, boss.progress + Math.sign(delta), boss.target);
  let leveledUp = false;
  let level: number | null = null;
  if (!!updated.defeated_at !== wasDefeated) {
    // The cap moved: settle the level the XP has already earned.
    const profile = await profilesData.getProfileById(ownerId);
    if (profile) {
      level = Math.min(computeLevelForXp(profile.total_xp), await bossesData.levelCap(ownerId));
      if (level !== profile.level) {
        await supabaseAdmin().from("profiles").update({ level }).eq("id", ownerId);
        leveledUp = level > profile.level;
      }
    }
  }
  revalidatePath("/", "layout");
  return { progress: updated.progress, target: updated.target, defeated: !!updated.defeated_at, leveledUp, level };
}

/** Name (or rename) the boss guarding a level. */
/** The quests standing in for a boss's sessions (open and done). */
export async function listBossQuestsAction(bossId: string) {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin()
    .from("tasks")
    .select("id, title, status, icon_key, icon_source, xp_value, completed_at, created_at")
    .eq("owner_id", ownerId)
    .eq("boss_id", bossId)
    .order("created_at", { ascending: true });
  return (data ?? []) as { id: string; title: string; status: string; icon_key: string | null; icon_source: string | null; xp_value: number; completed_at: string | null }[];
}

/** Open quests that could stand in for a session. */
export async function listQuestOptionsAction() {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin()
    .from("tasks")
    .select("id, title, icon_key, icon_source, boss_id")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(80);
  return ((data ?? []) as { id: string; title: string; icon_key: string | null; icon_source: string | null; boss_id: string | null }[]).filter((t) => !t.boss_id);
}

/** Make a quest one of the boss's sessions (or, with null, release it). */
export async function linkQuestToBossAction(taskId: string, bossId: string | null) {
  const ownerId = await requireProfileId();
  if (bossId && !(await bossesData.getBoss(ownerId, bossId))) throw new Error("That boss isn't here anymore.");
  const { error } = await supabaseAdmin().from("tasks").update({ boss_id: bossId }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/boss_id/.test(error.message) ? "Boss quests need a quick database update first." : `Couldn't link it: ${error.message}`);
  revalidatePath("/");
}

/** A new quest for one of the boss's sessions (lands in Additional Quests). */
export async function createBossQuestAction(bossId: string, title: string) {
  const ownerId = await requireProfileId();
  const t = title.trim();
  if (!t) throw new Error("Name the session first.");
  const task = await tasksData.createTask(ownerId, { title: t.slice(0, 200), xpValue: 30 });
  await linkQuestToBossAction(task.id, bossId);
  return task.id;
}

export async function setBossAction(level: number, title: string, target: number) {
  const ownerId = await requireProfileId();
  const t = title.trim();
  if (!t) throw new Error("Describe the boss first.");
  if (!Number.isInteger(level) || level < 1 || level > 9) throw new Error("Bosses guard levels 1 to 9.");
  await bossesData.upsertBoss(ownerId, level, t.slice(0, 200), Math.max(1, Math.min(99, target)));
  revalidatePath("/", "layout");
}

/** A quest by id, for opening it in the editor (e.g. from the quest-complete screen). */
export async function getQuestForEditAction(taskId: string) {
  const ownerId = await requireProfileId();
  return tasksData.getTask(taskId, ownerId);
}

/** Energy check-in (1–10, half steps). */
export async function logEnergyAction(level: number) {
  const ownerId = await requireProfileId();
  const entry = await energyData.logEnergy(ownerId, level);
  revalidatePath("/");
  return entry;
}

/** Low-energy picks: power-ups first, then light quests that matter. */
export async function listTakeoffQuestsAction() {
  const ownerId = await requireProfileId();
  const db = supabaseAdmin();
  const { data, error } = await db.from("tasks").select("*").eq("owner_id", ownerId).eq("status", "open").eq("is_aspiration", false);
  if (error) throw new Error(`Couldn't load quests: ${error.message}`);
  const tasks = (data ?? []) as import("@/lib/data/types").Task[];
  const isPowerUp = (t: (typeof tasks)[number]) => !!t.is_power_up || (t.estimate_minutes != null && t.estimate_minutes <= tasksData.POWER_UP_MAX_MINUTES);
  const light = (t: (typeof tasks)[number]) => ((t.effort ?? 0) > 0 ? (t.effort ?? 0) <= 2 : t.estimate_minutes != null && t.estimate_minutes <= 20);
  return tasks
    .filter((t) => !t.needs_review && !t.locked_by_task_id && !t.reward_id && (isPowerUp(t) || light(t) || (t.energy_gain ?? 0) >= 3))
    // Quests that give energy back come first: just what a low moment needs.
    .sort((a, b) => (b.energy_gain ?? 0) - (a.energy_gain ?? 0) || Number(isPowerUp(b)) - Number(isPowerUp(a)) || (b.importance || 0) - (a.importance || 0))
    .slice(0, 15)
    .map((t) => ({ id: t.id, title: t.title, description: t.description, estimate_minutes: t.estimate_minutes, xp_value: t.xp_value, is_power_up: isPowerUp(t), energy_gain: t.energy_gain ?? 0, is_manual_priority: t.is_manual_priority, icon_key: t.icon_key, icon_source: t.icon_source }));
}

/**
 * One check-in: energy, plus any other things being tracked (mood, focus…).
 * `metrics` empty = energy only.
 */
/** A check-in: energy (when it was given this time) and any other metrics moved. */
export async function saveCheckInAction(energy: number | null, metrics: { metric: string; level: number }[] = [], atISO?: string | null) {
  const ownerId = await requireProfileId();
  if (energy === null && !metrics.length) throw new Error("Nothing to check in yet.");
  // An entry added on the chart can be back-dated (up to three months), never set in the future.
  let at: string | null = null;
  if (atISO) {
    const t = new Date(atISO).getTime();
    if (!Number.isFinite(t)) throw new Error("That time doesn't look right.");
    if (t > Date.now() + 60_000) throw new Error("Pick a time that has already happened.");
    if (t < Date.now() - 92 * 86_400_000) throw new Error("Entries go back three months at most.");
    at = new Date(t).toISOString();
  }
  const entry = energy === null ? null : await energyData.logEnergy(ownerId, energy, at);
  const extra = metrics.length ? await energyData.logCheckIns(ownerId, metrics, at) : [];
  revalidatePath("/");
  revalidatePath("/insights");
  return { energy: entry, metrics: extra };
}

// ---- The Wheel of Time: bedtime, wake time, Right Effort and Hindrances.
/** Your Wheel of Time lists and log, and whether this morning's night is logged yet. */
export async function wheelOfTimeAction() {
  const ownerId = await requireProfileId();
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const wheel = cleanWheel((await readExtras(ownerId)).wheelOfTime);
  const today = tomorrowData.appDayKey();
  // Presses on the stone wheel can log Right Effort before the morning's
  // check-in; it still asks for sleep and wake, and starts from those presses.
  const night = wheel.log[today];
  return { effort: wheel.effort, hindrances: wheel.hindrances, target: wheel.target, today, loggedToday: !!(night?.bed || night?.wake), pressed: { effort: night?.effort ?? [], hindrances: night?.hindrances ?? [] } };
}

/** Log a night (by default last night, for this morning). Logging again replaces it, unless `keep` (then only the times given change). */
export async function saveNightAction(input: { bed: string | null; wake: string | null; effort: string[]; hindrances: { name: string; at?: string | null }[]; day?: string | null; keep?: boolean }) {
  const ownerId = await requireProfileId();
  const { cleanWheel, cleanNight } = await import("@/lib/wheel-of-time");
  const extras = await readExtras(ownerId);
  const wheel = cleanWheel(extras.wheelOfTime);
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : tomorrowData.appDayKey();
  const was = input.keep ? wheel.log[day] : undefined;
  const night = cleanNight(was ? { ...was, bed: input.bed ?? was.bed, wake: input.wake ?? was.wake, at: new Date().toISOString() } : { ...input, at: new Date().toISOString() });
  const log = { ...wheel.log };
  if (night) log[day] = night;
  else delete log[day];
  const { error } = await writeExtra(ownerId, "wheelOfTime", { ...wheel, log });
  if (error) throw new Error(`Couldn't save last night: ${error.message}`);
  revalidatePath("/insights");
  return { day, night };
}

/** Change the Right Effort / Hindrance lists or the target bedtime. */
export async function setWheelOfTimeAction(input: { effort?: string[]; hindrances?: string[]; target?: string | null; weights?: Record<string, number> }) {
  const ownerId = await requireProfileId();
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const extras = await readExtras(ownerId);
  const wheel = cleanWheel(extras.wheelOfTime);
  const next = cleanWheel({ ...wheel, ...(input.effort ? { effort: input.effort } : {}), ...(input.hindrances ? { hindrances: input.hindrances } : {}), ...("target" in input ? { target: input.target } : {}), ...(input.weights ? { weights: input.weights } : {}) });
  const { error } = await writeExtra(ownerId, "wheelOfTime", next);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  revalidatePath("/insights");
  return { effort: next.effort, hindrances: next.hindrances, target: next.target, weights: next.weights };
}

/** The check-in metrics being tracked (beyond Energy), in order. */
/** What the welcome screen needs: your check-in metrics, when you last checked in, and what's due soon. */
export async function welcomeContextAction() {
  const ownerId = await requireProfileId();
  // Everything at once (it was five waits in a row; the welcome screen waits on this).
  const db = supabaseAdmin();
  const [metrics, last, tasks, extras, me, { data: pinned }, { data: looks }, { data: boardRows }] = await Promise.all([
    energyData.getCheckMetrics(ownerId).catch(() => []),
    energyData.latestEnergy(ownerId),
    guideTasks(ownerId).catch(() => []),
    readExtras(ownerId).catch(() => ({}) as Record<string, unknown>),
    // Where you stand (streak, XP), so the welcome screen can show them on every visit, not just the day's first.
    profilesData.getProfileById(ownerId).catch(() => null),
    // Today's Quests (pinned for today), in their order, for choosing the day's quests here.
    db.from("tasks").select("id, title, due_at").eq("owner_id", ownerId).eq("status", "open").eq("is_manual_priority", true).order("sort_order", { ascending: true }).limit(40),
    // Portrait, XP and board for each, so choosing the day's quests shows them like their cards.
    db.from("tasks").select("id, icon_key, icon_source, xp_value, board_id").eq("owner_id", ownerId).eq("status", "open"),
    db.from("boards").select("id, title").eq("owner_id", ownerId),
  ]);
  // Candidates for today's main quest: what's due in the next two days, then what matters most.
  const soon = Date.now() + 2 * 86_400_000;
  const dueSoon = tasks.filter((t) => t.due_at && Date.parse(t.due_at) <= soon).sort(byDuePriority(Date.now()));
  const important = tasks.filter((t) => !dueSoon.includes(t) && (t.importance ?? 0) >= 4).sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  const suggestions = [...dueSoon, ...important].slice(0, 4).map((t) => ({ id: t.id, title: t.title, due_at: t.due_at }));
  const priority = (cleanPriorities(extras.priorities)[0] as Priority | undefined) ?? null;
  const boardName = new Map(((boardRows ?? []) as { id: string; title: string }[]).map((b) => [b.id, b.title]));
  const lookOf = new Map(
    ((looks ?? []) as { id: string; icon_key: string | null; icon_source: string | null; xp_value: number | null; board_id: string | null }[]).map((t) => [
      t.id,
      { icon: t.icon_source === "ai" || t.icon_source === "library" ? t.icon_key : null, xp: t.xp_value ?? 0, board: t.board_id ? (boardName.get(t.board_id) ?? null) : null },
    ])
  );
  const card = (t: { id: string; title: string; due_at: string | null }) => ({ id: t.id, title: t.title, due_at: t.due_at, ...lookOf.get(t.id) });
  const today = ((pinned ?? []) as { id: string; title: string; due_at: string | null }[]).map(card);
  return { metrics, lastCheckInAt: last?.created_at ?? null, tasks: tasks.filter((t) => t.due_at).map(card), suggestions, priority, streak: me?.streak_count ?? 0, totalXp: me?.total_xp ?? null, today };
}

/**
 * Your daily habits for the welcome screen's Habits part: each one that falls on `day`
 * (weekdays, or a repeat that's up), and whether it's done that day.
 */
export async function welcomeHabitsAction(day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rites = ((await ritesData.listRites(ownerId).catch(() => null)) ?? []).filter((r) => r.slot === "day" && r.kind !== "ritual");
  const since = new Date(Date.parse(`${day}T12:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const [done, skips] = await Promise.all([ritesData.listCompletionsFor(ownerId, rites.map((r) => r.id), since).catch(() => []), ritesData.listHabitSkips(ownerId, since).catch(() => [])]);
  const daysOf = (list: { rite_id: string; day: string }[] | null, id: string) => (list ?? []).filter((c) => c.rite_id === id).map((c) => c.day);
  const wd = new Date(`${day}T12:00:00`).getDay();
  return rites.map((r) => {
    const repeat = cleanRepeat(r.repeat);
    const today = repeat ? repeatIsUp(repeat, day, daysOf(done, r.id), daysOf(skips, r.id).filter((d) => d !== day)) : !r.days || r.days.length === 0 || r.days.includes(wd);
    return { id: r.id, title: r.title, xp: r.xp_value ?? 0, today, done: daysOf(done, r.id).includes(day) };
  });
}

/** Your top priority for today, from the welcome screen. The toucan keeps it in mind through the day, the week and the month. */
export async function setTopPriorityAction(text: string, othersIn: string[] = []) {
  const ownerId = await requireProfileId();
  // Keeps your line breaks (one priority per line, if you like); tidies spaces within each line.
  const t = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 400);
  const others = [...new Set((Array.isArray(othersIn) ? othersIn : []).map((o) => String(o ?? "").replace(/\s+/g, " ").trim().slice(0, 160)).filter(Boolean))].slice(0, 8);
  if (!t) throw new Error("Write your top priority first.");
  const extras = await readExtras(ownerId);
  const day = tomorrowData.appDayKey();
  const priorities = [{ text: t, others, day, at: new Date().toISOString() }, ...cleanPriorities(extras.priorities).filter((p) => p.day !== day)].slice(0, 120);
  const { error } = await writeExtra(ownerId, "priorities", priorities);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  return { text: t, others, day };
}

export async function getCheckMetricsAction() {
  const ownerId = await requireProfileId();
  return energyData.getCheckMetrics(ownerId);
}

/**
 * A check-in where every part is optional: energy, any other metrics, and
 * any events or #tags. Saves only what was given.
 */
export async function quickCheckInAction(input: { energy: number | null; metrics: { metric: string; level: number }[]; notes: string[] }) {
  const ownerId = await requireProfileId();
  const notes = input.notes.map((n) => n.trim()).filter(Boolean).slice(0, 20);
  if (input.energy === null && !input.metrics.length && !notes.length) throw new Error("Nothing to check in yet.");
  if (input.energy !== null) await energyData.logEnergy(ownerId, input.energy);
  if (input.metrics.length) await energyData.logCheckIns(ownerId, input.metrics);
  for (const n of notes) await energyData.addCheckNote(ownerId, n);
  revalidatePath("/");
  revalidatePath("/insights");
  return { ok: true };
}

/** Start or stop tracking a check-in metric. Returns the new list. */
export async function setCheckMetricsAction(labels: string[]) {
  const ownerId = await requireProfileId();
  const list = await energyData.setCheckMetrics(ownerId, labels);
  revalidatePath("/");
  return list;
}

/** Ask Google for Calendar access (only when the person chooses to connect it). */
export async function connectGoogleCalendarAction(returnTo: string = "/calendar") {
  await requireProfileId();
  const to = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/calendar";
  await signIn("google", { redirectTo: to }, CALENDAR_AUTH_PARAMS);
}

// Planning rituals (weekly and monthly)
export type SeedFate = "schedule" | "quest" | "waiting" | "someday" | "done" | "drop";

/** Keep a ritual's progress (it can be finished later). */
export async function savePlanDraftAction(kind: "week" | "month" | "pair", data: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const { savePlanDraft } = await import("@/lib/data/planning");
  await savePlanDraft(ownerId, kind, JSON.parse(JSON.stringify(data ?? {})));
}

/**
 * Turn the mind sweep into real things: quests to schedule (onto the
 * scheduling list), quests for the lists, Waiting For and Someday / Maybe
 * (each on its own private board), and two-minute jobs already done.
 */
export async function processSeedsAction(seeds: { text: string; fate: SeedFate }[]) {
  const ownerId = await requireProfileId();
  const { boardNamed } = await import("@/lib/data/planning");
  const made: { text: string; fate: SeedFate; id: string }[] = [];
  let waitingBoard: string | null = null;
  let somedayBoard: string | null = null;
  for (const s of seeds.slice(0, 80)) {
    const title = s.text.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!title || s.fate === "drop") continue;
    let boardId: string | null = null;
    if (s.fate === "waiting") boardId = waitingBoard ??= await boardNamed(ownerId, "Waiting For");
    if (s.fate === "someday") boardId = somedayBoard ??= await boardNamed(ownerId, "Someday / Maybe");
    const task = await tasksData.createTask(ownerId, { title, importance: 2.5, urgency: 2.5, xpValue: s.fate === "done" ? 5 : 20, boardId });
    if (s.fate === "schedule" || s.fate === "waiting" || s.fate === "someday") await tasksData.setTaskInAdditional(task.id, ownerId, false).catch(() => null);
    if (s.fate === "schedule") await schedulingData.addToSchedulingList(ownerId, task.id, "bottom");
    if (s.fate === "done") await finishTask(ownerId, task.id);
    made.push({ text: title, fate: s.fate, id: task.id });
  }
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/plan");
  return made;
}

/** Big rocks: to the top of the scheduling list, in the order chosen. */
export async function setBigRocksAction(taskIds: string[]) {
  const ownerId = await requireProfileId();
  for (const id of [...taskIds].slice(0, 5).reverse()) await schedulingData.addToSchedulingList(ownerId, id, "top");
  revalidatePath("/calendar");
  revalidatePath("/plan");
}

/** A stale quest, sorted: keep it, put it up for scheduling, park it in Someday / Maybe, or let it go. */
export async function reviewQuestAction(taskId: string, choice: "keep" | "schedule" | "someday" | "drop") {
  const ownerId = await requireProfileId();
  if (choice === "keep") {
    // Kept on purpose: it won't come up as stale again for a while.
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    await supabaseAdmin().from("tasks").update({ updated_at: new Date().toISOString() }).eq("id", taskId).eq("owner_id", ownerId);
  }
  if (choice === "schedule") await schedulingData.addToSchedulingList(ownerId, taskId, "bottom");
  if (choice === "someday") {
    const { boardNamed } = await import("@/lib/data/planning");
    await tasksData.setTaskBoard(taskId, ownerId, await boardNamed(ownerId, "Someday / Maybe"));
    await tasksData.setManualPriority(taskId, ownerId, false).catch(() => null);
    await tasksData.setTaskInAdditional(taskId, ownerId, false).catch(() => null);
  }
  if (choice === "drop") await deleteTaskAction(taskId);
  revalidatePath("/plan");
  revalidatePath("/");
}

/** Seal the ritual: XP once per week or month. */
export async function completePlanAction(kind: "week" | "month" | "pair", data: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const { completePlan } = await import("@/lib/data/planning");
  const res = await completePlan(ownerId, kind, JSON.parse(JSON.stringify(data ?? {})));
  revalidatePath("/");
  revalidatePath("/plan");
  return res;
}

/** A quest card's look on the calendar: a colour, its own portrait, or a photo (owner, Nov 12). */
export type CalCardLook = { color?: string; image?: string };
