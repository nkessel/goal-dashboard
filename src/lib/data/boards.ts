import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Board, Task } from "./types";

export async function listBoardsForOwner(ownerId: string): Promise<Board[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("boards")
    .select("*")
    .eq("owner_id", ownerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list boards: ${error.message}`);
  return data ?? [];
}

/**
 * Walks parent_board_id up from `boardId` to the root, for a breadcrumb —
 * root-first so callers can render it left-to-right as "Root / ... / Parent"
 * (the board itself is not included; append it separately).
 */
export async function getBoardAncestors(
  boardId: string,
  ownerId: string
): Promise<{ id: string; title: string }[]> {
  const db = supabaseAdmin();
  const chain: { id: string; title: string }[] = [];
  // Start from boardId's own parent_board_id — the board itself isn't part
  // of its own ancestry.
  const { data: start, error: startError } = await db
    .from("boards")
    .select("parent_board_id")
    .eq("id", boardId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (startError) throw new Error(`Failed to load board ancestry: ${startError.message}`);

  let currentId: string | null = start?.parent_board_id ?? null;
  // A cycle can't be created through the UI (see migration 0007's comment),
  // but this cap keeps a bad row from ever looping the request forever.
  for (let i = 0; i < 20 && currentId; i++) {
    const { data, error } = await db
      .from("boards")
      .select("id, title, parent_board_id")
      .eq("id", currentId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load board ancestry: ${error.message}`);
    if (!data) break;
    chain.unshift({ id: data.id, title: data.title });
    currentId = data.parent_board_id;
  }
  return chain;
}

export type BoardWithStats = Board & {
  questTotal: number;
  questDone: number;
  xpEarned: number;
  lastUpdatedAt: string;
  isComplete: boolean;
  /** Open quests on the board, in their saved order — for the card's previews. */
  openQuests: Task[];
  /** How many quest boards sit directly inside this one. */
  subBoardCount: number;
  /** Aspirations kept on the board (not counted as quests). */
  aspirationCount: number;
};

/**
 * Boards annotated with quest (task) counts, earned XP, and a
 * last-updated timestamp — the numbers the Quest Boards / Goal Boards
 * grid card needs (progress bar, "12/18 quests", XP total, "Updated Xh
 * ago"). Aggregated in JS from tasks rather than a SQL view, since
 * the dataset per owner is small.
 */
export async function listBoardsWithStatsForOwner(
  ownerId: string,
  /**
   * `null` (default) lists top-level boards only; pass a board id to list
   * that board's direct sub-boards instead. Keeps the top-level Boards page
   * and a board's own sub-boards grid from ever showing each other's rows.
   */
  parentBoardId: string | null = null
): Promise<BoardWithStats[]> {
  const db = supabaseAdmin();
  const [boardsRes, childrenRes, tasksRes] = await Promise.all([
    (() => {
      let q = db.from("boards").select("*").eq("owner_id", ownerId);
      q = parentBoardId === null ? q.is("parent_board_id", null) : q.eq("parent_board_id", parentBoardId);
      return q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    })(),
    db.from("boards").select("parent_board_id").eq("owner_id", ownerId).not("parent_board_id", "is", null),
    db
      .from("tasks")
      .select("*")
      .eq("owner_id", ownerId)
      .not("board_id", "is", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  if (boardsRes.error) throw new Error(`Failed to list boards: ${boardsRes.error.message}`);
  if (childrenRes.error) throw new Error(`Failed to list sub-boards: ${childrenRes.error.message}`);
  if (tasksRes.error) throw new Error(`Failed to list tasks: ${tasksRes.error.message}`);

  const subBoards = new Map<string, number>();
  for (const c of childrenRes.data ?? []) {
    const id = c.parent_board_id as string;
    subBoards.set(id, (subBoards.get(id) ?? 0) + 1);
  }

  const lastUpdated = new Map<string, string>();
  const stats = new Map<string, { total: number; done: number; xp: number; open: Task[]; dreams: number }>();
  for (const t of (tasksRes.data ?? []) as Task[]) {
    const boardId = t.board_id;
    if (!boardId) continue;
    const s = stats.get(boardId) ?? { total: 0, done: 0, xp: 0, open: [], dreams: 0 };
    if (t.is_aspiration && t.status === "open") {
      s.dreams += 1;
      stats.set(boardId, s);
      continue;
    }
    s.total += 1;
    if (t.status === "completed") {
      s.done += 1;
      s.xp += t.xp_value ?? 0;
    } else if (t.status === "open") {
      s.open.push(t);
    }
    stats.set(boardId, s);
    const current = lastUpdated.get(boardId);
    if (!current || new Date(t.updated_at) > new Date(current)) lastUpdated.set(boardId, t.updated_at);
  }

  return (boardsRes.data ?? []).map((board) => {
    const s = stats.get(board.id) ?? { total: 0, done: 0, xp: 0, open: [], dreams: 0 };
    return {
      ...board,
      questTotal: s.total,
      questDone: s.done,
      xpEarned: s.xp,
      lastUpdatedAt: lastUpdated.get(board.id) ?? board.updated_at,
      isComplete: s.total > 0 && s.done === s.total,
      openQuests: s.open,
      subBoardCount: subBoards.get(board.id) ?? 0,
      aspirationCount: s.dreams,
    };
  });
}

export async function getBoard(
  boardId: string,
  ownerId: string
): Promise<Board | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load board: ${error.message}`);
  return data;
}

/** Edits a board's own fields — used by the board-edit dialog. */
export async function updateBoard(
  boardId: string,
  ownerId: string,
  input: { title: string; description?: string | null; color?: string | null; isPrivate?: boolean }
): Promise<Board> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("boards")
    .update({
      title: input.title,
      description: input.description ?? null,
      color: input.color ?? null,
      ...(input.isPrivate !== undefined ? { is_private: input.isPrivate } : {}),
    })
    .eq("id", boardId)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update board: ${error.message}`);
  return data;
}

/**
 * Persists a new drag-and-drop order for the owner's boards: `orderedIds`
 * is the full list of board ids in their new display order, and each gets
 * its `sort_order` set to its index. Scoped by owner_id as a safety check
 * so one owner can never reorder (or overwrite) another owner's boards.
 */
export async function updateBoardOrder(ownerId: string, orderedIds: string[]): Promise<void> {
  const db = supabaseAdmin();
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("boards").update({ sort_order: index }).eq("id", id).eq("owner_id", ownerId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Failed to reorder boards: ${failed.error.message}`);
}

export async function createBoard(
  ownerId: string,
  input: {
    title: string;
    description?: string;
    color?: string;
    isPrivate?: boolean;
    /** Omit/undefined for a top-level board; pass a board id to create it as a sub-board. */
    parentBoardId?: string | null;
  }
): Promise<Board> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("boards")
    .insert({
      owner_id: ownerId,
      title: input.title,
      description: input.description || null,
      color: input.color || null,
      is_private: input.isPrivate ?? false,
      parent_board_id: input.parentBoardId || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create board: ${error.message}`);
  return data;
}
