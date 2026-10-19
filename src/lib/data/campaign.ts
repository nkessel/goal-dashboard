import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

type Row = Pick<Task, "id" | "title" | "status" | "completed_at" | "icon_key" | "icon_source" | "xp_value" | "created_at" | "due_at" | "board_id" | "is_aspiration"> & { sort_order?: number | null; needs_review?: boolean; is_private?: boolean };
export type CampaignStop = Row & { region: string };

/**
 * Every quest in a campaign (a board and all the boards inside it), as stops
 * along one road: what's done first, in the order it was done, then what's
 * left — the board's chosen next step leading.
 */
export async function loadCampaign(boardId: string, ownerId: string) {
  const db = supabaseAdmin();
  const { data: boards } = await db.from("boards").select("id, title, parent_board_id, next_task_id").eq("owner_id", ownerId);
  const all = (boards ?? []) as { id: string; title: string; parent_board_id: string | null; next_task_id: string | null }[];
  const root = all.find((b) => b.id === boardId);
  if (!root) return null;
  const inside = new Set([boardId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const b of all) if (b.parent_board_id && inside.has(b.parent_board_id) && !inside.has(b.id)) (inside.add(b.id), (grew = true));
  }
  const names = new Map(all.map((b) => [b.id, b.title]));
  const { data } = await db
    .from("tasks")
    .select("id, title, status, completed_at, icon_key, icon_source, xp_value, sort_order, created_at, due_at, board_id, is_aspiration, is_private, needs_review")
    .eq("owner_id", ownerId)
    .in("board_id", [...inside])
    .is("mission_id", null);
  const rows = ((data ?? []) as unknown as Row[]).filter((t) => !t.needs_review && !t.is_aspiration);
  const withRegion = rows.map((t) => ({ ...t, region: t.board_id && t.board_id !== boardId ? (names.get(t.board_id) ?? "") : "" }));
  const done = withRegion.filter((t) => t.status === "completed").sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  const nextIds = new Set(all.filter((b) => inside.has(b.id) && b.next_task_id).map((b) => b.next_task_id!));
  const open = withRegion
    .filter((t) => t.status !== "completed")
    .sort(
      (a, b) =>
        Number(nextIds.has(b.id)) - Number(nextIds.has(a.id)) ||
        (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
    );
  return { board: { id: root.id, title: root.title }, stops: [...done, ...open] as CampaignStop[] };
}
