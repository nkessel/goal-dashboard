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
  const v = Math.min(10, Math.max(1, Math.round(level * 10) / 10));
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

// ---------------------------------------------------------------------------
// Other check-in metrics (mood, focus, …), beside energy
// ---------------------------------------------------------------------------

export type CheckReading = { metric: string; level: number; created_at: string };

const MAX_METRICS = 6;

function cleanLabel(s: string) {
  return s.replace(/\s+/g, " ").trim().slice(0, 24);
}

/** The extra metrics someone tracks, in their order (empty before migration 0034). */
export async function getCheckMetrics(ownerId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("profiles").select("check_metrics").eq("id", ownerId).maybeSingle<{ check_metrics: unknown }>();
  if (error || !data || !Array.isArray(data.check_metrics)) return [];
  return (data.check_metrics as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_METRICS);
}

export async function setCheckMetrics(ownerId: string, labels: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of labels) {
    const l = cleanLabel(raw);
    if (!l || l.toLowerCase() === "energy" || seen.has(l.toLowerCase())) continue;
    seen.add(l.toLowerCase());
    list.push(l);
  }
  const next = list.slice(0, MAX_METRICS);
  const { error } = await supabaseAdmin().from("profiles").update({ check_metrics: next }).eq("id", ownerId);
  if (error && /check_metrics/.test(error.message)) throw new Error("Tracking more in check-ins needs a quick database update first.");
  if (error) throw new Error(`Couldn't save that: ${error.message}`);
  return next;
}

export async function logCheckIns(ownerId: string, readings: { metric: string; level: number }[]): Promise<CheckReading[]> {
  const rows = readings
    .map((r) => ({ owner_id: ownerId, metric: cleanLabel(r.metric), level: Math.min(10, Math.max(1, Math.round(r.level * 10) / 10)) }))
    .filter((r) => r.metric);
  if (rows.length === 0) return [];
  const { data, error } = await supabaseAdmin().from("check_ins").insert(rows).select("metric, level, created_at");
  if (error && (error.code === "42P01" || error.code === "PGRST205" || /check_ins/.test(error.message))) throw new Error("Tracking more in check-ins needs a quick database update first.");
  if (error) throw new Error(`Couldn't save your check-in: ${error.message}`);
  return (data ?? []).map((r) => ({ metric: r.metric as string, level: Number(r.level), created_at: r.created_at as string }));
}

/** Each metric's latest reading since a moment (e.g. a day or two back). */
export async function latestCheckIns(ownerId: string, sinceISO: string): Promise<Record<string, { level: number; at: string }>> {
  const { data, error } = await supabaseAdmin()
    .from("check_ins")
    .select("metric, level, created_at")
    .eq("owner_id", ownerId)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return {};
  const out: Record<string, { level: number; at: string }> = {};
  for (const r of data ?? []) if (!((r.metric as string) in out)) out[r.metric as string] = { level: Number(r.level), at: r.created_at as string };
  return out;
}
