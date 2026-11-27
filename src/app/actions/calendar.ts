"use server";

import * as stepsData from "@/lib/data/steps";
import * as tasksData from "@/lib/data/tasks";
import { updateCalendarEvent, createCalendarEvent, deleteCalendarEvent, listBusyIntervals } from "@/lib/google-calendar";
import { revalidatePath } from "next/cache";
import { findOpenSlots, type Interval } from "@/lib/scheduling";
import { sessionIdOf } from "@/lib/calendar-task-window";
import * as goalsData from "@/lib/data/goals";
import * as schedulingData from "@/lib/data/scheduling";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as ritesData from "@/lib/data/rites";
import { timedHabitsFrom } from "@/lib/timed-habits";
import { cleanRepeat } from "@/lib/habit-repeat";
import { cleanHabitPlan } from "@/lib/data/quest-ops";
import { isTentativeTitle } from "@/lib/tentative";
import * as boardsData from "@/lib/data/boards";
import { oneStepPerProject } from "@/lib/next-action";
import * as importCardsData from "@/lib/data/import-cards";
import { mirrorEssentialDays } from "@/lib/data/calendar-planner";
import { writeExtra } from "@/lib/data/extras";
import { requireSessionMaybeGoogle, attachCalendarEvent, requireProfileId, readExtras, googleSide } from "./_shared";
import { applyCalendarOps, type CalOp } from "@/lib/data/calendar-ops";

/**
 * Puts one sub-quest on the calendar (or moves it): its own block and its own Google event, named
 * "<sub-quest> · <quest>". Ticking it is the step's own save (saveQuestStepsAction), so XP stays one path.
 */
export async function scheduleStepAction(stepId: string, startISO: string, endISO: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Pick a time first.");
  const step = await stepsData.getStep(stepId, profileId);
  if (!step) throw new Error("That sub-quest isn't here anymore.");
  const quest = await tasksData.getTask(step.task_id, profileId);
  let eventId = step.google_calendar_event_id ?? null;
  if (accessToken) {
    try {
      if (eventId) await updateCalendarEvent(accessToken, eventId, { start, end });
      else eventId = await createCalendarEvent(accessToken, { title: quest ? `${step.title} · ${quest.title}` : step.title, start, end });
    } catch {
      /* the app's own calendar still holds it */
    }
  }
  await stepsData.setStepSlot(stepId, profileId, { start: start.toISOString(), end: end.toISOString(), eventId });
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** Takes a sub-quest off the calendar (and its Google event). */
export async function unscheduleStepAction(stepId: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const step = await stepsData.getStep(stepId, profileId);
  if (!step) return;
  if (step.google_calendar_event_id && accessToken) await deleteCalendarEvent(accessToken, step.google_calendar_event_id).catch(() => {});
  await stepsData.setStepSlot(stepId, profileId, null);
  revalidatePath("/");
  revalidatePath("/calendar");
}

// Pull-to-calendar (Priority #4)
/**
 * Suggests the next 3 open Google Calendar slots for a task, per the spec's
 * "v1 logic: treat all open gaps as available" rule. Purely a suggestion —
 * nothing is written until scheduleTaskAction is called with a chosen slot.
 */
export async function suggestSlotsAction(
  durationMinutes = 30
): Promise<{ start: string; end: string }[]> {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();

  const from = new Date();
  const horizonEnd = new Date(from.getTime() + 14 * 86_400_000);
  // Busy = Google appointments (when connected) plus quests already on the calendar.
  const [google, scheduled] = await Promise.all([
    accessToken ? listBusyIntervals(accessToken, from, horizonEnd).catch(() => []) : Promise.resolve([]),
    tasksData.listCalendarTasksForOwner(profileId, from, horizonEnd),
  ]);
  const busy = [
    ...google,
    ...scheduled
      .filter((t) => t.status === "open" && t.scheduled_start && t.scheduled_end)
      .map((t) => ({ start: new Date(t.scheduled_start!), end: new Date(t.scheduled_end!) })),
  ];

  const slots = findOpenSlots(busy, { from, durationMinutes, horizonDays: 14, maxSlots: 3 });
  return slots.map((s: Interval) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));
}

