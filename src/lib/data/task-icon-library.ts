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

export async function removeTaskIconFromLibrary(id: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("task_icon_library").delete().eq("id", id);
  if (error) throw new Error(`Failed to remove icon from library: ${error.message}`);
}

/** Built-in quest icons that live in /public/design rather than the table. */
const STATIC_QUEST_ICONS = [
  { url: "/design/icon-reading-book.svg", prompt: "Reading — an open book glowing with light" },
  { url: "/design/icon-course-laptop.svg", prompt: "Course work — a laptop with a beating heart" },
];

const categoryOf = (url: string): "quest" | "reward" =>
  /\/rewards\//.test(url) ? "reward" : "quest";

/**
 * Everything the portrait picker can offer: the shared library, every
 * portrait this person's quests and rewards already use (some were set
 * directly and never added), the built-in icons, and character avatars —
 * each tagged with its shelf (quest / reward / character).
 */
export async function listAllPortraits(ownerId: string): Promise<TaskIconLibraryEntry[]> {
  const db = supabaseAdmin();
  const [lib, tasks, rewards, avatars] = await Promise.all([
    listTaskIconLibrary().catch(() => [] as TaskIconLibraryEntry[]),
    db.from("tasks").select("icon_key, title, created_at").eq("owner_id", ownerId).in("icon_source", ["ai", "library"]).not("icon_key", "is", null),
    db.from("rewards").select("icon_key, title, created_at").eq("owner_id", ownerId).not("icon_key", "is", null),
    db.from("avatar_library").select("*").order("created_at", { ascending: false }),
  ]);
  const out: TaskIconLibraryEntry[] = [];
  const seen = new Set<string>();
  const push = (e: TaskIconLibraryEntry) => {
    if (!e.image_url || seen.has(e.image_url)) return;
    seen.add(e.image_url);
    out.push(e);
  };
  for (const e of lib) push({ ...e, category: categoryOf(e.image_url) });
  for (const r of rewards.data ?? []) push({ id: `reward:${r.icon_key}`, image_url: r.icon_key as string, prompt: r.title as string, created_by: ownerId, is_preset: false, created_at: r.created_at as string, category: "reward" });
  for (const t of tasks.data ?? []) push({ id: `used:${t.icon_key}`, image_url: t.icon_key as string, prompt: t.title as string, created_by: ownerId, is_preset: false, created_at: t.created_at as string, category: categoryOf(t.icon_key as string) });
  for (const st of STATIC_QUEST_ICONS) push({ id: `static:${st.url}`, image_url: st.url, prompt: st.prompt, created_by: null, is_preset: true, created_at: "2026-01-01T00:00:00Z", category: "quest" });
  for (const a of (avatars.data ?? []) as TaskIconLibraryEntry[]) push({ ...a, id: `avatar:${a.id}`, category: "character" });
  return out;
}
