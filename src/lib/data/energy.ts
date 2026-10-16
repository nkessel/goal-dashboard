import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type EnergyEntry = { id: string; level: number; created_at: string };

function missingTable(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /energy_log/.test(error.message));
}

/** The latest check-in, or null (also null before the table exists). */
export async function latestEnergy(ownerId: string): Promise<EnergyEntry | null> {
  const { data, error } = await supabaseAdmin()
    .from("energy_log")
    .select("id, level, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = data?.[0];
  return row ? { id: row.id as string, level: Number(row.level), created_at: row.created_at as string } : null;
}

export async function logEnergy(ownerId: string, level: number): Promise<EnergyEntry> {
  const v = Math.min(10, Math.max(1, Math.round(level * 2) / 2));
  const { data, error } = await supabaseAdmin().from("energy_log").insert({ owner_id: ownerId, level: v }).select("id, level, created_at").single();
  if (missingTable(error)) throw new Error("The energy log needs a quick database update first.");
  if (error) throw new Error(`Couldn't save your energy: ${error.message}`);
  return { id: data.id as string, level: Number(data.level), created_at: data.created_at as string };
}

/** Check-ins since a moment, oldest first (empty before the table exists). */
export async function listEnergySince(ownerId: string, sinceISO: string): Promise<EnergyEntry[]> {
  const { data, error } = await supabaseAdmin()
    .from("energy_log")
    .select("id, level, created_at")
    .eq("owner_id", ownerId)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id as string, level: Number(r.level), created_at: r.created_at as string }));
}