/**
 * Pulls a task onto the calendar at the given start/end — either one of the
 * suggested slots or a manually chosen time. Creates a real Google Calendar
 * event (or moves the existing one if the task was already scheduled) and
 * bumps reschedule_count via rescheduleTask when it's a re-pull.
 */
export async function scheduleTaskAction(
  taskId: string,
  startISO: string,
  endISO: string
) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  // One write path (planner step 5): the app's row first, Google after, and the opposite back for Undo.
  const sid = sessionIdOf(taskId);
  let counts = true;
  if (!sid) {
    const task = await tasksData.getTask(taskId, profileId);
    if (!task) throw new Error("Task not found");
    // Same start, new length (a resize, or shortening it to its time): not a reschedule.
    counts = !task.scheduled_start || new Date(task.scheduled_start).getTime() !== new Date(startISO).getTime();
  }
  const res = await applyCalendarOps(profileId, [{ op: "place", ref: sid ? `s:${sid}` : `t:${taskId}`, start: startISO, end: endISO, counts }], { google: googleSide(accessToken, profileId) });
  if (!res.undo.length && res.skipped.length) throw new Error(sid ? "That session isn't on the calendar anymore." : res.skipped[0]);
  for (const n of res.google) console.warn(n);
  revalidatePath("/");
  revalidatePath("/calendar");
  return { undo: res.undo };
}

/**
 * Undo for a calendar change (planner step 5): applies the opposites a change gave back. Rows that changed since
 * are left as they are and named in `skipped`; it hands back the opposite of the undo (Redo).
 */
export async function undoCalendarAction(ops: CalOp[]) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  if (!Array.isArray(ops) || ops.length > 200 || ops.some((o) => o?.op !== "restore")) throw new Error("That can't be undone.");
  const res = await applyCalendarOps(profileId, ops, { google: googleSide(accessToken, profileId) });
  for (const n of res.google) console.warn(n);
  revalidatePath("/");
  revalidatePath("/calendar");
  return { undo: res.undo, skipped: res.skipped };
}

/**
 * One quest in another calendar spot (owner, Nov 5: a quest ran long, "I need to do more of it
 * tomorrow morning"). The quest keeps its first slot; this adds a further session with its own
 * Google event. A quest not on the calendar yet simply goes there.
 */
export async function addTaskSessionAction(taskId: string, startISO: string, endISO: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Pick a time first.");
  // Called from a session's own card too: the quest is that session's.
  const sid = sessionIdOf(taskId);
  const questId = sid ? (await tasksData.getTaskSession(sid, profileId))?.task_id : taskId;
  const task = questId ? await tasksData.getTask(questId, profileId) : null;
  if (!task) throw new Error("That quest isn't here anymore.");
  if (!task.is_on_calendar || !task.scheduled_start) {
    await attachCalendarEvent(accessToken, profileId, task, start, end);
  } else {
    let eventId: string | null = null;
    if (accessToken) eventId = await createCalendarEvent(accessToken, { title: task.title, description: task.description ?? undefined, start, end }).catch(() => null);
    await tasksData.addTaskSession(profileId, task.id, start.toISOString(), end.toISOString(), eventId);
  }
  revalidatePath("/");
  revalidatePath("/calendar");
}

/**
 * Lists the user's open quests for the calendar's "add existing quest
 * instead" search — deliberately includes already-scheduled ones too (an
 * open quest can always be re-slotted into a new time from here).
 */
export async function listSchedulableTasksAction() {
  const ownerId = await requireProfileId();
  return tasksData.listOpenTasksForOwner(ownerId);
}

/**
 * Calendar drag-to-add: creates a brand-new quest already scheduled at the
 * dragged time range, in one step — the "new quest" half of the calendar's
 * drag-a-time-range popup (the other half, scheduling an *existing* quest
 * into that range, is scheduleTaskAction above).
 */
