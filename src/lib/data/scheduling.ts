import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Task } from "./types";

/** Where a quest joins the scheduling list. */
export type SchedulePlace = "top" | "unordered" | "bottom";

/** The numbered slots at the head of the list; the rest are unnumbered. */
export const NUMBERED = 3;

/** Open quests waiting to be scheduled, in order (empty before migration 0041). */
export async function listSchedulingList(ownerId: string): Promise<Task[]> {
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .not("schedule_rank", "is", null)
    .order("schedule_rank", { ascending: true });
  if (error) return [];
  return (data ?? []) as Task[];
}

/** Save the whole order. Anything left out comes off the list. */
export async function setSchedulingOrder(ownerId: string, ids: string[]): Promise<void> {
  const db = supabaseAdmin();
  const current = await listSchedulingList(ownerId);
  const drop = current.map((t) => t.id).filter((id) => !ids.includes(id));
  if (drop.length) await db.from("tasks").update({ schedule_rank: null }).eq("owner_id", ownerId).in("id", drop);
  const results = await Promise.all(ids.map((id, i) => db.from("tasks").update({ schedule_rank: i }).eq("owner_id", ownerId).eq("id", id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(/schedule_rank/.test(failed.error.message) ? "The scheduling list needs a quick database update first." : `Couldn't save the list: ${failed.error.message}`);
}

/**
 * Put a quest on the list, outside any folder: at the very top, at the top of
 * the unnumbered part, or at the bottom.
 */
export async function addToSchedulingList(ownerId: string, taskId: string, place: SchedulePlace): Promise<void> {
  const all = (await listSchedulingList(ownerId)).filter((t) => t.id !== taskId);
  const loose = all.filter((t) => !t.schedule_folder).map((t) => t.id);
  const filed = all.filter((t) => t.schedule_folder).map((t) => t.id);
  const at = place === "top" ? 0 : place === "unordered" ? Math.min(NUMBERED, loose.length) : loose.length;
  loose.splice(at, 0, taskId);
  await supabaseAdmin().from("tasks").update({ schedule_folder: null }).eq("owner_id", ownerId).eq("id", taskId);
  await setSchedulingOrder(ownerId, [...loose, ...filed]);
}

// ---------------------------------------------------------------------------
// Folders: a light grouping (e.g. "Relationships"), each opened or closed.
// ---------------------------------------------------------------------------

export type ScheduleFolder = { name: string; open: boolean };

function cleanFolder(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, 40);
}

export async function getSchedulingFolders(ownerId: string): Promise<ScheduleFolder[]> {
  const { data, error } = await supabaseAdmin().from("profiles").select("schedule_folders").eq("id", ownerId).maybeSingle<{ schedule_folders: unknown }>();
  if (error || !data || !Array.isArray(data.schedule_folders)) return [];
  return (data.schedule_folders as unknown[])
    .filter((f): f is ScheduleFolder => !!f && typeof (f as ScheduleFolder).name === "string")
    .map((f) => ({ name: f.name, open: f.open !== false }));
}

export async function setSchedulingFolders(ownerId: string, folders: ScheduleFolder[]): Promise<ScheduleFolder[]> {
  const seen = new Set<string>();
  const next: ScheduleFolder[] = [];
  for (const f of folders) {
    const name = cleanFolder(f.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    next.push({ name, open: f.open !== false });
  }
  const { error } = await supabaseAdmin().from("profiles").update({ schedule_folders: next.slice(0, 30) }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save folders: ${error.message}`);
  return next;
}

/** File a quest in a folder (or take it out with null). */
export async function moveToSchedulingFolder(ownerId: string, taskId: string, folder: string | null): Promise<void> {
  const name = folder ? cleanFolder(folder) : null;
  if (name) {
    const folders = await getSchedulingFolders(ownerId);
    if (!folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) await setSchedulingFolders(ownerId, [...folders, { name, open: true }]);
  }
  const { error } = await supabaseAdmin().from("tasks").update({ schedule_folder: name }).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't move it: ${error.message}`);
}

/** Rename a folder (and everything filed in it). */
export async function renameSchedulingFolder(ownerId: string, from: string, to: string): Promise<void> {
  const name = cleanFolder(to);
  if (!name) throw new Error("Give the folder a name.");
  const folders = await getSchedulingFolders(ownerId);
  await setSchedulingFolders(ownerId, folders.map((f) => (f.name === from ? { ...f, name } : f)));
  await supabaseAdmin().from("tasks").update({ schedule_folder: name }).eq("owner_id", ownerId).eq("schedule_folder", from);
}

/** Remove a folder; what was in it goes back to the main list. */
export async function deleteSchedulingFolder(ownerId: string, name: string): Promise<void> {
  const folders = await getSchedulingFolders(ownerId);
  await setSchedulingFolders(ownerId, folders.filter((f) => f.name !== name));
  await supabaseAdmin().from("tasks").update({ schedule_folder: null }).eq("owner_id", ownerId).eq("schedule_folder", name);
}

export async function removeFromSchedulingList(ownerId: string, taskId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("tasks").update({ schedule_rank: null }).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't take it off the list: ${error.message}`);
}
