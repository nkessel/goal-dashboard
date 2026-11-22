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
import { generateAndStoreImage } from "@/lib/ai-image";
import { mirrorQuestDrive } from "@/lib/data/calendar-planner";
import { readEventQuestSettings as readEventQuestSettingsOf } from "@/lib/data/event-quests";
import * as profilesData from "@/lib/data/profiles";
import * as winsData from "@/lib/data/wins";
import * as stepsData from "@/lib/data/steps";
import * as schedulingData from "@/lib/data/scheduling";
import { stepsComplete } from "@/lib/habit-steps";
import * as rewardsData from "@/lib/data/rewards";
import * as importCardsData from "@/lib/data/import-cards";
import * as boardsData from "@/lib/data/boards";
import { type HabitTicks, type HabitTicksSeed, habitTicksSeed, cleanHabitTicks } from "@/lib/habit-ticks";
import { coinsForXp } from "@/lib/coins";
import { requireProfileId, requireIdentity, readExtras, assertFamilyFriendly, QUEST_ID, type LookTask, lookOf, requireSessionMaybeGoogle, guideTasks, cleanPriorities, assertDay } from "./_shared";
import { type CalCardLook, saveNightAction, completeRiteAction, uncompleteRiteAction, createRiteAction } from "./evening";
import { createRewardAction } from "./rewards";
import { createQuestAction } from "./quests";

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
export async function logEventAction(input: { title: string; details?: string | null; tone?: number | null; at?: string | null; allDay?: boolean }) {
  try {
    const ownerId = await requireProfileId();
    const note = await energyData.addCheckNote(ownerId, String(input.title ?? ""), input.at ?? null, !!input.allDay, { details: input.details ?? null, tone: input.tone ?? null });
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

// Streaks: things you're keeping away from (kept with your life wheel, private)
/** Save the list of streaks. */
export async function saveStreaksAction(list: { id: string; name: string; word: string; since: string }[]) {
  const ownerId = await requireProfileId();
  const clean = list.slice(0, 12).map((s) => ({
    id: String(s.id).slice(0, 40),
    name: s.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Streak",
    word: s.word.split(",").map((w) => w.replace(/^\s*#/, "").trim().toLowerCase()).filter(Boolean).join(", ").slice(0, 60),
    since: new Date(Date.parse(s.since) || Date.now()).toISOString(),
  }));
  const { error } = await writeExtra(ownerId, "streaks", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return clean;
}

/** Rituals of connection: the whole list (names, notes and the days each was done). */
export async function saveRitualsAction(list: import("@/lib/rituals").Ritual[]) {
  const ownerId = await requireProfileId();
  const { cleanRituals } = await import("@/lib/rituals");
  const clean = cleanRituals(list);
  const { error } = await writeExtra(ownerId, "rituals", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return clean;
}

async function addRitual(ownerId: string, title: string, note: string | null) {
  const { cleanRituals } = await import("@/lib/rituals");
  const extras = await readExtras(ownerId);
  const list = cleanRituals(extras.rituals);
  const same = list.find((r) => r.title.toLowerCase() === title.toLowerCase());
  if (same) return same.id;
  const id = `r${Math.random().toString(36).slice(2, 10)}`;
  const { error } = await writeExtra(ownerId, "rituals", [...list, { id, title, note, log: [] }]);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return id;
}

/** A slip: logged as an event with the streak's #word, so the count starts again from then. */
export async function logSlipAction(word: string, atISO?: string | null) {
  const ownerId = await requireProfileId();
  // The first word is the one logged.
  const w = word.split(",")[0].replace(/^\s*#/, "").replace(/\s+/g, "").toLowerCase().slice(0, 24);
  if (!w) throw new Error("This streak needs a word first.");
  const note = await energyData.addCheckNote(ownerId, `#${w}`, atISO ?? null);
  revalidatePath("/insights");
  return note;
}

// Inventory: the backpack (kept with your other personal extras)
export async function saveInventoryAction(inventory: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeInventory } = await import("@/lib/inventory");
  const clean = normalizeInventory(inventory);
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  // Packing lists are saved by their own window (below); the backpack never writes over them.
  const stored = ((cur?.life_wheel ?? {}) as { inventory?: { packing?: unknown } }).inventory?.packing;
  if (stored !== undefined) (clean as { packing: unknown }).packing = stored;
  const { error } = await writeExtra(ownerId, "inventory", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/settings");
  return clean;
}

/** Your packing lists, for the floating packing window. */
export async function packingListsAction() {
  const ownerId = await requireProfileId();
  const { normalizePacking } = await import("@/lib/inventory");
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  return normalizePacking(((cur?.life_wheel ?? {}) as { inventory?: { packing?: unknown } }).inventory?.packing);
}

/** Save the packing lists (merged into the backpack's record, nothing else touched). */
export async function savePackingListsAction(lists: unknown) {
  const ownerId = await requireProfileId();
  const { normalizePacking } = await import("@/lib/inventory");
  const clean = normalizePacking(lists);
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const lw = cur?.life_wheel ?? {};
  const inventory = { ...((lw as { inventory?: Record<string, unknown> }).inventory ?? {}), packing: clean };
  const { error } = await writeExtra(ownerId, "inventory", inventory);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

// Mess check-in: spaces, laundry bin and chore deck for the cleaning habit
export async function saveCleaningAction(cleaning: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeCleaning } = await import("@/lib/cleaning");
  const clean = normalizeCleaning(cleaning);
  if (!clean) throw new Error("Nothing to save.");
  const { error } = await writeExtra(ownerId, "cleaning", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

/**
 * Fighting back the mess in a space: logs before and after (0–10), and
 * optionally minutes and the energy it took and gave; sets the space to how
 * it looks now; pays XP when it's cleaner than before (capped per day).
 */
export async function fightMessAction(input: { day: string; spaceId: string; before: number; after: number; minutes?: number | null; took?: number | null; gave?: number | null }) {
  const ownerId = await requireProfileId();
  const { normalizeCleaning, battleXp, battleXpToday, levelOfTen } = await import("@/lib/cleaning");
  const extras = await readExtras(ownerId);
  const c = normalizeCleaning(extras.cleaning);
  if (!c) throw new Error("Set up your spaces first.");
  const space = c.spaces.find((s) => s.id === input.spaceId);
  if (!space) throw new Error("That space is gone.");
  // The app day the screen is on (the client knows the owner's time zone).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error("Bad day.");
  const day = input.day;
  const n = (v: unknown, max: number) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(max, Math.round(Number(v)))));
  const before = n(input.before, 10) ?? 5;
  const after = n(input.after, 10) ?? before;
  const minutes = n(input.minutes, 600);
  const xpEarned = battleXpToday(c, day, battleXp(before, after, minutes));
  const next = normalizeCleaning({
    ...c,
    spaces: c.spaces.map((s) => (s.id === space.id ? { ...s, level: levelOfTen(after), mess: after, ratedOn: day } : s)),
    battles: [...(c.battles ?? []), { on: day, spaceId: space.id, before, after, minutes, took: n(input.took, 5), gave: n(input.gave, 5), xp: xpEarned }],
  })!;
  const { error } = await writeExtra(ownerId, "cleaning", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  const award = xpEarned > 0 ? await xp.awardXp(ownerId, xpEarned, "mess_battle") : null;
  revalidatePath("/");
  return { cleaning: next, xp: xpEarned, totalXp: award?.totalXp ?? null, coinsEarned: award?.coinsEarned ?? 0 };
}

/** Paint an inventory item's portrait (from its name, or your own description of the picture). */
export async function paintInventoryItemAction(name: string, description?: string | null): Promise<string> {
  const ownerId = await requireProfileId();
  const trimmed = (description?.trim() || name.trim()).slice(0, 200);
  if (!trimmed) throw new Error("Name the item first.");
  assertFamilyFriendly(trimmed);
  const { buildInventoryIconPrompt } = await import("@/lib/ai-image");
  return generateAndStoreImage(buildInventoryIconPrompt(trimmed), `inventory/${ownerId}-${Date.now()}.jpg`);
}

/** A quest to go refill something from the backpack. */
export async function makeRefillQuestAction(itemName: string) {
  const ownerId = await requireProfileId();
  const task = await tasksData.createTask(ownerId, { title: `Refill: ${itemName.trim().slice(0, 100)}`, importance: 2.5, urgency: 3, xpValue: 10, estimateMinutes: 15 });
  revalidatePath("/");
  return task.id;
}

/** Show a quest on other boards too (it keeps living on its own board). */
export async function setTaskAlsoOnAction(taskId: string, boardIds: string[]) {
  const ownerId = await requireProfileId();
  const { data: t } = await supabaseAdmin().from("tasks").select("board_id, also_on").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<{ board_id: string | null; also_on: string[] | null }>();
  if (!t) throw new Error("Quest not found.");
  const clean = [...new Set(boardIds.filter((b) => b && b !== t.board_id))].slice(0, 8);
  const { error } = await supabaseAdmin().from("tasks").update({ also_on: clean }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/also_on/.test(error.message) ? "Linking to more boards needs a quick database update first." : `Couldn't save: ${error.message}`);
  for (const b of new Set([...(t.also_on ?? []), ...clean])) revalidatePath(`/boards/${b}`);
  revalidatePath("/boards");
  return clean;
}

/**
 * An inventory item's picture from a photo: as it is ("photo"), or repainted
 * as an illustration in the inventory style ("illustrate").
 */
export async function inventoryPhotoAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const file = formData.get("file");
  const mode = String(formData.get("mode") || "photo");
  const name = String(formData.get("name") || "").trim().slice(0, 80) || "an item";
  if (!(file instanceof File)) throw new Error("No photo was attached.");
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("That photo is too big (12 MB at most).");
  const sharp = (await import("sharp")).default;
  const raw = Buffer.from(await file.arrayBuffer());
  const db = supabaseAdmin();
  let bytes: Buffer;
  const ext = "webp";
  const type = "image/webp";
  if (mode === "illustrate") {
    assertFamilyFriendly(name);
    const { illustrateFromPhoto, buildInventoryIconPrompt } = await import("@/lib/ai-image");
    try {
      bytes = await sharp(await illustrateFromPhoto(raw, buildInventoryIconPrompt(name))).webp({ quality: 86 }).toBuffer();
    } catch {
      // The photo painter is unavailable: paint it from its name instead.
      return generateAndStoreImage(buildInventoryIconPrompt(name), `inventory/${ownerId}-${Date.now()}.jpg`);
    }
  } else {
    bytes = await sharp(raw).rotate().resize(640, 640, { fit: "cover" }).webp({ quality: 84 }).toBuffer();
  }
  const path = `inventory/${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("ai-images").upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`Couldn't store the picture: ${error.message}`);
  return db.storage.from("ai-images").getPublicUrl(path).data.publicUrl;
}

/** Edit a logged event or #tag. */
export async function updateCheckNoteAction(id: string, edit: string | { text?: string; details?: string | null; tone?: number | null; at?: string }) {
  const ownerId = await requireProfileId();
  const note = await energyData.updateCheckNote(ownerId, id, edit);
  revalidatePath("/insights");
  revalidatePath("/");
  return note;
}

/** The forecast place, kept on your account (beside your other personal extras). */
export async function saveWeatherPlaceAction(place: { lat: number; lon: number; name?: string | null }) {
  const ownerId = await requireProfileId();
  const lat = Math.round(Number(place.lat) * 100) / 100;
  const lon = Math.round(Number(place.lon) * 100) / 100;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("That place doesn't look right.");
  await writeExtra(ownerId, "weather", { lat, lon, name: place.name?.slice(0, 60) ?? null });
}

/** Quests counted in something other than percent ("12 of 32 pages"), by quest id. */
export async function progressUnitsAction() {
  const ownerId = await requireProfileId();
  const { cleanUnits } = await import("@/lib/progress-units");
  return cleanUnits((await readExtras(ownerId)).progressUnits);
}

/** Count a quest's progress in pages (or anything), or back in percent (null). */
export async function setProgressUnitAction(taskId: string, unit: import("@/lib/progress-units").ProgressUnit | null) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("Unknown quest.");
  const { cleanUnit, cleanUnits } = await import("@/lib/progress-units");
  const extras = await readExtras(ownerId);
  const all = cleanUnits(extras.progressUnits);
  const u = unit ? cleanUnit(unit) : null;
  if (u) all[taskId] = u;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "progressUnits", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return u;
}

/** Where quests happen ("📍 Natick library"), by quest id. */
export async function questPlacesAction(): Promise<Record<string, string>> {
  const ownerId = await requireProfileId();
  const raw = (await readExtras(ownerId)).questPlaces;
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (/^[0-9a-f-]{36}$/i.test(k) && typeof v === "string" && v.trim()) out[k] = v.slice(0, 80);
  return out;
}

export async function setQuestPlaceAction(taskId: string, place: string | null) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.questPlaces as Record<string, string> | undefined) ?? {}) };
  const p = place?.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  if (p) all[taskId] = p;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "questPlaces", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return p;
}

function cleanLook(v: unknown): CalCardLook | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const color = typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : undefined;
  const image = typeof r.image === "string" && (r.image === "portrait" || /^https:\/\/[^\s"']{8,600}$/.test(r.image)) ? r.image : undefined;
  return color || image ? { ...(color ? { color } : {}), ...(image ? { image } : {}) } : null;
}

/** Driving time to each quest's place (minutes each way) and each quest's calendar card look, by quest id. */
/** A quest's own time range ("09:00"–"14:00"; either end alone works), for the auto-scheduler. */
export type QuestWindow = { from?: string; to?: string };

const HHMM = /^[0-2][0-9]:[0-5][0-9]$/;

function cleanWindow(v: unknown): QuestWindow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const from = typeof o.from === "string" && HHMM.test(o.from) ? o.from : undefined;
  const to = typeof o.to === "string" && HHMM.test(o.to) ? o.to : undefined;
  if (from && to && from >= to) return { from };
  return from || to ? { ...(from ? { from } : {}), ...(to ? { to } : {}) } : null;
}

export async function setQuestWindowAction(taskId: string, win: QuestWindow | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.questWindows as Record<string, QuestWindow> | undefined) ?? {}) };
  const w = cleanWindow(win);
  if (w) all[taskId] = w;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "questWindows", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return w;
}

