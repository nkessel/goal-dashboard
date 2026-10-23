"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn, CALENDAR_AUTH_PARAMS } from "@/auth";
import * as boardsData from "@/lib/data/boards";
import * as goalsData from "@/lib/data/goals";
import * as tasksData from "@/lib/data/tasks";
import * as friendshipsData from "@/lib/data/friendships";
import * as invitesData from "@/lib/data/invites";
import * as activityData from "@/lib/data/activity";
import * as notificationsData from "@/lib/data/notifications";
import * as profilesData from "@/lib/data/profiles";
import * as avatarLibraryData from "@/lib/data/avatar-library";
import * as taskIconLibraryData from "@/lib/data/task-icon-library";
import * as rewardsData from "@/lib/data/rewards";
import * as ritesData from "@/lib/data/rites";
import * as winsData from "@/lib/data/wins";
import * as feedbackData from "@/lib/data/feedback";
import * as stepsData from "@/lib/data/steps";
import * as journalData from "@/lib/data/journal";
import * as tomorrowData from "@/lib/data/tomorrow";
import * as schedulingData from "@/lib/data/scheduling";
import * as forumData from "@/lib/data/forum";
import * as statsData from "@/lib/data/stats";
import * as sharingData from "@/lib/data/sharing";
import * as partyData from "@/lib/data/party";
import * as bossesData from "@/lib/data/bosses";
import * as energyData from "@/lib/data/energy";
import { computeLevelForXp } from "@/lib/levels";
import * as xp from "@/lib/data/xp";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateAndStoreImage, buildAvatarPrompt, buildQuestScenePrompt, buildTreasureIconPrompt, visualSubjectFor } from "@/lib/ai-image";
import { styleLook, AVATAR_STYLE_OPTIONS, STYLE_EXAMPLE_SUBJECT } from "@/lib/avatar-prompts";
import { exportAccountData, type AccountExport } from "@/lib/data/export";
import type { TaskIconLibraryEntry, Task } from "@/lib/data/types";
import { sendEmail } from "@/lib/email";
import { findOpenSlots, type Interval } from "@/lib/scheduling";
import {
  listBusyIntervals,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listEvents,
} from "@/lib/google-calendar";
import { coinsForXp } from "@/lib/coins";
import { earlyBirdBonus } from "@/lib/next-action";

async function requireProfileId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

async function requireIdentity(): Promise<{ id: string; name: string }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id, name: session.user.name || session.user.email || "Someone" };
}

/** Signed in; Google Calendar access too when it's been connected (else null). */
async function requireSessionMaybeGoogle() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { profileId: session.user.id, accessToken: session.googleAccessToken ?? null };
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------
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

export async function reorderBoardsAction(orderedIds: string[], parentBoardId?: string | null) {
  const ownerId = await requireProfileId();
  await boardsData.updateBoardOrder(ownerId, orderedIds);
  revalidatePath("/boards");
  // Reordering a board's sub-boards grid only touches that board's own
  // page, not the top-level /boards list — revalidate it explicitly too,
  // or the drag would look like it silently didn't stick on next load.
  if (parentBoardId) revalidatePath(`/boards/${parentBoardId}`);
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
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
  return finishTask(ownerId, taskId, completedAt);
}

/** Coins to add on completion so the quest pays exactly its custom coin value. */
function customCoinAdjustment(task: { coin_value?: number | null; xp_value: number }) {
  if (task.coin_value == null) return 0;
  return Math.max(0, Math.round(task.coin_value)) - coinsForXp(task.xp_value);
}

/**
 * Complete a quest and pay what it still owes. A reward's own quest also
 * completes the reward and pays its bonus coins.
 */
async function finishTask(ownerId: string, taskId: string, completedAt?: string): Promise<Awaited<ReturnType<typeof finishTaskItself>>> {
  // A stand-in quest stays: checking it off finishes the assignment it speaks for right now.
  const t = await tasksData.getTask(taskId, ownerId);
  if (t?.stands_for) {
    const { currentAssignment } = await import("@/lib/data/standins");
    const current = await currentAssignment(ownerId, t);
    if (current) {
      await supabaseAdmin().from("tasks").update({ needs_review: false }).eq("id", current).eq("owner_id", ownerId);
      return finishTaskItself(ownerId, current, completedAt);
    }
  }
  return finishTaskItself(ownerId, taskId, completedAt);
}

/** A quest is done: the next one in its sequence steps into the same spot. */
async function releaseNext(ownerId: string, was: Task) {
  const { releaseFollowers } = await import("@/lib/data/sequences");
  const freed = await releaseFollowers(ownerId, was.id);
  if (!freed.length) return;
  const patch: Record<string, unknown> = { sort_order: (was as Task & { sort_order?: number }).sort_order ?? 0 };
  if (was.is_manual_priority) patch.is_manual_priority = true;
  if (was.queued_for) patch.queued_for = was.queued_for;
  await supabaseAdmin().from("tasks").update(patch).eq("owner_id", ownerId).eq("id", freed[0]);
}

async function finishTaskItself(ownerId: string, taskId: string, completedAt?: string) {
  const was = await tasksData.getTask(taskId, ownerId);
  const completed = await tasksData.completeTask(taskId, ownerId, completedAt);
  // The next quest in its sequence steps forward (taking its place on Today).
  if (was) await releaseNext(ownerId, was).catch(() => {});
  // Partial progress may already have paid some of this quest's XP; pay the rest.
  const tracked = typeof completed.xp_awarded === "number";
  const payout = tracked ? completed.xp_value - (completed.xp_awarded ?? 0) : completed.xp_value;
  if (tracked) await tasksData.setTaskPayout(taskId, ownerId, { progress: 100, xpAwarded: completed.xp_value });
  let totalXp: number | null = null;
  let coinsEarned = 0;
  if (payout !== 0) {
    const award = await xp.awardXp(ownerId, payout, "task_completed", taskId);
    totalXp = award.totalXp;
    coinsEarned = award.coins === null ? 0 : award.coinsEarned;
  } else {
    totalXp = (await profilesData.getProfileById(ownerId))?.total_xp ?? null;
  }
  // A custom coin payout tops up (or trims) the automatic 1-per-10-XP coins.
  const coinAdjust = customCoinAdjustment(completed);
  if (coinAdjust !== 0) {
    await rewardsData.addCoins(ownerId, coinAdjust);
    coinsEarned += coinAdjust;
  }
  let rewardCompleted = false;
  if (completed.reward_id) {
    try {
      const reward = await rewardsData.completeReward(completed.reward_id, ownerId);
      rewardCompleted = true;
      if ((reward.bonus_coins ?? 0) > 0) {
        await rewardsData.addCoins(ownerId, reward.bonus_coins ?? 0);
        coinsEarned += reward.bonus_coins ?? 0;
      }
    } catch {
      /* reward already completed or removed — the quest still counts */
    }
    revalidatePath("/rewards");
  }
  // A boss's session quest counts toward defeating it.
  if (completed.boss_id) await bossStep(ownerId, completed.boss_id, 1).catch(() => {});
  // Done well before its deadline: the early-bird bonus.
  const early = earlyBirdBonus(completed, completedAt ? Date.parse(completedAt) : Date.now());
  if (early > 0) {
    const award = await xp.awardXp(ownerId, early, "early_bird", taskId).catch(() => null);
    if (award) {
      totalXp = award.totalXp;
      coinsEarned += award.coins === null ? 0 : award.coinsEarned;
    }
  }
  // A project's next action is done: the next one takes its place.
  await supabaseAdmin().from("boards").update({ next_task_id: null }).eq("owner_id", ownerId).eq("next_task_id", taskId);
  revalidatePath("/");
  revalidatePath("/matrix");
  // Lets the quest-complete celebration fill the XP bar to the real total.
  return { totalXp, coinsEarned, rewardCompleted, earlyBird: early };
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
  }
) {
  const ownerId = await requireProfileId();
  if (input.grantsReward !== undefined) await tasksData.setTaskGrantsReward(taskId, ownerId, input.grantsReward);
  if (input.confirmImport) await rewardsData.markReviewed("quest", taskId, ownerId);
  // Changing a quest's XP adjusts what you've already earned for it: all of
  // it for a finished quest, its progress share for one in progress.
  const before = await tasksData.getTask(taskId, ownerId);
  if (before && before.xp_value !== input.xpValue) {
    if (typeof before.xp_awarded === "number") {
      const target =
        before.status === "completed"
          ? Math.max(0, Math.round(input.xpValue))
          : Math.round((Math.max(0, input.xpValue) * (before.progress ?? 0)) / 100);
      const delta = target - before.xp_awarded;
      if (delta !== 0) {
        await xp.awardXp(ownerId, delta, "task_completed", taskId);
        await tasksData.setTaskPayout(taskId, ownerId, { xpAwarded: target });
      }
    } else if (before.status === "completed") {
      await xp.awardXp(ownerId, input.xpValue - before.xp_value, "task_completed", taskId);
    }
  }
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
  });
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
  for (const st of saved) {
    const owed = st.done ? (st.xp ?? 0) : 0;
    const paid = st.xp_paid ?? 0;
    if (owed !== paid) {
      delta += owed - paid;
      await stepsData.setStepPaid(st.id, ownerId, owed);
    }
  }
  let coinsEarned = 0;
  if (delta !== 0) coinsEarned = (await xp.awardXp(ownerId, delta, "task_completed", taskId)).coinsEarned;
  revalidatePath("/");
  revalidatePath("/boards", "layout");
  return {
    steps: saved.map((s) => ({ id: s.id, title: s.title, done: s.done, sort_order: s.sort_order, xp: s.xp ?? 0, weight: s.weight ?? null, progress: s.progress ?? (s.done ? 100 : 0), state: s.state ?? null, parent_id: s.parent_id ?? null })),
    xpEarned: delta,
    coinsEarned,
  };
}