export async function createScheduledTaskAction(formData: FormData) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Task title is required");
  const startISO = String(formData.get("startISO") || "");
  const endISO = String(formData.get("endISO") || "");
  if (!startISO || !endISO) throw new Error("Start and end time are required");

  const goalId = String(formData.get("goalId") || "") || null;
  const xpValue = Math.max(0, Number(formData.get("xpValue") || 0));
  const estimateRaw = String(formData.get("estimateMinutes") || "").trim();
  const estimateMinutes = estimateRaw ? Math.max(0, Number(estimateRaw)) : null;

  const task = await tasksData.createTask(profileId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    importance: Number(formData.get("importance") || 0),
    urgency: Number(formData.get("urgency") || 0),
    xpValue,
    goalId,
    estimateMinutes,
  });

  await attachCalendarEvent(accessToken, profileId, task, new Date(startISO), new Date(endISO));

  revalidatePath("/");
  revalidatePath("/calendar");
  if (goalId) {
    const goal = await goalsData.getGoal(goalId, profileId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
}

/**
 * Turns one of the user's real Google Calendar appointments into a quest:
 * creates a task already scheduled at the event's time, linked to the same
 * Google event id so it's recognized as "already a quest" and not shown
 * twice as a raw calendar event.
 */
export async function convertCalendarEventToTaskAction(input: {
  googleEventId: string;
  title: string;
  description?: string;
  startISO: string;
  endISO: string;
}) {
  const ownerId = await requireProfileId();
  const task = await tasksData.createTask(ownerId, {
    title: input.title,
    description: input.description,
  });
  await tasksData.rescheduleTask(task.id, ownerId, input.startISO, input.endISO, input.googleEventId);
  revalidatePath("/calendar");
  revalidatePath("/");
}

// Scheduling priority list (beside the calendar)
export async function listSchedulingAction() {
  const ownerId = await requireProfileId();
  return schedulingData.listSchedulingList(ownerId);
}

export async function reorderSchedulingAction(ids: string[]) {
  const ownerId = await requireProfileId();
  await schedulingData.setSchedulingOrder(ownerId, ids.slice(0, 100));
  revalidatePath("/calendar");
}

/** On (with where it goes) or off the scheduling list. */
export async function setSchedulingAction(taskId: string, place: schedulingData.SchedulePlace | null) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  if (place) await schedulingData.addToSchedulingList(ownerId, taskId, place);
  else await schedulingData.removeFromSchedulingList(ownerId, taskId);
  revalidatePath("/calendar");
}

export async function setSchedulingFoldersAction(folders: schedulingData.ScheduleFolder[]) {
  const ownerId = await requireProfileId();
  const next = await schedulingData.setSchedulingFolders(ownerId, folders);
  revalidatePath("/calendar");
  return next;
}

export async function moveSchedulingFolderAction(taskId: string, folder: string | null, order?: string[]) {
  const ownerId = await requireProfileId();
  await schedulingData.moveToSchedulingFolder(ownerId, taskId, folder);
  if (order) await schedulingData.setSchedulingOrder(ownerId, order.slice(0, 100));
  revalidatePath("/calendar");
}

export async function renameSchedulingFolderAction(from: string, to: string) {
  const ownerId = await requireProfileId();
  await schedulingData.renameSchedulingFolder(ownerId, from, to);
  revalidatePath("/calendar");
}

export async function deleteSchedulingFolderAction(name: string) {
  const ownerId = await requireProfileId();
  await schedulingData.deleteSchedulingFolder(ownerId, name);
  revalidatePath("/calendar");
}

// Calendar: editing Google events in place
/** Move, resize, rename or re-describe a Google Calendar event. */
/** Yes / Maybe / No on a Google Calendar invitation. */
export async function rsvpGoogleEventAction(eventId: string, calendarId: string, answer: "accepted" | "tentative" | "declined") {
  const { accessToken } = await requireSessionMaybeGoogle();
  if (!accessToken) throw new Error("Connect Google Calendar first.");
  if (!["accepted", "tentative", "declined"].includes(answer)) throw new Error("Pick Yes, Maybe or No.");
  const { rsvpCalendarEvent } = await import("@/lib/google-calendar");
  try {
    await rsvpCalendarEvent(accessToken, calendarId || "primary", eventId, answer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/forbidden|insufficient|403/i.test(msg) ? "Google didn't let the answer through from here." : `Couldn't answer the invitation: ${msg}`);
  }
  revalidatePath("/calendar");
}