export async function questCalExtrasAction(): Promise<{ drives: Record<string, number>; looks: Record<string, CalCardLook>; windows: Record<string, QuestWindow> }> {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const drives: Record<string, number> = {};
  const looks: Record<string, CalCardLook> = {};
  for (const [k, v] of Object.entries((extras.questDrives as Record<string, unknown> | undefined) ?? {})) if (QUEST_ID.test(k) && typeof v === "number" && v > 0) drives[k] = Math.min(600, Math.round(v));
  for (const [k, v] of Object.entries((extras.calCardLooks as Record<string, unknown> | undefined) ?? {})) {
    const l = QUEST_ID.test(k) ? cleanLook(v) : null;
    if (l) looks[k] = l;
  }
  const windows: Record<string, QuestWindow> = {};
  for (const [k, v] of Object.entries((extras.questWindows as Record<string, unknown> | undefined) ?? {})) {
    const w = QUEST_ID.test(k) ? cleanWindow(v) : null;
    if (w) windows[k] = w;
  }
  return { drives, looks, windows };
}

export async function setQuestDriveAction(taskId: string, minutes: number | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.questDrives as Record<string, number> | undefined) ?? {}) };
  const m = minutes && minutes > 0 ? Math.min(600, Math.round(minutes)) : null;
  if (m) all[taskId] = m;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "questDrives", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  await mirrorQuestDrive(ownerId, taskId, m); // planner step 3: the new columns follow until readers switch over
  revalidatePath("/calendar");
  return m;
}

export async function setCalCardLookAction(taskId: string, look: CalCardLook | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.calCardLooks as Record<string, CalCardLook> | undefined) ?? {}) };
  const l = cleanLook(look);
  if (l) all[taskId] = l;
  else delete all[taskId];
  const { error } = await writeExtra(ownerId, "calCardLooks", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return l;
}

// Calendar events as quests (owner, Nov 18; XP by the event's length, Nov 19), and one look for a repeating event's quests (owner, Nov 18)
/** Whether upcoming calendar events become quests by themselves. */
export async function eventQuestsSettingAction(): Promise<{ on: boolean }> {
  const ownerId = await requireProfileId();
  return { on: readEventQuestSettingsOf(await readExtras(ownerId)).on };
}

export async function setEventQuestsAction(on: boolean) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const cur = readEventQuestSettingsOf(extras);
  // Turning it on starts from now: events already past stay as they are.
  const next = { ...cur, on, ...(on && !cur.on ? { since: new Date().toISOString() } : {}) };
  const { error } = await writeExtra(ownerId, "eventQuests", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { on };
}

/** "Make it a quest" on an event: remember it (never made again, its event kept on removal) and its series. */
export async function recordEventQuestAction(taskId: string, eventId: string, recurringEventId?: string | null) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId) || !eventId || eventId.length > 300) return;
  const extras = await readExtras(ownerId);
  const cur = readEventQuestSettingsOf(extras);
  const series = { ...((extras.questSeries as Record<string, string> | undefined) ?? {}) };
  if (recurringEventId && recurringEventId.length < 300) series[taskId] = `g:${recurringEventId}`;
  await writeExtra(ownerId, "eventQuests", { ...cur, made: { ...(cur.made ?? {}), [eventId]: taskId } });
  if (recurringEventId) await writeExtra(ownerId, "questSeries", series);
}

const dayKeyOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : "");

/**
 * After a quest of a repeating event is edited: does its look differ from the series' (so it's worth
 * asking "Just this one · This and later · All")? Null when it isn't part of a series or nothing differs.
 */
export async function seriesAskAction(taskId: string): Promise<{ title: string; others: number } | null> {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) return null;
  const extras = await readExtras(ownerId);
  const key = (extras.questSeries as Record<string, string> | undefined)?.[taskId];
  if (!key) return null;
  const { lookFor, sameLook } = await import("@/lib/series-look");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<LookTask>();
  if (!t) return null;
  const card = cleanLook((extras.calCardLooks as Record<string, unknown> | undefined)?.[taskId]);
  const mine = lookOf(t, card);
  // Kept as it is for this one only: don't ask again until it changes once more.
  const kept = (extras.seriesKept as Record<string, string> | undefined)?.[taskId];
  if (kept && kept === JSON.stringify(mine)) return null;
  const siblings = Object.entries((extras.questSeries as Record<string, string>) ?? {}).filter(([id, k]) => k === key && id !== taskId).map(([id]) => id);
  if (!siblings.length) return null;
  const saved = lookFor((extras.seriesLooks as Record<string, import("@/lib/series-look").SeriesEntry[]> | undefined)?.[key], dayKeyOf(t.scheduled_start));
  if (saved) return sameLook(saved, mine) ? null : { title: t.title, others: siblings.length };
  // No look saved yet: ask when this one differs from another of the series.
  const { data: other } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("owner_id", ownerId).in("id", siblings.slice(0, 50)).limit(1).maybeSingle<LookTask>();
  if (!other) return null;
  const otherCard = cleanLook((extras.calCardLooks as Record<string, unknown> | undefined)?.[other.id]);
  return sameLook(lookOf(other, otherCard), mine) ? null : { title: t.title, others: siblings.length };
}