/** Deletion lives inside the edit dialog, not a separate control. */
export async function deleteTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  const task = await tasksData.getTask(taskId, ownerId);
  // Reverse any XP already paid for this quest (completion or partial
  // progress) so deleting it can't be used to farm points.
  const paid = task ? (typeof task.xp_awarded === "number" ? task.xp_awarded : task.status === "completed" ? task.xp_value : 0) : 0;
  if (paid > 0) {
    await xp.awardXp(ownerId, -paid, "task_completed", taskId);
  }
  await tasksData.deleteTask(taskId, ownerId);
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
}

export async function reopenTaskAction(taskId: string) {
  const ownerId = await requireProfileId();
  const before = await tasksData.getTask(taskId, ownerId);
  await tasksData.reopenTask(taskId, ownerId);
  // Undo what the quest paid out so re-completing later doesn't farm points;
  // progress starts over.
  if (before?.status === "completed" && before.reward_id) {
    // Reopening a reward's quest puts the reward back to accepted (bonus coins back out).
    const was = await rewardsData.uncompleteReward(before.reward_id, ownerId);
    if (was && (was.bonus_coins ?? 0) > 0) await rewardsData.addCoins(ownerId, -(was.bonus_coins ?? 0));
    revalidatePath("/rewards");
  }
  if (before?.status === "completed" && before.boss_id) await bossStep(ownerId, before.boss_id, -1).catch(() => {});
  if (before?.status === "completed") {
    const paid = typeof before.xp_awarded === "number" ? before.xp_awarded : before.xp_value;
    if (paid > 0) await xp.awardXp(ownerId, -paid, "task_completed", taskId);
    const coinAdjust = customCoinAdjustment(before);
    if (coinAdjust !== 0) await rewardsData.addCoins(ownerId, -coinAdjust);
    if (typeof before.xp_awarded === "number") await tasksData.setTaskPayout(taskId, ownerId, { progress: 0, xpAwarded: 0 });
  }
  revalidatePath("/");
  revalidatePath("/matrix");
}

// ---------------------------------------------------------------------------
// Pull-to-calendar (Priority #4)
// ---------------------------------------------------------------------------

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
 * Shared by scheduleTaskAction and createScheduledTaskAction: creates the
 * Google Calendar event for a task's chosen time (or moves its existing
 * event, if it was already scheduled) and records the schedule on the task.
 */
async function attachCalendarEvent(
  /** Null when Google Calendar isn't connected: the time is kept in the app only. */
  accessToken: string | null,
  profileId: string,
  task: { id: string; title: string; description: string | null; google_calendar_event_id?: string | null },
  start: Date,
  end: Date,
  /** False while planning a day: moving a quest around isn't a reschedule. */
  countAsReschedule = true
) {
  let eventId = task.google_calendar_event_id ?? undefined;
  if (!accessToken) {
    await tasksData.rescheduleTask(task.id, profileId, start.toISOString(), end.toISOString(), eventId, countAsReschedule);
    return;
  }
  if (eventId) {
    await updateCalendarEvent(accessToken, eventId, { start, end });
  } else {
    eventId = await createCalendarEvent(accessToken, {
      title: task.title,
      description: task.description ?? undefined,
      start,
      end,
    });
  }
  await tasksData.rescheduleTask(task.id, profileId, start.toISOString(), end.toISOString(), eventId, countAsReschedule);
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

  const task = await tasksData.getTask(taskId, profileId);
  if (!task) throw new Error("Task not found");

  await attachCalendarEvent(accessToken, profileId, task, new Date(startISO), new Date(endISO));
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

// ---------------------------------------------------------------------------
// Social: friend directory, requests, invite links (Priority #7)
// ---------------------------------------------------------------------------
export async function sendFriendRequestAction(addresseeId: string) {
  const { id: requesterId, name } = await requireIdentity();
  const friendship = await friendshipsData.sendFriendRequest(requesterId, addresseeId);
  await notificationsData.createNotification({
    profileId: addresseeId,
    actorId: requesterId,
    kind: "friend_request",
    body: `${name} sent you a friend request.`,
    friendshipId: friendship.id,
  });
  revalidatePath("/feed");
}

export async function respondFriendRequestAction(friendshipId: string, accept: boolean) {
  const { id: addresseeId, name } = await requireIdentity();
  const friendship = await friendshipsData.respondToFriendRequest(friendshipId, addresseeId, accept);
  if (accept) {
    await notificationsData.createNotification({
      profileId: friendship.requester_id,
      actorId: addresseeId,
      kind: "friend_request_accepted",
      body: `${name} accepted your friend request.`,
      friendshipId: friendship.id,
    });
  }
  revalidatePath("/feed");
}

export async function removeFriendAction(friendshipId: string) {
  const ownerId = await requireProfileId();
  await friendshipsData.removeFriendship(friendshipId, ownerId);
  revalidatePath("/feed");
}

/**
 * Accepts an invite link: creates (or upgrades to) an accepted friendship
 * between the visitor and whoever created the link, then bumps its use
 * count. Safe to call more than once (idempotent-ish — a repeat visit just
 * re-affirms an existing friendship rather than erroring).
 */
export async function acceptInviteAction(code: string) {
  const { id: profileId, name } = await requireIdentity();
  const invite = await invitesData.getInviteByCode(code);
  if (!invite) throw new Error("This invite link is invalid or has expired.");
  if (invite.created_by === profileId) {
    throw new Error("This is your own invite link — share it with a friend instead.");
  }

  const existing = await friendshipsData.getFriendshipMap(profileId);
  const already = existing.get(invite.created_by);
  if (!already || already.status !== "accepted") {
    if (already) {
      await friendshipsData.respondToFriendRequest(already.id, profileId, true);
    } else {
      const friendship = await friendshipsData.sendFriendRequest(invite.created_by, profileId);
      await friendshipsData.respondToFriendRequest(friendship.id, profileId, true);
    }
    await invitesData.incrementInviteUse(invite.id);
    await notificationsData.createNotification({
      profileId: invite.created_by,
      actorId: profileId,
      kind: "friend_request_accepted",
      body: `${name} joined using your invite link and is now your friend.`,
    });
  }

  revalidatePath("/feed");
}

// ---------------------------------------------------------------------------
// Social: activity feed reactions + comments (Priority #7)
// ---------------------------------------------------------------------------
export async function addReactionAction(activityId: string, emoji: string) {
  const { id: profileId, name } = await requireIdentity();
  await activityData.addReaction(activityId, profileId, emoji);

  const ownerId = await activityData.getActivityOwner(activityId);
  if (ownerId) {
    const what = await activityData.describeActivity(activityId).catch(() => null);
    await notificationsData.createNotification({
      profileId: ownerId,
      actorId: profileId,
      kind: "reaction",
      body: `${name} reacted ${emoji} to ${what ?? "your activity"}.`,
      activityId,
    });
  }
  revalidatePath("/feed");
}

export async function removeReactionAction(activityId: string, emoji: string) {
  const profileId = await requireProfileId();
  await activityData.removeReaction(activityId, profileId, emoji);
  revalidatePath("/feed");
}

export async function addCommentAction(formData: FormData) {
  const { id: profileId, name } = await requireIdentity();
  const activityId = String(formData.get("activityId") || "");
  const body = String(formData.get("body") || "");
  if (!activityId) throw new Error("Missing activity");

  await activityData.addComment(activityId, profileId, body);

  const ownerId = await activityData.getActivityOwner(activityId);
  if (ownerId) {
    const what = await activityData.describeActivity(activityId).catch(() => null);
    const notification = await notificationsData.createNotification({
      profileId: ownerId,
      actorId: profileId,
      kind: "comment",
      body: `${name} commented on ${what ?? "your activity"}: "${body.slice(0, 120)}"`,
      activityId,
    });

    // Comments are a "higher-value moment" per the spec (a real cheer, not
    // just a tap) — worth an email in addition to the in-app notification.
    if (notification) {
      const owner = await profilesData.getProfileById(ownerId);
      if (owner) {
        const sent = await sendEmail({
          to: owner.email,
          subject: `${name} commented on your activity`,
          html: `<p><strong>${escapeHtml(name)}</strong> commented on your Goal Dashboard activity:</p><blockquote>${escapeHtml(body)}</blockquote>`,
        });
        if (sent) await notificationsData.markEmailSent(notification.id);
      }
    }
  }
  revalidatePath("/feed");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ---------------------------------------------------------------------------
// XP / leveling (Priority #8)
// ---------------------------------------------------------------------------
export async function dailyCheckInAction(tzOffsetMinutes?: number): Promise<xp.CheckInResult> {
  const ownerId = await requireProfileId();
  const offset = Number.isFinite(tzOffsetMinutes) ? Math.max(-840, Math.min(840, Math.round(tzOffsetMinutes!))) : 0;
  const result = await xp.dailyCheckIn(ownerId, offset);
  revalidatePath("/");
  return result;
}

// ---------------------------------------------------------------------------
// Notifications (Priority #9)
// ---------------------------------------------------------------------------
export async function markNotificationReadAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.markRead(id, ownerId);
  revalidatePath("/notifications");
}

/** Hide a notification for a while; it comes back unread afterwards. */
export async function snoozeNotificationAction(id: string, minutes: number) {
  const ownerId = await requireProfileId();
  const mins = Math.max(5, Math.min(60 * 24 * 14, Math.round(minutes)));
  await notificationsData.snooze(id, ownerId, new Date(Date.now() + mins * 60_000).toISOString());
  revalidatePath("/notifications");
}

export async function markNotificationUnreadAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.markUnread(id, ownerId);
  revalidatePath("/notifications");
}

