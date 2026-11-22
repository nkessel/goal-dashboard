import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as boardsData from "@/lib/data/boards";
import { archivedOf, readExtrasOf } from "@/lib/data/quest-ops";
import type { Task, Board } from "@/lib/data/types";
import { DuetError, resolveRef, type Candidate } from "./pure";

export type Row = Task & { sort_order?: number | null; in_additional?: boolean | null; is_tiny?: boolean | null; is_aspiration?: boolean | null };
export type HabitRow = {
  id: string; owner_id: string; title: string; description: string | null; is_core: boolean; xp_value: number; slot?: string | null;
  days?: number[] | null; due_time?: string | null; window_to?: string | null; kind?: string | null; coin_value?: number | null;
  estimate_minutes?: number | null; repeat?: unknown; sort_order: number; archived: boolean; created_at: string;
};

export type BoardLabels = { boards: Board[]; label: (id: string | null | undefined) => string | null };

/** Boards with "Parent › Child" labels, as the app's own board picker writes them. */
export async function loadBoards(ownerId: string): Promise<BoardLabels> {
  const boards = await boardsData.listBoardsForOwner(ownerId);
  const byId = new Map(boards.map((b) => [b.id, b]));
  const label = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const seen = new Set<string>();
    const walk = (x: string): string => {
      const b = byId.get(x);
      if (!b || seen.has(x)) return "";
      seen.add(x);
      return b.parent_board_id && byId.has(b.parent_board_id) ? `${walk(b.parent_board_id)} › ${b.title}` : b.title;
    };
    return walk(id) || null;
  };
  return { boards, label };
}

export async function openQuests(ownerId: string): Promise<Row[]> {
  const { data, error } = await supabaseAdmin().from("tasks").select("*").eq("owner_id", ownerId).eq("status", "open").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) throw new DuetError(`Couldn't read quests: ${error.message}`);
  return (data ?? []) as Row[];
}

/** Finished quests, newest first (for reopening). A failed one counts: reopening it is allowed. */
export async function completedQuests(ownerId: string, limit = 400): Promise<Row[]> {
  const { data, error } = await supabaseAdmin().from("tasks").select("*").eq("owner_id", ownerId).eq("status", "completed").order("completed_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) throw new DuetError(`Couldn't read quests: ${error.message}`);
  return (data ?? []) as Row[];
}

export async function questById(ownerId: string, id: string): Promise<Row | null> {
  const { data } = await supabaseAdmin().from("tasks").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function habits(ownerId: string, archived = false): Promise<HabitRow[]> {
  const { data, error } = await supabaseAdmin().from("rites").select("*").eq("owner_id", ownerId).eq("archived", archived).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw new DuetError(`Couldn't read habits: ${error.message}`);
  // The app's own special evening rites (wins, tomorrow, plan) aren't habits to edit from here.
  return ((data ?? []) as HabitRow[]).filter((r) => !r.kind);
}

export const slotOf = (h: { slot?: string | null }): "day" | "evening" => (h.slot === "day" ? "day" : "evening");

export async function archivedQuestList(ownerId: string) {
  return archivedOf(await readExtrasOf(ownerId)).map((a) => ({ id: a.task.id as string, title: String(a.task.title ?? "A quest"), board_id: (a.task.board_id as string | null) ?? null, at: a.at }));
}

/** Resolve a quest reference among a pool, turning a miss into a DuetError that carries the candidates. */
export function pick<T extends { id: string; title: string }>(pool: T[], ref: unknown, what: string, boardOf?: (i: T) => string | null): T {
  const r = resolveRef(pool, ref, what, boardOf ? (i): Candidate => ({ id: i.id, title: i.title, board: boardOf(i) }) : undefined);
  if (!r.ok) throw new DuetError(r.error, r.candidates);
  return r.item;
}