/** Save a quest's look for its whole series ("all"), from its day on ("following"), or keep it to itself ("one"). */
export async function applySeriesLookAction(taskId: string, scope: import("@/lib/series-look").SeriesScope) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(taskId)) throw new Error("Unknown quest.");
  const extras = await readExtras(ownerId);
  const key = (extras.questSeries as Record<string, string> | undefined)?.[taskId];
  if (!key) throw new Error("That quest isn't part of a repeating event.");
  const { withLook } = await import("@/lib/series-look");
  const db = supabaseAdmin();
  const { data: t } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<LookTask>();
  if (!t) throw new Error("Unknown quest.");
  const card = cleanLook((extras.calCardLooks as Record<string, unknown> | undefined)?.[taskId]);
  const look = lookOf(t, card);
  if (scope === "one") {
    const kept = { ...((extras.seriesKept as Record<string, string> | undefined) ?? {}), [taskId]: JSON.stringify(look) };
    await writeExtra(ownerId, "seriesKept", kept);
    return { changed: 0 };
  }
  const day = dayKeyOf(t.scheduled_start);
  const siblings = Object.entries((extras.questSeries as Record<string, string>) ?? {}).filter(([id, k]) => k === key && id !== taskId).map(([id]) => id);
  let targets: LookTask[] = [];
  if (siblings.length) {
    const { data } = await db.from("tasks").select("id, title, icon_key, icon_source, xp_value, coin_value, board_id, color, scheduled_start, status").eq("owner_id", ownerId).in("id", siblings);
    targets = ((data ?? []) as LookTask[]).filter((x) => scope === "all" || (x.scheduled_start && dayKeyOf(x.scheduled_start) >= day));
  }
  // The picture and colours go on every one; XP, coins and board only on ones not finished yet (what a
  // finished quest paid stays as it was).
  const open = targets.filter((x) => x.status === "open").map((x) => x.id);
  const all = targets.map((x) => x.id);
  if (all.length) {
    await db.from("tasks").update({ icon_key: look.iconKey ?? null, icon_source: look.iconSource ?? "library", color: look.color ?? null }).eq("owner_id", ownerId).in("id", all);
  }
  if (open.length) {
    await db.from("tasks").update({ xp_value: look.xp ?? 15, coin_value: look.coins ?? null, board_id: look.boardId ?? null }).eq("owner_id", ownerId).in("id", open);
  }
  const cards = { ...((extras.calCardLooks as Record<string, CalCardLook> | undefined) ?? {}) };
  for (const id of all) {
    if (card) cards[id] = card;
    else delete cards[id];
  }
  const looks = { ...((extras.seriesLooks as Record<string, import("@/lib/series-look").SeriesEntry[]> | undefined) ?? {}) };
  looks[key] = withLook(looks[key], look, scope, day);
  const { error } = await writeExtra(ownerId, "seriesLooks", looks);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  const { error: cardErr } = await writeExtra(ownerId, "calCardLooks", cards);
  if (cardErr) throw new Error(`Couldn't save: ${cardErr.message}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  return { changed: all.length };
}

/** The gem each reward wears on its tag (a diamond unless chosen), kept on the account by reward id. */
export async function rewardGemsAction(): Promise<Record<string, "diamond" | "ruby" | "emerald" | "ink">> {
  const ownerId = await requireProfileId();
  const raw = (await readExtras(ownerId)).rewardGems;
  const ok = ["diamond", "ruby", "emerald", "ink"];
  const out: Record<string, "diamond" | "ruby" | "emerald" | "ink"> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (/^[0-9a-f-]{36}$/i.test(k) && typeof v === "string" && ok.includes(v)) out[k] = v as "diamond";
  return out;
}

export async function setRewardGemAction(rewardId: string, kind: string) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(rewardId)) throw new Error("Unknown reward.");
  if (!["diamond", "ruby", "emerald", "ink"].includes(kind)) throw new Error("Unknown gem.");
  const extras = await readExtras(ownerId);
  const all = { ...((extras.rewardGems as Record<string, string> | undefined) ?? {}) };
  if (kind === "diamond") delete all[rewardId];
  else all[rewardId] = kind;
  const { error } = await writeExtra(ownerId, "rewardGems", all);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

/** A board shown whole (no mist over all but its next step), or misty again. Kept on the account. */
export async function setBoardMistAction(boardId: string, mist: boolean) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) throw new Error("Unknown board.");
  const extras = await readExtras(ownerId);
  const list = (Array.isArray(extras.clearBoards) ? (extras.clearBoards as unknown[]) : []).filter((x): x is string => typeof x === "string" && x !== boardId);
  const next = mist ? list : [...list, boardId].slice(-200);
  const { error } = await writeExtra(ownerId, "clearBoards", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath(`/boards/${boardId}`);
}

/** How a board's quests are listed: your own drag order, or by due date, newest, XP or name (kept per board on the account). */
export async function saveBoardOrderAction(boardId: string, order: { by: string; ids?: string[] }) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(boardId)) throw new Error("Unknown board.");
  const { normalizeBoardOrder } = await import("@/lib/board-order");
  const extras = await readExtras(ownerId);
  const all = (extras.boardOrders && typeof extras.boardOrders === "object" ? (extras.boardOrders as Record<string, unknown>) : {}) as Record<string, unknown>;
  const next = { ...all, [boardId]: normalizeBoardOrder(order) };
  // Keep the newest 200 boards' choices.
  const keys = Object.keys(next);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete next[k];
  const { error } = await writeExtra(ownerId, "boardOrders", next);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

export async function listQuestTemplatesAction() {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  return normalizeTemplates((await readExtras(ownerId)).templates);
}

/** Add a template, or replace the one with the same id. */
export async function saveQuestTemplateAction(tpl: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  const [clean] = normalizeTemplates([tpl]);
  if (!clean) throw new Error("That template needs a title.");
  const extras = await readExtras(ownerId);
  const list = normalizeTemplates(extras.templates).filter((t) => t.id !== clean.id);
  const next = [...list, clean].sort((a, b) => a.name.localeCompare(b.name));
  const { error } = await writeExtra(ownerId, "templates", next);
  if (error) throw new Error(`Couldn't save the template: ${error.message}`);
  return next;
}

export async function deleteQuestTemplateAction(id: string) {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  const extras = await readExtras(ownerId);
  const next = normalizeTemplates(extras.templates).filter((t) => t.id !== id);
  await writeExtra(ownerId, "templates", next);
  return next;
}

/** What the toucan keeps an eye on: your open quests (scored in the browser, in your time zone) and what you've waved off. With `guesses`, also quests whose deadline looks like an event on your calendar. */
export async function toucanWatchAction(opts: { guesses?: boolean } = {}) {
  const { profileId: ownerId, accessToken } = await requireSessionMaybeGoogle();
  const [tasks, extras] = await Promise.all([guideTasks(ownerId), readExtras(ownerId)]);
  const { cleanCoach, duePromises, readyReminders } = await import("@/lib/coach");
  const coach = cleanCoach(extras.coach);
  const asked = (extras.toucanDueAsked as Record<string, string> | undefined) ?? {};
  const wantNext = coach.promises.some((p) => p.status === "open" && p.next);
  const wantGuesses = !!opts.guesses && tasks.some((t) => !t.due_at && !asked[t.id]);
  // "Next time" reminders look at your calendar from a little while ago to tomorrow morning;
  // deadline guesses look a week ahead.
  let events: { title: string; start: string; end: string }[] = [];
  if (accessToken && (wantNext || wantGuesses)) {
    try {
      const { listEventsAllCalendars } = await import("@/lib/google-calendar");
      const now = Date.now();
      const all = await listEventsAllCalendars(accessToken, new Date(now - 3 * 3_600_000), new Date(now + (wantGuesses ? 8 * 86_400_000 : 20 * 3_600_000)));
      events = all.events.filter((e) => Date.parse(e.end) > now).map((e) => ({ title: e.title, start: e.start, end: e.end }));
    } catch {
      /* no calendar right now: the reminder waits */
    }
  }
  const soonEvents = events.filter((e) => Date.parse(e.start) < Date.now() + 20 * 3_600_000);
  const { nextNear, standing } = readyReminders(coach.promises, soonEvents);
  const { deadlineGuesses } = await import("@/lib/toucan-guide");
  const guesses = wantGuesses ? deadlineGuesses(tasks, events, asked) : [];
  return { tasks, snoozed: ((extras.toucanSnooze as Record<string, string> | undefined) ?? {}), promises: coach.promises.filter((p) => p.status === "open"), due: duePromises(coach), nextNear, standing, guesses };
}

/** The toucan asked "is this due before <event>?": yes sets the due date; either way it won't ask about this quest again. */
export async function answerDeadlineGuessAction(taskId: string, dueAt: string | null) {
  const ownerId = await requireProfileId();
  if (dueAt) {
    const when = new Date(dueAt);
    if (Number.isNaN(when.getTime())) throw new Error("That date didn't look right.");
    const { error } = await supabaseAdmin().from("tasks").update({ due_at: when.toISOString() }).eq("id", taskId).eq("owner_id", ownerId);
    if (error) throw new Error(`Couldn't set the due date: ${error.message}`);
  }
  const extras = await readExtras(ownerId);
  const asked = { ...((extras.toucanDueAsked as Record<string, string> | undefined) ?? {}), [taskId.slice(0, 40)]: new Date().toISOString() };
  // Keep the record small: the most recent 200 answers.
  const kept = Object.fromEntries(Object.entries(asked).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 200));
  await writeExtra(ownerId, "toucanDueAsked", kept);
  revalidatePath("/");
}

/** "Not now": the toucan won't raise this quest again for a while. */
export async function snoozeToucanAction(taskId: string, days = 1) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const now = Date.now();
  const kept = Object.fromEntries(Object.entries((extras.toucanSnooze as Record<string, string> | undefined) ?? {}).filter(([, until]) => Date.parse(until) > now));
  kept[taskId.slice(0, 40)] = new Date(now + Math.max(0.01, Math.min(30, days)) * 86_400_000).toISOString();
  await writeExtra(ownerId, "toucanSnooze", kept);
}