export async function deleteNotificationAction(id: string) {
  const ownerId = await requireProfileId();
  await notificationsData.deleteNotification(id, ownerId);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const ownerId = await requireProfileId();
  await notificationsData.markAllRead(ownerId);
  revalidatePath("/notifications");
}

// ---------------------------------------------------------------------------
// Theme + avatar (Priority #10)
// ---------------------------------------------------------------------------
export async function updateThemeAction(theme: "calm" | "adventure") {
  const ownerId = await requireProfileId();
  await profilesData.updateProfileTheme(ownerId, theme);
  revalidatePath("/", "layout");
}

/** Picking an avatar straight from the shared library (a preset or someone
 * else's generated one) — no new image is created, just a URL swap. */
export async function pickAvatarFromLibraryAction(imageUrl: string) {
  const ownerId = await requireProfileId();
  await profilesData.updateProfileAvatarImage(ownerId, imageUrl);
  revalidatePath("/", "layout");
}

export async function updateProfilePrivacyAction(isPublic: boolean) {
  const ownerId = await requireProfileId();
  await profilesData.updateProfilePrivacy(ownerId, isPublic);
  revalidatePath("/settings");
  revalidatePath("/feed");
}

export async function setTaskIconAction(
  taskId: string,
  iconKey: string | null,
  iconSource: "monster" | "library" | "ai"
) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey, iconSource });
  revalidatePath("/");
  revalidatePath("/matrix");
}

/** The shared quest-icon library (presets + everyone's generated icons),
 * for IconPicker's "Library" tab. Fetched lazily on demand rather than
 * plumbed as a prop, since IconPicker is mounted deep inside every task
 * card across several pages. */
export async function listTaskIconLibraryAction(): Promise<TaskIconLibraryEntry[]> {
  const ownerId = await requireProfileId();
  return taskIconLibraryData.listAllPortraits(ownerId);
}

/** Picking a task icon straight from the shared library (a preset or
 * someone else's generated one) — no new image is created, just a URL
 * swap, same as pickAvatarFromLibraryAction. */
export async function pickTaskIconFromLibraryAction(taskId: string, imageUrl: string) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey: imageUrl, iconSource: "library" });
  revalidatePath("/");
  revalidatePath("/matrix");
}

/**
 * "Generate once, then store it": calls the image-gen API exactly once per
 * click and immediately persists the result — never regenerated on view.
 * The result is also added to the shared avatar library so anyone can pick
 * it later.
 *
 * @param withBackground false (default) generates a transparent cutout;
 *   true keeps an illustrated scene behind the character instead.
 * @param style Optional art-style preset key (from AVATAR_STYLE_OPTIONS in
 *   avatar-prompts.ts) layered on top of the base epic/gritty prompt.
 */
/**
 * Portraits show on the shared Friend Feed, so they stay family-friendly:
 * explicit prompts are turned away before any painting happens.
 */
const EXPLICIT_PROMPT = /\b(nude|nudes|naked|nsfw|topless|bottomless|porn\w*|sex|sexy|sexual|erotic\w*|genital\w*|penis|vagina|nipples?|boobs?|breasts?|lingerie|undress\w*|strip(per|ping)?|fetish\w*|hentai|xxx)\b/i;
function assertFamilyFriendly(prompt: string) {
  if (EXPLICIT_PROMPT.test(prompt)) throw new Error("Let's keep portraits family-friendly. Try a different description.");
}

export async function generateAvatarImageAction(
  prompt: string,
  withBackground = false,
  style: string | null = null
) {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe what you want your avatar to look like first.");
  assertFamilyFriendly(trimmed);

  const fullPrompt = buildAvatarPrompt(trimmed, { withBackground, look: styleLook(style) });
  const url = await generateAndStoreImage(fullPrompt, `avatars/${ownerId}-${Date.now()}.jpg`, {
    pixelate: style === "pixel" ? 48 : undefined,
  });
  await profilesData.updateProfileAvatarImage(ownerId, url);
  await avatarLibraryData.addAvatarToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  revalidatePath("/", "layout");
  revalidatePath("/settings/avatar");
  return url;
}

export async function clearAvatarImageAction() {
  const ownerId = await requireProfileId();
  await profilesData.updateProfileAvatarImage(ownerId, null);
  revalidatePath("/", "layout");
}

/** Updates the profile's display name — the "character name" shown on the
 * Friend Feed, in comments, and atop the Settings profile card. */
