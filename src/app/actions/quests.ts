"use server";

import * as boardsData from "@/lib/data/boards";
import { revalidatePath } from "next/cache";
import { writeExtra } from "@/lib/data/extras";
import * as goalsData from "@/lib/data/goals";
import * as tasksData from "@/lib/data/tasks";
import { supabaseAdmin } from "@/lib/supabase/server";
import { finishTaskForOwner as finishTask, adjustXpForEditForOwner, deleteTaskForOwner, archiveTaskForOwner, archivedOf, restoreArchivedQuestForOwner, reopenTaskForOwner, createQuestForOwner } from "@/lib/data/quest-ops";
import * as rewardsData from "@/lib/data/rewards";
import * as xp from "@/lib/data/xp";
import * as stepsData from "@/lib/data/steps";
import { auth } from "@/auth";
import { requireProfileId, readExtras, requireSessionMaybeGoogle, attachCalendarEvent } from "./_shared";

// Boards
export async function createBoardAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Board title is required");

  const parentBoardId = String(formData.get("parentBoardId") || "").trim() || null;
  if (parentBoardId) {
    const parent = await boardsData.getBoard(parentBoardId, ownerId);
    if (!parent) throw new Error("Parent board not found");
  }

  await boardsData.createBoard(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    color: String(formData.get("color") || "").trim() || undefined,
    parentBoardId,
  });

  revalidatePath("/boards");
  if (parentBoardId) revalidatePath(`/boards/${parentBoardId}`);
}

/** A new board from a picker (typed name): returns it so the picker can choose it at once. */
export async function createBoardQuickAction(title: string): Promise<{ id: string; title: string; color: string | null }> {
  const ownerId = await requireProfileId();
  const t = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) throw new Error("Give the board a name.");
  const b = await boardsData.createBoard(ownerId, { title: t });
  revalidatePath("/boards");
  return { id: b.id, title: b.title, color: (b as { color?: string | null }).color ?? null };
}

/** Edits an existing board's own fields (title/description/color). */
export async function updateBoardAction(
  boardId: string,
  input: { title: string; description: string; color: string | null }
) {
  const ownerId = await requireProfileId();
  await boardsData.updateBoard(boardId, ownerId, {
    title: input.title,
    description: input.description.trim() || null,
    color: input.color,
  });
  revalidatePath("/boards");
  revalidatePath(`/boards/${boardId}`);
}

/** "Nest into another board" (or back to the top with null). */
export async function nestBoardAction(boardId: string, parentId: string | null) {
  const ownerId = await requireProfileId();
  const board = await boardsData.getBoard(boardId, ownerId);
  if (!board) throw new Error("That board isn't here anymore.");
  await boardsData.setBoardParent(boardId, ownerId, parentId);
  revalidatePath("/boards", "layout");
}

/** Moves a top-level board into the dreams cloud on the Boards page, or back out to the scrolls. */
export async function setBoardDreamAction(boardId: string, isDream: boolean) {
  const ownerId = await requireProfileId();
  const board = await boardsData.getBoard(boardId, ownerId);
  if (!board) throw new Error("That board isn't here anymore.");
  const { dreamBoardIds } = await import("@/lib/dream-boards");
  const [extras, boards] = await Promise.all([readExtras(ownerId), boardsData.listBoardsForOwner(ownerId)]);
  const ids = dreamBoardIds(extras, boards);
  if (isDream) ids.add(boardId);
  else ids.delete(boardId);
  const live = new Set(boards.map((b) => b.id));
  const dreamBoards = [...ids].filter((id) => live.has(id));
  const { error } = await writeExtra(ownerId, "dreamBoards", dreamBoards);
  if (error) throw new Error(`Couldn't move the board: ${error.message}`);
  revalidatePath("/boards");
  revalidatePath(`/boards/${boardId}`);
}

/** A new board that starts in the dreams cloud. */
export async function createDreamBoardAction(title: string) {
  const ownerId = await requireProfileId();
  const name = title.trim();
  if (!name) throw new Error("Give your dream a name.");
  const board = await boardsData.createBoard(ownerId, { title: name });
  await setBoardDreamAction(board.id, true);
  return board.id;
}