/** Save how long a quest will take (the first rung: estimate, schedule, do). */
export async function setQuestEstimateAction(taskId: string, minutes: number) {
  const ownerId = await requireProfileId();
  const m = Math.max(5, Math.min(600, Math.round(minutes)));
  const { error } = await supabaseAdmin().from("tasks").update({ estimate_minutes: m }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't save the estimate: ${error.message}`);
  revalidatePath("/");
}

// ---- The Great Toucan Spirit as a guide: memory, promises, and the actions it offers.
async function readCoach(ownerId: string) {
  const extras = await readExtras(ownerId);
  const { cleanCoach } = await import("@/lib/coach");
  return { extras, coach: cleanCoach(extras.coach) };
}

async function writeCoach(ownerId: string, extras: Record<string, unknown>, coach: import("@/lib/coach").CoachState) {
  await writeExtra(ownerId, "coach", coach);
}

/** The conversation so far (recent part), what it remembers and your promises. */
export async function coachStateAction() {
  const ownerId = await requireProfileId();
  const { coach } = await readCoach(ownerId);
  const { duePromises } = await import("@/lib/coach");
  return { history: coach.history.slice(-24), notes: coach.notes, promises: coach.promises.filter((p) => p.status === "open"), due: duePromises(coach) };
}

/** Talk with the Great Toucan Spirit. It sees your quests, recent wins and check-ins, and remembers what you've shared. */
export async function coachAction(message: string, lite = false, liteHistory: { role: "user" | "assistant"; content: string }[] = []) {
  const ownerId = await requireProfileId();
  const text = String(message ?? "").trim().slice(0, 2000);
  if (!text) throw new Error("Say something first.");
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw new Error("The toucan can't talk yet: the AI service isn't set up.");
  const tz = process.env.APP_TIMEZONE || "America/New_York";
  const now = new Date();
  const db = supabaseAdmin();
  const [{ extras, coach }, tasks, profile, wins, checks, boardsRes, aspRes, metrics] = await Promise.all([
    readCoach(ownerId),
    guideTasks(ownerId, { imports: true }),
    profilesData.getProfileById(ownerId),
    winsData.listWinsSince(ownerId, new Date(now.getTime() - 3 * 86_400_000).toISOString()).catch(() => []),
    energyData.latestCheckIns(ownerId, new Date(now.getTime() - 36 * 3_600_000).toISOString()).catch(() => ({})),
    db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId),
    db.from("tasks").select("title").eq("owner_id", ownerId).eq("status", "open").eq("is_aspiration", true).limit(12),
    energyData.getCheckMetrics(ownerId).catch(() => [] as string[]),
  ]);
  const { contextLines } = await import("@/lib/toucan-guide");
  const { coachSystemPrompt, parseReply, asksToMake, asksToShip, MAKES } = await import("@/lib/coach");
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const wheel = cleanWheel(extras.wheelOfTime);
  const { mentioned } = await import("@/lib/toucan-guide");
  const { catchUpPlan, catchUpOrder } = await import("@/lib/catch-up");
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
  const who = profile?.name?.split(" ")[0] || "friend";
  const boards = (boardsRes.data ?? []) as { id: string; title: string; parent_board_id: string | null }[];
  // Coursework in the agreed order: what's coming up first, then catching up from the beginning.
  const courseIds = new Set(((extras.catchUp as { boards?: string[] } | undefined)?.boards ?? []).filter((id) => boards.some((b) => b.id === id)));
  const course = catchUpOrder(catchUpPlan(tasks.filter((t) => t.board_id && courseIds.has(t.board_id)), now)).slice(0, 14);
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: tz });
  const today = tasks.filter((t) => t.scheduled_start && new Date(t.scheduled_start).toLocaleDateString("en-CA", { timeZone: tz }) === todayKey).map((t) => `- ${new Date(t.scheduled_start!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}: "${t.title}"`);
  const questLines = contextLines(tasks.map((t) => (t.needs_review ? { ...t, title: t.title, board: `${t.board ?? "no board"}, imported, not yet sorted` } : t)), now, 60);
  const { cleanStyle, styleLines } = await import("@/lib/toucan-style");
  const system = coachSystemPrompt({
    who,
    when: now.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }),
    quests: [
      ...(course.length ? [`Coursework, in the order they chose (coming up first, then catching up from the beginning): ${course.map((c, i) => `${i + 1}. "${c.title}"${c.due_at ? ` (due ${fmtWhen(c.due_at)})` : ""}`).join("; ")}`] : []),
      ...questLines,
    ],
    aspirations: ((aspRes.data ?? []) as { title: string }[]).map((a) => `- ${a.title}`),
    areas: boards.filter((b) => !b.parent_board_id).map((b) => `- ${b.title}`),
    wins: (wins as { kind: string; title: string; at: string }[]).filter((w) => w.kind !== "login" && w.kind !== "feedback").slice(0, 12).map((w) => `- ${w.title} (${fmtWhen(w.at)})`),
    checkIn: Object.entries(checks as Record<string, { level: number; at: string }>).slice(0, 8).map(([k, v]) => `- ${k}: ${v.level}`),
    today,
    notes: lite ? [] : coach.notes.map((n) => `- ${n.text}`),
    promises: lite ? [] : coach.promises.filter((p) => p.status === "open").map((p) => `- ${p.text}${p.due ? ` (for ${fmtWhen(p.due)})` : p.next ? ` (next time: ${p.next})` : ""}`),
    style: styleLines(cleanStyle(extras.toucanStyle)),
    lite,
    todayKey: `${todayKey} (${now.toLocaleDateString("en-US", { weekday: "long", timeZone: tz })})`,
    metrics,
    effort: wheel.effort,
    hindrances: wheel.hindrances,
    priorities: cleanPriorities(extras.priorities)
      .filter((p) => Date.parse(p.at) > now.getTime() - 35 * 86_400_000)
      .slice(0, 12)
      .map((p, i) => `- ${p.day === tomorrowData.appDayKey() ? "Today" : new Date(`${p.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}${i === 0 ? " (latest)" : ""}: ${p.text.replace(/\n+/g, "; ")}${p.others?.length ? ` · other priorities: ${p.others.join("; ")}` : ""}`),
  });
  // The app's owner asking to build their feedback: the app starts that build (a card shows it).
  const ship = !lite && asksToShip(text) && (await feedbackData.isAdmin(ownerId)) ? await (await import("@/lib/data/feedback-run")).pendingFeedback(ownerId) : null;
  const shipLine =
    ship === null
      ? ""
      : `\n\nThey are asking you to build their app feedback. The app is starting that build right now (${ship} note${ship === 1 ? "" : "s"} waiting) and shows a card for it. Say in a sentence or two that you've sent ${ship ? `their ${ship} note${ship === 1 ? "" : "s"}` : "it"} to the builders and the changes go live on their own when they're done${ship ? "" : " (though nothing new is waiting right now)"}. Offer no ACTIONS line.`;
  // The light guide keeps no memory: it sees only this conversation.
  const past = lite ? liteHistory.slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1200) })) : coach.history.slice(-12);
  const history = [...past, { role: "user" as const, content: text }];
  const messages = [{ role: "system", content: system + shipLine }, ...history.map((m) => ({ role: m.role, content: m.content }))];
  let raw = "";
  for (const model of ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"]) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_tokens: 520, temperature: 0.65, messages }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      raw = String(json?.result?.response ?? "").trim();
      if (raw) break;
    } catch {
      /* try the next model */
    }
  }
  if (!raw) throw new Error("The toucan is lost in thought. Try again in a moment.");
  const { text: reply, actions: parsed } = parseReply(raw, tasks, { metrics, effort: wheel.effort, hindrances: wheel.hindrances });
  // Asked to add or log something: the app makes those entries itself (each with an undo).
  const makeNow = asksToMake(text);
  const actions = ship !== null ? [{ type: "ship" as const, pending: ship, auto: true }] : parsed.map((a) => ((MAKES as readonly string[]).includes(a.type) ? { ...a, auto: makeNow } : a));
  if (lite) {
    // Plan buttons for the quests it names; nothing remembered.
    const named = mentioned(reply, tasks).map((q) => ({ type: "plan" as const, questId: q.id, quest: q.title }));
    return { reply, actions: named, remembered: [] as import("@/lib/coach").CoachNote[] };
  }
  // What it learns about you, it keeps (you can see and remove each note).
  const remembered = actions.filter((a): a is Extract<typeof a, { type: "remember" }> => a.type === "remember").map((a) => ({ id: crypto.randomUUID().slice(0, 8), text: a.note, at: now.toISOString() }));
  const stamp = now.toISOString();
  const next = {
    ...coach,
    history: [...coach.history, { role: "user" as const, content: text, at: stamp }, { role: "assistant" as const, content: reply, at: stamp }].slice(-40),
    notes: [...coach.notes, ...remembered].slice(-30),
  };
  await writeCoach(ownerId, extras, next);
  return { reply, actions: actions.filter((a) => a.type !== "remember"), remembered };
}

/** Start the conversation over (what it remembers about you stays, unless you remove it). */
export async function coachClearAction() {
  const ownerId = await requireProfileId();
  const { extras, coach } = await readCoach(ownerId);
  await writeCoach(ownerId, extras, { ...coach, history: [] });
}

/** Remove something the toucan remembered. */
export async function coachForgetAction(noteId: string) {
  const ownerId = await requireProfileId();
  const { extras, coach } = await readCoach(ownerId);
  await writeCoach(ownerId, extras, { ...coach, notes: coach.notes.filter((n) => n.id !== noteId) });
}

/** Make a promise (a "when…, then I will…"), or settle one: kept, missed or let go. */
export async function coachPromiseAction(input: { add?: { text: string; when: string | null; next?: string | null; questId?: string | null }; settle?: { id: string; status: "kept" | "missed" | "released" }; push?: { id: string; minutes: number } }) {
  const ownerId = await requireProfileId();
  const { extras, coach } = await readCoach(ownerId);
  let promises = coach.promises;
  if (input.add) {
    const due = input.add.when ? new Date(input.add.when) : null;
    promises = [...promises, { id: crypto.randomUUID().slice(0, 8), text: input.add.text.slice(0, 180), due: due && !Number.isNaN(due.getTime()) ? due.toISOString() : null, next: input.add.next?.trim().slice(0, 40) || null, questId: input.add.questId ?? null, status: "open" as const, at: new Date().toISOString() }];
  }
  if (input.settle) promises = promises.map((p) => (p.id === input.settle!.id ? { ...p, status: input.settle!.status } : p));
  if (input.push) promises = promises.map((p) => (p.id === input.push!.id ? { ...p, due: new Date(Date.now() + input.push!.minutes * 60_000).toISOString() } : p));
  await writeCoach(ownerId, extras, { ...coach, promises: promises.slice(-30) });
  return promises.filter((p) => p.status === "open");
}

/** Add small steps to a quest (after the ones it already has). */
export async function coachAddStepsAction(taskId: string, titles: string[]) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  const existing = (await stepsData.listStepsForTask(taskId, ownerId)) ?? [];
  const fresh = titles.map((t) => t.trim()).filter(Boolean).slice(0, 8);
  await stepsData.replaceSteps(taskId, ownerId, [
    ...existing.map((st) => ({ id: st.id, title: st.title, done: st.done, xp: st.xp ?? undefined, weight: st.weight ?? null, progress: st.progress ?? undefined, seconds: st.seconds_spent ?? undefined, state: st.state ?? null })),
    ...fresh.map((title) => ({ title, done: false })),
  ]);
  revalidatePath("/");
}

/** A quest the toucan suggested (something you named that wasn't on your list yet). */
export async function coachNewQuestAction(title: string, minutes: number | null, dueISO: string | null = null) {
  const ownerId = await requireProfileId();
  const t = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) throw new Error("Give it a name.");
  const due = dueISO && Number.isFinite(Date.parse(dueISO)) ? new Date(dueISO).toISOString() : null;
  const task = await tasksData.createTask(ownerId, { title: t, importance: 3, urgency: 3, xpValue: 15, estimateMinutes: minutes ?? null, dueAt: due });
  revalidatePath("/");
  return task.id;
}

/** The toucan moves a quest's due date when asked ("make it due Monday"); returns the old one for Undo. */
export async function coachSetDueAction(taskId: string, dueISO: string | null) {
  const ownerId = await requireProfileId();
  const due = dueISO && Number.isFinite(Date.parse(dueISO)) ? new Date(dueISO).toISOString() : null;
  const db = supabaseAdmin();
  const { data: was, error: readErr } = await db.from("tasks").select("due_at").eq("id", taskId).eq("owner_id", ownerId).maybeSingle();
  if (readErr || !was) throw new Error("Couldn't find that quest.");
  const { error } = await db.from("tasks").update({ due_at: due }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't change the due date: ${error.message}`);
  revalidatePath("/");
  return { was: (was as { due_at: string | null }).due_at };
}

