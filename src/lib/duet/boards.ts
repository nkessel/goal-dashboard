import "server-only";
import { revalidatePath } from "next/cache";
import * as boardsData from "@/lib/data/boards";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DuetError, anchorOf, moveAround } from "./pure";
import { loadBoards, pick } from "./load";
import type { Args, Out } from "./types";

export async function addBoard(ownerId: string, a: Args): Promise<Out> {
  const title = typeof a.title === "string" ? a.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!title) throw new DuetError("Give the board a name.");
  const bl = await loadBoards(ownerId);
  const parent = a.parent === undefined || a.parent === null || a.parent === "" ? null : pick(bl.boards, a.parent, "parent board", (x) => bl.label(x.parent_board_id));
  const b = await boardsData.createBoard(ownerId, { title, parentBoardId: parent?.id ?? null });
  revalidatePath("/boards", "layout");
  return { summary: `Added board "${title}"${parent ? ` inside ${bl.label(parent.id)}` : ""}.`, data: { board: { id: b.id, title } }, change: { kind: "board", id: b.id, before: null, after: { id: b.id, title } } };
}

export async function editBoard(ownerId: string, a: Args): Promise<Out> {
  const bl = await loadBoards(ownerId);
  const b = pick(bl.boards, a.board, "board", (x) => bl.label(x.parent_board_id));
  const before = { title: b.title, parent_board_id: b.parent_board_id, sort_order: b.sort_order };
  const changed: string[] = [];
  if (a.title !== undefined) {
    const t = typeof a.title === "string" ? a.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!t) throw new DuetError("A board's title can't be empty.");
    // The app's own edit sets description and color from what the dialog holds: keep what's there.
    await boardsData.updateBoard(b.id, ownerId, { title: t, description: b.description, color: b.color });
    changed.push("title");
  }
  if (a.parent !== undefined) {
    const parent = a.parent === null || a.parent === "" ? null : pick(bl.boards.filter((x) => x.id !== b.id), a.parent, "parent board", (x) => bl.label(x.parent_board_id));
    await boardsData.setBoardParent(b.id, ownerId, parent?.id ?? null);
    changed.push("parent");
  }
  if (!changed.length) throw new DuetError("Nothing to change: give title and/or parent (null puts it at the top level).");
  revalidatePath("/boards", "layout");
  const now = (await loadBoards(ownerId)).boards.find((x) => x.id === b.id)!;
  return { summary: `Updated board "${b.title}": ${changed.join(", ")}.`, change: { kind: "board", id: b.id, before, after: { title: now.title, parent_board_id: now.parent_board_id, sort_order: now.sort_order } } };
}

export async function moveBoard(ownerId: string, a: Args): Promise<Out> {
  const bl = await loadBoards(ownerId);
  const b = pick(bl.boards, a.board, "board", (x) => bl.label(x.parent_board_id));
  const sibs = bl.boards.filter((x) => (x.parent_board_id ?? null) === (b.parent_board_id ?? null));
  const { ref, where } = anchorOf(a);
  const other = pick(sibs.filter((x) => x.id !== b.id), ref, "board next to it", (x) => bl.label(x.parent_board_id));
  const order = moveAround(sibs.map((x) => x.id), b.id, other.id, where);
  await boardsData.updateBoardOrder(ownerId, order);
  revalidatePath("/boards");
  if (b.parent_board_id) revalidatePath(`/boards/${b.parent_board_id}`);
  return { summary: `Moved board "${b.title}" ${where} "${other.title}".`, change: { kind: "boards", id: b.id, before: { order: sibs.map((x) => ({ id: x.id, sort_order: x.sort_order })), parent_board_id: b.parent_board_id }, after: { order } } };
}

/** For undo of add_board: only an empty board (no quests, sub-boards, goals or stand-ins) is removed. */
export async function removeEmptyBoard(ownerId: string, id: string): Promise<string | null> {
  const db = supabaseAdmin();
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new DuetError(`Couldn't check the board: ${r.error.message}`);
    return r.count ?? 0;
  };
  const used =
    (await count(db.from("tasks").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("board_id", id))) +
    (await count(db.from("tasks").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("stands_for", id))) +
    (await count(db.from("boards").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("parent_board_id", id))) +
    (await count(db.from("goals").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("board_id", id)));
  if (used > 0) return "That board isn't empty any more (it holds quests, goals or sub-boards), so it was left alone. Move or remove those first.";
  const { error } = await db.from("boards").delete().eq("id", id).eq("owner_id", ownerId);
  if (error) throw new DuetError(`Couldn't remove the board: ${error.message}`);
  revalidatePath("/boards", "layout");
  return null;
}
