import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AvatarLibraryEntry } from "./types";

export async function listAvatarLibrary(): Promise<AvatarLibraryEntry[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("avatar_library")
    .select("*")
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