/** Start building the owner's app feedback (the toucan's "ship" card). Only the app's owner can. */
export async function coachShipFeedbackAction() {
  const ownerId = await requireProfileId();
  if (!(await feedbackData.isAdmin(ownerId))) throw new Error("Only the app's owner can start an update.");
  const run = await import("@/lib/data/feedback-run");
  const pending = await run.pendingFeedback(ownerId);
  if (!pending) return { url: null, already: false, queued: false, pending };
  const r = await run.startRun(pending);
  return { url: r.url, already: !!r.already, queued: !!r.queued, pending };
}

/** Save (or remove, with "") the token that lets the app start feedback builds. */
export async function saveFeedbackRunTokenAction(token: string) {
  const ownerId = await requireProfileId();
  if (!(await feedbackData.isAdmin(ownerId))) throw new Error("Only the app's owner can change that.");
  await (await import("@/lib/data/feedback-run")).saveRunToken(token);
  revalidatePath("/feedback-review");
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

/** A check-in the toucan logged; returns what it saved so it can be undone. */
export async function coachCheckInAction(energy: number | null, metrics: { metric: string; level: number }[]) {
  const ownerId = await requireProfileId();
  if (energy === null && !metrics.length) throw new Error("Nothing to check in yet.");
  const entry = energy === null ? null : await energyData.logEnergy(ownerId, energy);
  const extra = metrics.length ? await energyData.logCheckIns(ownerId, metrics) : [];
  revalidatePath("/");
  revalidatePath("/insights");
  return { energyId: entry?.id ?? null, checkInIds: extra.map((r) => r.id).filter((id): id is string => !!id) };
}

/** Take back a check-in the toucan logged. */
export async function coachUndoCheckInAction(ref: { energyId: string | null; checkInIds: string[] }) {
  const ownerId = await requireProfileId();
  await energyData.deleteReadings(ownerId, ref.energyId ? [ref.energyId] : [], ref.checkInIds);
  revalidatePath("/");
  revalidatePath("/insights");
}

/**
 * A night the toucan logged on the Wheel of Time, added to what's already
 * there for that morning. Returns the night as it was, for undo.
 */
export async function coachLogNightAction(input: { day: string | null; bed: string | null; wake: string | null; effort: string[]; hindrances: string[] }) {
  const ownerId = await requireProfileId();
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const wheel = cleanWheel((await readExtras(ownerId)).wheelOfTime);
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : tomorrowData.appDayKey();
  const was = wheel.log[day] ?? null;
  const hindrances = [...(was?.hindrances ?? [])];
  for (const h of input.hindrances) if (!hindrances.some((x) => x.name === h)) hindrances.push({ name: h });
  await saveNightAction({ day, bed: input.bed ?? was?.bed ?? null, wake: input.wake ?? was?.wake ?? null, effort: [...new Set([...(was?.effort ?? []), ...input.effort])], hindrances });
  return { day, was };
}

/** Put a night back the way it was before the toucan logged it. */
export async function coachUndoNightAction(day: string, was: import("@/lib/wheel-of-time").NightLog | null) {
  await saveNightAction({ day, bed: was?.bed ?? null, wake: was?.wake ?? null, effort: was?.effort ?? [], hindrances: was?.hindrances ?? [] });
}

// ---- Getting up to date on coursework.
/** Your boards with dated quests (imports included), for the catch-up plan. */
export async function courseworkAction() {
  const ownerId = await requireProfileId();
  const [tasks, extras] = await Promise.all([guideTasks(ownerId, { imports: true }), readExtras(ownerId)]);
  const dated = tasks.filter((t) => t.due_at && t.board_id);
  const byBoard = new Map<string, { id: string; title: string; dated: number }>();
  for (const t of dated) {
    const b = byBoard.get(t.board_id!) ?? { id: t.board_id!, title: t.board ?? "Board", dated: 0 };
    b.dated += 1;
    byBoard.set(t.board_id!, b);
  }
  const saved = (extras.catchUp as { boards?: string[] } | undefined)?.boards ?? null;
  return {
    boards: [...byBoard.values()].sort((a, b) => b.dated - a.dated),
    chosen: saved,
    items: tasks.filter((t) => t.board_id && byBoard.has(t.board_id)).map((t) => ({ id: t.id, title: t.title, due_at: t.due_at, estimate_minutes: t.estimate_minutes, board: t.board, board_id: t.board_id, needs_review: t.needs_review, scheduled_start: t.scheduled_start })),
  };
}

/**
 * Use a catch-up plan: its imported quests become real quests, estimates are
 * kept, and the whole order goes to the top of your scheduling list (so the
 * scheduler, the toucan and Today all follow it).
 */
export async function applyCatchUpAction(boardIds: string[], orderedIds: string[], estimates: Record<string, number>) {
  const ownerId = await requireProfileId();
  const db = supabaseAdmin();
  const ids = [...new Set(orderedIds)].slice(0, 80);
  if (ids.length) await db.from("tasks").update({ needs_review: false }).eq("owner_id", ownerId).in("id", ids).eq("needs_review", true);
  await Promise.all(
    Object.entries(estimates)
      .filter(([id, m]) => ids.includes(id) && m > 0)
      .map(([id, m]) => db.from("tasks").update({ estimate_minutes: Math.max(5, Math.min(600, Math.round(m))) }).eq("owner_id", ownerId).eq("id", id))
  );
  const current = (await schedulingData.listSchedulingList(ownerId)).map((t) => t.id).filter((id) => !ids.includes(id));
  await schedulingData.setSchedulingOrder(ownerId, [...ids, ...current]);
  await writeExtra(ownerId, "catchUp", { boards: boardIds.slice(0, 20), at: new Date().toISOString() });
  revalidatePath("/", "layout");
}

/** How much the toucan does (simple, light guide, full guide) and which of his lines are switched off. */
export async function saveToucanPrefsAction(patch: { mode?: "simple" | "lite" | "full"; retired?: string[] }) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const prev = (extras.toucanPrefs as { mode?: string; retired?: string[] } | undefined) ?? {};
  const next = {
    mode: patch.mode && ["simple", "lite", "full"].includes(patch.mode) ? patch.mode : (prev.mode ?? "full"),
    retired: Array.isArray(patch.retired) ? patch.retired.filter((x) => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 200) : (prev.retired ?? []),
  };
  await writeExtra(ownerId, "toucanPrefs", next);
}

export async function toucanPrefsAction() {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const p = (extras.toucanPrefs as { mode?: "simple" | "lite" | "full"; retired?: string[] } | undefined) ?? {};
  const { cleanStyle } = await import("@/lib/toucan-style");
  return { mode: p.mode ?? "full", retired: p.retired ?? [], style: cleanStyle(extras.toucanStyle) };
}

/** Save how you like to be checked in (the check-in quiz, or Settings). */
export async function saveToucanStyleAction(style: unknown) {
  const ownerId = await requireProfileId();
  const { cleanStyle } = await import("@/lib/toucan-style");
  const clean = cleanStyle(style);
  await writeExtra(ownerId, "toucanStyle", clean);
  revalidatePath("/", "layout");
  return clean;
}

/** The colour theme for the Adventure look (forest, moonlit, ember…). */
export async function savePaletteAction(palette: string) {
  const ownerId = await requireProfileId();
  const { isPalette } = await import("@/lib/palettes");
  if (!isPalette(palette)) throw new Error("That isn't one of the colour themes.");
  await writeExtra(ownerId, "palette", palette);
  revalidatePath("/", "layout");
}

export async function saveMapPrefsAction(boardId: string, prefs: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const all = { ...((extras.mapPrefs as Record<string, unknown>) ?? {}), [boardId.slice(0, 40)]: JSON.parse(JSON.stringify(prefs ?? {})) };
  await writeExtra(ownerId, "mapPrefs", all);
}

/* ── Quest sequences ─────────────────────────────────────────────────── */
/** The sequence a quest belongs to, front to back. */
export async function sequenceOfAction(taskId: string) {
  const ownerId = await requireProfileId();
  const { sequenceOf } = await import("@/lib/data/sequences");
  return sequenceOf(ownerId, taskId);
}