export async function updateProfileNameAction(name: string) {
  const ownerId = await requireProfileId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a name first.");
  await profilesData.updateProfileName(ownerId, trimmed);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Full account data export (local -> published migration)
// ---------------------------------------------------------------------------
export async function exportAccountDataAction(): Promise<AccountExport> {
  const ownerId = await requireProfileId();
  return exportAccountData(ownerId);
}

export async function generateTaskIconAction(taskId: string, prompt: string) {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the monster/icon you want first.");
  assertFamilyFriendly(trimmed);

  // A concrete picture of the task, in the same painted storybook style as imports.
  // Quest portraits keep their painted scene behind them.
  const url = await generateAndStoreImage(buildQuestScenePrompt(await visualSubjectFor(trimmed)), `tasks/${taskId}-${Date.now()}.jpg`);
  await tasksData.setTaskIcon(taskId, ownerId, { iconKey: url, iconSource: "ai" });
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/boards", "layout");
  return url;
}

/** Remove one image from the shared avatar library. Profiles already using
 * it keep their avatar — only the library tile goes away. */
export async function removeAvatarFromLibraryAction(id: string) {
  const ownerId = await requireProfileId();
  await avatarLibraryData.removeAvatarFromLibrary(id, ownerId);
  revalidatePath("/settings/avatar");
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
  /** Where it shows on Today ("none" = just on its board). */
  placement?: "today" | "additional" | "none";
}): Promise<string> {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give your quest a title first.");
  const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n * 10) / 10));
  const task = await tasksData.createTask(ownerId, {
    title,
    description: input.description?.trim() || undefined,
    importance: clamp(input.importance),
    urgency: clamp(input.urgency),
    xpValue: Math.max(0, Math.round(input.xpValue)),
    boardId: input.boardId ?? null,
    effort: input.effort,
    energyGain: input.energyGain,
    estimateMinutes: input.estimateMinutes ?? null,
    iconKey: input.iconKey ?? null,
    iconSource: input.iconSource,
    dueAt: input.dueAt ?? null,
    chunkMinutes: input.chunkMinutes ?? null,
    coinValue: input.coinValue ?? null,
  });
  revalidatePath("/power-ups");
  if (input.schedule) {
    const session = await auth();
    if (!input.schedule.googleEventId && session?.googleAccessToken) {
      // New time picked in the quest editor: also put it on Google Calendar.
      await attachCalendarEvent(
        session.googleAccessToken,
        ownerId,
        task,
        new Date(input.schedule.startISO),
        new Date(input.schedule.endISO)
      );
    } else {
      await tasksData.rescheduleTask(
        task.id,
        ownerId,
        input.schedule.startISO,
        input.schedule.endISO,
        input.schedule.googleEventId
      );
    }
  }
  if (input.pinToBattle) {
    // Today's Quests full: it simply lands in Additional Quests.
    await tasksData.setManualPriority(task.id, ownerId, true).catch(() => null);
  }
  if (input.placement === "none") await tasksData.setTaskInAdditional(task.id, ownerId, false).catch(() => null);
  if (input.grantsReward) {
    await tasksData.setTaskGrantsReward(task.id, ownerId, true);
  }
  revalidatePath("/");
  revalidatePath("/matrix");
  revalidatePath("/calendar");
  if (input.boardId) revalidatePath(`/boards/${input.boardId}`);
  return task.id;
}

/** Generate a quest portrait without attaching it to a quest yet (the create
 * dialog, before the quest exists). Added to the shared icon library. */
export async function generateQuestIconImageAction(prompt: string, artStyle: "monster" | "treasure" = "monster"): Promise<string> {
  const ownerId = await requireProfileId();
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Describe the monster/icon you want first.");
  assertFamilyFriendly(trimmed);
  const url =
    artStyle === "treasure"
      ? await generateAndStoreImage(buildTreasureIconPrompt(trimmed), `rewards/draft-${ownerId}-${Date.now()}.jpg`)
      : await generateAndStoreImage(buildQuestScenePrompt(await visualSubjectFor(trimmed)), `tasks/draft-${ownerId}-${Date.now()}.jpg`);
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: trimmed });
  return url;
}

/**
 * Example portrait for each art style (same subject in every style), made
 * once and cached in storage at a fixed path. Returns { styleKey: url }.
 */
export async function ensureStyleExamplesAction(): Promise<Record<string, string>> {
  await requireProfileId();
  const out: Record<string, string> = {};
  const db = supabaseAdmin();
  const { data: existing } = await db.storage.from("ai-images").list("style-examples");
  const have = new Set((existing ?? []).map((f: { name: string }) => f.name));
  for (const style of AVATAR_STYLE_OPTIONS) {
    // Heroic keeps the v2 example Nathan liked.
    const version = style.key === "heroic" ? "v2" : "v7";
    const name = `${style.key}-${version}.png`;
    if (have.has(name)) {
      out[style.key] = db.storage.from("ai-images").getPublicUrl(`style-examples/${name}`).data.publicUrl;
      continue;
    }
    out[style.key] = await generateAndStoreImage(
      buildAvatarPrompt(STYLE_EXAMPLE_SUBJECT, { withBackground: false, look: style.look }),
      `style-examples/${style.key}-${version}.jpg`,
      { pixelate: style.key === "pixel" ? 48 : undefined }
    );
  }
  return out;
}

/** Remove one image from the shared quest-icon library (quests already using it keep it). */
export async function removeTaskIconFromLibraryAction(id: string) {
  const ownerId = await requireProfileId();
  await taskIconLibraryData.removeTaskIconFromLibrary(id, ownerId);
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------
export async function createRewardAction(input: {
  title: string;
  description?: string;
  iconKey?: string | null;
  costCoins?: number;
  bonusXp?: number;
  bonusCoins?: number;
  prereqTitle?: string;
  prereqXp?: number;
}) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give the reward a name first.");
  const reward = await rewardsData.createReward(ownerId, {
    title,
    description: input.description?.trim() || null,
    iconKey: input.iconKey,
    costCoins: input.costCoins,
    bonusXp: input.bonusXp,
    bonusCoins: input.bonusCoins,
    prereqTitle: input.prereqTitle?.trim() || null,
    prereqXp: input.prereqXp,
  });
  revalidatePath("/rewards");
  return reward.id;
}

export async function updateRewardAction(
  rewardId: string,
  input: {
    title: string;
    description: string;
    iconKey?: string | null;
    costCoins?: number;
    bonusXp?: number;
    bonusCoins?: number;
    prereqTitle?: string;
    prereqXp?: number;
    confirmImport?: boolean;
  }
) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error("Give the reward a name first.");
  await rewardsData.updateReward(rewardId, ownerId, {
    title,
    description: input.description.trim() || null,
    iconKey: input.iconKey,
    costCoins: input.costCoins,
    bonusXp: input.bonusXp,
    bonusCoins: input.bonusCoins,
    prereqTitle: input.prereqTitle === undefined ? undefined : input.prereqTitle.trim() || null,
    prereqXp: input.prereqXp,
    needsReview: input.confirmImport ? false : undefined,
  });
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function deleteRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  await rewardsData.deleteReward(rewardId, ownerId);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

/** Your unclaimed rewards plus your coin balance (for the reward picker). */
export async function listAvailableRewardsAction() {
  const ownerId = await requireProfileId();
  const [all, coins] = await Promise.all([rewardsData.listRewards(ownerId), rewardsData.getCoins(ownerId)]);
  return { rewards: all.filter((r) => r.status === "available"), coins };
}

/** Pick a reward after finishing a reward-granting quest (or claim one directly). */
export async function claimRewardAction(rewardId: string, taskId: string | null, opts: { now?: boolean } = {}) {
  const ownerId = await requireProfileId();
  // Accepting spends the reward's coins; its bonus comes when you complete it.
  const { coins, reward } = await rewardsData.claimReward(rewardId, ownerId, taskId);
  if (opts.now) {
    // Received on the spot: complete it right away and pay its bonus.
    const done = await rewardsData.completeReward(rewardId, ownerId);
    const bonusXp = done.bonus_xp ?? 0;
    const bonusCoins = done.bonus_coins ?? 0;
    let totalXp: number | null = null;
    let coinsNow = coins;
    if (bonusXp > 0) {
      const award = await xp.awardXp(ownerId, bonusXp, "task_completed");
      totalXp = award.totalXp ?? null;
      coinsNow += award.coinsEarned ?? 0;
    }
    if (bonusCoins > 0) {
      await rewardsData.addCoins(ownerId, bonusCoins);
      coinsNow += bonusCoins;
    }
    revalidatePath("/rewards");
    revalidatePath("/", "layout");
    return { coins: coinsNow, received: true as const, bonusXp, bonusCoins, totalXp };
  }
  // It goes straight into Today's Battle: the reward's own quest, stacked
  // behind its prerequisite quest when it has one.
  if (reward.prereq_xp !== undefined) {
    const prereq = reward.prereq_title
      ? await tasksData.createTask(ownerId, {
          title: reward.prereq_title,
          description: reward.prereq_description || `Do this first to unlock: ${reward.title}`,
          xpValue: reward.prereq_xp ?? 10,
          isManualPriority: true,
        })
      : null;
    await tasksData.createTask(ownerId, {
      title: reward.title,
      description: reward.description || "Your reward — enjoy it!",
      xpValue: reward.bonus_xp ?? 0,
      iconKey: reward.icon_key,
      iconSource: "library",
      rewardId: reward.id,
      lockedByTaskId: prereq?.id ?? null,
      isManualPriority: true,
    });
  }
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
  return { coins, received: false as const, bonusXp: 0, bonusCoins: 0, totalXp: null as number | null };
}

