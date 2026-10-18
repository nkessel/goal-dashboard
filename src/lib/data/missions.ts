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