/** One quest, whole, to open in the editor from somewhere that only has its id (e.g. a quest waiting in a sequence). */
export async function questForEditAction(taskId: string) {
  const ownerId = await requireProfileId();
  return tasksData.getTask(taskId, ownerId);
}

/** Open quests to pick from when adding one to a sequence (title search). */
export async function findQuestsAction(query: string, exclude: string[] = []) {
  const ownerId = await requireProfileId();
  let q = supabaseAdmin().from("tasks").select("id, title, board_id, icon_key").eq("owner_id", ownerId).eq("status", "open").is("reward_id", null);
  const term = query.replace(/[%,()]/g, " ").trim();
  if (term) q = q.ilike("title", `%${term}%`);
  const { data } = await q.order("updated_at", { ascending: false }).limit(40);
  const skip = new Set(exclude);
  return ((data ?? []) as { id: string; title: string; board_id: string | null; icon_key: string | null }[]).filter((t) => !skip.has(t.id)).slice(0, 12);
}

/**
 * Put a quest before or after another in its sequence: an existing quest, or
 * a new one by title (made on the same board). Returns the updated sequence.
 */
export async function sequenceLinkAction(anchorId: string, where: "before" | "after", pick: { id: string } | { title: string }) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const anchor = await tasksData.getTask(anchorId, ownerId);
  if (!anchor) throw new Error("That quest isn't there any more.");
  let id: string;
  if ("id" in pick) id = pick.id;
  else {
    const title = pick.title.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!title) throw new Error("Give the new quest a name.");
    const made = await tasksData.createTask(ownerId, { title, boardId: anchor.board_id ?? null, goalId: anchor.goal_id ?? null });
    id = made.id;
  }
  // A quest already in a sequence just moves here.
  if (where === "after") await seq.placeAfter(ownerId, id, anchorId);
  else {
    await seq.placeBefore(ownerId, id, anchorId);
    // The quest put in front takes the anchor's place (owner, Nov 4: adding a pre-quest to a quest on
    // Today made both vanish: the anchor was locked away and the new one wasn't on Today).
    const take: Record<string, unknown> = {};
    const order = (anchor as unknown as { sort_order?: number }).sort_order;
    if (typeof order === "number") take.sort_order = order;
    if (anchor.is_manual_priority) take.is_manual_priority = true;
    if (Object.keys(take).length) await supabaseAdmin().from("tasks").update(take).eq("owner_id", ownerId).eq("id", id).eq("status", "open");
  }
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, anchorId);
}

/**
 * Turn a quest into a project: each of its open top-level steps becomes its
 * own quest, in order, ahead of this one (their sub-tasks come along as their
 * steps). The quest itself comes last and closes the project out.
 */
export async function stepsToSequenceAction(taskId: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const anchor = await tasksData.getTask(taskId, ownerId);
  if (!anchor) throw new Error("That quest isn't there any more.");
  const all = (await stepsData.listStepsForTask(taskId, ownerId)) ?? [];
  const tops = all.filter((s) => !s.parent_id && !s.done && !s.state);
  if (!tops.length) throw new Error("This quest has no open steps to turn into quests.");
  const under = (id: string): typeof all => all.filter((s) => s.parent_id === id).flatMap((s) => [s, ...under(s.id)]);
  const moved = new Set<string>();
  for (const [i, st] of tops.entries()) {
    const made = await tasksData.createTask(ownerId, {
      title: st.title.slice(0, 200),
      boardId: anchor.board_id ?? null,
      goalId: anchor.goal_id ?? null,
      // The first one takes the project's place on Today.
      isManualPriority: i === 0 && !!anchor.is_manual_priority,
    });
    await seq.placeBefore(ownerId, made.id, taskId);
    const kids = under(st.id);
    if (kids.length) {
      await stepsData.replaceSteps(
        made.id,
        ownerId,
        kids.map((k) => ({ key: k.id, parentKey: k.parent_id === st.id ? null : (k.parent_id ?? null), title: k.title, done: k.done, xp: k.xp ?? 0, weight: k.weight ?? null, progress: k.progress ?? 0, state: k.state ?? null }))
      );
    }
    moved.add(st.id);
    for (const k of kids) moved.add(k.id);
  }
  await stepsData.replaceSteps(
    taskId,
    ownerId,
    all.filter((s) => !moved.has(s.id)).map((s) => ({ id: s.id, key: s.id, parentKey: s.parent_id ?? null, title: s.title, done: s.done, xp: s.xp ?? 0, weight: s.weight ?? null, progress: s.progress ?? 0, state: s.state ?? null }))
  );
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, taskId);
}

/** Take a quest out of its sequence (the rest close up). */
export async function sequenceDetachAction(taskId: string, viewFrom?: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  await seq.detachFromSequence(ownerId, taskId);
  revalidatePath("/", "layout");
  return viewFrom ? seq.sequenceOf(ownerId, viewFrom) : [];
}

/** Move a quest one place earlier or later in its sequence. */
/**
 * The open quests of a sequence in a new order (the sequence window's cards are dragged, owner Nov 4).
 * The front quest takes the old front's place on Today, so the sequence never drops out of sight.
 */
export async function sequenceReorderAction(ids: string[], viewFrom: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const chain = (await seq.sequenceOf(ownerId, viewFrom)).filter((t) => t.status === "open" && !t.reward);
  const known = new Set(chain.map((c) => c.id));
  const order = ids.filter((id) => known.has(id));
  if (order.length !== chain.length || order.every((id, i) => id === chain[i].id)) return seq.sequenceOf(ownerId, viewFrom);
  const db = supabaseAdmin();
  const { data: front } = await db.from("tasks").select("locked_by_task_id, is_manual_priority, sort_order").eq("owner_id", ownerId).eq("id", chain[0].id).maybeSingle<{ locked_by_task_id: string | null; is_manual_priority: boolean; sort_order: number | null }>();
  for (let i = 0; i < order.length; i++) {
    const patch: Record<string, unknown> = { locked_by_task_id: i === 0 ? (front?.locked_by_task_id ?? null) : order[i - 1] };
    if (i === 0 && order[0] !== chain[0].id) {
      if (front?.is_manual_priority) patch.is_manual_priority = true;
      if (typeof front?.sort_order === "number") patch.sort_order = front.sort_order;
    }
    await db.from("tasks").update(patch).eq("owner_id", ownerId).eq("id", order[i]);
  }
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, viewFrom);
}

export async function sequenceMoveAction(taskId: string, dir: -1 | 1, viewFrom?: string) {
  const ownerId = await requireProfileId();
  const seq = await import("@/lib/data/sequences");
  const chain = (await seq.sequenceOf(ownerId, taskId)).filter((t) => t.status === "open");
  const i = chain.findIndex((t) => t.id === taskId);
  const other = chain[i + dir];
  if (i >= 0 && other) {
    if (dir < 0) await seq.placeBefore(ownerId, taskId, other.id);
    else await seq.placeAfter(ownerId, taskId, other.id);
  }
  revalidatePath("/", "layout");
  return seq.sequenceOf(ownerId, viewFrom ?? taskId);
}

/* ── Sub-habits ──────────────────────────────────────────────────────── */
/** Save a habit's sub-habit checklist. */
export async function setRiteStepsAction(riteId: string, steps: { id: string; title: string; xp?: number; coins?: number; optional?: boolean }[]) {
  const ownerId = await requireProfileId();
  const clean = ritesData.cleanRiteSteps(steps);
  await ritesData.setRiteSteps(ownerId, riteId, clean);
  revalidatePath("/");
  return clean;
}

/**
 * Tick (or untick) one sub-habit for `day`. Ticking the last required one completes the
 * habit (XP and all); unticking a required one of a completed habit undoes that.
 */
export async function tickRiteStepAction(riteId: string, stepId: string, day: string, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit isn't here anymore.");
  const changed = await ritesData.setRiteStepCheck(ownerId, riteId, stepId, day, on);
  const steps = ritesData.cleanRiteSteps(rite.steps);
  // A sub-habit with its own XP or coins pays them when ticked (and takes them back when unticked).
  const step = steps.find((st) => st.id === stepId);
  if (changed && step) await payStep(ownerId, step, on ? 1 : -1);
  const checks = ((await ritesData.listRiteStepChecks(ownerId, day)) ?? []).filter((c) => c.rite_id === riteId && c.day === day);
  const ticked = new Set(checks.map((c) => c.step_id));
  // Only the required sub-habits finish it; with none required, ticks never complete or undo it.
  const all = stepsComplete(steps, (id) => ticked.has(id));
  const { data: doneRow } = await supabaseAdmin().from("rite_completions").select("id").eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day).maybeSingle();
  let completed: { xp: number; coinsEarned: number } | null = null;
  if (all === true && !doneRow) completed = await completeRiteAction(riteId, day);
  else if (all === false && doneRow) await uncompleteRiteAction(riteId, day);
  revalidatePath("/");
  return { done: all ?? !!doneRow, xp: completed?.xp ?? 0 };
}

async function payStep(ownerId: string, step: ritesData.RiteStep, sign: 1 | -1) {
  if (step.xp) await xp.awardXp(ownerId, sign * step.xp, "task_completed").catch(() => {});
  if (step.coins) await rewardsData.addCoins(ownerId, sign * step.coins).catch(() => {});
}

/** Check (or clear) every sub-habit at once, with the habit itself. */
export async function tickAllRiteStepsAction(riteId: string, day: string, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) return;
  for (const st of ritesData.cleanRiteSteps(rite.steps)) {
    const changed = await ritesData.setRiteStepCheck(ownerId, riteId, st.id, day, on).catch(() => false);
    if (changed) await payStep(ownerId, st, on ? 1 : -1);
  }
}

/* ── Final Boss battle plans ─────────────────────────────────────────── */
/** Your notes on how to beat a Final Boss (kept with your account). */
export async function bossPlanAction(bossId: string) {
  const ownerId = await requireProfileId();
  const plans = ((await readExtras(ownerId)).bossPlans as Record<string, string> | undefined) ?? {};
  return typeof plans[bossId] === "string" ? plans[bossId] : "";
}

