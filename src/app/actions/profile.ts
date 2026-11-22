"use server";

import * as xp from "@/lib/data/xp";
import { type AccountExport, exportAccountData } from "@/lib/data/export";
import * as statsData from "@/lib/data/stats";
import { revalidatePath } from "next/cache";
import * as tasksData from "@/lib/data/tasks";
import { supabaseAdmin } from "@/lib/supabase/server";
import { writeExtra } from "@/lib/data/extras";
import * as energyData from "@/lib/data/energy";
import * as feedbackData from "@/lib/data/feedback";
import * as rewardsData from "@/lib/data/rewards";
import { finishTaskForOwner as finishTask } from "@/lib/data/quest-ops";
import { requireProfileId, readExtras } from "./_shared";
import { getOwnWordsAction, getWelcomeLayoutAction, questCalExtrasAction, questPlacesAction, toucanPrefsAction } from "./rest";

// XP / leveling (Priority #8)
export async function dailyCheckInAction(tzOffsetMinutes?: number): Promise<xp.CheckInResult> {
  const ownerId = await requireProfileId();
  const offset = Number.isFinite(tzOffsetMinutes) ? Math.max(-840, Math.min(840, Math.round(tzOffsetMinutes!))) : 0;
  const result = await xp.dailyCheckIn(ownerId, offset);
  // No revalidatePath here: it made this action send back all of Today, re-rendered, while the welcome
  // screen (which waits on it) was opening. The screen refreshes Today when it closes.
  return result;
}

// Full account data export (local -> published migration)
export async function exportAccountDataAction(): Promise<AccountExport> {
  const ownerId = await requireProfileId();
  return exportAccountData(ownerId);
}

// Character stats
export async function getStatsAction() {
  const ownerId = await requireProfileId();
  const [stats, xp] = await Promise.all([statsData.getStats(ownerId), statsData.getStatXp(ownerId)]);
  return { stats, xp };
}

export async function setStatsAction(names: string[]) {
  const ownerId = await requireProfileId();
  const next = await statsData.setStats(ownerId, names);
  // Not the whole app: refreshing the screen you're on mid-edit closed an open quest editor.
  revalidatePath("/settings");
  revalidatePath("/insights");
  return next;
}

export async function setTaskStatSplitAction(taskId: string, split: Record<string, number>) {
  const ownerId = await requireProfileId();
  const next = await statsData.setTaskStatSplit(ownerId, taskId, split);
  revalidatePath("/");
  return next;
}

/** Someone holding an honorary level sets it (1–99). Only those granted one can. */
export async function setDisplayLevelAction(level: number) {
  const ownerId = await requireProfileId();
  const n = Math.round(Number(level));
  if (!Number.isFinite(n) || n < 1 || n > 99) throw new Error("Pick a level from 1 to 99.");
  const db = (await import("@/lib/supabase/server")).supabaseAdmin();
  const { data } = await db.from("profiles").select("display_level").eq("id", ownerId).maybeSingle<{ display_level: number | null }>();
  if (data?.display_level == null) throw new Error("Only an honorary level can be changed.");
  const { error } = await db.from("profiles").update({ display_level: n }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't change it: ${error.message}`);
  revalidatePath("/", "layout");
}

// The great toucan spirit's wardrobe
/** Buy a toucan add-on with coins (it's worn straight away). */
export async function buyToucanAddonAction(addonId: string) {
  const ownerId = await requireProfileId();
  const { buyAddon } = await import("@/lib/data/toucan");
  const res = await buyAddon(ownerId, addonId);
  revalidatePath("/settings");
  return res;
}

/** Put on (or take off, with null) an owned toucan add-on. */
export async function equipToucanAction(slot: import("@/lib/toucan").ToucanSlot, addonId: string | null) {
  const ownerId = await requireProfileId();
  const { equipAddon } = await import("@/lib/data/toucan");
  return equipAddon(ownerId, slot, addonId);
}

// Secret missions
/** Save the whole list of secret missions (they're private to their owner). */
export async function saveSecretMissionsAction(missions: unknown) {
  const ownerId = await requireProfileId();
  const { saveMissions } = await import("@/lib/data/missions");
  return saveMissions(ownerId, missions);
}

/** Add a step to a secret mission: it's a real quest (XP, editor, Today), kept private. */
export async function addMissionStepAction(missionId: string, title: string, xp = 20) {
  const ownerId = await requireProfileId();
  const t = title.replace(/\s+/g, " ").trim();
  if (!t) throw new Error("Give the step a name.");
  const { createMissionStep } = await import("@/lib/data/missions");
  const id = await createMissionStep(ownerId, missionId, t, xp);
  revalidatePath("/settings");
  return id;
}

/** Send a mission step to Today's Quests, or take it back off. */
export async function sendMissionStepToTodayAction(taskId: string, onToday: boolean) {
  const ownerId = await requireProfileId();
  if (onToday) await tasksData.pinToTopOfToday(taskId, ownerId);
  else {
    await tasksData.setManualPriority(taskId, ownerId, false);
    await tasksData.setTaskInAdditional(taskId, ownerId, false);
  }
  revalidatePath("/");
  revalidatePath("/settings");
}

/** Change a mission step: its name, its XP, or which mission it belongs to. */
export async function editMissionStepAction(taskId: string, patch: { title?: string; xp?: number; missionId?: string }) {
  const ownerId = await requireProfileId();
  const up: Record<string, unknown> = {};
  if (typeof patch.title === "string") {
    const t = patch.title.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!t) throw new Error("Give the step a name.");
    up.title = t;
  }
  if (typeof patch.xp === "number") up.xp_value = Math.max(0, Math.min(500, Math.round(patch.xp)));
  if (typeof patch.missionId === "string" && patch.missionId) up.mission_id = patch.missionId.slice(0, 64);
  if (!Object.keys(up).length) return;
  const { error } = await supabaseAdmin().from("tasks").update(up).eq("id", taskId).eq("owner_id", ownerId).not("mission_id", "is", null);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  revalidatePath("/settings");
}

