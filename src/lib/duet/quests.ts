import "server-only";
import { revalidatePath } from "next/cache";
import * as tasksData from "@/lib/data/tasks";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  adjustXpForEditForOwner,
  archiveTaskForOwner,
  createQuestForOwner,
  finishTaskForOwner,
  reopenTaskForOwner,
  restoreArchivedQuestForOwner,
  setTaskPlacementForOwner,
} from "@/lib/data/quest-ops";
import { earlyBirdCoins } from "@/lib/next-action";
import { DuetError, anchorOf, clampInt, clampScore, moveAround, nyToIso, parseDue } from "./pure";
import { archivedQuestList, completedQuests, loadBoards, openQuests, pick, questById, type Row } from "./load";
import { questView } from "./reads";
import type { Args, Out } from "./types";

/** pick() with each candidate's board named, so an ambiguous answer can be shown to the owner. */
async function qpick<T extends Row>(ownerId: string, pool: T[], ref: unknown, what: string): Promise<T> {
  const bl = await loadBoards(ownerId);
  return pick(pool, ref, what, (t) => bl.label(t.board_id));
}
const has = (a: Args, k: string) => a[k] !== undefined;
const PLACES = ["top", "today", "additional", "board_only"] as const;
type Place = (typeof PLACES)[number];
const placeOf = (v: unknown): Place => {
  if (!PLACES.includes(v as Place)) throw new DuetError(`where/place must be one of ${PLACES.join(", ")}.`);
  return v as Place;
};
const str = (v: unknown, what: string, max = 20_000) => {
  if (typeof v !== "string") throw new DuetError(`${what} must be text.`);
  return v.slice(0, max);
};

/** Quest columns a Duet edit can change (the "before" of an edit holds these, by column). */
export type QPatch = {
  title?: string; description?: string | null; board_id?: string | null; due_at?: string | null; importance?: number; urgency?: number;
  xp_value?: number; coin_value?: number | null; estimate_minutes?: number | null; is_tiny?: boolean; is_aspiration?: boolean;
};
const FIELD_WORDS: Partial<Record<keyof QPatch, string>> = { description: "notes", board_id: "board", due_at: "due", xp_value: "xp", coin_value: "coins", estimate_minutes: "minutes", is_tiny: "tiny", is_aspiration: "aspiration" };
const QKEYS: (keyof QPatch)[] = ["title", "description", "board_id", "due_at", "importance", "urgency", "xp_value", "coin_value", "estimate_minutes", "is_tiny", "is_aspiration"];
export const snapshotOf = (row: Row, keys: (keyof QPatch)[]): QPatch => Object.fromEntries(keys.map((k) => [k, (row as unknown as Record<string, unknown>)[k] ?? (typeof (row as unknown as Record<string, unknown>)[k] === "boolean" ? false : null)])) as QPatch;

const revalidateQuest = () => {
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/power-ups");
  revalidatePath("/boards", "layout");
};

/** The app's own edit path: changes XP already earned, then `updateTask`. The calendar (Google) is never touched from here. */
export async function applyQuestEdit(ownerId: string, row: Row, p: QPatch): Promise<string[]> {
  const notes: string[] = [];
  const xpValue = p.xp_value ?? row.xp_value;
  await adjustXpForEditForOwner(ownerId, row.id, xpValue);
  const desc = p.description === undefined ? row.description : p.description === null ? null : p.description.trim() || null;
  await tasksData.updateTask(row.id, ownerId, {
    title: p.title ?? row.title,
    description: desc,
    importance: p.importance ?? row.importance,
    urgency: p.urgency ?? row.urgency,
    xpValue,
    estimateMinutes: p.estimate_minutes,
    boardId: p.board_id,
    dueAt: p.due_at,
    coinValue: p.coin_value,
    isTiny: p.is_tiny,
    isAspiration: p.is_aspiration,
  });
  const est = p.estimate_minutes;
  if (row.status === "open" && row.is_on_calendar && row.scheduled_start && row.scheduled_end && est && est > 0 && est !== row.estimate_minutes) {
    const len = Math.round((Date.parse(row.scheduled_end) - Date.parse(row.scheduled_start)) / 60_000);
    if (est > len) notes.push("The quest's block on the calendar wasn't lengthened (that needs Google); it grows next time he opens it in the app.");
  }
  revalidateQuest();
  return notes;
}

