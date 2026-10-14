import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * A boss guards each level: until it's defeated you can't level up past it,
 * however much XP you earn. Progress counts toward a target (e.g. 3 training
 * sessions), so it can be chipped away at.
 */
export type LevelBoss = {
  id: string;
  owner_id: string;
  level: number;
  title: string;
  target: number;
  progress: number;
  defeated_at: string | null;
};

/** The lowest undefeated boss — the one standing in the way now (null when none, or before the migration). */
export async function getActiveBoss(ownerId: string): Promise<LevelBoss | null> {
  const { data, error } = await supabaseAdmin()
    .from("level_bosses")
    .select("*")
    .eq("owner_id", ownerId)
    .is("defeated_at", null)
    .order("level", { ascending: true })
    .limit(1);
  if (error) return null;
  return ((data ?? [])[0] as LevelBoss | undefined) ?? null;
}

/** The highest level reachable right now (a boss at level L holds you at L). */
export async function levelCap(ownerId: string): Promise<number> {
  return (await getActiveBoss(ownerId))?.level ?? 10;
}

export async function getBoss(ownerId: string, id: string): Promise<LevelBoss | null> {
  const { data, error } = await supabaseAdmin().from("level_bosses").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  if (error) return null;
  return (data as LevelBoss | null) ?? null;
}

export async function setBossProgress(ownerId: string, id: string, progress: number, target: number): Promise<LevelBoss> {
  const p = Math.max(0, Math.min(target, Math.round(progress)));
  const { data, error } = await supabaseAdmin()
    .from("level_bosses")
    .update({ progress: p, defeated_at: p >= target ? new Date().toISOString() : null })
    .eq("owner_id", ownerId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`Failed to update the boss: ${error.message}`);
  return data as LevelBoss;
}

/** Create or rename the boss for a level. */
export async function upsertBoss(ownerId: string, level: number, title: string, target: number): Promise<LevelBoss> {
  const { data, error } = await supabaseAdmin()
    .from("level_bosses")
    .upsert({ owner_id: ownerId, level, title, target: Math.max(1, Math.round(target)) }, { onConflict: "owner_id,level" })
    .select("*")
    .single();
  if (error && /level_bosses/.test(error.message)) throw new Error("Bosses need a quick database update first.");
  if (error) throw new Error(`Failed to save the boss: ${error.message}`);
  return data as LevelBoss;
}

/** Whether the bosses table exists yet. */
export async function bossesTableExists(): Promise<boolean> {
  const { error } = await supabaseAdmin().from("level_bosses").select("id", { head: true, count: "exact" }).limit(1);
  return !error;
}
