import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_STATS, cleanStatName, normalizeSplit, statShare, type StatSplit } from "@/lib/stats";

/** Someone's stats, in their order (the defaults until they change them). */
export async function getStats(ownerId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("profiles").select("stats").eq("id", ownerId).maybeSingle<{ stats: unknown }>();
  if (error || !data || !Array.isArray(data.stats)) return [...DEFAULT_STATS];
  const list = (data.stats as unknown[]).filter((x): x is string => typeof x === "string");
  return list.length ? list : [...DEFAULT_STATS];
}

export async function setStats(ownerId: string, names: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of names) {
    const n = cleanStatName(raw);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    next.push(n);
  }
  const list = next.slice(0, 16);
  const { error } = await supabaseAdmin().from("profiles").update({ stats: list }).eq("id", ownerId);
  if (error) throw new Error(`Couldn't save your stats: ${error.message}`);
  return list;
}

/** XP in each stat. */
export async function getStatXp(ownerId: string): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin().from("profiles").select("stat_xp").eq("id", ownerId).maybeSingle<{ stat_xp: Record<string, number> | null }>();
  return data?.stat_xp ?? {};
}

export async function setTaskStatSplit(ownerId: string, taskId: string, split: StatSplit): Promise<StatSplit> {
  const clean = normalizeSplit(split);
  const { error } = await supabaseAdmin().from("tasks").update({ stat_split: clean }).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't save the stat split: ${error.message}`);
  return clean;
}

/**
 * Splits a quest's XP award: each stat takes its share (rounded), and the
 * rest is what fills the main level meter. Stat XP is logged and added to
 * the profile's stat totals here; the caller applies the remainder.
 */
export async function splitTaskXp(ownerId: string, taskId: string, amount: number, override?: StatSplit | null, basis?: number): Promise<number> {
  if (!amount) return amount;
  const db = supabaseAdmin();
  const { data: task } = await db.from("tasks").select("stat_split").eq("id", taskId).eq("owner_id", ownerId).maybeSingle<{ stat_split: StatSplit | null }>();
  // A sub-quest with its own split (override) uses it; otherwise the quest's split applies.
  const split = normalizeSplit(override && Object.keys(override).length ? override : (task?.stat_split ?? {}));
  const parts = Object.entries(split)
    // With a basis (what the quest had paid before), each share is taken on the running total, so parts add up
    // to the share of the whole and taking the whole back takes back exactly what each stat got.
    .map(([stat, pct]) => ({ stat, amount: basis !== undefined ? statShare(basis + amount, pct) - statShare(basis, pct) : Math.trunc((amount * pct) / 100) }))
    .filter((p) => p.amount !== 0);
  if (!parts.length) return amount;
  await db.from("stat_xp_events").insert(parts.map((p) => ({ owner_id: ownerId, task_id: taskId, stat: p.stat, amount: p.amount })));
  const totals = await getStatXp(ownerId);
  for (const p of parts) totals[p.stat] = Math.max(0, (totals[p.stat] ?? 0) + p.amount);
  await db.from("profiles").update({ stat_xp: totals }).eq("id", ownerId);
  return amount - parts.reduce((a, p) => a + p.amount, 0);
}
