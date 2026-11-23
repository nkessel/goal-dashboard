"use server";

import { writeExtra } from "@/lib/data/extras";
import { revalidatePath } from "next/cache";
import * as importCardsData from "@/lib/data/import-cards";
import * as boardsData from "@/lib/data/boards";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as ritesData from "@/lib/data/rites";
import * as stepsData from "@/lib/data/steps";
import { finishTaskForOwner as finishTask } from "@/lib/data/quest-ops";
import { type HabitTicks, type HabitTicksSeed, habitTicksSeed, cleanHabitTicks } from "@/lib/habit-ticks";
import { coinsForXp } from "@/lib/coins";
import * as xp from "@/lib/data/xp";
import * as rewardsData from "@/lib/data/rewards";
import { readExtras, requireProfileId, QUEST_ID, assertDay } from "./_shared";
import { createRewardAction } from "./rewards";
import { createQuestAction } from "./quests";
import { createRiteAction } from "./evening";

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