export async function reorderBoardsAction(orderedIds: string[], parentBoardId?: string | null) {
  const ownerId = await requireProfileId();
  await boardsData.updateBoardOrder(ownerId, orderedIds);
  revalidatePath("/boards");
  // Reordering a board's sub-boards grid only touches that board's own
  // page, not the top-level /boards list — revalidate it explicitly too,
  // or the drag would look like it silently didn't stick on next load.
  if (parentBoardId) revalidatePath(`/boards/${parentBoardId}`);
}

// Goals
export async function createGoalAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const boardId = String(formData.get("boardId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!boardId || !title) throw new Error("Board and goal title are required");

  await goalsData.createGoal(ownerId, boardId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
  });

  revalidatePath(`/boards/${boardId}`);
}

export async function reorderGoalsAction(boardId: string, orderedIds: string[]) {
  const ownerId = await requireProfileId();
  await goalsData.updateGoalOrder(boardId, ownerId, orderedIds);
  revalidatePath(`/boards/${boardId}`);
}

export async function updateGoalProgressAction(
  goalId: string,
  boardId: string,
  progress: number
) {
  const ownerId = await requireProfileId();
  await goalsData.updateGoalProgress(goalId, ownerId, progress);
  revalidatePath(`/boards/${boardId}`);
}

// Tasks
export async function createTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Task title is required");

  const goalId = String(formData.get("goalId") || "") || null;
  const xpValue = Math.max(0, Number(formData.get("xpValue") || 0));
  const estimateRaw = String(formData.get("estimateMinutes") || "").trim();
  const estimateMinutes = estimateRaw ? Math.max(0, Number(estimateRaw)) : null;

  await tasksData.createTask(ownerId, {
    title,
    description: String(formData.get("description") || "").trim() || undefined,
    importance: Number(formData.get("importance") || 0),
    urgency: Number(formData.get("urgency") || 0),
    xpValue,
    goalId,
    estimateMinutes,
  });

  revalidatePath("/");
  if (goalId) {
    const goal = await goalsData.getGoal(goalId, ownerId);
    if (goal) revalidatePath(`/boards/${goal.board_id}`);
  }
}

/**
 * Quick-add straight into Today's Battle/Focus (the "+" beside that
 * heading): creates a plain task and immediately pins it as a manual
 * priority, subject to the existing 3-item cap.
 */
export async function createPriorityTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Title is required");

  const task = await tasksData.createTask(ownerId, { title });
  await tasksData.setManualPriority(task.id, ownerId, true);
  revalidatePath("/");
}

export async function toggleManualPriorityAction(
  taskId: string,
  nextValue: boolean
) {
  const ownerId = await requireProfileId();
  await tasksData.setManualPriority(taskId, ownerId, nextValue);
  revalidatePath("/");
}

/** Power-ups and low-energy picks: straight to the top of Today's Quests. */
export async function addToTopOfTodayAction(taskId: string) {
  const ownerId = await requireProfileId();
  await tasksData.pinToTopOfToday(taskId, ownerId);
  revalidatePath("/");
  revalidatePath("/power-ups");
}

export async function reorderTasksAction(orderedIds: string[]) {
  const ownerId = await requireProfileId();
  await tasksData.updateTaskOrder(ownerId, orderedIds);
  revalidatePath("/");
}

/** Drag-to-set on the Priority Matrix: moves a task's dot to a new quadrant position. */
export async function updateTaskPriorityAction(
  taskId: string,
  importance: number,
  urgency: number
) {
  const ownerId = await requireProfileId();
  await tasksData.updateTaskPriority(taskId, ownerId, { importance, urgency });
  revalidatePath("/matrix");
  revalidatePath("/");
}