export async function updateGoogleEventAction(
  eventId: string,
  calendarId: string,
  input: { startISO?: string; endISO?: string; title?: string; description?: string | null }
) {
  const { accessToken } = await requireSessionMaybeGoogle();
  if (!accessToken) throw new Error("Connect Google Calendar first.");
  const { updateCalendarEvent } = await import("@/lib/google-calendar");
  if (input.startISO && input.endISO && new Date(input.endISO) <= new Date(input.startISO)) throw new Error("It has to end after it starts.");
  try {
    await updateCalendarEvent(
      accessToken,
      eventId,
      {
        start: input.startISO ? new Date(input.startISO) : undefined,
        end: input.endISO ? new Date(input.endISO) : undefined,
        title: input.title?.trim() || undefined,
        description: input.description,
      },
      calendarId || "primary"
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/forbidden|insufficient|403/i.test(msg) ? "Google won't let this event be changed from here (it may belong to someone else)." : `Couldn't update the event: ${msg}`);
  }
  revalidatePath("/calendar");
}

// Auto-scheduler: busy times in, the scheduling list placed into free time out
/**
 * Everything that already takes up time between two moments: Google events
 * (except calendars switched off on the calendar screen, and all-day ones)
 * and quests already on the calendar. Plus the saved scheduler settings.
 */
export async function schedulerContextAction(fromISO: string, toISO: string, hiddenCalendars: string[] = [], /** The local day being planned ("2026-11-02"): which flexible habits are already done. */ dayKey?: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const from = new Date(fromISO);
  const to = new Date(toISO);
  const hidden = new Set(hiddenCalendars);
  const busy: { start: number; end: number; cal?: string; title?: string }[] = [];
  let calendars: { id: string; name: string; color: string | null; writable: boolean; primary: boolean }[] = [];
  const [quests, profileRes] = await Promise.all([
    tasksData.listCalendarTasksForOwner(profileId, from, to).catch(() => []),
    supabaseAdmin().from("profiles").select("scheduler").eq("id", profileId).maybeSingle<{ scheduler: Record<string, unknown> | null }>(),
  ]);
  // Driving there and back is busy too (owner, Nov 12).
  const drives = quests.length ? ((await readExtras(profileId).catch(() => ({}) as Record<string, unknown>)).questDrives as Record<string, number> | undefined) ?? {} : {};
  for (const t of quests) {
    if (t.status !== "open" || !t.scheduled_start || !t.scheduled_end) continue;
    const pad = (typeof drives[t.id] === "number" ? drives[t.id] : 0) * 60_000;
    busy.push({ start: new Date(t.scheduled_start).getTime() - pad, end: new Date(t.scheduled_end).getTime() + pad, title: t.title });
  }
  // Habits with a set time (Gym at 7) hold their time; the browser lays them out in local time.
  const riteRows = (await ritesData.listRites(profileId).catch(() => null)) ?? [];
  const habits = timedHabitsFrom(riteRows, cleanRepeat);
  // Habits without a set time but with a length (20 mins of cleaning): the day planner keeps room for them.
  const dayOk = !!dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey);
  // With habits chosen for that day (or core ones), room is kept only for those (owner, Nov 14).
  const habitPlan = dayOk ? cleanHabitPlan((await readExtras(profileId).catch(() => ({}) as Record<string, unknown>)).habitPlan) : null;
  const chosen = new Set(habitPlan ? [...habitPlan.core, ...(habitPlan.days[dayKey!] ?? [])] : []);
  const flex = riteRows.filter((r) => r.slot === "day" && !r.due_time && !r.window_to && (r.estimate_minutes ?? 0) > 0 && r.kind !== "ritual" && (!chosen.size || chosen.has(r.id)));
  const doneIds = dayOk && flex.length
    ? new Set(
        [
          ...(await ritesData.listCompletionsFor(profileId, flex.map((r) => r.id), dayKey!).catch(() => [])),
          // Resting today counts as off the plan.
          ...((await ritesData.listHabitSkips(profileId, dayKey!).catch(() => [])) ?? []),
        ]
          .filter((c) => c.day === dayKey)
          .map((c) => c.rite_id)
      )
    : new Set<string>();
  const flexHabits = flex.filter((r) => !doneIds.has(r.id)).map((r) => ({ id: r.id, title: r.title, days: r.days ?? null, minutes: r.estimate_minutes ?? 15, repeat: cleanRepeat(r.repeat) }));
  // Events written in [brackets] on your calendar are optional: they don't hold time until you keep them.
  const optional: { id: string; calendarId: string; title: string; start: number; end: number }[] = [];
  let google = false;
  if (accessToken) {
    try {
      const { listEventsAllCalendars } = await import("@/lib/google-calendar");
      const all = await listEventsAllCalendars(accessToken, from, to);
      google = true;
      calendars = all.calendars.filter((c) => !hidden.has(c.id)).map((c) => ({ id: c.id, name: c.name, color: c.color, writable: c.writable ?? c.primary, primary: c.primary }));
      const own = new Set(quests.map((t) => t.google_calendar_event_id).filter(Boolean));
      for (const e of all.events) {
        if (e.isAllDay || own.has(e.id) || (e.calendarId && hidden.has(e.calendarId))) continue;
        if (isTentativeTitle(e.title)) {
          optional.push({ id: e.id, calendarId: e.calendarId ?? "primary", title: e.title.trim().slice(1, -1).trim(), start: new Date(e.start).getTime(), end: new Date(e.end).getTime() });
          continue;
        }
        busy.push({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime(), cal: e.calendarId, title: e.title });
      }
    } catch {
      /* planning still works from the app's own calendar */
    }
  }
  return { busy, habits, flexHabits, optional, google, calendars, settings: profileRes.error ? null : (profileRes.data?.scheduler ?? null) };
}