export async function addQuest(ownerId: string, a: Args): Promise<Out> {
  const title = typeof a.title === "string" ? a.title.trim() : "";
  if (!title) throw new DuetError("Give the quest a title.");
  const bl = await loadBoards(ownerId);
  const board = a.board === undefined || a.board === null || a.board === "" ? null : pick(bl.boards, a.board, "board", (x) => bl.label(x.parent_board_id));
  const place = a.place === undefined ? "additional" : placeOf(a.place);
  const id = await createQuestForOwner(ownerId, {
    title,
    description: has(a, "notes") && a.notes !== null ? str(a.notes, "notes") : undefined,
    importance: has(a, "importance") ? clampScore(a.importance, "importance") : 0,
    urgency: has(a, "urgency") ? clampScore(a.urgency, "urgency") : 0,
    xpValue: has(a, "xp") ? clampInt(a.xp, 0, 1000, "xp") : 15,
    estimateMinutes: has(a, "minutes") && a.minutes !== null ? clampInt(a.minutes, 0, 100_000, "minutes") : null,
    boardId: board?.id ?? null,
    dueAt: has(a, "due") ? parseDue(a.due) : null,
    // The quest editor starts a new quest at 1 coin.
    coinValue: has(a, "coins") ? (a.coins === null ? null : clampInt(a.coins, 0, 1000, "coins")) : 1,
    isTiny: a.tiny === true ? true : undefined,
    pinToBattle: place === "today",
    placement: place === "board_only" ? "none" : place === "today" ? "today" : "additional",
  });
  const notes: string[] = [];
  if (a.aspiration === true) await applyQuestEdit(ownerId, (await questById(ownerId, id))!, { is_aspiration: true });
  if (place === "top") await tasksData.pinToTopOfToday(id, ownerId);
  if (place === "top" || place === "today") revalidatePath("/power-ups");
  const row = (await questById(ownerId, id))!;
  return {
    summary: `Added quest "${title}"${board ? ` on ${bl.label(board.id)}` : ""}${row.due_at ? `, due ${questView(row, bl.label).due_ny}` : ""}.`,
    data: { quest: { ...questView(row, bl.label), where: place } },
    notes,
    change: { kind: "quest", id, before: null, after: { id, title } },
  };
}

export async function editQuest(ownerId: string, a: Args): Promise<Out> {
  const pool = await openQuests(ownerId);
  const row = await qpick(ownerId, pool, a.quest, "quest");
  const bl = await loadBoards(ownerId);
  const p: QPatch = {};
  if (has(a, "title")) {
    const t = typeof a.title === "string" ? a.title.trim() : "";
    if (!t) throw new DuetError("A quest's title can't be empty.");
    p.title = t;
  }
  if (has(a, "notes")) p.description = a.notes === null ? null : str(a.notes, "notes");
  if (has(a, "board")) p.board_id = a.board === null || a.board === "" ? null : pick(bl.boards, a.board, "board", (x) => bl.label(x.parent_board_id)).id;
  if (has(a, "due")) p.due_at = parseDue(a.due);
  if (has(a, "importance")) p.importance = clampScore(a.importance, "importance");
  if (has(a, "urgency")) p.urgency = clampScore(a.urgency, "urgency");
  if (has(a, "xp")) p.xp_value = clampInt(a.xp, 0, 1000, "xp");
  if (has(a, "coins")) p.coin_value = a.coins === null ? null : clampInt(a.coins, 0, 1000, "coins");
  if (has(a, "minutes")) p.estimate_minutes = a.minutes === null ? null : clampInt(a.minutes, 0, 100_000, "minutes");
  if (has(a, "tiny")) p.is_tiny = a.tiny === true;
  if (has(a, "aspiration")) p.is_aspiration = a.aspiration === true;
  const keys = (Object.keys(p) as (keyof QPatch)[]).filter((k) => QKEYS.includes(k));
  if (!keys.length) throw new DuetError("Nothing to change: give at least one of title, notes, board, due, importance, urgency, xp, coins, minutes, tiny, aspiration.");
  const before = snapshotOf(row, keys);
  const notes = await applyQuestEdit(ownerId, row, p);
  const now = (await questById(ownerId, row.id))!;
  return {
    summary: `Updated "${row.title}": ${keys.map((k) => FIELD_WORDS[k] ?? k).join(", ")}.`,
    data: { quest: questView(now, bl.label) },
    notes,
    change: { kind: "quest", id: row.id, before, after: snapshotOf(now, keys) },
  };
}

