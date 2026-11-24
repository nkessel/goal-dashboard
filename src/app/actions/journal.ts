"use server";

import * as tasksData from "@/lib/data/tasks";
import { finishTaskForOwner as finishTask, cleanHabitPlan, saveHabitPlan, setCoreHabitForOwner } from "@/lib/data/quest-ops";
import { revalidatePath } from "next/cache";
import * as journalData from "@/lib/data/journal";
import * as feedbackData from "@/lib/data/feedback";
import * as xp from "@/lib/data/xp";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as tomorrowData from "@/lib/data/tomorrow";
import type { Task } from "@/lib/data/types";
import { writeExtra } from "@/lib/data/extras";
import * as ritesData from "@/lib/data/rites";
import { cleanRepeat, repeatIsUp } from "@/lib/habit-repeat";
import * as energyData from "@/lib/data/energy";
import { LEAF_EVENT, cleanFace, cleanFeelings, cleanReason } from "@/lib/leaf";
import { requireProfileId, requireIdentity, readExtras } from "./_shared";

// "Doing now" and the journal (both from the + sheet)
/** Log something you're doing right now: creates the quest and completes it at once. */
export async function logDoingNowAction(input: {
  title: string;
  description?: string;
  xpValue: number;
  boardId?: string | null;
  iconKey?: string | null;
  iconSource?: "library" | "ai";
}) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("What are you doing? Give it a name first.");
  const task = await tasksData.createTask(ownerId, {
    title,
    description: input.description?.trim() || undefined,
    xpValue: Math.max(0, Math.min(1000, Math.round(input.xpValue))),
    boardId: input.boardId ?? null,
    iconKey: input.iconKey ?? null,
    iconSource: input.iconSource,
  });
  const res = await finishTask(ownerId, task.id);
  revalidatePath("/boards", "layout");
  return { id: task.id, ...res };
}

export async function listJournalAction() {
  const ownerId = await requireProfileId();
  return journalData.listJournalEntries(ownerId);
}

/**
 * A journal entry, or a piece of feedback. Feedback earns the XP its writer
 * picked or its paragraphs earned (`feedbackXp`); the result says how much was paid.
 */
