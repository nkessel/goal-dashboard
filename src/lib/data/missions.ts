import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanMissions, type Mission } from "@/lib/missions";

export async function getMissions(ownerId: string): Promise<Mission[]> {
  const { data } = await supabaseAdmin().from("profiles").select("secret_missions").eq("id", ownerId).maybeSingle<{ secret_missions: unknown }>();
  return cleanMissions(data?.secret_missions);
}

export async function saveMissions(ownerId: string, missions: unknown): Promise<Mission[]> {
  const clean = cleanMissions(missions);
  const { error } = await supabaseAdmin().from("profiles").update({ secret_missions: clean }).eq("id", ownerId);
  if (error && /secret_missions/.test(error.message)) throw new Error("Secret missions need a quick database update first.");
  if (error) throw new Error(`Couldn't save: ${error.message}`);
  return clean;
}

/** Every secret-mission step: real quests, linked by mission id. */
export async function listMissionSteps(ownerId: string) {
  const { attachStepCounts } = await import("./steps");
  const { data, error } = await supabaseAdmin()
    .from("tasks")
    .select("*")
    .eq("owner_id", ownerId)
    .not("mission_id", "is", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return attachStepCounts(((data ?? []) as import("./types").Task[]).map((t) => ({ ...t, categoryLabel: null as string | null })), ownerId);
}

/** A new step: a private quest on no board and off Today until sent there. */
export async function createMissionStep(ownerId: string, missionId: string, title: string, xp: number) {
  const { createTask } = await import("./tasks");
  const task = await createTask(ownerId, { title: title.slice(0, 200), xpValue: Math.max(0, Math.min(500, Math.round(xp))) });
  // New steps go to the end of the mission.
  const { data: last } = await supabaseAdmin().from("tasks").select("sort_order").eq("owner_id", ownerId).eq("mission_id", missionId.slice(0, 64)).order("sort_order", { ascending: false }).limit(1).maybeSingle<{ sort_order: number | null }>();
  const { error } = await supabaseAdmin().from("tasks").update({ mission_id: missionId.slice(0, 64), in_additional: false, is_manual_priority: false, is_private: true, sort_order: (last?.sort_order ?? 0) + 1 }).eq("id", task.id).eq("owner_id", ownerId);
  if (error) throw new Error(`Couldn't add that step: ${error.message}`);
  return task.id;
}
