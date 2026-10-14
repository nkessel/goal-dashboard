import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type Rite = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  icon_key: string | null;
  /** Non-negotiable (shown where Today's Battle sits) vs. an optional mini-quest. */
  is_core: boolean;
  xp_value: number;
  /** "day" for a daily habit; "evening" (or missing) for an evening rite. */
  slot?: string | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type RiteCompletion = {
  id: string;
  owner_id: string;
  rite_id: string;
  /** The viewer's local calendar day, YYYY-MM-DD. */
  day: string;
  xp_awarded: number;
  completed_at: string;
};

const DEFAULT_RITES: { title: string; description: string; is_core: boolean; xp_value: number }[] = [
  { title: "Plan tomorrow", description: "Look over tomorrow's calendar and choose the quests for tomorrow's battle.", is_core: true, xp_value: 10 },
  { title: "Envision tomorrow", description: "Imagine what you'd love to see happen tomorrow.", is_core: true, xp_value: 5 },
  { title: "Plan meals & exercise", description: "Decide tomorrow's meals and how you'll move your body.", is_core: true, xp_value: 5 },
  { title: "Check in with Tiffany", description: "Go over plans for the coming day and week.", is_core: true, xp_value: 5 },
  { title: "Tidy the kitchen", description: "Leave it ready for the morning.", is_core: false, xp_value: 5 },
  { title: "Stretch for ten minutes", description: "Unwind the day.", is_core: false, xp_value: 5 },
  { title: "Read a chapter", description: "Something just for you.", is_core: false, xp_value: 5 },
  { title: "Write three gratitudes", description: "Small things count.", is_core: false, xp_value: 5 },
];

/**
 * Your rites (not archived), seeding the defaults the first time. Returns
 * null when the rites tables don't exist yet (migration 0014 not run).
 */
export async function listRites(ownerId: string): Promise<Rite[] | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("rites")
    .select("*")
    .eq("owner_id", ownerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return null;
  if (!data || data.length === 0) {
    const { data: seeded, error: seedErr } = await db
      .from("rites")
      .insert(DEFAULT_RITES.map((r, i) => ({ ...r, owner_id: ownerId, sort_order: i })))
      .select("*");
    if (seedErr) return null;
    return (seeded ?? []) as Rite[];
  }
  return (data as Rite[]).filter((r) => !r.archived);
}

/** Completions on or after `sinceDay` (YYYY-MM-DD). */
export async function listRiteCompletions(ownerId: string, sinceDay: string): Promise<RiteCompletion[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("rite_completions").select("*").eq("owner_id", ownerId).gte("day", sinceDay);
  if (error) return [];
  return (data ?? []) as RiteCompletion[];
}

export async function getRite(riteId: string, ownerId: string): Promise<Rite | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("rites").select("*").eq("id", riteId).eq("owner_id", ownerId).maybeSingle<Rite>();
  return data ?? null;
}

export async function createRite(
  ownerId: string,
  input: { title: string; description?: string | null; isCore: boolean; xpValue?: number; slot?: "evening" | "day" }
): Promise<Rite> {
  const db = supabaseAdmin();
  const { data: last } = await db
    .from("rites")
    .select("sort_order")
    .eq("owner_id", ownerId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const { data, error } = await db
    .from("rites")
    .insert({
      owner_id: ownerId,
      title: input.title,
      description: input.description || null,
      is_core: input.isCore,
      xp_value: Math.max(0, Math.round(input.xpValue ?? 5)),
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
      ...(input.slot === "day" ? { slot: "day" } : {}),
    })
    .select("*")
    .single<Rite>();
  if (error && /slot/.test(error.message)) throw new Error("Daily habits need a quick database update first.");
  if (error || !data) throw new Error(`Failed to add rite: ${error?.message}`);
  return data;
}

export async function updateRite(
  riteId: string,
  ownerId: string,
  input: { title?: string; description?: string | null; isCore?: boolean; xpValue?: number }
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("rites")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.isCore !== undefined ? { is_core: input.isCore } : {}),
      ...(input.xpValue !== undefined ? { xp_value: Math.max(0, Math.round(input.xpValue)) } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", riteId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update rite: ${error.message}`);
}

/** Archive rather than delete, so past evenings keep their history. */
export async function archiveRite(riteId: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("rites").update({ archived: true }).eq("id", riteId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to remove rite: ${error.message}`);
}

/** Records a completion; returns false if it was already done that day. */
export async function addRiteCompletion(ownerId: string, riteId: string, day: string, xpAwarded: number): Promise<boolean> {
  const db = supabaseAdmin();
  const { error } = await db.from("rite_completions").insert({ owner_id: ownerId, rite_id: riteId, day, xp_awarded: xpAwarded });
  if (error) {
    if (error.code === "23505") return false; // already completed that day
    throw new Error(`Failed to complete rite: ${error.message}`);
  }
  return true;
}

/** Removes a completion; returns the XP it had paid (to reverse), or null. */
export async function removeRiteCompletion(ownerId: string, riteId: string, day: string): Promise<number | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("rite_completions")
    .delete()
    .eq("owner_id", ownerId)
    .eq("rite_id", riteId)
    .eq("day", day)
    .select("xp_awarded")
    .maybeSingle<{ xp_awarded: number }>();
  return data ? data.xp_awarded : null;
}

/** Save the evening's order (rites first, then mini-quests). */
export async function reorderRites(ownerId: string, ids: string[]): Promise<void> {
  const db = supabaseAdmin();
  const results = await Promise.all(ids.map((id, i) => db.from("rites").update({ sort_order: i }).eq("id", id).eq("owner_id", ownerId)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`Failed to reorder rites: ${failed.error.message}`);
}