export async function addJournalEntryAction(body: string, mood: number | null, kind: string | null = null, feedbackXp = 0, attachments: string[] = []) {
  const { id: ownerId, name } = await requireIdentity();
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  const k = kind && /^[a-z]{2,20}$/.test(kind) ? kind : null;
  const isFeedback = !!k && (feedbackData.FEEDBACK_KINDS as readonly string[]).includes(k);
  // 1 XP per paragraph, growing past three, up to 12.
  const xpAwarded = isFeedback ? Math.max(0, Math.min(12, Math.round(feedbackXp))) : 0;
  const entry = await journalData.addJournalEntry(ownerId, text.slice(0, 20000), mood && mood >= 1 && mood <= 5 ? Math.round(mood) : null, k, xpAwarded);
  const pics = attachments.filter((u) => typeof u === "string" && /^https:\/\/[^\s]+\/feedback\//.test(u)).slice(0, 6);
  if (pics.length) await journalData.setAttachments(ownerId, entry.id, pics).catch(() => {});
  // Feedback from someone in the party goes to the owner's review queue.
  if (isFeedback) {
    await feedbackData.notifyReviewers(ownerId, name, text).catch(() => {});
    if (xpAwarded > 0) {
      // No refresh of the Today screen here: a quest editor open there would be swept away.
      await xp.awardXp(ownerId, xpAwarded, "task_completed");
    }
    revalidatePath("/feedback-review");
  }
  revalidatePath("/journal");
  return { ...entry, xpAwarded };
}

/** A picture that finished uploading after its note was sent: it joins the note. */
export async function addFeedbackAttachmentAction(entryId: string, url: string) {
  const ownerId = await requireProfileId();
  if (typeof url !== "string" || !/^https:\/\/[^\s]+\/feedback\//.test(url)) throw new Error("That isn't a feedback picture.");
  const { data } = await supabaseAdmin().from("journal_entries").select("attachments").eq("id", entryId).eq("owner_id", ownerId).maybeSingle<{ attachments: string[] | null }>();
  if (!data) throw new Error("That note isn't there.");
  const now = Array.isArray(data.attachments) ? data.attachments : [];
  if (now.includes(url)) return;
  await journalData.setAttachments(ownerId, entryId, [...now, url].slice(0, 8));
  revalidatePath("/feedback-review");
}

/** The owner's decision on a piece of feedback (null = back to New). */
export async function reviewFeedbackAction(entryId: string, status: feedbackData.ReviewStatus | null) {
  const profileId = await requireProfileId();
  if (!(await feedbackData.isAdmin(profileId))) throw new Error("Only the app's owner reviews feedback.");
  if (status !== null && !["global", "personal", "later", "skipped"].includes(status)) throw new Error("Unknown choice.");
  await feedbackData.setReviewStatus(entryId, status);
  revalidatePath("/feedback-review");
  revalidatePath("/settings");
}

export async function editFeedbackAction(entryId: string, text: string | null) {
  const profileId = await requireProfileId();
  if (!(await feedbackData.isAdmin(profileId))) throw new Error("Only the app's owner edits feedback.");
  await feedbackData.setEditedBody(entryId, text);
  revalidatePath("/feedback-review");
}

export async function deleteJournalEntryAction(id: string) {
  const ownerId = await requireProfileId();
  await journalData.deleteJournalEntry(ownerId, id);
  revalidatePath("/journal");
}

/** The evening routine's "Tomorrow's Quests": up to three, in slot order. */
/** Tomorrow's plan: `rankIds` by importance, `seqIds` in the order you'll do them. */
export async function setTomorrowQueueAction(rankIds: string[], seqIds?: string[]) {
  const ownerId = await requireProfileId();
  await tomorrowData.setTomorrowQueue(ownerId, rankIds, seqIds);
  revalidatePath("/");
}

/**
 * The prioritization tool (owner, Nov 10): cards or a list of open quests for today or tomorrow;
 * swipe one in, rate how important it is for that day (1–5), snooze it, or set its dates.
 * Ratings are per day in `life_wheel.dayRatings` ({ "2026-11-10": { id: 4 } }, last few days kept).
 */
export type PrioritizeItem = { id: string; title: string; description: string | null; due_at: string | null; plan_by: string | null; xp_value: number; estimate_minutes: number | null; icon_key: string | null; icon_source: string | null; board: string | null; snoozed: boolean };

export async function prioritizeAction(day: "today" | "tomorrow"): Promise<{ items: PrioritizeItem[]; onDay: string[]; ratings: Record<string, number> }> {
  const ownerId = await requireProfileId();
  const key = day === "today" ? tomorrowData.appDayKey() : tomorrowData.nextDayKey(tomorrowData.appDayKey());
  const [open, queue, extras] = await Promise.all([tasksData.listOpenTasksForOwnerWithCategory(ownerId), tomorrowData.listTomorrowQueue(ownerId), readExtras(ownerId)]);
  const now = Date.now();
  const live = open.filter((t) => !t.locked_by_task_id && !t.reward_id && !t.mission_id);
  const onDay = day === "today" ? live.filter((t) => t.is_manual_priority).map((t) => t.id) : (queue ?? []).map((t) => t.id);
  const ratings = ((extras.dayRatings as Record<string, Record<string, number>> | undefined) ?? {})[key] ?? {};
  // Due first (soonest, past due at the top), then planned-by, then the rest newest first.
  const rank = (t: Task) => {
    const due = t.due_at ? Date.parse(t.due_at) : NaN;
    const plan = (t as Task & { plan_by?: string | null }).plan_by ? Date.parse((t as Task & { plan_by?: string | null }).plan_by!) : NaN;
    return Number.isFinite(due) ? due : Number.isFinite(plan) ? plan + 1e12 : 4e12 - Date.parse(t.created_at);
  };
  const items = [...live]
    .sort((a, b) => rank(a) - rank(b))
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description ? t.description.slice(0, 400) : null,
      due_at: t.due_at ?? null,
      plan_by: (t as Task & { plan_by?: string | null }).plan_by ?? null,
      xp_value: t.xp_value,
      estimate_minutes: t.estimate_minutes,
      icon_key: t.icon_key,
      icon_source: t.icon_source,
      board: t.categoryLabel ?? null,
      snoozed: !!(t as Task & { snoozed_until?: string | null }).snoozed_until && Date.parse((t as Task & { snoozed_until?: string | null }).snoozed_until!) > now,
    }));
  return { items, onDay, ratings };
}