export async function saveBossPlanAction(bossId: string, text: string) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const plans = { ...((extras.bossPlans as Record<string, string> | undefined) ?? {}) };
  const t = text.slice(0, 4000);
  if (t.trim()) plans[bossId] = t;
  else delete plans[bossId];
  await writeExtra(ownerId, "bossPlans", plans);
}

/** A habit's interval repeat from the editor, cleaned (null = weekdays). */
// ---- Import cards: sort things in one at a time (import, snooze, skip) ----
export async function listImportCardsAction(): Promise<{ waiting: importCardsData.ImportCard[]; setAside: importCardsData.ImportCard[] }> {
  const ownerId = await requireProfileId();
  const now = new Date().toISOString();
  const [waiting, setAside] = await Promise.all([importCardsData.listWaitingImportCards(ownerId, now), importCardsData.listSetAsideImportCards(ownerId, now)]);
  return { waiting, setAside };
}

/** Snooze until a time, skip (kept, can come back), bring back, or delete for good. */
export async function decideImportCardAction(id: string, choice: { kind: "snooze"; until: string } | { kind: "skip" } | { kind: "restore" } | { kind: "delete" }) {
  const ownerId = await requireProfileId();
  if (choice.kind === "delete") await importCardsData.deleteImportCard(ownerId, id);
  else if (choice.kind === "snooze") {
    const t = Date.parse(choice.until);
    if (!Number.isFinite(t)) throw new Error("Pick a time to snooze it until.");
    await importCardsData.setImportCardStatus(ownerId, id, { status: "snoozed", snoozed_until: new Date(t).toISOString() });
  } else await importCardsData.setImportCardStatus(ownerId, id, { status: choice.kind === "skip" ? "skipped" : "new" });
  revalidatePath("/");
  revalidatePath("/import");
}

/** The card became a quest some other way (the full quest editor): mark it imported. */
export async function editImportCardAction(id: string, patch: { title?: string; description?: string | null; kind?: importCardsData.ImportCard["kind"]; /** How soon it needs a time, in days (owner, Nov 6); null clears it. */ planWithinDays?: number | null; /** Its sub-quests (a buy list's items), as edited on the card: names in order. */ steps?: string[] }) {
  const ownerId = await requireProfileId();
  const KINDS = ["quest", "habit", "schedule", "reward", "project", "shopping", "done", "ritual"];
  const title = patch.title === undefined ? undefined : patch.title.replace(/\s+/g, " ").trim().slice(0, 200);
  if (title === "") throw new Error("Give it a name.");
  await importCardsData.editImportCard(ownerId, id, {
    title,
    description: patch.description === undefined ? undefined : (patch.description ?? "").trim().slice(0, 2000) || null,
    kind: patch.kind && KINDS.includes(patch.kind) ? patch.kind : undefined,
    plan_within_days: patch.planWithinDays === undefined ? undefined : patch.planWithinDays === null ? null : Math.max(0, Math.min(999, Math.round(patch.planWithinDays))),
    steps: Array.isArray(patch.steps) ? patch.steps.map((s) => String(s).replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 30) : undefined,
  });
  revalidatePath("/import");
}

export async function markImportCardImportedAction(id: string, taskId: string | null) {
  const ownerId = await requireProfileId();
  await importCardsData.setImportCardStatus(ownerId, id, { status: "imported", task_id: taskId });
  revalidatePath("/");
  revalidatePath("/import");
}

/** Import a card with what the guided steps gathered (anything skipped is left out). */
export async function importCardAction(
  id: string,
  input: {
    /** "done": a quest logged as already done (XP, nothing left open); "project": a board with a quest per step; "reward": into the Treasure Chest. */
    kind: "quest" | "habit" | "done" | "project" | "reward" | "ritual";
    title: string;
    description?: string | null;
    steps?: string[];
    /** To buy: items that go to the Treasure Chest as rewards instead. */
    rewardItems?: string[];
    boardId?: string | null;
    /** Rewards: its cost in coins. */
    costCoins?: number | null;
    dueAt?: string | null;
    /** "Plan it within…": onto the list to schedule, to be planned by then. */
    planBy?: string | null;
    importance?: number | null;
    urgency?: number | null;
    minutes?: number | null;
    /** Habits: weekdays (0 = Sunday), or an interval. Neither = every day. */
    days?: number[] | null;
    repeat?: { every: number; unit: "day" | "week" | "month" | "year"; from: string } | null;
    /** Quest details picked on the card (owner, Nov 6): every import is 15 XP and a coin unless changed. */
    xp?: number | null;
    coins?: number | null;
    isTiny?: boolean;
    energyGain?: number | null;
    effort?: number | null;
    /** XP each sub-quest pays when done, by sub-quest name (set on the card). */
    stepXp?: Record<string, number>;
    /** Coins a sub-quest pays when done, by its name (owner, Nov 14). */
    stepCoins?: Record<string, number>;
  }
): Promise<{ kind: "quest" | "habit" | "board" | "reward" | "ritual"; id: string }> {
  const ownerId = await requireProfileId();
  const card = await importCardsData.getImportCard(ownerId, id);
  if (!card) throw new Error("That card is gone.");
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!title) throw new Error("Give it a name first.");
  const steps = (input.steps ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 20);
  const minutes = input.minutes && input.minutes > 0 ? Math.min(1440, Math.round(input.minutes)) : null;
  let made: { kind: "quest" | "habit" | "board" | "reward" | "ritual"; id: string };
  // A ritual of connection joins your rituals (Insights keeps how long since each).
  // Planned ("Plan it within…"), it also goes on the list to schedule, as a quest.
  const ritualId = input.kind === "ritual" ? await addRitual(ownerId, title, input.description?.trim() || null) : null;
  // To buy: the items marked as rewards go to the Treasure Chest first.
  const rewardItems = (input.rewardItems ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 20);
  let firstReward: string | null = null;
  for (const it of rewardItems) {
    const rid = await createRewardAction({ title: it.slice(0, 200) }).catch(() => null);
    firstReward ??= rid;
  }
  if (ritualId && !input.planBy) {
    made = { kind: "ritual", id: ritualId };
  } else if (rewardItems.length && !steps.length && input.kind === "quest" && firstReward) {
    // Every item was a reward: nothing left to buy.
    made = { kind: "reward", id: firstReward };
  } else if (input.kind === "reward") {
    const rid = await createRewardAction({ title, description: input.description ?? undefined, costCoins: input.costCoins ?? undefined });
    made = { kind: "reward", id: rid };
  } else if (input.kind === "project") {
    // A board of its own (inside the one you picked, if any), each step a quest on it.
    const board = await boardsData.createBoard(ownerId, { title, description: input.description ?? undefined, parentBoardId: input.boardId ?? null });
    let first: string | null = null;
    for (const st of steps) {
      const q = await createQuestAction({ title: st.slice(0, 200), importance: 0, urgency: 0, xpValue: 15, coinValue: 1, boardId: board.id }).catch(() => null);
      first ??= q;
    }
    // Its files go with the first step.
    if (first && card.attachments?.length) await supabaseAdmin().from("tasks").update({ attachments: card.attachments }).eq("owner_id", ownerId).eq("id", first);
    revalidatePath("/boards", "layout");
    made = { kind: "board", id: board.id };
  } else if (input.kind === "habit") {
    const days = input.days?.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) ?? null;
    const riteId = await createRiteAction({
      title,
      description: input.description ?? undefined,
      isCore: false,
      slot: "day",
      days: days?.length ? [...new Set(days)].sort() : null,
      estimateMinutes: minutes,
      repeat: input.repeat ?? null,
    });
    if (steps.length) await ritesData.setRiteSteps(ownerId, riteId, steps.map((s, i) => ({ id: `s${i + 1}`, title: s.slice(0, 120) }))).catch(() => null);
    made = { kind: "habit", id: riteId };
  } else {
    const n = (v: number | null | undefined, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined);
    const taskId = await createQuestAction({
      title,
      description: input.description ?? undefined,
      importance: input.importance ?? 0,
      urgency: input.urgency ?? 0,
      xpValue: n(input.xp, 0, 1000) ?? 15,
      coinValue: n(input.coins, 0, 100) ?? 1,
      isTiny: input.isTiny || undefined,
      energyGain: n(input.energyGain, 0, 5),
      effort: n(input.effort, 0, 5),
      estimateMinutes: minutes,
      boardId: input.boardId ?? null,
      dueAt: input.dueAt ?? null,
    });
    const stepXp = (s: string) => {
      const v = input.stepXp?.[s];
      return typeof v === "number" && v > 0 ? { xp: Math.min(1000, Math.round(v)) } : {};
    };
    const stepCoins = (s: string) => {
      const v = input.stepCoins?.[s];
      return typeof v === "number" && v > 0 ? { coins: Math.min(100, Math.round(v)) } : {};
    };
    if (steps.length) await stepsData.replaceSteps(taskId, ownerId, steps.map((s) => ({ title: s.slice(0, 200), done: false, ...stepXp(s), ...stepCoins(s) }))).catch(() => null);
    // Files kept with the card (a form to fill in) stay handy on the quest.
    if (card.attachments?.length) await supabaseAdmin().from("tasks").update({ attachments: card.attachments }).eq("owner_id", ownerId).eq("id", taskId);
    const planBy = input.planBy && Number.isFinite(Date.parse(input.planBy)) ? new Date(input.planBy).toISOString() : null;
    if (planBy) {
      await importCardsData.queueToSchedule(ownerId, taskId, planBy);
      revalidatePath("/calendar");
    }
    // Already done: it counts (XP and all), and nothing is left open.
    if (input.kind === "done") await finishTask(ownerId, taskId).catch(() => null);
    made = { kind: "quest", id: taskId };
  }
  await importCardsData.setImportCardStatus(ownerId, id, { status: "imported", task_id: made.kind === "quest" ? made.id : null });
  revalidatePath("/");
  revalidatePath("/import");
  return made;
}