/** Move a quest or board between the map and the matrix lots. */
export async function setMatrixStateAction(
  kind: "task" | "board",
  id: string,
  state: "unplotted" | "later" | "hidden" | "plot" | null
) {
  const ownerId = await requireProfileId();
  if (kind === "task") {
    if (state === "plot") state = null;
    await tasksData.setTaskMatrixState([id], ownerId, state as tasksData.MatrixState);
  } else {
    // A board "removed" from the matrix simply isn't on it any more.
    await boardsData.updateBoardMatrix(id, ownerId, { matrix_state: state === "hidden" ? null : (state as "plot" | "unplotted" | "later" | null) ?? "plot" });
  }
  revalidatePath("/matrix");
}

/** Drop a quest or board onto the map at these values. */
export async function placeOnMatrixAction(
  kind: "task" | "board",
  id: string,
  values: { importance: number; urgency?: number; effort?: number }
) {
  const ownerId = await requireProfileId();
  if (kind === "task") await tasksData.placeTaskOnMatrix(id, ownerId, values);
  else await boardsData.updateBoardMatrix(id, ownerId, { ...values, matrix_state: "plot" });
  revalidatePath("/matrix");
  if (kind === "task") revalidatePath("/");
}

/** Bring quests and boards (back) onto the matrix, optionally taking a board's own quests off it. */
export async function addToMatrixAction(input: { taskIds: string[]; boardIds: string[]; hideQuestsOfBoards?: boolean }) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskMatrixState(input.taskIds, ownerId, null);
  for (const b of input.boardIds) await boardsData.updateBoardMatrix(b, ownerId, { matrix_state: "plot" });
  if (input.hideQuestsOfBoards && input.boardIds.length) {
    const db = supabaseAdmin();
    const { data } = await db.from("tasks").select("id").eq("owner_id", ownerId).eq("status", "open").in("board_id", input.boardIds);
    await tasksData.setTaskMatrixState((data ?? []).map((r) => r.id as string), ownerId, "hidden");
  }
  revalidatePath("/matrix");
}

/** Fold a board's quests into one board icon on the matrix (placed where its quests sat on average). */
export async function collapseBoardOnMatrixAction(boardId: string) {
  const ownerId = await requireProfileId();
  const db = supabaseAdmin();
  const [{ data: quests }, board] = await Promise.all([
    db.from("tasks").select("id, importance, urgency, effort, matrix_state").eq("owner_id", ownerId).eq("status", "open").eq("board_id", boardId),
    boardsData.getBoard(boardId, ownerId),
  ]);
  if (!board) throw new Error("That board isn't here anymore.");
  const rows = (quests ?? []) as { id: string; importance: number; urgency: number; effort: number; matrix_state: string | null }[];
  const rated = rows.filter((r) => r.matrix_state !== "hidden" && (r.importance || r.urgency));
  const avg = (k: "importance" | "urgency" | "effort") => (rated.length ? rated.reduce((n, r) => n + Number(r[k] || 0), 0) / rated.length : 0);
  const b = board as typeof board & { importance?: number; urgency?: number };
  const boardRated = (b.importance ?? 0) > 0 || (b.urgency ?? 0) > 0;
  await boardsData.updateBoardMatrix(boardId, ownerId, {
    matrix_state: "plot",
    ...(boardRated ? {} : { importance: avg("importance"), urgency: avg("urgency"), effort: avg("effort") }),
  });
  await tasksData.setTaskMatrixState(rows.map((r) => r.id), ownerId, "hidden");
  revalidatePath("/matrix");
}

/** Put a board's quests back on the matrix: all at the board's spot, or all in Not yet plotted. */
export async function expandBoardOnMatrixAction(boardId: string, where: "here" | "unplotted") {
  const ownerId = await requireProfileId();
  const db = supabaseAdmin();
  const board = (await boardsData.getBoard(boardId, ownerId)) as (Awaited<ReturnType<typeof boardsData.getBoard>> & { importance?: number; urgency?: number; effort?: number }) | null;
  if (!board) throw new Error("That board isn't here anymore.");
  const { data: quests } = await db.from("tasks").select("id").eq("owner_id", ownerId).eq("status", "open").eq("board_id", boardId);
  const ids = (quests ?? []).map((r) => r.id as string);
  if (ids.length) {
    const patch: Record<string, unknown> =
      where === "here"
        ? { matrix_state: null, importance: board.importance ?? 0, urgency: board.urgency ?? 0, ...((board.effort ?? 0) > 0 ? { effort: board.effort } : {}) }
        : { matrix_state: "unplotted" };
    const { error } = await db.from("tasks").update(patch).in("id", ids).eq("owner_id", ownerId);
    if (error) throw new Error(`Couldn't move the quests: ${error.message}`);
  }
  await boardsData.updateBoardMatrix(boardId, ownerId, { matrix_state: null });
  revalidatePath("/matrix");
  revalidatePath("/");
}

