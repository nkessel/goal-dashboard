import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * One-time data cleanups the app runs for an account on its next visit (approved by the owner).
 * Each runs once: when it's done, its name is recorded in `life_wheel.cleanups`.
 */
const SLEEP_DUPES = "sleep-quality-dupes-2026-11-01";

export async function runCleanups(ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: prof } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const done = Array.isArray(prof?.life_wheel?.cleanups) ? (prof!.life_wheel!.cleanups as string[]) : [];
  if (done.includes(SLEEP_DUPES)) return;
  // Nov 1: the welcome screen's Sleep part saved "Sleep quality" on every render for a few
  // minutes (fixed). Keep the first of that burst, remove the copies.
  const { data: rows, error } = await db
    .from("check_ins")
    .select("id, created_at")
    .eq("owner_id", ownerId)
    .eq("metric", "Sleep quality")
    .gte("created_at", "2026-11-01T14:48:00Z")
    .lte("created_at", "2026-11-01T14:56:00Z")
    .order("created_at", { ascending: true });
  if (error) return;
  const extra = (rows ?? []).slice(1).map((r) => r.id as string);
  for (let i = 0; i < extra.length; i += 200) {
    const { error: e } = await db.from("check_ins").delete().eq("owner_id", ownerId).in("id", extra.slice(i, i + 200));
    if (e) return;
  }
  // Merge into the freshest copy (never overwrite the catch-all).
  const { data: cur } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const lw = cur?.life_wheel ?? {};
  const list = Array.isArray(lw.cleanups) ? (lw.cleanups as string[]) : [];
  await db.from("profiles").update({ life_wheel: { ...lw, cleanups: [...new Set([...list, SLEEP_DUPES])] } }).eq("id", ownerId);
}