async function reverseRewardBonus(ownerId: string, was: Awaited<ReturnType<typeof rewardsData.uncompleteReward>>) {
  if (!was) return;
  if ((was.bonus_xp ?? 0) > 0) await xp.awardXp(ownerId, -(was.bonus_xp ?? 0), "task_completed");
  if ((was.bonus_coins ?? 0) > 0) await rewardsData.addCoins(ownerId, -(was.bonus_coins ?? 0));
}

/** You actually did it (got the haircut, bought the frames): pays the completion bonus. */
export async function completeRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  // Accepted with its own quest: completing that quest completes the reward.
  const quest = await tasksData.findOpenRewardTask(rewardId, ownerId);
  if (quest) {
    if (quest.locked_by_task_id) {
      const prereq = await tasksData.getTask(quest.locked_by_task_id, ownerId);
      if (prereq && prereq.status === "open") throw new Error(`Finish “${prereq.title}” first to unlock this reward.`);
    }
    const before = await rewardsData.listRewards(ownerId).then((rs) => rs.find((r) => r.id === rewardId));
    const done = await finishTask(ownerId, quest.id);
    const totalXp = (done as { totalXp?: number | null } | undefined)?.totalXp ?? null;
    return { bonusXp: quest.xp_value, bonusCoins: before?.bonus_coins ?? 0, bonusCoinsFromXp: coinsForXp(quest.xp_value), totalXp };
  }
  const reward = await rewardsData.completeReward(rewardId, ownerId);
  const bonusXp = reward.bonus_xp ?? 0;
  const bonusCoins = reward.bonus_coins ?? 0;
  const award = bonusXp > 0 ? await xp.awardXp(ownerId, bonusXp, "task_completed") : null;
  if (bonusCoins > 0) await rewardsData.addCoins(ownerId, bonusCoins);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
  return { bonusXp, bonusCoins, bonusCoinsFromXp: coinsForXp(bonusXp), totalXp: award?.totalXp ?? null };
}

/** Undo a completion (back to accepted) and take back its bonus. */
export async function uncompleteRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  await reverseRewardBonus(ownerId, await rewardsData.uncompleteReward(rewardId, ownerId));
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function unclaimRewardAction(rewardId: string) {
  const ownerId = await requireProfileId();
  // A completed reward first gives back its bonus, then refunds as usual;
  // its still-open quests leave Today's Battle.
  await reverseRewardBonus(ownerId, await rewardsData.uncompleteReward(rewardId, ownerId));
  await tasksData.deleteOpenRewardTasks(rewardId, ownerId).catch(() => {});
  await rewardsData.unclaimReward(rewardId, ownerId);
  revalidatePath("/rewards");
  revalidatePath("/", "layout");
}

export async function setTaskGrantsRewardAction(taskId: string, grantsReward: boolean) {
  const ownerId = await requireProfileId();
  await tasksData.setTaskGrantsReward(taskId, ownerId, grantsReward);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Imports (quests/rewards added for you, reviewed one by one)
// ---------------------------------------------------------------------------
export async function listImportsAction() {
  const ownerId = await requireProfileId();
  return rewardsData.listImports(ownerId);
}

export async function confirmImportAction(kind: "quest" | "reward", id: string) {
  const ownerId = await requireProfileId();
  await rewardsData.markReviewed(kind, id, ownerId);
  revalidatePath("/", "layout");
}

/**
 * Makes the sketchbook portrait for ONE import that still needs one, and
 * returns what's left (the client calls this repeatedly, one image per
 * request, so no single request runs long).
 */
export async function generateNextImportIconAction(): Promise<{ done: boolean; id?: string; url?: string }> {
  const ownerId = await requireProfileId();
  const next = await rewardsData.nextImportNeedingIcon(ownerId);
  if (!next) return { done: true };
  // Quests: painted storybook object, cut out. Rewards: same style, kept on
  // a beaming golden background.
  const url =
    next.kind === "reward"
      ? await generateAndStoreImage(buildTreasureIconPrompt(await visualSubjectFor(next.prompt)), `rewards/${next.id}-${Date.now()}.jpg`)
      : await generateAndStoreImage(buildQuestScenePrompt(await visualSubjectFor(next.prompt)), `tasks/${next.id}-${Date.now()}.jpg`);
  await rewardsData.setImportIcon(next.kind, next.id, ownerId, url);
  await taskIconLibraryData.addTaskIconToLibrary({ imageUrl: url, createdBy: ownerId, prompt: next.prompt });
  return { done: false, id: next.id, url };
}

// ---------------------------------------------------------------------------
// Evening routine (rites)
// ---------------------------------------------------------------------------
function assertDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Bad day.");
}

/** Complete a rite for your local `day` (YYYY-MM-DD); pays its XP once per day. */
export async function completeRiteAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That rite isn't here anymore.");
  // A habit with its own coin value pays exactly that (on top of or instead of the automatic coins).
  const coinAdjust = rite.coin_value == null ? 0 : Math.max(0, rite.coin_value) - coinsForXp(rite.xp_value);
  const added = await ritesData.addRiteCompletion(ownerId, riteId, day, rite.xp_value, coinAdjust);
  let coinsEarned = 0;
  if (added && rite.xp_value > 0) coinsEarned = (await xp.awardXp(ownerId, rite.xp_value, "task_completed")).coinsEarned;
  if (added && coinAdjust !== 0) {
    await rewardsData.addCoins(ownerId, coinAdjust);
    coinsEarned += coinAdjust;
  }
  revalidatePath("/");
  return { xp: added ? rite.xp_value : 0, coinsEarned };
}

/** Undo a rite completion for `day` and take back its XP. */
export async function uncompleteRiteAction(riteId: string, day: string) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const paid = await ritesData.removeRiteCompletion(ownerId, riteId, day);
  if (paid && paid.xp > 0) await xp.awardXp(ownerId, -paid.xp, "task_completed");
  if (paid && paid.coins !== 0) await rewardsData.addCoins(ownerId, -paid.coins);
  revalidatePath("/");
}

export async function createRiteAction(input: { title: string; description?: string; isCore: boolean; xpValue?: number; slot?: "evening" | "day"; days?: number[] | null; dueTime?: string | null } & ritesData.HabitExtras) {
  const ownerId = await requireProfileId();
  const title = input.title.trim();
  if (!title) throw new Error(input.slot === "day" ? "Name the habit first." : "Name the rite first.");
  const rite = await ritesData.createRite(ownerId, {
    title,
    description: input.description?.trim() || null,
    isCore: input.isCore,
    xpValue: input.xpValue,
    slot: input.slot,
    days: input.days,
    dueTime: input.dueTime,
    iconKey: input.iconKey,
    iconSource: input.iconSource,
    coinValue: input.coinValue,
    estimateMinutes: input.estimateMinutes,
  });
  revalidatePath("/");
  return rite.id;
}

export async function updateRiteAction(riteId: string, input: { title?: string; description?: string; isCore?: boolean; xpValue?: number; days?: number[] | null; dueTime?: string | null } & ritesData.HabitExtras) {
  const ownerId = await requireProfileId();
  if (input.title !== undefined && !input.title.trim()) throw new Error("Name the rite first.");
  await ritesData.updateRite(riteId, ownerId, {
    title: input.title?.trim(),
    description: input.description === undefined ? undefined : input.description.trim() || null,
    isCore: input.isCore,
    xpValue: input.xpValue,
    days: input.days,
    dueTime: input.dueTime,
    iconKey: input.iconKey,
    iconSource: input.iconSource,
    coinValue: input.coinValue,
    estimateMinutes: input.estimateMinutes,
  });
  revalidatePath("/");
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

// ---------------------------------------------------------------------------
// "Doing now" and the journal (both from the + sheet)
// ---------------------------------------------------------------------------

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

/** Snooze a quest until tomorrow (end of tomorrow's plan; counts as a reschedule). Returns what Undo needs. */
export async function snoozeQuestAction(taskId: string) {
  const ownerId = await requireProfileId();
  const prev = await tomorrowData.snoozeToTomorrow(ownerId, taskId);
  revalidatePath("/");
  return prev;
}

export async function undoSnoozeAction(taskId: string, prev: tomorrowData.SnoozePrev) {
  const ownerId = await requireProfileId();
  await tomorrowData.undoSnooze(ownerId, taskId, prev);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Planning tomorrow's day (the evening's "Plan tomorrow's day" rite)
// ---------------------------------------------------------------------------

export type DayPlan = {
  events: { id: string; title: string; start: string; end: string; isAllDay: boolean }[];
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
    events: events.filter((e) => !linked.has(e.id)).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, isAllDay: e.isAllDay })),
    quests: tasks
      .filter((t) => t.scheduled_start && t.scheduled_end)
      .map((t) => ({ id: t.id, title: t.title, start: t.scheduled_start!, end: t.scheduled_end!, icon_key: t.icon_key ?? null, icon_source: t.icon_source ?? null, status: t.status })),
  };
}