/** Edit a board as a matrix item: title, notes, ratings, portrait. */
export async function updateBoardMatrixAction(
  boardId: string,
  patch: { title: string; description: string | null; importance: number; urgency: number; effort: number; icon_key: string | null; icon_source: "library" | "ai" }
) {
  const ownerId = await requireProfileId();
  await boardsData.updateBoardMatrix(boardId, ownerId, patch);
  revalidatePath("/matrix");
  revalidatePath("/boards");
}

export async function completeTaskAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const taskId = String(formData.get("taskId") || "");
  const completedAtRaw = String(formData.get("completedAt") || "");
  const completedAt = completedAtRaw ? new Date(completedAtRaw).toISOString() : undefined;
  // Engage Quest: how long it took (the timer, or minutes typed in).
  const spent = Math.round(Number(formData.get("minutesSpent") || 0));
  if (spent > 0 && spent <= 1440) await supabaseAdmin().from("tasks").update({ minutes_spent: spent }).eq("id", taskId).eq("owner_id", ownerId);
  return finishTask(ownerId, taskId, completedAt);
}

/** Full edit from the quest-card edit dialog (title/description/importance/urgency/xp/estimate). */
export async function updateTaskAction(
  taskId: string,
  input: {
    title: string;
    description: string;
    importance: number;
    urgency: number;
    xpValue: number;
    estimateMinutes?: number | null;
    /** Undefined leaves the board untouched; null takes it off its board. */
    boardId?: string | null;
    /** 0–5 energy it takes (0 = unrated). */
    effort?: number;
    /** 0–5 energy it gives back when done (0 = unrated). */
    energyGain?: number;
    /** Keep it as an aspiration (not actionable yet). */
    isAspiration?: boolean;
    grantsReward?: boolean;
    /** Also confirm this quest if it was an import awaiting review. */
    confirmImport?: boolean;
    dueAt?: string | null;
    chunkMinutes?: number | null;
    /** Coins paid on completion; null = automatic (see lib/coins). */
    coinValue?: number | null;
    earlyBonusXp?: number | null;
    earlyBonusCoins?: number | null;
    earlyBonusPerDay?: number | null;
    isTiny?: boolean;
  }
) {
  const ownerId = await requireProfileId();
  if (input.grantsReward !== undefined) await tasksData.setTaskGrantsReward(taskId, ownerId, input.grantsReward);
  if (input.confirmImport) await rewardsData.markReviewed("quest", taskId, ownerId);
  const before = await adjustXpForEditForOwner(ownerId, taskId, input.xpValue);
  await tasksData.updateTask(taskId, ownerId, {
    title: input.title,
    description: input.description.trim() || null,
    importance: input.importance,
    urgency: input.urgency,
    xpValue: input.xpValue,
    estimateMinutes: input.estimateMinutes,
    boardId: input.boardId,
    effort: input.effort,
    energyGain: input.energyGain,
    isAspiration: input.isAspiration,
    dueAt: input.dueAt,
    chunkMinutes: input.chunkMinutes,
    coinValue: input.coinValue,
    earlyBonusXp: input.earlyBonusXp,
    earlyBonusCoins: input.earlyBonusCoins,
    earlyBonusPerDay: input.earlyBonusPerDay,
    isTiny: input.isTiny,
  });
  // A longer quest grows its block on the calendar (owner, Nov 5 and 15: "changed the time from 60 to 90
  // minutes, the quest didn't update in the calendar view"). A shorter one keeps its block for now.
  const est = input.estimateMinutes;
  if (before && before.status === "open" && before.is_on_calendar && before.scheduled_start && before.scheduled_end && est && est > 0 && est !== before.estimate_minutes) {
    const start = new Date(before.scheduled_start);
    const len = Math.round((new Date(before.scheduled_end).getTime() - start.getTime()) / 60_000);
    if (est > len) {
      const { accessToken } = await requireSessionMaybeGoogle();
      await attachCalendarEvent(accessToken ?? null, ownerId, before, start, new Date(start.getTime() + est * 60_000), false).catch(() => {});
      revalidatePath("/calendar");
    }
  }
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/power-ups");
  revalidatePath("/boards", "layout");
}

