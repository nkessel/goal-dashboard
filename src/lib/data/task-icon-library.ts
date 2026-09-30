import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { TaskIconLibraryEntry } from "./types";

/**
 * The whole shared quest-icon library — presets first (seeded in migration
 * 0010), then everyone's generated task icons, newest first. Mirrors
 * avatar-library.ts exactly, just scoped to a separate table since task
 * icons use their own prompt style (buildTaskIconPrompt) distinct from
 * avatar portraits. No pagination yet; fine at the scale a friend-group app
 * runs at.
 */
export async function listTaskIconLibrary(): Promise<TaskIconLibraryEntry[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("task_icon_library")
    .select("*")
    .order("is_preset", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list task icon library: ${error.message}`);
  return data ?? [];
}

/**
 * Adds a freshly-generated task icon to the shared library, prompt included
 * as searchable metadata, so anyone can find and re-pick it later instead of
 * spending a fresh generation on the same idea. Safe to call more than once
 * for the same image_url (unique index + upsert-ignore).
 */
export async function addTaskIconToLibrary(input: {
  imageUrl: string;
  createdBy: string;
  prompt?: string;
}): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("task_icon_library")
    .upsert(
      { image_url: input.imageUrl, created_by: input.createdBy, prompt: input.prompt ?? null, is_preset: false },
      { onConflict: "image_url", ignoreDuplicates: true }
    );
  if (error) throw new Error(`Failed to add task icon to library: ${error.message}`);
}