/** Delete an event from the owner's Google Calendar (owner, Nov 4: "delete items from my google calendar"); `series` deletes every repeat. */
export async function deleteGoogleEventAction(calendarId: string, eventId: string, series?: string | null) {
  const { accessToken } = await requireSessionMaybeGoogle();
  if (!accessToken) return { ok: false as const, error: "Connect Google Calendar first." };
  const g = await import("@/lib/google-calendar");
  try {
    await g.deleteCalendarEvent(accessToken, series || eventId, calendarId || "primary");
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: /forbidden|403|insufficient|permission/i.test(msg) ? "Google won't let the app delete this one (it may be someone else's calendar). Open it in Google Calendar to remove it." : "Google didn't delete it. Try again?" };
  }
}

/** An optional [bracketed] calendar event: keep it (its brackets come off, so it holds its time) or delete it. */
export async function resolveOptionalEventAction(calendarId: string, eventId: string, title: string, keep: boolean) {
  const { accessToken } = await requireSessionMaybeGoogle();
  if (!accessToken) throw new Error("Connect Google Calendar first.");
  const g = await import("@/lib/google-calendar");
  if (keep) await g.updateCalendarEvent(accessToken, eventId, { title: title.trim().slice(0, 300) }, calendarId || "primary");
  else await g.deleteCalendarEvent(accessToken, eventId, calendarId || "primary");
  return { ok: true };
}

/** Plan my day: Today's Quests and whatever is due by the end of the day (open, awake, approved). */
/** The board of things to listen to (the "Online learning videos" list), for 🎧 in Plan my day. */
export async function listenBoardAction(): Promise<string | null> {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin().from("boards").select("id, title").eq("owner_id", ownerId);
  const hit = ((data ?? []) as { id: string; title: string }[]).find((b) => /learning videos|listen/i.test(b.title));
  return hit?.id ?? null;
}

export async function planDayTasksAction(dayEndISO: string) {
  const ownerId = await requireProfileId();
  const end = Date.parse(dayEndISO);
  const now = Date.now();
  const all = await tasksData.listOpenTasksForOwnerWithCategory(ownerId);
  return all.filter((t) => !t.needs_review && !t.reward_id && (!t.snoozed_until || Date.parse(t.snoozed_until) <= now) && (t.is_manual_priority || (!!t.due_at && Date.parse(t.due_at) < end)));
}

/** A daily habit as the auto-scheduler lists it. */
export type SchedHabit = { id: string; title: string; minutes: number; due_time: string | null; window_to: string | null; icon_key: string | null; days: number[] | null; repeat: unknown; core?: boolean };

/**
 * The auto-scheduler's sections on top (owner, Nov 6): Today's quests, Additional quests and today's
 * habits, each without what's already on the list to schedule. `done` holds the habits done or
 * skipped on `dayKey` (the browser's day); `settings` the scheduler's (for a habit placed by hand).
 */