/** "+ New board" from the quest editor. */
export async function createBoardFromEditorAction(boardTitle: string, parentBoardId?: string | null) {
  const ownerId = await requireProfileId();
  const title = boardTitle.trim();
  if (!title) throw new Error("Name the board first.");
  const board = await boardsData.createBoard(ownerId, { title, parentBoardId: parentBoardId || null });
  revalidatePath("/boards", "layout");
  return { id: board.id, title: board.title };
}

/** A sub-board's contents, for opening it in place like a folder (boards inside, then its quests). */
export async function boardFolderAction(boardId: string) {
  const ownerId = await requireProfileId();
  return boardsData.listBoardFolder(boardId, ownerId);
}

/** Quest boards to file a quest under, nested ones labelled "Parent › Child". */
export async function listBoardOptionsAction() {
  const ownerId = await requireProfileId();
  const boards = await boardsData.listBoardsForOwner(ownerId);
  const byId = new Map(boards.map((b) => [b.id, b]));
  const label = (id: string): string => {
    const b = byId.get(id);
    if (!b) return "";
    return b.parent_board_id && byId.has(b.parent_board_id) ? `${label(b.parent_board_id)} › ${b.title}` : b.title;
  };
  return boards.map((b) => ({ id: b.id, label: label(b.id) })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Mark partial progress on a quest (0–100%). Pays the matching share of its
 * XP now; completing it later pays the rest.
 */
/** A quest's early bonus, set from its card: null XP = automatic. */
export async function setEarlyBonusAction(taskId: string, b: { xp: number | null; coins: number | null; perDay: number | null }) {
  const ownerId = await requireProfileId();
  await tasksData.updateTask(taskId, ownerId, { earlyBonusXp: b.xp, earlyBonusCoins: b.xp === null ? null : b.coins, earlyBonusPerDay: b.xp === null ? null : b.perDay } as Parameters<typeof tasksData.updateTask>[2]);
  revalidatePath("/");
  revalidatePath("/boards", "layout");
}

export async function setTaskProgressAction(taskId: string, progress: number) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  if (typeof task.xp_awarded !== "number") throw new Error("Quest progress needs a quick database update first.");
  if (task.status === "completed") return { xpEarned: 0, coinsEarned: 0, totalXp: null };
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const target = Math.round((task.xp_value * pct) / 100);
  const delta = target - task.xp_awarded;
  await tasksData.setTaskPayout(taskId, ownerId, { progress: pct, xpAwarded: target });
  const award = delta !== 0 ? await xp.awardXp(ownerId, delta, "task_completed", taskId) : null;
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
  return { xpEarned: delta, coinsEarned: award?.coinsEarned ?? 0, totalXp: award?.totalXp ?? null };
}

/** A quest's steps for the editor; null when steps aren't available yet. */
export async function listQuestStepsAction(taskId: string) {
  const ownerId = await requireProfileId();
  return stepsData.listStepsForTask(taskId, ownerId);
}

/**
 * Saves the editor's step list for a quest. A step with its own XP pays it
 * when it's done (and takes it back if it's unticked); `xpEarned` is what
 * this save paid.
 */
export async function saveQuestStepsAction(taskId: string, steps: stepsData.StepInput[]) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  const saved = await stepsData.replaceSteps(taskId, ownerId, steps.slice(0, 50));
  let delta = 0;
  let coinDelta = 0;
  // A sub-quest with its own stat split pays its XP through that split, apart from the rest.
  const ownSplit: { amount: number; split: Record<string, number> }[] = [];
  for (const st of saved) {
    const owed = st.done ? (st.xp ?? 0) : 0;
    const paid = st.xp_paid ?? 0;
    // A sub-quest's own coins (owner, Nov 14), paid when ticked and taken back when unticked.
    const owedC = st.done ? (st.coins ?? 0) : 0;
    const paidC = st.coins_paid ?? 0;
    if (owed !== paid || owedC !== paidC) {
      if (st.stat_split && Object.keys(st.stat_split).length && owed !== paid) ownSplit.push({ amount: owed - paid, split: st.stat_split });
      else delta += owed - paid;
      coinDelta += owedC - paidC;
      await stepsData.setStepPaid(st.id, ownerId, owed, owedC !== paidC ? owedC : undefined);
    }
  }
  let coinsEarned = 0;
  if (delta !== 0) coinsEarned = (await xp.awardXp(ownerId, delta, "task_completed", taskId)).coinsEarned;
  for (const o of ownSplit) {
    coinsEarned += (await xp.awardXp(ownerId, o.amount, "task_completed", taskId, o.split)).coinsEarned;
    delta += o.amount;
  }
  if (coinDelta !== 0) {
    await rewardsData.addCoins(ownerId, coinDelta).catch(() => {});
    coinsEarned += coinDelta;
  }
  revalidatePath("/");
  revalidatePath("/boards", "layout");
  return {
    steps: saved.map((s) => ({ id: s.id, title: s.title, done: s.done, sort_order: s.sort_order, xp: s.xp ?? 0, coins: s.coins ?? 0, minutes: s.minutes ?? null, stat_split: s.stat_split ?? null, weight: s.weight ?? null, progress: s.progress ?? (s.done ? 100 : 0), state: s.state ?? null, parent_id: s.parent_id ?? null })),
    xpEarned: delta,
    coinsEarned,
  };
}

