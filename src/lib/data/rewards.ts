import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Reward, Task } from "./types";

export async function listRewards(ownerId: string): Promise<Reward[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("rewards")
    .select("*")
    .eq("owner_id", ownerId)
    .order("status", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to list rewards: ${error.message}`);
  return data ?? [];
}

export async function createReward(
  ownerId: string,
  input: { title: string; description?: string | null; iconKey?: string | null }
): Promise<Reward> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("rewards")
    .insert({
      owner_id: ownerId,
      title: input.title,
      description: input.description || null,
      icon_key: input.iconKey ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create reward: ${error.message}`);
  return data;
}

export async function updateReward(
  rewardId: string,
  ownerId: string,
  input: { title: string; description: string | null; iconKey?: string | null; needsReview?: boolean }
): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("rewards")
    .update({
      title: input.title,
      description: input.description,
      ...(input.iconKey !== undefined ? { icon_key: input.iconKey } : {}),
      ...(input.needsReview !== undefined ? { needs_review: input.needsReview } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rewardId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to update reward: ${error.message}`);
}

export async function deleteReward(rewardId: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("rewards").delete().eq("id", rewardId).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to delete reward: ${error.message}`);
}

export async function claimReward(rewardId: string, ownerId: string, taskId: string | null): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("rewards")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      claimed_with_task_id: taskId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rewardId)
    .eq("owner_id", ownerId)
    .eq("status", "available");
  if (error) throw new Error(`Failed to claim reward: ${error.message}`);
}

export async function unclaimReward(rewardId: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from("rewards")
    .update({ status: "available", claimed_at: null, claimed_with_task_id: null, updated_at: new Date().toISOString() })
    .eq("id", rewardId)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to restore reward: ${error.message}`);
}

/** Rewards claimed since `sinceISO` (for Victories Today). */
export async function listClaimedSince(ownerId: string, sinceISO: string): Promise<Reward[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("rewards")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("status", "claimed")
    .gte("claimed_at", sinceISO)
    .order("claimed_at", { ascending: false });
  if (error) throw new Error(`Failed to list claimed rewards: ${error.message}`);
  return data ?? [];
}

export type ImportItem =
  | { kind: "quest"; task: Task }
  | { kind: "reward"; reward: Reward };

/** Everything imported for this person that they haven't reviewed yet. */
export async function listImports(ownerId: string): Promise<ImportItem[]> {
  const db = supabaseAdmin();
  const [tasks, rewards] = await Promise.all([
    db.from("tasks").select("*").eq("owner_id", ownerId).eq("needs_review", true).eq("status", "open").order("created_at"),
    db.from("rewards").select("*").eq("owner_id", ownerId).eq("needs_review", true).order("created_at"),
  ]);
  if (tasks.error) throw new Error(`Failed to list imported quests: ${tasks.error.message}`);
  if (rewards.error) throw new Error(`Failed to list imported rewards: ${rewards.error.message}`);
  return [
    ...(tasks.data ?? []).map((task: Task) => ({ kind: "quest" as const, task })),
    ...(rewards.data ?? []).map((reward: Reward) => ({ kind: "reward" as const, reward })),
  ];
}

export async function countImports(ownerId: string): Promise<{ quests: number; rewards: number }> {
  const db = supabaseAdmin();
  const [t, r] = await Promise.all([
    db.from("tasks").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("needs_review", true).eq("status", "open"),
    db.from("rewards").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("needs_review", true),
  ]);
  // Before migration 0012 runs these columns don't exist — treat as "no imports".
  return { quests: t.error ? 0 : (t.count ?? 0), rewards: r.error ? 0 : (r.count ?? 0) };
}

export async function markReviewed(kind: "quest" | "reward", id: string, ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db
    .from(kind === "quest" ? "tasks" : "rewards")
    .update({ needs_review: false })
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to confirm import: ${error.message}`);
}

/** One import still waiting for its auto-generated portrait, if any. */
export async function nextImportNeedingIcon(
  ownerId: string
): Promise<{ kind: "quest" | "reward"; id: string; prompt: string } | null> {
  const db = supabaseAdmin();
  const t = await db
    .from("tasks")
    .select("id, icon_prompt")
    .eq("owner_id", ownerId)
    .is("icon_key", null)
    .not("icon_prompt", "is", null)
    .limit(1);
  if (!t.error && t.data?.length) return { kind: "quest", id: t.data[0].id, prompt: t.data[0].icon_prompt };
  const r = await db
    .from("rewards")
    .select("id, icon_prompt")
    .eq("owner_id", ownerId)
    .is("icon_key", null)
    .not("icon_prompt", "is", null)
    .limit(1);
  if (!r.error && r.data?.length) return { kind: "reward", id: r.data[0].id, prompt: r.data[0].icon_prompt };
  return null;
}

export async function setImportIcon(kind: "quest" | "reward", id: string, ownerId: string, url: string): Promise<void> {
  const db = supabaseAdmin();
  const patch = kind === "quest" ? { icon_key: url, icon_source: "ai" } : { icon_key: url };
  const { error } = await db.from(kind === "quest" ? "tasks" : "rewards").update(patch).eq("id", id).eq("owner_id", ownerId);
  if (error) throw new Error(`Failed to save portrait: ${error.message}`);
}
