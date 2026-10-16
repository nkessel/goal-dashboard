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
  /** Weekdays it repeats on (0 = Sunday); null = every day. */
  days?: number[] | null;
  /** Due by this time of day ("17:30"), if any. */
  due_time?: string | null;
  /** A special evening rite with its own content: "wins" or "tomorrow"; null for ordinary rites. */
  kind?: string | null;
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
  const live = (data as Rite[]).filter((r) => !r.archived);
  return ensureSpecialRites(ownerId, live);
}

/** The two special evening rites, added once (ahead of the others) when missing. */
const SPECIAL_RITES: { kind: string; title: string; description: string; xp_value: number; adopt?: RegExp }[] = [
  { kind: "wins", title: "Appreciate recent wins", description: "Look back at what you got done.", xp_value: 5 },
  { kind: "tomorrow", title: "Choose tomorrow's quests", description: "Pick tomorrow's quests: how much each matters, and the order you'll do them.", xp_value: 10 },
  // Someone's own "Plan tomorrow…" rite becomes the day planner (keeping its history).
  { kind: "plan", title: "Plan tomorrow's day", description: "Place tomorrow's quests, meals and moments on its hours.", xp_value: 10, adopt: /^plan tomorrow/i },
];

async function ensureSpecialRites(ownerId: string, list: Rite[]): Promise<Rite[]> {
  let rites = list;
  // Before migration 0030 there's no `kind` column: leave things as they are.
  if (rites.length > 0 && !("kind" in rites[0])) return rites;
  const missing = SPECIAL_RITES.filter((s) => !rites.some((r) => r.kind === s.kind));
  if (missing.length === 0) return rites;
  const db = supabaseAdmin();
  const first = Math.min(0, ...rites.filter((r) => r.slot !== "day").map((r) => r.sort_order));
  const added: Rite[] = [];
  for (const [i, s] of SPECIAL_RITES.entries()) {
    if (!missing.includes(s)) continue;
    const own = s.adopt ? rites.find((r) => !r.kind && r.slot !== "day" && s.adopt!.test(r.title)) : undefined;
    if (own) {
      const { data, error } = await db
        .from("rites")
        .update({ kind: s.kind, sort_order: first - SPECIAL_RITES.length + i })
        .eq("id", own.id)
        .eq("owner_id", ownerId)
        .select("*")
        .single<Rite>();
      if (data) {
        added.push(data);
        rites = rites.filter((r) => r.id !== own.id);
        continue;
      }
      if (error && error.code !== "23505") return rites;
      continue;
    }
    // A unique index keeps a second, simultaneous page load from adding it twice.
    const { data, error } = await db
      .from("rites")
      .insert({ owner_id: ownerId, title: s.title, description: s.description, is_core: true, xp_value: s.xp_value, kind: s.kind, sort_order: first - SPECIAL_RITES.length + i })
      .select("*")
      .single<Rite>();
    if (data) added.push(data);
    else if (error && error.code !== "23505") return rites;
  }
  if (added.length < missing.length) {
    // Someone else's insert won the race: read the list again.
    const { data } = await db.from("rites").select("*").eq("owner_id", ownerId).eq("archived", false).order("sort_order").order("created_at");
    return (data as Rite[] | null) ?? rites;
  }
  return [...added, ...rites].sort((a, b) => a.sort_order - b.sort_order);
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
  input: { title: string; description?: string | null; isCore: boolean; xpValue?: number; slot?: "evening" | "day"; days?: number[] | null; dueTime?: string | null }
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
      ...(input.days && input.days.length < 7 ? { days: input.days } : {}),
      ...(input.dueTime ? { due_time: input.dueTime } : {}),
    })
    .select("*")
    .single<Rite>();
  if (error && /slot/.test(error.message)) throw new Error("Daily habits need a quick database update first.");
  if (error && /days|due_time/.test(error.message)) throw new Error("Weekly habits need a quick database update first.");
  if (error || !data) throw new Error(`Failed to add rite: ${error?.message}`);
  return data;
}

export async function updateRite(
  riteId: string,
  ownerId: string,
  input: { title?: string; description?: string | null; isCore?: boolean; xpValue?: number; days?: number[] | null; dueTime?: string | null }
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("rites")
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.isCore !== undefined ? { is_core: input.isCore } : {}),
      ...(input.xpValue !== undefined ? { xp_value: Math.max(0, Math.round(input.xpValue)) } : {}),
      ...(input.days !== undefined ? { days: input.days && input.days.length < 7 ? input.days : null } : {}),
      ...(input.dueTime !== undefined ? { due_time: input.dueTime || null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", riteId)
    .eq("owner_id", ownerId);
  if (error && /days|due_time/.test(error.message)) throw new Error("Weekly habits need a quick database update first.");
  if (error) throw new Error(`Failed to update rite: ${error.message}`);
}

/** Bring back a rite that was just removed. */
export async function restoreRite(riteId: string, ownerId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("rites").update({ archived: false }).eq("id", riteId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to restore rite: ${error.message}`);
}

/** Completions of these rites on or after `sinceDay` (for habit streaks). */
export async function listCompletionsFor(ownerId: string, riteIds: string[], sinceDay: string): Promise<{ rite_id: string; day: string }[]> {
  if (riteIds.length === 0) return [];
  const { data, error } = await supabaseAdmin().from("rite_completions").select("rite_id, day").eq("owner_id", ownerId).in("rite_id", riteIds).gte("day", sinceDay);
  if (error) return [];
  return (data ?? []) as { rite_id: string; day: string }[];
}

/** Habit days skipped on purpose, on or after `sinceDay`; null before migration 0030. */
export async function listHabitSkips(ownerId: string, sinceDay: string): Promise<{ rite_id: string; day: string }[] | null> {
  const { data, error } = await supabaseAdmin().from("habit_skips").select("rite_id, day").eq("owner_id", ownerId).gte("day", sinceDay);
  if (error) return null;
  return (data ?? []) as { rite_id: string; day: string }[];
}

export async function addHabitSkip(ownerId: string, riteId: string, day: string): Promise<void> {
  const { error } = await supabaseAdmin().from("habit_skips").insert({ owner_id: ownerId, rite_id: riteId, day });
  if (error && error.code !== "23505") {
    if (/habit_skips/.test(error.message)) throw new Error("Skipping habits needs a quick database update first.");
    throw new Error(`Failed to skip: ${error.message}`);
  }
}

export async function removeHabitSkip(ownerId: string, riteId: string, day: string): Promise<void> {
  const { error } = await supabaseAdmin().from("habit_skips").delete().eq("owner_id", ownerId).eq("rite_id", riteId).eq("day", day);
  if (error) throw new Error(`Failed to undo the skip: ${error.message}`);
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