/** Deletion lives inside the edit dialog, not a separate control. */
export async function deleteTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  await deleteTaskForOwner(ownerId, taskId);
}

/**
 * Archive instead of delete (owner, Nov 3: "a record of deleted quests that can be recovered"): the quest and its
 * steps are kept whole in the account's extras (last 60), then the quest is removed. Restoring puts both back.
 */
export async function archiveTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  await archiveTaskForOwner(ownerId, taskId);
}

/** Archived quests, newest first (title, when, board). */
export async function listArchivedQuestsAction() {
  const ownerId = await requireProfileId();
  return archivedOf(await readExtras(ownerId)).map((a) => ({ id: a.task.id as string, title: String(a.task.title ?? "A quest"), at: a.at, boardId: (a.task.board_id as string | null) ?? null, steps: a.steps.length }));
}

export async function restoreArchivedQuestAction(taskId: string) {
  const ownerId = await requireProfileId();
  return restoreArchivedQuestForOwner(ownerId, taskId);
}

/** Quest failure (owner, Nov 6): no XP, no coins, a red X where the check would be. Undo is "Undo quest completion". */
export async function failTaskAction(taskId: string, reason?: string | null) {
  const ownerId = await requireProfileId();
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new Error("Unknown quest.");
  await tasksData.failTask(taskId, ownerId, reason ?? null);
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/boards");
  return { ok: true as const };
}

export async function reopenTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  await reopenTaskForOwner(ownerId, taskId);
}

/**
 * Create a quest from the quest editor dialog. Optionally pins it to Today's
 * Battle, or places it on the calendar (e.g. when turning a Google Calendar
 * event into a quest). Returns the new quest's id.
 */
