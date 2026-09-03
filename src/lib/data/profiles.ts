import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Profile } from "./types";

export async function getProfileById(id: string): Promise<Profile | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load profile: ${error.message}`);
  return data;
}

/** Batch fetch, keyed by id — handy for stamping feed/comment authors. */
export async function getProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  if (ids.length === 0) return new Map();
  const db = supabaseAdmin();
  const { data, error } = await db.from("profiles").select("*").in("id", [...new Set(ids)]);

  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  return new Map((data ?? []).map((p) => [p.id, p as Profile]));
}

/**
 * The "all registered users" directory (v1 friend discovery per spec).
 * Excludes the current user. Fine at small scale; a real search/pagination
 * layer would replace this if the user base grows.
 */
export async function listDirectory(excludingId: string): Promise<Profile[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .neq("id", excludingId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to list directory: ${error.message}`);
  return data ?? [];
}

export async function updateProfileTheme(
  id: string,
  theme: "calm" | "adventure"
): Promise<Profile> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("profiles")
    .update({ theme })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update theme: ${error.message}`);
  return data;
}