/** Put a quest on today's or tomorrow's list, with how important it is for that day (null = just add). Highest first. */
export async function rateForDayAction(day: "today" | "tomorrow", taskId: string, rating: number | null) {
  const ownerId = await requireProfileId();
  const key = day === "today" ? tomorrowData.appDayKey() : tomorrowData.nextDayKey(tomorrowData.appDayKey());
  const extras = await readExtras(ownerId);
  const all = (extras.dayRatings as Record<string, Record<string, number>> | undefined) ?? {};
  const mine = { ...(all[key] ?? {}) };
  if (rating && rating >= 1 && rating <= 5) mine[taskId] = Math.round(rating);
  // Keep only the last few days.
  const kept = Object.fromEntries(Object.entries({ ...all, [key]: mine }).sort(([a], [b]) => b.localeCompare(a)).slice(0, 4));
  const { error } = await writeExtra(ownerId, "dayRatings", kept);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  // Rated first (highest first), then the rest in their current order.
  const order = (ids: string[]) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    return [...ids].sort((a, b) => (mine[b] ?? 0) - (mine[a] ?? 0) || (pos.get(a)! - pos.get(b)!));
  };
  if (day === "today") {
    const open = await tasksData.listOpenTasksForOwner(ownerId);
    const today = open.filter((t) => t.is_manual_priority).map((t) => t.id);
    if (!today.includes(taskId)) {
      await tasksData.pinToTopOfToday(taskId, ownerId);
      today.push(taskId);
    }
    await tasksData.updateTaskOrder(ownerId, order(today));
  } else {
    const queue = ((await tomorrowData.listTomorrowQueue(ownerId)) ?? []).map((t) => t.id);
    if (!queue.includes(taskId)) queue.push(taskId);
    const next = order(queue);
    await tomorrowData.setTomorrowQueue(ownerId, next, next);
  }
  revalidatePath("/");
}

/** Take a quest off today's or tomorrow's list (the tool's undo). */
export async function unrateForDayAction(day: "today" | "tomorrow", taskId: string, wasOn: boolean) {
  const ownerId = await requireProfileId();
  const key = day === "today" ? tomorrowData.appDayKey() : tomorrowData.nextDayKey(tomorrowData.appDayKey());
  const extras = await readExtras(ownerId);
  const all = (extras.dayRatings as Record<string, Record<string, number>> | undefined) ?? {};
  const mine = { ...(all[key] ?? {}) };
  delete mine[taskId];
  await writeExtra(ownerId, "dayRatings", { ...all, [key]: mine });
  if (!wasOn) {
    if (day === "today") await tasksData.setManualPriority(taskId, ownerId, false);
    else {
      const queue = ((await tomorrowData.listTomorrowQueue(ownerId)) ?? []).map((t) => t.id).filter((id) => id !== taskId);
      await tomorrowData.setTomorrowQueue(ownerId, queue, queue);
    }
  }
  revalidatePath("/");
}

/**
 * Habits in the day's plan (owner, Nov 14): `life_wheel.habitPlan` = { core: ids, days: { "YYYY-MM-DD": ids } }.
 * Core habits always come up; the ones picked for a day join Today's Quests that day. "Rest" is a habit skip.
 */
const planDayKey = (day: "today" | "tomorrow") => (day === "today" ? tomorrowData.appDayKey() : tomorrowData.nextDayKey(tomorrowData.appDayKey()));

export type PlanHabit = { id: string; title: string; icon_key: string | null; estimate_minutes: number | null; xp_value: number; due_time: string | null; core: boolean; done: boolean };