export async function autoSchedulerSectionsAction(dayKey: string) {
  const ownerId = await requireProfileId();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const [all, boards, rites, profileRes] = await Promise.all([
    tasksData.listOpenTasksForOwnerWithCategory(ownerId),
    boardsData.listBoardsForOwner(ownerId).catch(() => []),
    ritesData.listRites(ownerId).catch(() => null),
    supabaseAdmin().from("profiles").select("scheduler").eq("id", ownerId).maybeSingle<{ scheduler: Record<string, unknown> | null }>(),
  ]);
  const live = all.filter((t) => !t.needs_review && !t.reward_id && t.schedule_rank == null && (!t.snoozed_until || Date.parse(t.snoozed_until) <= now));
  const today = live.filter((t) => t.is_manual_priority);
  const additional = oneStepPerProject(live.filter((t) => !t.is_manual_priority && t.in_additional !== false), boards, all).slice(0, 60);
  const dayHabits = (rites ?? []).filter((r) => r.slot === "day" && r.kind !== "ritual");
  const ids = dayHabits.map((r) => r.id);
  const [done, skips] = await Promise.all([ritesData.listCompletionsFor(ownerId, ids, day).catch(() => []), ritesData.listHabitSkips(ownerId, day).catch(() => [])]);
  const off = new Set([...done, ...(skips ?? [])].filter((c) => c.day === day).map((c) => c.rite_id));
  // With habits chosen for the day (or core ones), only those are lined up, core first (owner, Nov 14).
  const plan = cleanHabitPlan((await readExtras(ownerId).catch(() => ({}) as Record<string, unknown>)).habitPlan);
  const chosen = new Set([...plan.core, ...(plan.days[day] ?? [])]);
  const coreIds = new Set(plan.core);
  const habits: SchedHabit[] = dayHabits
    .filter((r) => !off.has(r.id) && (!chosen.size || chosen.has(r.id)))
    .sort((a, b) => Number(coreIds.has(b.id)) - Number(coreIds.has(a.id)))
    .map((r) => ({ id: r.id, title: r.title, minutes: r.estimate_minutes ?? (r.due_time || r.window_to ? 60 : 30), due_time: r.due_time ?? null, window_to: r.window_to ?? null, icon_key: r.icon_source ? (r.icon_key ?? null) : null, days: r.days ?? null, repeat: cleanRepeat(r.repeat), core: coreIds.has(r.id) }));
  return { today, additional, habits, habitsChosen: chosen.size > 0, settings: profileRes.error ? null : (profileRes.data?.scheduler ?? null) };
}

/** Put a quest on the list to schedule in a group (owner, Nov 6): its plan-by (undefined keeps it) and the list's whole new order. */
export async function moveToSchedulingAction(taskId: string, planBy: string | null | undefined, order: string[], today?: boolean) {
  const ownerId = await requireProfileId();
  const patch: Record<string, unknown> = { schedule_folder: null };
  if (planBy !== undefined) patch.plan_by = planBy && Number.isFinite(Date.parse(planBy)) ? new Date(planBy).toISOString() : null;
  const { error } = await supabaseAdmin().from("tasks").update(patch).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't move it: ${error.message}`);
  if (today !== undefined) await tasksData.setManualPriority(taskId, ownerId, today);
  await schedulingData.setSchedulingOrder(ownerId, order.slice(0, 200));
  revalidatePath("/");
  revalidatePath("/calendar");
}

/**
 * The quest editor's "Schedule within" (owner, Nov 7: due date and scheduling together): a plan-by
 * date puts the quest on the list to schedule in its place by date; null takes it off the list.
 */