/** Place (or move) a quest in a day plan. Planning moves don't count as reschedules. */
export async function planQuestAtAction(taskId: string, startISO: string, endISO: string) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
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
  const { data: t } = await supabaseAdmin().from("tasks").select("plan_xp, status").eq("id", taskId).eq("owner_id", profileId).maybeSingle<{ plan_xp: number | null; status: string }>();
  const eventId = await tasksData.unscheduleTask(taskId, profileId);
  if (eventId && accessToken) await deleteCalendarEvent(accessToken, eventId).catch(() => {});
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
  const task = await tasksData.getTask(taskId, ownerId);
  if (!task) throw new Error("That quest isn't here anymore.");
  if (placement === "today") {
    if (!task.is_manual_priority) await tasksData.setManualPriority(taskId, ownerId, true);
    if (task.in_additional === false) await tasksData.setTaskInAdditional(taskId, ownerId, true).catch(() => null);
  } else {
    if (task.is_manual_priority) await tasksData.setManualPriority(taskId, ownerId, false);
    if ((placement === "none") !== (task.in_additional === false)) await tasksData.setTaskInAdditional(taskId, ownerId, placement !== "none");
  }
  revalidatePath("/");
  revalidatePath("/boards", "layout");
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
/** Move a boss's count by one (a session quest done or undone). Defeating it may level you up. */
async function bossStep(ownerId: string, bossId: string, delta: 1 | -1) {
  const boss = await bossesData.getBoss(ownerId, bossId);
  if (!boss) return null;
  const updated = await bossesData.setBossProgress(ownerId, bossId, boss.progress + delta, boss.target);
  if (!!updated.defeated_at !== !!boss.defeated_at) {
    // The level cap moved: settle the level the XP has already earned.
    const profile = await profilesData.getProfileById(ownerId);
    if (profile) {
      const level = Math.min(computeLevelForXp(profile.total_xp), await bossesData.levelCap(ownerId));
      if (level !== profile.level) await supabaseAdmin().from("profiles").update({ level }).eq("id", ownerId);
    }
  }
  return updated;
}

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
export async function saveCheckInAction(energy: number | null, metrics: { metric: string; level: number }[] = []) {
  const ownerId = await requireProfileId();
  if (energy === null && !metrics.length) throw new Error("Nothing to check in yet.");
  const entry = energy === null ? null : await energyData.logEnergy(ownerId, energy);
  const extra = metrics.length ? await energyData.logCheckIns(ownerId, metrics) : [];
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
  return { effort: wheel.effort, hindrances: wheel.hindrances, target: wheel.target, today, loggedToday: !!wheel.log[today] };
}

/** Log a night (by default last night, for this morning). Logging again replaces it. */
export async function saveNightAction(input: { bed: string | null; wake: string | null; effort: string[]; hindrances: { name: string; at?: string | null }[]; day?: string | null }) {
  const ownerId = await requireProfileId();
  const { cleanWheel, cleanNight } = await import("@/lib/wheel-of-time");
  const extras = await readExtras(ownerId);
  const wheel = cleanWheel(extras.wheelOfTime);
  const day = input.day && /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : tomorrowData.appDayKey();
  const night = cleanNight({ ...input, at: new Date().toISOString() });
  const log = { ...wheel.log };
  if (night) log[day] = night;
  else delete log[day];
  const { error } = await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, wheelOfTime: { ...wheel, log } } }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save last night: ${error.message}`);
  revalidatePath("/insights");
  return { day, night };
}

/** Change the Right Effort / Hindrance lists or the target bedtime. */
export async function setWheelOfTimeAction(input: { effort?: string[]; hindrances?: string[]; target?: string | null }) {
  const ownerId = await requireProfileId();
  const { cleanWheel } = await import("@/lib/wheel-of-time");
  const extras = await readExtras(ownerId);
  const wheel = cleanWheel(extras.wheelOfTime);
  const next = cleanWheel({ ...wheel, ...(input.effort ? { effort: input.effort } : {}), ...(input.hindrances ? { hindrances: input.hindrances } : {}), ...("target" in input ? { target: input.target } : {}) });
  const { error } = await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, wheelOfTime: next } }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  revalidatePath("/insights");
  return { effort: next.effort, hindrances: next.hindrances, target: next.target };
}

/** The check-in metrics being tracked (beyond Energy), in order. */
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

// ---------------------------------------------------------------------------
// Priority Lab
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Scheduling priority list (beside the calendar)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Forums (Party, Community, Feature ideas)
// ---------------------------------------------------------------------------

export async function createForumThreadAction(scope: forumData.ForumScope, title: string, body: string) {
  const ownerId = await requireProfileId();
  if (!forumData.SCOPES.includes(scope)) throw new Error("Unknown forum.");
  const t = await forumData.createThread(ownerId, scope, title, body);
  revalidatePath("/feed");
  return t.id;
}

export async function replyForumAction(threadId: string, body: string) {
  const ownerId = await requireProfileId();
  await forumData.reply(ownerId, threadId, body);
  revalidatePath(`/feed/forum/${threadId}`);
  revalidatePath("/feed");
}

export async function voteForumAction(threadId: string) {
  const ownerId = await requireProfileId();
  const res = await forumData.toggleVote(ownerId, threadId);
  revalidatePath("/feed");
  return res;
}

export async function deleteForumThreadAction(threadId: string) {
  const ownerId = await requireProfileId();
  await forumData.deleteThread(ownerId, threadId);
  revalidatePath("/feed");
}

export async function deleteForumPostAction(postId: string, threadId: string) {
  const ownerId = await requireProfileId();
  await forumData.deletePost(ownerId, postId);
  revalidatePath(`/feed/forum/${threadId}`);
}

export async function setIdeaStatusAction(threadId: string, status: forumData.IdeaStatus) {
  const ownerId = await requireProfileId();
  await forumData.setIdeaStatus(ownerId, threadId, status);
  revalidatePath(`/feed/forum/${threadId}`);
  revalidatePath("/feed");
}

// ---------------------------------------------------------------------------
// Check-in notes and #tags
// ---------------------------------------------------------------------------

export async function addCheckNoteAction(text: string, atISO?: string | null, allDay = false) {
  const ownerId = await requireProfileId();
  const note = await energyData.addCheckNote(ownerId, text, atISO, allDay);
  revalidatePath("/insights");
  return note;
}

export async function deleteCheckNoteAction(id: string) {
  const ownerId = await requireProfileId();
  await energyData.deleteCheckNote(ownerId, id);
  revalidatePath("/insights");
}

// ---------------------------------------------------------------------------
// Character stats
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sharing with your party
// ---------------------------------------------------------------------------

export async function setShareSettingsAction(patch: Record<string, boolean>) {
  const ownerId = await requireProfileId();
  const next = await sharingData.setShareSettings(ownerId, patch);
  revalidatePath("/friends", "layout");
  return next;
}

export async function setTaskPrivateAction(taskId: string, isPrivate: boolean) {
  const ownerId = await requireProfileId();
  await sharingData.setTaskPrivate(ownerId, taskId, isPrivate);
  revalidatePath("/friends", "layout");
}

export async function setBoardPrivateAction(boardId: string, isPrivate: boolean) {
  const ownerId = await requireProfileId();
  const board = await boardsData.getBoard(boardId, ownerId);
  if (!board) throw new Error("That board isn't here anymore.");
  await boardsData.updateBoard(boardId, ownerId, { title: board.title, description: board.description, color: board.color, isPrivate });
  revalidatePath("/boards", "layout");
  revalidatePath("/friends", "layout");
}

// ---------------------------------------------------------------------------
// Party: support calls, notification levels, shared boards
// ---------------------------------------------------------------------------

export async function callForSupportAction(kind: partyData.SupportKind, message: string) {
  const { id, name } = await requireIdentity();
  if (!["encouragement", "accountability", "help"].includes(kind)) throw new Error("Pick what you need.");
  const threadId = await partyData.callForSupport(id, name, kind, message);
  revalidatePath("/feed");
  return threadId;
}

export async function setNotifyPrefsAction(prefs: { level?: string; email?: boolean }) {
  const ownerId = await requireProfileId();
  await partyData.setNotifyPrefs(ownerId, prefs);
  revalidatePath("/settings");
}

export async function setBoardSharedAction(boardId: string, shared: boolean) {
  const { id, name } = await requireIdentity();
  await partyData.setBoardShared(id, boardId, shared, name);
  revalidatePath("/boards", "layout");
  revalidatePath("/feed");
}

export async function addQuestToSharedBoardAction(boardId: string, title: string) {
  const { id } = await requireIdentity();
  await partyData.addQuestToSharedBoard(id, boardId, title);
  revalidatePath("/feed");
}

export async function takeOnSharedQuestAction(taskId: string) {
  const { id } = await requireIdentity();
  await partyData.takeOnSharedQuest(id, taskId);
  revalidatePath("/");
}

/** The latest few notifications for the bell's preview popup. */
export async function recentNotificationsAction() {
  const ownerId = await requireProfileId();
  const list = await notificationsData.listForProfile(ownerId, 8);
  const now = new Date().toISOString();
  return list
    .filter((n) => !(n.snoozed_until && n.snoozed_until > now))
    .slice(0, 6)
    .map((n) => ({ id: n.id, kind: n.kind, body: n.body, at: n.created_at, read: n.is_read }));
}

/** Unread notifications newer than a moment, newest first (for the little preview toast). */
export async function newNotificationsAction(sinceISO: string) {
  const ownerId = await requireProfileId();
  const list = await notificationsData.listForProfile(ownerId, 10);
  return list
    .filter((n) => !n.is_read && n.created_at > sinceISO && !(n.snoozed_until && n.snoozed_until > new Date().toISOString()))
    .map((n) => ({ id: n.id, kind: n.kind, body: n.body, at: n.created_at, activityId: n.activity_id }));
}

/** A screenshot for a piece of feedback: shrunk to a sensible size and stored; returns its URL. */
export async function uploadFeedbackImageAction(formData: FormData) {
  const ownerId = await requireProfileId();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No image was attached.");
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is too big (8 MB at most).");
  const sharp = (await import("sharp")).default;
  const bytes = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const path = `feedback/${ownerId}/${crypto.randomUUID()}.webp`;
  const db = (await import("@/lib/supabase/server")).supabaseAdmin();
  const { error } = await db.storage.from("ai-images").upload(path, bytes, { contentType: "image/webp", upsert: false });
  if (error) throw new Error(`Couldn't store the image: ${error.message}`);
  return db.storage.from("ai-images").getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Life wheel (Insights): pick the areas of your life, then rate each 1–10.