/** The habits that fall on today or tomorrow, which are core, which are picked for that day and which rest. */
export async function habitPlanAction(day: "today" | "tomorrow"): Promise<{ habits: PlanHabit[]; picked: string[]; rested: string[] }> {
  const ownerId = await requireProfileId();
  const key = planDayKey(day);
  const [rites, extras] = await Promise.all([ritesData.listRites(ownerId).catch(() => null), readExtras(ownerId)]);
  const list = (rites ?? []).filter((r) => r.slot === "day" && r.kind !== "ritual");
  const since = new Date(Date.parse(`${key}T12:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const [done, skips] = await Promise.all([ritesData.listCompletionsFor(ownerId, list.map((r) => r.id), since).catch(() => []), ritesData.listHabitSkips(ownerId, since).catch(() => [])]);
  const daysOf = (l: { rite_id: string; day: string }[] | null, id: string) => (l ?? []).filter((c) => c.rite_id === id).map((c) => c.day);
  const wd = new Date(`${key}T12:00:00`).getDay();
  const plan = cleanHabitPlan(extras.habitPlan);
  const habits = list
    .filter((r) => {
      const repeat = cleanRepeat(r.repeat);
      return repeat ? repeatIsUp(repeat, key, daysOf(done, r.id), daysOf(skips, r.id).filter((d) => d !== key)) : !r.days || r.days.length === 0 || r.days.includes(wd);
    })
    .map((r) => ({ id: r.id, title: r.title, icon_key: r.icon_source ? r.icon_key : null, estimate_minutes: r.estimate_minutes ?? null, xp_value: r.xp_value ?? 0, due_time: r.due_time ?? null, core: plan.core.includes(r.id), done: daysOf(done, r.id).includes(key) }));
  const ids = new Set(habits.map((h) => h.id));
  return { habits, picked: (plan.days[key] ?? []).filter((id) => ids.has(id)), rested: (skips ?? []).filter((s) => s.day === key && ids.has(s.rite_id)).map((s) => s.rite_id) };
}

/** Pick a habit for the day ("today"), let it rest that day ("rest"), or leave it undecided (null). */
export async function setHabitForDayAction(day: "today" | "tomorrow", riteId: string, choice: "today" | "rest" | null) {
  const ownerId = await requireProfileId();
  const key = planDayKey(day);
  const plan = cleanHabitPlan((await readExtras(ownerId)).habitPlan);
  const picked = (plan.days[key] ?? []).filter((id) => id !== riteId);
  if (choice === "today") picked.push(riteId);
  await saveHabitPlan(ownerId, { ...plan, days: { ...plan.days, [key]: picked } });
  if (choice === "rest") await ritesData.addHabitSkip(ownerId, riteId, key);
  else await ritesData.removeHabitSkip(ownerId, riteId, key).catch(() => {});
  revalidatePath("/");
}

/** A core habit always comes up in the day's plan and wears a gold star. */
export async function setCoreHabitAction(riteId: string, core: boolean) {
  const ownerId = await requireProfileId();
  await setCoreHabitForOwner(ownerId, riteId, core);
}

/** Snooze a quest until tomorrow (end of tomorrow's plan; counts as a reschedule). Returns what Undo needs. */
export async function snoozeQuestAction(taskId: string) {
  const ownerId = await requireProfileId();
  const prev = await tomorrowData.snoozeToTomorrow(ownerId, taskId);
  revalidatePath("/");
  return prev;
}

/** Snooze a quest for a while (off Today until then). Returns what Undo needs. */
export async function snoozeQuestUntilAction(taskId: string, untilISO: string) {
  const ownerId = await requireProfileId();
  const until = new Date(untilISO);
  if (!Number.isFinite(until.getTime()) || until.getTime() < Date.now()) throw new Error("Pick a time that's still ahead.");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tasks").select("snoozed_until, status").eq("id", taskId).eq("owner_id", ownerId).maybeSingle();
  if (!t || t.status !== "open") throw new Error("That quest isn't open anymore.");
  const { error } = await db.from("tasks").update({ snoozed_until: until.toISOString() }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/snoozed_until/.test(error.message) ? "Snoozing for a while needs a quick database update first." : `Couldn't snooze: ${error.message}`);
  revalidatePath("/");
  return { snoozed_until: (t.snoozed_until as string | null) ?? null };
}

export async function undoSnoozeUntilAction(taskId: string, prev: { snoozed_until: string | null }) {
  const ownerId = await requireProfileId();
  await supabaseAdmin().from("tasks").update({ snoozed_until: prev.snoozed_until }).eq("id", taskId).eq("owner_id", ownerId);
  revalidatePath("/");
}

export async function undoSnoozeAction(taskId: string, prev: tomorrowData.SnoozePrev) {
  const ownerId = await requireProfileId();
  await tomorrowData.undoSnooze(ownerId, taskId, prev);
  revalidatePath("/");
}

// Check-in notes and #tags
export async function addCheckNoteAction(text: string, atISO?: string | null, allDay = false, tone: number | null = null) {
  const ownerId = await requireProfileId();
  const note = await energyData.addCheckNote(ownerId, text, atISO, allDay, { tone });
  revalidatePath("/insights");
  return note;
}

/**
 * Log an event from Insights: a title (with any #tags), optional details shown
 * on hover, and how it felt (-1, 0, 1). Returns the problem in words instead of
 * throwing, so the page can say what went wrong (a thrown error shows only as
 * a "server error" on the live site).
 */
export async function logEventAction(input: { title: string; details?: string | null; tone?: number | null; at?: string | null; allDay?: boolean; /** The leaf log only (owner, Nov 24): why, the face before, the feeling words before. */ reason?: string | null; beforeTone?: number | null; beforeFeelings?: string[] }) {
  try {
    const ownerId = await requireProfileId();
    const isLeaf = String(input.title ?? "") === LEAF_EVENT;
    const leaf = isLeaf ? { reason: cleanReason(input.reason), beforeTone: cleanFace(input.beforeTone), beforeFeelings: cleanFeelings(input.beforeFeelings) } : undefined;
    const note = await energyData.addCheckNote(ownerId, String(input.title ?? ""), input.at ?? null, !!input.allDay, { details: input.details ?? null, tone: input.tone ?? null, leaf });
    revalidatePath("/insights");
    return { ok: true as const, note };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't log that." };
  }
}

export async function deleteCheckNoteAction(id: string) {
  const ownerId = await requireProfileId();
  await energyData.deleteCheckNote(ownerId, id);
  revalidatePath("/insights");
}

/** Star a check-in (owner, Nov 9: "I want to thumbs up the check in"; Nov 18: "star an entry"), by its readings' keys. */
export async function starCheckInAction(keys: string[], on: boolean) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const marks = { ...((extras.checkInMarks as { star?: string[]; archived?: string[] } | undefined) ?? {}) };
  const clean = keys.filter((k) => /^[ec]:[0-9a-f-]{36}$/i.test(k)).slice(0, 12);
  const star = new Set(marks.star ?? []);
  for (const k of clean) {
    if (on) star.add(k);
    else star.delete(k);
  }
  marks.star = [...star].slice(-500);
  await writeExtra(ownerId, "checkInMarks", marks);
  revalidatePath("/insights");
}

/** Take a check-in out of the log and the chart: archived (kept, can come back) or deleted for good. */
export async function removeCheckInAction(keys: string[], how: "archive" | "delete") {
  const ownerId = await requireProfileId();
  const clean = keys.filter((k) => /^[ec]:[0-9a-f-]{36}$/i.test(k)).slice(0, 12);
  if (how === "delete") {
    await energyData.deleteReadings(ownerId, clean.filter((k) => k.startsWith("e:")).map((k) => k.slice(2)), clean.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)));
  } else {
    const extras = await readExtras(ownerId);
    const marks = { ...((extras.checkInMarks as { star?: string[]; archived?: string[] } | undefined) ?? {}) };
    marks.archived = [...new Set([...(marks.archived ?? []), ...clean])].slice(-2000);
    await writeExtra(ownerId, "checkInMarks", marks);
  }
  revalidatePath("/insights");
  revalidatePath("/");
}

/** Change a check-in: its readings are replaced by the new ones, at the time given. */
export async function replaceCheckInAction(keys: string[], energy: number | null, metrics: { metric: string; level: number }[], atISO: string) {
  const ownerId = await requireProfileId();
  const at = new Date(atISO);
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000) throw new Error("Pick a time that has already happened.");
  if (energy === null && !metrics.length) throw new Error("Keep at least one reading, or delete the check-in.");
  const clean = keys.filter((k) => /^[ec]:[0-9a-f-]{36}$/i.test(k)).slice(0, 12);
  await energyData.deleteReadings(ownerId, clean.filter((k) => k.startsWith("e:")).map((k) => k.slice(2)), clean.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)));
  if (energy !== null) await energyData.logEnergy(ownerId, energy, at.toISOString());
  if (metrics.length) await energyData.logCheckIns(ownerId, metrics, at.toISOString());
  revalidatePath("/insights");
  revalidatePath("/");
}