export async function setTaskPlanByAction(taskId: string, planBy: string | null) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  const when = planBy && Number.isFinite(Date.parse(planBy)) ? new Date(planBy).toISOString() : null;
  if (when) await importCardsData.queueToSchedule(ownerId, taskId, when);
  else {
    const { error } = await supabaseAdmin().from("tasks").update({ plan_by: null }).eq("owner_id", ownerId).eq("id", taskId);
    if (error) throw new Error(`Couldn't take it off the list: ${error.message}`);
    await schedulingData.removeFromSchedulingList(ownerId, taskId);
  }
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** From the list to schedule back to Today's quests (pinned) or Additional quests. */
export async function moveOffSchedulingAction(taskId: string, toToday: boolean) {
  const ownerId = await requireProfileId();
  await schedulingData.removeFromSchedulingList(ownerId, taskId);
  await tasksData.setManualPriority(taskId, ownerId, toToday);
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** Remember the scheduler's settings and time-of-day choices (on every device). */
export async function saveSchedulerSettingsAction(settings: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const clean = JSON.parse(JSON.stringify(settings ?? {}));
  // Merged onto what's saved (planner step 2d): a copy from another tab or an older screen that lacks a part
  // no longer wipes it ("Keep it here on lunch made it disappear").
  const { data: cur } = await supabaseAdmin().from("profiles").select("scheduler").eq("id", ownerId).maybeSingle<{ scheduler: Record<string, unknown> | null }>();
  const { error } = await supabaseAdmin().from("profiles").update({ scheduler: { ...(cur?.scheduler ?? {}), ...clean } }).eq("id", ownerId);
  if (error) throw new Error(/scheduler/.test(error.message) ? "Saved on this device (your account needs a quick database update to keep it everywhere)." : `Couldn't save: ${error.message}`);
  if ("essentialDays" in clean) await mirrorEssentialDays(ownerId, clean.essentialDays); // planner step 3: calendar_blocks follows until readers switch over
}

/** Put a whole plan on the calendar: each quest at its time (and on Google Calendar when connected). */
export async function applyAutoScheduleAction(plan: { taskId: string; startISO: string; endISO: string }[]) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  let done = 0;
  const failed: string[] = [];
  for (const p of plan.slice(0, 60)) {
    try {
      const task = await tasksData.getTask(p.taskId, profileId);
      if (!task) continue;
      await attachCalendarEvent(accessToken, profileId, task, new Date(p.startISO), new Date(p.endISO));
      done++;
    } catch {
      failed.push(p.taskId);
    }
  }
  revalidatePath("/");
  revalidatePath("/calendar");
  return { done, failed };
}

/** Name this week's chapter. */
export async function setChapterTitleAction(title: string) {
  const ownerId = await requireProfileId();
  const { setChapterTitle } = await import("@/lib/data/planning");
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 60);
  await setChapterTitle(ownerId, clean || null);
  revalidatePath("/");
}

// Calendars of interest (owner, Nov 4): feeds shown in week and month views, and links to open.
export async function interestCalendarsAction() {
  const ownerId = await requireProfileId();
  const { normalizeInterest, INTEREST_SEED } = await import("@/lib/interest-calendars");
  return normalizeInterest((await readExtras(ownerId)).interestCalendars) ?? INTEREST_SEED;
}

export async function saveInterestCalendarsAction(list: import("@/lib/interest-calendars").InterestCalendar[]) {
  const ownerId = await requireProfileId();
  const { normalizeInterest } = await import("@/lib/interest-calendars");
  const clean = normalizeInterest(list) ?? [];
  const { error } = await writeExtra(ownerId, "interestCalendars", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/calendar");
  return clean;
}

/** Look for a calendar feed at (or behind) a link: its address, or null when there isn't one. */
export async function findFeedAction(url: string) {
  await requireProfileId();
  const { cleanUrl } = await import("@/lib/interest-calendars");
  const u = cleanUrl(url);
  if (!u) return null;
  const { findFeed } = await import("@/lib/data/ics");
  return findFeed(u);
}

/**
 * Another day for Today's calendar, when you pan it sideways (owner, Nov 25: "couldn't pan to different days from
 * the today screen calendar"). Read-only: the day's quests and Google events, a day either side for time zones.
 */
export async function todayCalendarDayAction(dayKey: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) throw new Error("Bad day");
  const { addDays, parseDateParam } = await import("@/lib/calendar-dates");
  const { listEventsAllCalendars } = await import("@/lib/google-calendar");
  const { cookies } = await import("next/headers");
  const day = parseDateParam(dayKey);
  const from = addDays(day, -1);
  const to = addDays(day, 2);
  const skip = decodeURIComponent((await cookies()).get("cal-skip")?.value ?? "").split("|").filter(Boolean);
  const [tasks, google] = await Promise.all([
    tasksData.listCalendarTasksForOwner(profileId, from, to).catch(() => []),
    accessToken ? listEventsAllCalendars(accessToken, from, to, skip).catch(() => null) : Promise.resolve(null),
  ]);
  const imported = new Set(tasks.map((t) => t.google_calendar_event_id).filter((id): id is string => Boolean(id)));
  const events = (google?.events ?? []).filter((e) => !imported.has(e.id));
  return { dayKey, tasks, events };
}
