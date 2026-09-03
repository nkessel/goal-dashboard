import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Board } from "./types";

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

export async function createBoard(
  ownerId: string,
  input: { title: string; description?: string; color?: string; isPrivate?: boolean }
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
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create board: ${error.message}`);
  return data;
}