/** Make a quest a stand-in for a board's current assignment (or a plain quest again, with null). */
export async function setStandsForAction(taskId: string, boardId: string | null) {
  const ownerId = await requireProfileId();
  const { error } = await supabaseAdmin().from("tasks").update({ stands_for: boardId }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/stands_for/.test(error.message) ? "Stand-in quests need a quick database update first." : `Couldn't save that: ${error.message}`);
  revalidatePath("/");
}

/** A quest's tags (lower-case words, no #). */
export async function setTaskTagsAction(taskId: string, tags: string[]) {
  const ownerId = await requireProfileId();
  const clean = [...new Set(tags.map((t) => t.replace(/^#/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 12);
  const { error } = await supabaseAdmin().from("tasks").update({ tags: clean }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/tags/.test(error.message) ? "Tags need a quick database update first." : `Couldn't save the tags: ${error.message}`);
  revalidatePath("/");
  return clean;
}

/** Every tag you've used, most used first (for suggestions). */
export async function listTagsAction() {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin().from("tasks").select("tags").eq("owner_id", ownerId).not("tags", "eq", "{}").limit(1000);
  const n = new Map<string, number>();
  for (const r of (data ?? []) as { tags: string[] | null }[]) for (const t of r.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** Put a mission's steps in this order. */
export async function orderMissionStepsAction(ids: string[]) {
  const ownerId = await requireProfileId();
  const db = supabaseAdmin();
  await Promise.all(ids.slice(0, 100).map((id, i) => db.from("tasks").update({ sort_order: i + 1 }).eq("id", id).eq("owner_id", ownerId).not("mission_id", "is", null)));
  revalidatePath("/settings");
}

/** A mission was burned: its steps become ordinary quests. */
export async function releaseMissionStepsAction(missionId: string) {
  const ownerId = await requireProfileId();
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  await supabaseAdmin().from("tasks").update({ mission_id: null }).eq("owner_id", ownerId).eq("mission_id", missionId);
  revalidatePath("/");
}

// Life wheel (Insights): pick the areas of your life, then rate each 1–10.
const WHEEL_PREFIX = "◎ ";

/** Save which areas the life wheel has (in order). */
export async function setLifeWheelTopicsAction(topics: string[]) {
  const ownerId = await requireProfileId();
  const clean = [...new Set(topics.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 20)).filter(Boolean))].slice(0, 12);
  const { error } = await writeExtra(ownerId, "topics", clean);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return clean;
}

/** A life-wheel check-in: one reading per area. */
export async function saveLifeWheelAction(values: { topic: string; level: number }[]) {
  const ownerId = await requireProfileId();
  const rows = values.slice(0, 12).map((v) => ({ metric: WHEEL_PREFIX + v.topic.slice(0, 20), level: Math.max(1, Math.min(10, Number(v.level) || 5)) }));
  if (!rows.length) throw new Error("Nothing to save yet.");
  await energyData.logCheckIns(ownerId, rows);
  revalidatePath("/insights");
}

// ---- App-wide defaults for settings kept on each device.
/** The defaults a new device starts from. */
export async function appDefaultsAction() {
  await requireProfileId();
  const { listAppDefaults } = await import("@/lib/data/app-defaults");
  return listAppDefaults();
}

/** The app's owner makes their own settings the default for every account. */
export async function setAppDefaultsAction(values: Record<string, string | null>) {
  const profileId = await requireProfileId();
  if (!(await feedbackData.isAdmin(profileId))) throw new Error("Only the app's owner sets defaults for everyone.");
  const { saveAppDefaults } = await import("@/lib/data/app-defaults");
  await saveAppDefaults(profileId, values);
  return { ok: true };
}

/** Open quests with a due date, as full cards (Due soon's drawer on the welcome screen). */
export async function dueSoonCardsAction() {
  const ownerId = await requireProfileId();
  const tasks = await tasksData.listOpenTasksForOwnerWithCategory(ownerId);
  return tasks.filter((t) => t.due_at && !t.needs_review && !t.reward_id);
}

/** Drag to reorder the Treasure Chest. */
export async function reorderRewardsAction(ids: string[]) {
  const ownerId = await requireProfileId();
  await rewardsData.reorderRewards(ownerId, ids.filter((x) => typeof x === "string").slice(0, 200));
  revalidatePath("/rewards");
}

// The new-adventurer walkthrough (owner, Nov 13): where each account is in it, kept on the account.
export type TourState = { step: string; done?: boolean; hidden?: string[]; practiceId?: string | null; realId?: string | null; since?: string | null; at?: number; /** What the person asked the toucan to call them. */ name?: string | null; /** Snoozed until (ms). */ until?: number | null; /** The two starter quests on Today (owner, Nov 15). */ exploreId?: string | null; createId?: string | null };

export async function tourAction(): Promise<TourState | null> {
  const ownerId = await requireProfileId();
  const t = (await readExtras(ownerId)).tour as TourState | undefined;
  return t && typeof t === "object" ? t : null;
}

/** The name the account goes by now (the walkthrough offers it when the toucan asks what to call you). */
export async function tourNameAction(): Promise<string | null> {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin().from("profiles").select("name").eq("id", ownerId).maybeSingle();
  // Only the first word: "Nathan", not "Nathan Kessel".
  return ((data?.name as string | null | undefined) ?? "").trim().split(/\s+/)[0] || null;
}

/**
 * What the app shell asks for as it opens, in one request (owner, Nov 19: "loading/opening the app is
 * super buggy"). These were seven separate calls, and server actions run one at a time, so a tap
 * (ticking a quest) waited behind all of them. Read through `fromStartup` in `src/lib/startup.ts`;
 * a part that fails here is asked for again on its own.
 */
export async function startupAction() {
  const [ownWords, welcomeLayout, questCalExtras, questPlaces, tour, tourName, toucanPrefs] = await Promise.allSettled([
    getOwnWordsAction(),
    getWelcomeLayoutAction(),
    questCalExtrasAction(),
    questPlacesAction(),
    tourAction(),
    tourNameAction(),
    toucanPrefsAction(),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? { ok: true as const, value: r.value } : { ok: false as const });
  return {
    ownWords: ok(ownWords),
    welcomeLayout: ok(welcomeLayout),
    questCalExtras: ok(questCalExtras),
    questPlaces: ok(questPlaces),
    tour: ok(tour),
    tourName: ok(tourName),
    toucanPrefs: ok(toucanPrefs),
  };
}

export async function saveTourAction(state: TourState) {
  const ownerId = await requireProfileId();
  const clean: TourState = {
    step: String(state.step || "intro").slice(0, 40),
    done: !!state.done,
    hidden: (state.hidden ?? []).map((x) => String(x).slice(0, 40)).slice(0, 20),
    practiceId: state.practiceId && /^[0-9a-f-]{36}$/i.test(state.practiceId) ? state.practiceId : null,
    realId: state.realId && /^[0-9a-f-]{36}$/i.test(state.realId) ? state.realId : null,
    since: state.since ? new Date(state.since).toISOString() : null,
    at: Date.now(),
    name: state.name ? String(state.name).trim().slice(0, 40) || null : null,
    until: typeof state.until === "number" && Number.isFinite(state.until) ? state.until : null,
    exploreId: state.exploreId && /^[0-9a-f-]{36}$/i.test(state.exploreId) ? state.exploreId : null,
    createId: state.createId && /^[0-9a-f-]{36}$/i.test(state.createId) ? state.createId : null,
  };
  const { error } = await writeExtra(ownerId, "tour", clean);
  if (error) throw new Error(error.message);
  return clean;
}

/** The walkthrough's first quest: "Make your first quest", on Today, worth a small first win. */
export async function tourPracticeQuestAction(): Promise<{ id: string }> {
  const ownerId = await requireProfileId();
  const t = await tasksData.createTask(ownerId, {
    title: "Make your first quest ✦",
    description: "Tap + and choose Quest, give it a name, and save it. This one completes itself when you do.",
    xpValue: 15,
    coinValue: 1,
    estimateMinutes: 2,
    isManualPriority: true,
  });
  revalidatePath("/");
  return { id: t.id };
}

/**
 * The walkthrough's two starter quests on Today (owner, Nov 15): "Explore the realm" (+15 XP, 1 coin) and
 * "Create your first quest" (+25 XP, 2 coins), tiny so they tick off with one tap. Ones already made and
 * still open are kept, not made twice.
 */
export async function tourStarterQuestsAction(have: { exploreId?: string | null; createId?: string | null } = {}): Promise<{ exploreId: string; createId: string }> {
  const ownerId = await requireProfileId();
  const keep = async (id: string | null | undefined) => {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const t = await tasksData.getTask(id, ownerId).catch(() => null);
    return t ? t.id : null;
  };
  const make = (title: string, description: string, xpValue: number, coinValue: number) =>
    tasksData.createTask(ownerId, { title, description, xpValue, coinValue, estimateMinutes: 5, isManualPriority: true, isTiny: true }).then((t) => t.id);
  const exploreId = (await keep(have.exploreId)) ?? (await make("Explore the realm ✦", "The Great Toucan Spirit shows you around: Today, the calendar, your boards, Insights, your party and the Treasure Chest.", 15, 1));
  const createId = (await keep(have.createId)) ?? (await make("Create your first quest ✦", "Make your first real quest with the Great Toucan Spirit, then tick this one off to claim its reward.", 25, 2));
  revalidatePath("/");
  return { exploreId, createId };
}

/** The quest made in the walkthrough joins Today's Quests, where Engage Quest is shown next. */
export async function tourPinQuestAction(taskId: string) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) return;
  await supabaseAdmin().from("tasks").update({ is_manual_priority: true }).eq("id", taskId).eq("owner_id", ownerId);
  revalidatePath("/");
}

/** The portrait the account wears now (the walkthrough's character step shows it). */
export async function tourAvatarAction(): Promise<string | null> {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin().from("profiles").select("avatar_image_url").eq("id", ownerId).maybeSingle();
  return (data?.avatar_image_url as string | null | undefined) ?? null;
}

/** The newest quest made since the walkthrough asked for one (not its own practice quest). */
export async function tourNewQuestAction(since: string, not: string[] = []): Promise<{ id: string; title: string } | null> {
  const ownerId = await requireProfileId();
  let q = supabaseAdmin().from("tasks").select("id, title").eq("owner_id", ownerId).gte("created_at", new Date(since).toISOString()).order("created_at", { ascending: false }).limit(5);
  const ids = not.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (ids.length) q = q.not("id", "in", `(${ids.join(",")})`);
  const { data } = await q;
  return data?.[0] ? { id: data[0].id as string, title: data[0].title as string } : null;
}

/** Completes the practice quest, paying its XP like any quest. */
export async function tourCompletePracticeAction(taskId: string) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("Unknown quest.");
  const t = await tasksData.getTask(taskId, ownerId);
  if (!t || t.status === "completed") return null;
  const res = await finishTask(ownerId, taskId);
  revalidatePath("/");
  return { title: t.title, xp: t.xp_value, totalXp: (res as { totalXp?: number | null } | null)?.totalXp ?? null, coins: t.coin_value ?? 1 };
}