export async function placeQuest(ownerId: string, a: Args): Promise<Out> {
  const row = await qpick(ownerId, await openQuests(ownerId), a.quest, "quest");
  const where = placeOf(a.where);
  const before = { is_manual_priority: !!row.is_manual_priority, in_additional: row.in_additional ?? true, sort_order: row.sort_order ?? 0 };
  if (where === "top") {
    await tasksData.pinToTopOfToday(row.id, ownerId);
    revalidatePath("/");
    revalidatePath("/power-ups");
  } else {
    await setTaskPlacementForOwner(ownerId, row.id, where === "board_only" ? "none" : where);
  }
  const now = (await questById(ownerId, row.id))!;
  const label = { top: "the top of Today's Quests", today: "Today's Quests", additional: "Additional Quests", board_only: "its board only" }[where];
  return {
    summary: `Moved "${row.title}" to ${label}.`,
    change: { kind: "quest", id: row.id, before, after: { is_manual_priority: !!now.is_manual_priority, in_additional: now.in_additional ?? true, sort_order: now.sort_order ?? 0 } },
  };
}

/** The chosen quests in the order Today draws them (the part you can reorder). */
async function chosenOrder(ownerId: string) {
  const nowMs = Date.now();
  const tasks = await tasksData.listOpenTasksForOwner(ownerId);
  return tasks.filter((t) => !t.needs_review && t.is_manual_priority && (!t.snoozed_until || Date.parse(t.snoozed_until) <= nowMs)) as Row[];
}

export async function moveQuest(ownerId: string, a: Args): Promise<Out> {
  const list = await chosenOrder(ownerId);
  const { ref, where } = anchorOf(a);
  const row = await qpick(ownerId, list, a.quest, "quest in Today's Quests");
  const other = await qpick(ownerId, list.filter((t) => t.id !== row.id), ref, "quest in Today's Quests");
  const order = moveAround(list.map((t) => t.id), row.id, other.id, where);
  const before = { order: list.map((t, i) => ({ id: t.id, sort_order: t.sort_order ?? i })) };
  await tasksData.updateTaskOrder(ownerId, order);
  revalidatePath("/");
  return { summary: `Moved "${row.title}" ${where} "${other.title}" in Today's Quests.`, change: { kind: "quests", id: row.id, before, after: { order } } };
}

/** A completion time: a date (noon, New York), a New York date and time, or a full instant. Never in the future. */
function completedAtOf(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const iso = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? nyToIso(v.trim(), "12:00") : parseDue(v);
  if (!iso) return undefined;
  if (Date.parse(iso) > Date.now() + 60_000) throw new DuetError("A quest can't be completed in the future.");
  return iso;
}