const WHEEL_PREFIX = "◎ ";

/** Save which areas the life wheel has (in order). */
export async function setLifeWheelTopicsAction(topics: string[]) {
  const ownerId = await requireProfileId();
  const clean = [...new Set(topics.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 20)).filter(Boolean))].slice(0, 12);
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const { error } = await supabaseAdmin().from("profiles").update({ life_wheel: { ...(cur?.life_wheel ?? {}), topics: clean } }).eq("id", ownerId);
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Calendar: editing Google events in place
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auto-scheduler: busy times in, the scheduling list placed into free time out

/**
 * Everything that already takes up time between two moments: Google events
 * (except calendars switched off on the calendar screen, and all-day ones)
 * and quests already on the calendar. Plus the saved scheduler settings.
 */
export async function schedulerContextAction(fromISO: string, toISO: string, hiddenCalendars: string[] = []) {
  const { profileId, accessToken } = await requireSessionMaybeGoogle();
  const from = new Date(fromISO);
  const to = new Date(toISO);
  const hidden = new Set(hiddenCalendars);
  const busy: { start: number; end: number; cal?: string }[] = [];
  let calendars: { id: string; name: string; color: string | null; writable: boolean; primary: boolean }[] = [];
  const [quests, profileRes] = await Promise.all([
    tasksData.listCalendarTasksForOwner(profileId, from, to).catch(() => []),
    supabaseAdmin().from("profiles").select("scheduler").eq("id", profileId).maybeSingle<{ scheduler: Record<string, unknown> | null }>(),
  ]);
  for (const t of quests) {
    if (t.status !== "open" || !t.scheduled_start || !t.scheduled_end) continue;
    busy.push({ start: new Date(t.scheduled_start).getTime(), end: new Date(t.scheduled_end).getTime() });
  }
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
        busy.push({ start: new Date(e.start).getTime(), end: new Date(e.end).getTime(), cal: e.calendarId });
      }
    } catch {
      /* planning still works from the app's own calendar */
    }
  }
  return { busy, google, calendars, settings: profileRes.error ? null : (profileRes.data?.scheduler ?? null) };
}