/**
 * Your own words, kept on your account (so every device has them): the wise lines
 * you wrote for the welcome screen and your reflection questions, with whether each shows.
 * Stored in `life_wheel.words`.
 */
export type OwnWords = { lines?: string; linesOn?: boolean; reflect?: string[]; reflectOn?: boolean; at?: number };

export async function getOwnWordsAction(): Promise<OwnWords | null> {
  const ownerId = await requireProfileId();
  const w = (await readExtras(ownerId)).words;
  return w && typeof w === "object" ? (w as OwnWords) : null;
}

export async function saveOwnWordsAction(words: OwnWords) {
  const ownerId = await requireProfileId();
  const clean: OwnWords = {
    lines: typeof words.lines === "string" ? words.lines.slice(0, 2400) : undefined,
    linesOn: typeof words.linesOn === "boolean" ? words.linesOn : undefined,
    reflect: Array.isArray(words.reflect) ? words.reflect.filter((q) => typeof q === "string").map((q) => q.slice(0, 300)).slice(0, 60) : undefined,
    reflectOn: typeof words.reflectOn === "boolean" ? words.reflectOn : undefined,
    at: Date.now(),
  };
  const extras = await readExtras(ownerId);
  const { error } = await writeExtra(ownerId, "words", { ...((extras.words as object) ?? {}), ...clean });
  if (error) throw new Error(error.message);
}

/** The welcome screen's layout (order, hidden parts, its buttons), kept on the account so every device shows the same screen. */
export type WelcomeLayout = Record<string, unknown> & { at?: number };

const WELCOME_LAYOUT_KEYS = ["welcomeMode", "toucanAskBg", "toucanAskMist", "toucanKeptQuote", "welcomeOrder", "welcomeHide", "welcomeArchived", "welcomeDawnOn", "welcomeHabitsOn", "welcomeButtons", "welcomeSleep", "welcomeMetrics", "welcomeLine", "welcomeStreak", "welcomeBar", "journalPrompts", "journalPromptsV", "journalAllPrompts", "journalPick"] as const;

/** The bottom bar's tab order (hold and drag a tab). */
export async function saveNavOrderAction(order: string[]) {
  const ownerId = await requireProfileId();
  const { normalizeNavOrder } = await import("@/lib/nav-order");
  const { error } = await writeExtra(ownerId, "navOrder", normalizeNavOrder(order));
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

export async function getWelcomeLayoutAction(): Promise<WelcomeLayout | null> {
  const ownerId = await requireProfileId();
  const w = (await readExtras(ownerId)).welcomeLayout;
  return w && typeof w === "object" ? (w as WelcomeLayout) : null;
}

export async function saveWelcomeLayoutAction(layout: WelcomeLayout) {
  const ownerId = await requireProfileId();
  const clean: WelcomeLayout = { at: Date.now() };
  for (const k of WELCOME_LAYOUT_KEYS) if (layout[k] !== undefined) clean[k] = layout[k];
  if (JSON.stringify(clean).length > 8000) throw new Error("Too much to keep.");
  const { error } = await writeExtra(ownerId, "welcomeLayout", clean);
  if (error) throw new Error(error.message);
}

/** Learn a language: one phrase in each chosen language, with how to say it (non-Latin scripts get a transliteration). */
export async function translatePhraseAction(phrase: string, languages: string[]): Promise<{ results: import("@/lib/languages").Translation[]; error?: string }> {
  await requireProfileId();
  const { approxNote } = await import("@/lib/languages");
  const p = phrase.replace(/\s+/g, " ").trim().slice(0, 200);
  const langs = [...new Set(languages.map((l) => l.replace(/\s+/g, " ").trim().slice(0, 40)).filter(Boolean))].slice(0, 24);
  if (!p) return { results: [], error: "Write a phrase first." };
  if (!langs.length) return { results: [], error: "Turn on at least one language." };
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return { results: [], error: "Translation isn't set up yet." };
  const system =
    "You are a careful translator and language teacher. Translate the user's phrase into each listed language. " +
    "Reply ONLY with JSON: an array of objects {\"language\": string, \"text\": string, \"say\": string}. " +
    "\"text\" is the phrase in that language's own script. \"say\" is a simple English-letters pronunciation guide (always give it). " +
    "For reconstructed or sparsely attested languages (e.g. Phoenician, Natick Algonquin / Massachusett), give your best reconstruction from known vocabulary; for Phoenician use Phoenician script if you can, else a Latin transliteration. Never refuse; keep the same order as the list.";
  const user = `Phrase: "${p}"\nLanguages: ${langs.join(", ")}`;
  let raw = "";
  for (const model of ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"]) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_tokens: 1800, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const r = json?.result?.response;
      raw = typeof r === "string" ? r.trim() : JSON.stringify(r ?? "");
      if (raw) break;
    } catch {
      /* try the next model */
    }
  }
  const m = raw.match(/\[[\s\S]*\]/);
  let rows: { language?: unknown; text?: unknown; say?: unknown }[] = [];
  try {
    rows = m ? (JSON.parse(m[0]) as typeof rows) : [];
  } catch {
    rows = [];
  }
  if (!rows.length) return { results: [], error: "The words didn't come this time. Try again in a moment." };
  const byLang = new Map(rows.map((r) => [String(r.language ?? "").toLowerCase(), r]));
  const results = langs.map((l, i) => {
    const r = byLang.get(l.toLowerCase()) ?? rows[i] ?? {};
    const text = String(r.text ?? "").trim().slice(0, 300);
    const say = String(r.say ?? "").trim().slice(0, 300);
    return { language: l, text: text || "—", say: say && say !== text ? say : undefined, approx: approxNote(l) || undefined };
  });
  return { results };
}

// Habits done more than once a day (owner, Nov 16: "every tick of the checkbox gives another
// completion/victory/xp gain… the card keeps track of how many times per day it's been done")
async function saveHabitTicks(ownerId: string, extras: Record<string, unknown>, ticks: HabitTicks) {
  // The last 14 days are enough for an undo.
  const days = Object.fromEntries(Object.entries(ticks.days).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14));
  const { error } = await writeExtra(ownerId, "habitTicks", { many: ticks.many, days });
  if (error) throw new Error(`Couldn't save: ${error.message}`);
}

/** Which habits count every tick, and today's ticks after the first. */
export async function habitTicksAction(day: string): Promise<HabitTicksSeed> {
  const ownerId = await requireProfileId();
  return habitTicksSeed((await readExtras(ownerId)).habitTicks, day);
}

/** A habit counts every tick (many times a day), or goes back to once a day. */
export async function setHabitManyAction(riteId: string, on: boolean) {
  const ownerId = await requireProfileId();
  if (!QUEST_ID.test(riteId)) throw new Error("Unknown habit.");
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  ticks.many = on ? [...new Set([...ticks.many, riteId])] : ticks.many.filter((id) => id !== riteId);
  await saveHabitTicks(ownerId, extras, ticks);
}

/** Done again today: pays the habit's XP and coins once more and counts it. */
export async function tickHabitAgainAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit is gone.");
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  const earned = Math.max(0, rite.xp_value);
  const coinAdjust = rite.coin_value == null ? 0 : Math.max(0, rite.coin_value) - coinsForXp(rite.xp_value);
  const list = [...(ticks.days[day]?.[riteId] ?? []), [earned, coinAdjust] as [number, number]];
  ticks.days[day] = { ...(ticks.days[day] ?? {}), [riteId]: list };
  await saveHabitTicks(ownerId, extras, ticks);
  let coinsEarned = 0;
  if (earned > 0) coinsEarned = (await xp.awardXp(ownerId, earned, "task_completed")).coinsEarned;
  if (coinAdjust !== 0) {
    await rewardsData.addCoins(ownerId, coinAdjust);
    coinsEarned += coinAdjust;
  }
  revalidatePath("/");
  return { xp: earned, coinsEarned, extra: list.length };
}

/** Take back the last extra tick of the day (what it paid). False when there was none: undo the habit itself. */
export async function undoHabitTickAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  if (!QUEST_ID.test(riteId)) throw new Error("Unknown habit.");
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  const list = [...(ticks.days[day]?.[riteId] ?? [])];
  const last = list.pop();
  if (!last) return { undone: false, extra: 0 };
  ticks.days[day] = { ...(ticks.days[day] ?? {}), [riteId]: list };
  await saveHabitTicks(ownerId, extras, cleanHabitTicks(ticks));
  if (last[0] > 0) await xp.awardXp(ownerId, -last[0], "task_completed").catch(() => {});
  if (last[1] !== 0) await rewardsData.addCoins(ownerId, -last[1]).catch(() => {});
  revalidatePath("/");
  return { undone: true, extra: list.length };
}

/** The XP changed on the celebration (owner, Nov 16): the habit pays that from now on, and the tick just made is paid the difference. */
export async function setHabitXpNowAction(riteId: string, day: string, xpValue: number) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit is gone.");
  const next = Math.max(0, Math.min(500, Math.round(Number(xpValue) || 0)));
  const db = supabaseAdmin();
  const { error } = await db.from("rites").update({ xp_value: next }).eq("owner_id", ownerId).eq("id", riteId);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  const extras = await readExtras(ownerId);
  const ticks = cleanHabitTicks(extras.habitTicks);
  const list = [...(ticks.days[day]?.[riteId] ?? [])];
  let delta = 0;
  if (list.length) {
    // The latest tick was an extra one.
    delta = next - list[list.length - 1][0];
    list[list.length - 1] = [next, list[list.length - 1][1]];
    ticks.days[day] = { ...(ticks.days[day] ?? {}), [riteId]: list };
    await saveHabitTicks(ownerId, extras, ticks);
  } else {
    // It was the day's first: the completion itself.
    const { data } = await db.from("rite_completions").select("xp_awarded").eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day).maybeSingle<{ xp_awarded: number }>();
    if (data) {
      delta = next - data.xp_awarded;
      await db.from("rite_completions").update({ xp_awarded: next }).eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day);
    }
  }
  if (delta !== 0) await xp.awardXp(ownerId, delta, "task_completed").catch(() => {});
  revalidatePath("/");
  return { xp: next };
}