export async function completeQuest(ownerId: string, a: Args): Promise<Out> {
  const open = await openQuests(ownerId);
  const bl = await loadBoards(ownerId);
  let row: Row;
  try {
    row = await qpick(ownerId, open, a.quest, "quest");
  } catch (e) {
    // Already finished? Say so instead of "no match".
    if (e instanceof DuetError) {
      const done = (await completedQuests(ownerId, 200)).filter((t) => !t.failed_at);
      const ref = typeof a.quest === "string" ? a.quest.trim().toLowerCase() : "";
      const again = ref ? done.filter((t) => t.id === ref || t.title.trim().toLowerCase() === ref) : [];
      if (again.length === 1) return { summary: `"${again[0].title}" is already completed.`, notes: ["No change made."] };
    }
    throw e;
  }
  const at = completedAtOf(a.at);
  // A stand-in finishes the assignment it speaks for (the app does the same).
  let targetId = row.id;
  if (row.stands_for) {
    const { currentAssignment } = await import("@/lib/data/standins");
    targetId = (await currentAssignment(ownerId, row)) ?? row.id;
  }
  const target = targetId === row.id ? row : ((await questById(ownerId, targetId)) ?? row);
  const before = { status: "open", is_manual_priority: !!target.is_manual_priority, in_additional: target.in_additional ?? true, sort_order: target.sort_order ?? 0 };
  const r = await finishTaskForOwner(ownerId, row.id, at);
  const notes: string[] = [];
  if (targetId !== row.id) notes.push(`It's a stand-in, so the assignment it speaks for ("${target.title}") was completed.`);
  if (r.rewardCompleted) notes.push("That quest was a reward's own quest: the reward was completed too.");
  if (r.earlyBird > 0) notes.push(`Early-bird bonus: +${r.earlyBird} XP.`);
  return {
    summary: `Completed "${target.title}": +${target.xp_value} XP, ${r.coinsEarned} coin${r.coinsEarned === 1 ? "" : "s"}${r.totalXp !== null ? ` (total ${r.totalXp} XP)` : ""}.`,
    data: { id: targetId, total_xp: r.totalXp, coins_earned: r.coinsEarned, early_bird_xp: r.earlyBird, board: bl.label(target.board_id) },
    notes,
    change: { kind: "quest", id: targetId, before, after: { totalXp: r.totalXp, coinsEarned: r.coinsEarned, early_xp: r.earlyBird, early_coins: earlyBirdCoins(target, at ? Date.parse(at) : Date.now()) } },
  };
}

export async function reopenQuest(ownerId: string, a: Args): Promise<Out> {
  const done = await completedQuests(ownerId);
  const row = await qpick(ownerId, done, a.quest, "finished quest");
  await reopenTaskForOwner(ownerId, row.id);
  const failed = !!row.failed_at;
  return {
    summary: `Reopened "${row.title}"${failed ? " (it was marked failed)" : ": its XP and coins were taken back"}. It's an open quest again, in Additional Quests.`,
    change: { kind: "quest", id: row.id, before: { completed_at: row.completed_at, failed_at: row.failed_at ?? null, fail_reason: row.fail_reason ?? null }, after: { status: "open" } },
  };
}

export async function archiveQuest(ownerId: string, a: Args): Promise<Out> {
  const row = await qpick(ownerId, await openQuests(ownerId), a.quest, "quest");
  await archiveTaskForOwner(ownerId, row.id);
  return { summary: `Archived "${row.title}" (kept whole; restore_quest brings it back).`, change: { kind: "quest", id: row.id, before: { title: row.title }, after: { archived: true } } };
}

export async function restoreQuest(ownerId: string, a: Args): Promise<Out> {
  const row = pick(await archivedQuestList(ownerId), a.quest, "archived quest");
  const r = await restoreArchivedQuestForOwner(ownerId, row.id);
  return { summary: `Restored "${r.title}" as an open quest.`, change: { kind: "quest", id: row.id, before: { archived: true }, after: { restored: true } } };
}

/** For undo: put the three placement fields back exactly. */
export async function setPlacementColumns(ownerId: string, id: string, v: { is_manual_priority: boolean; in_additional: boolean; sort_order: number }) {
  const { error } = await supabaseAdmin().from("tasks").update({ is_manual_priority: v.is_manual_priority, in_additional: v.in_additional, sort_order: v.sort_order }).eq("id", id).eq("owner_id", ownerId);
  if (error) throw new DuetError(`Couldn't put it back: ${error.message}`);
  revalidatePath("/");
  revalidatePath("/boards", "layout");
}
