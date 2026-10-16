import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AvatarLibraryEntry } from "./types";

/** The built-in portraits plus this person's own generated ones (no one else's). */
export async function listAvatarLibrary(ownerId: string): Promise<AvatarLibraryEntry[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("avatar_library")
    .select("*")
    .or(`is_preset.eq.true,created_by.eq.${ownerId}`)
    .order("is_preset", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list avatar library: ${error.message}`);
  return data ?? [];
}

export async function addAvatarToLibrary(input: {
  imageUrl: string;
  createdBy: string;
  prompt?: string;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("avatar_library")
    .upsert(
      { image_url: input.imageUrl, created_by: input.createdBy, prompt: input.prompt ?? null, is_preset: false },
      { onConflict: "image_url", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to add avatar to library: ${error.message}`);
}

export async function removeAvatarFromLibrary(id: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("avatar_library").delete().eq("id", id).eq("created_by", ownerId);
  if (error) throw new Error(`Failed to remove avatar from library: ${error.message}`);
}