/** Remember the scheduler's settings and time-of-day choices (on every device). */
export async function saveSchedulerSettingsAction(settings: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const clean = JSON.parse(JSON.stringify(settings ?? {}));
  const { error } = await supabaseAdmin().from("profiles").update({ scheduler: clean }).eq("id", ownerId);
  if (error) throw new Error(/scheduler/.test(error.message) ? "Saved on this device (your account needs a quick database update to keep it everywhere)." : `Couldn't save: ${error.message}`);
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

// ---------------------------------------------------------------------------
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
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const { error } = await supabaseAdmin().from("profiles").update({ life_wheel: { ...(cur?.life_wheel ?? {}), streaks: clean } }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/insights");
  return clean;
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

// ---------------------------------------------------------------------------
// Inventory: the backpack (kept with your other personal extras)

export async function saveInventoryAction(inventory: unknown) {
  const ownerId = await requireProfileId();
  const { normalizeInventory } = await import("@/lib/inventory");
  const clean = normalizeInventory(inventory);
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const { error } = await supabaseAdmin().from("profiles").update({ life_wheel: { ...(cur?.life_wheel ?? {}), inventory: clean } }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  revalidatePath("/settings");
  return clean;
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
export async function updateCheckNoteAction(id: string, text: string) {
  const ownerId = await requireProfileId();
  const note = await energyData.updateCheckNote(ownerId, id, text);
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
  const { data: cur } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...(cur?.life_wheel ?? {}), weather: { lat, lon, name: place.name?.slice(0, 60) ?? null } } }).eq("id", ownerId);
}

// ---------------------------------------------------------------------------
// Quest templates (kept with your other personal extras)

async function readExtras(ownerId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  return data?.life_wheel ?? {};
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
  const { error } = await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, templates: next } }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save the template: ${error.message}`);
  return next;
}

export async function deleteQuestTemplateAction(id: string) {
  const ownerId = await requireProfileId();
  const { normalizeTemplates } = await import("@/lib/quest-templates");
  const extras = await readExtras(ownerId);
  const next = normalizeTemplates(extras.templates).filter((t) => t.id !== id);
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, templates: next } }).eq("id", ownerId);
  return next;
}

/** A quest map's look and how far ahead it shows (per board). */
// ---------------------------------------------------------------------------
// The toucan as a guide: it watches for important quests slipping, and talks.

async function guideTasks(ownerId: string, opts: { imports?: boolean } = {}) {
  const db = supabaseAdmin();
  const [tasks, boards, imports] = await Promise.all([
    tasksData.listOpenTasksWithBoardForOwner(ownerId),
    db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId),
    // Imported quests (a syllabus, say) still waiting to be sorted are real work too.
    opts.imports ? db.from("tasks").select("*").eq("owner_id", ownerId).eq("status", "open").eq("needs_review", true) : Promise.resolve({ data: [] as Task[] }),
  ]);
  const names = new Map(((boards.data ?? []) as { id: string; title: string }[]).map((b) => [b.id, b.title]));
  const seen = new Set<string>();
  const all = [...tasks, ...(((imports as { data: Task[] | null }).data ?? []) as Task[])].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  return all
    .filter((t) => opts.imports || !t.needs_review)
    .map((t) => ({
      id: t.id,
      title: t.title,
      importance: t.importance ?? null,
      urgency: t.urgency ?? null,
      due_at: t.due_at ?? null,
      estimate_minutes: t.estimate_minutes ?? null,
      scheduled_start: t.is_on_calendar ? (t.scheduled_start ?? null) : null,
      updated_at: t.updated_at ?? null,
      created_at: t.created_at ?? null,
      reschedule_count: t.reschedule_count ?? 0,
      board: t.board_id ? (names.get(t.board_id) ?? null) : null,
      board_id: t.board_id ?? null,
      needs_review: !!t.needs_review,
    }));
}

/** What the toucan keeps an eye on: your open quests (scored in the browser, in your time zone) and what you've waved off. */
export async function toucanWatchAction() {
  const { profileId: ownerId, accessToken } = await requireSessionMaybeGoogle();
  const [tasks, extras] = await Promise.all([guideTasks(ownerId), readExtras(ownerId)]);
  const { cleanCoach, duePromises, readyReminders } = await import("@/lib/coach");
  const coach = cleanCoach(extras.coach);
  // "Next time" reminders look at your calendar from a little while ago to tomorrow morning.
  let events: { title: string; start: string; end: string }[] = [];
  if (accessToken && coach.promises.some((p) => p.status === "open" && p.next)) {
    try {
      const { listEventsAllCalendars } = await import("@/lib/google-calendar");
      const now = Date.now();
      const all = await listEventsAllCalendars(accessToken, new Date(now - 3 * 3_600_000), new Date(now + 20 * 3_600_000));
      events = all.events.filter((e) => Date.parse(e.end) > now).map((e) => ({ title: e.title, start: e.start, end: e.end }));
    } catch {
      /* no calendar right now: the reminder waits */
    }
  }
  const { nextNear, standing } = readyReminders(coach.promises, events);
  return { tasks, snoozed: ((extras.toucanSnooze as Record<string, string> | undefined) ?? {}), promises: coach.promises.filter((p) => p.status === "open"), due: duePromises(coach), nextNear, standing };
}

/** "Not now": the toucan won't raise this quest again for a while. */
export async function snoozeToucanAction(taskId: string, days = 1) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const now = Date.now();
  const kept = Object.fromEntries(Object.entries((extras.toucanSnooze as Record<string, string> | undefined) ?? {}).filter(([, until]) => Date.parse(until) > now));
  kept[taskId.slice(0, 40)] = new Date(now + Math.max(0.01, Math.min(30, days)) * 86_400_000).toISOString();
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, toucanSnooze: kept } }).eq("id", ownerId);
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
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, coach } }).eq("id", ownerId);
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
  const [{ extras, coach }, tasks, profile, wins, checks, boardsRes, aspRes] = await Promise.all([
    readCoach(ownerId),
    guideTasks(ownerId, { imports: true }),
    profilesData.getProfileById(ownerId),
    winsData.listWinsSince(ownerId, new Date(now.getTime() - 3 * 86_400_000).toISOString()).catch(() => []),
    energyData.latestCheckIns(ownerId, new Date(now.getTime() - 36 * 3_600_000).toISOString()).catch(() => ({})),
    db.from("boards").select("id, title, parent_board_id").eq("owner_id", ownerId),
    db.from("tasks").select("title").eq("owner_id", ownerId).eq("status", "open").eq("is_aspiration", true).limit(12),
  ]);
  const { contextLines } = await import("@/lib/toucan-guide");
  const { coachSystemPrompt, parseReply } = await import("@/lib/coach");
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
    lite,
  });
  // The light guide keeps no memory: it sees only this conversation.
  const past = lite ? liteHistory.slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1200) })) : coach.history.slice(-12);
  const history = [...past, { role: "user" as const, content: text }];
  const messages = [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.content }))];
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
  const { text: reply, actions } = parseReply(raw, tasks);
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
export async function coachNewQuestAction(title: string, minutes: number | null) {
  const ownerId = await requireProfileId();
  const t = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) throw new Error("Give it a name.");
  const task = await tasksData.createTask(ownerId, { title: t, importance: 3, urgency: 3, xpValue: 15, estimateMinutes: minutes ?? null });
  revalidatePath("/");
  return task.id;
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
  const extras = await readExtras(ownerId);
  await db.from("profiles").update({ life_wheel: { ...extras, catchUp: { boards: boardIds.slice(0, 20), at: new Date().toISOString() } } }).eq("id", ownerId);
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
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, toucanPrefs: next } }).eq("id", ownerId);
}

export async function toucanPrefsAction() {
  const ownerId = await requireProfileId();
  const p = ((await readExtras(ownerId)).toucanPrefs as { mode?: "simple" | "lite" | "full"; retired?: string[] } | undefined) ?? {};
  return { mode: p.mode ?? "full", retired: p.retired ?? [] };
}

/** The colour theme for the Adventure look (forest, moonlit, ember…). */
export async function savePaletteAction(palette: string) {
  const ownerId = await requireProfileId();
  const { isPalette } = await import("@/lib/palettes");
  if (!isPalette(palette)) throw new Error("That isn't one of the colour themes.");
  const extras = await readExtras(ownerId);
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, palette } }).eq("id", ownerId);
  revalidatePath("/", "layout");
}

export async function saveMapPrefsAction(boardId: string, prefs: Record<string, unknown>) {
  const ownerId = await requireProfileId();
  const extras = await readExtras(ownerId);
  const all = { ...((extras.mapPrefs as Record<string, unknown>) ?? {}), [boardId.slice(0, 40)]: JSON.parse(JSON.stringify(prefs ?? {})) };
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, mapPrefs: all } }).eq("id", ownerId);
}

/* ── Quest sequences ─────────────────────────────────────────────────── */

/** The sequence a quest belongs to, front to back. */
export async function sequenceOfAction(taskId: string) {
  const ownerId = await requireProfileId();
  const { sequenceOf } = await import("@/lib/data/sequences");
  return sequenceOf(ownerId, taskId);
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
  else await seq.placeBefore(ownerId, id, anchorId);
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
export async function setRiteStepsAction(riteId: string, steps: { id: string; title: string }[]) {
  const ownerId = await requireProfileId();
  const clean = ritesData.cleanRiteSteps(steps);
  await ritesData.setRiteSteps(ownerId, riteId, clean);
  revalidatePath("/");
  return clean;
}

/**
 * Tick (or untick) one sub-habit for `day`. Ticking the last one completes the
 * habit (XP and all); unticking one of a completed habit undoes that.
 */
export async function tickRiteStepAction(riteId: string, stepId: string, day: string, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) throw new Error("That habit isn't here anymore.");
  await ritesData.setRiteStepCheck(ownerId, riteId, stepId, day, on);
  const steps = ritesData.cleanRiteSteps(rite.steps);
  const checks = ((await ritesData.listRiteStepChecks(ownerId, day)) ?? []).filter((c) => c.rite_id === riteId && c.day === day);
  const ticked = new Set(checks.map((c) => c.step_id));
  const all = steps.length > 0 && steps.every((st) => ticked.has(st.id));
  const { data: doneRow } = await supabaseAdmin().from("rite_completions").select("id").eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day).maybeSingle();
  let completed: { xp: number; coinsEarned: number } | null = null;
  if (all && !doneRow) completed = await completeRiteAction(riteId, day);
  else if (!all && doneRow) await uncompleteRiteAction(riteId, day);
  revalidatePath("/");
  return { done: all, xp: completed?.xp ?? 0 };
}

/** Check (or clear) every sub-habit at once, with the habit itself. */
export async function tickAllRiteStepsAction(riteId: string, day: string, on: boolean) {
  const ownerId = await requireProfileId();
  assertDay(day);
  const rite = await ritesData.getRite(riteId, ownerId);
  if (!rite) return;
  for (const st of ritesData.cleanRiteSteps(rite.steps)) await ritesData.setRiteStepCheck(ownerId, riteId, st.id, day, on).catch(() => {});
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
  await supabaseAdmin().from("profiles").update({ life_wheel: { ...extras, bossPlans: plans } }).eq("id", ownerId);
}