export async function createQuestAction(input: {
  title: string;
  description?: string;
  importance: number;
  urgency: number;
  xpValue: number;
  estimateMinutes?: number | null;
  boardId?: string | null;
  effort?: number;
  energyGain?: number;
  iconKey?: string | null;
  iconSource?: "library" | "ai";
  pinToBattle?: boolean;
  grantsReward?: boolean;
  schedule?: { startISO: string; endISO: string; googleEventId?: string };
  dueAt?: string | null;
  chunkMinutes?: number | null;
  coinValue?: number | null;
  earlyBonusXp?: number | null;
  earlyBonusCoins?: number | null;
  earlyBonusPerDay?: number | null;
  /** Where it shows on Today ("none" = just on its board). */
  placement?: "today" | "additional" | "none";
  /** A tiny task (half height on Today, just a check box). */
  isTiny?: boolean;
}): Promise<string> {
  const ownerId = await requireProfileId();
  return createQuestForOwner(ownerId, input, async (task) => {
    const session = await auth();
    if (!input.schedule!.googleEventId && session?.googleAccessToken) {
      // New time picked in the quest editor: also put it on Google Calendar.
      await attachCalendarEvent(
        session.googleAccessToken,
        ownerId,
        task,
        new Date(input.schedule!.startISO),
        new Date(input.schedule!.endISO)
      );
    } else {
      await tasksData.rescheduleTask(
        task.id,
        ownerId,
        input.schedule!.startISO,
        input.schedule!.endISO,
        input.schedule!.googleEventId
      );
    }
  });
}

// Priority Lab
/** Spark map: how interesting, novel and challenging a quest feels (0–5; null clears). */
export async function rateSparkAction(taskId: string, patch: { interest?: number | null; novelty?: number | null; challenge?: number | null }) {
  const ownerId = await requireProfileId();
  const clean: Record<string, number | null> = {};
  for (const k of ["interest", "novelty", "challenge"] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    clean[k] = v === null || v === undefined ? null : Math.max(0, Math.min(5, Math.round(v)));
  }
  const { error } = await supabaseAdmin().from("tasks").update(clean).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(/interest|novelty|challenge/.test(error.message) ? "Spark ratings need a quick database update first." : `Couldn't save that: ${error.message}`);
  revalidatePath("/matrix");
}

/**
 * Fresh start for a quest that keeps slipping: its reschedule count goes
 * back to zero (the "fresh start effect" — new beginnings renew effort).
 */
export async function freshStartAction(taskId: string) {
  const ownerId = await requireProfileId();
  const { error } = await supabaseAdmin().from("tasks").update({ reschedule_count: 0 }).eq("id", taskId).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't reset it: ${error.message}`);
  revalidatePath("/");
  revalidatePath("/matrix");
}

// Project next actions
/** Make a quest its board's next action (the one step priority views show). */
export async function setNextStepAction(taskId: string) {
  const ownerId = await requireProfileId();
  const { data } = await supabaseAdmin().from("tasks").select("board_id").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<{ board_id: string | null }>();
  if (!data?.board_id) throw new Error("This quest isn't on a board yet.");
  const { error } = await supabaseAdmin().from("boards").update({ next_task_id: taskId }).eq("id", data.board_id).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards");
}

/** Boards whose name matches, for the boards list's finder (owner [f6349b0f]: "search for boards in the board screen"). */
export async function findBoardsAction(query: string) {
  const ownerId = await requireProfileId();
  const term = query.replace(/[%,()]/g, " ").trim();
  if (!term) return [];
  const db = supabaseAdmin();
  const { data } = await db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId).ilike("title", `%${term}%`).order("sort_order", { ascending: true }).limit(8);
  const rows = (data ?? []) as { id: string; title: string; parent_board_id: string | null }[];
  const parentIds = [...new Set(rows.map((r) => r.parent_board_id).filter((x): x is string => !!x))];
  const parents = new Map<string, string>();
  if (parentIds.length) {
    const { data: ps } = await db.from("boards").select("id, title").eq("owner_id", ownerId).in("id", parentIds);
    for (const p of (ps ?? []) as { id: string; title: string }[]) parents.set(p.id, p.title);
  }
  return rows.map((r) => ({ id: r.id, title: r.title, parent: r.parent_board_id ? parents.get(r.parent_board_id) ?? null : null }));
}
