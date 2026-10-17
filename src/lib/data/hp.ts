import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { appDayKey, nextDayKey } from "./tomorrow";

export const HP_MAX = 10; // half-hearts: five hearts

/**
 * Settle HP for the days since it was last checked: each non-negotiable rite
 * left undone on a past day costs half a heart (at most two hearts a day),
 * never below zero. Returns the current HP.
 */
export async function settleHp(ownerId: string): Promise<{ hp: number; lostToday: number }> {
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("hp, hp_checked_day").eq("id", ownerId).maybeSingle<{ hp: number | null; hp_checked_day: string | null }>();
  if (!p || p.hp === null || p.hp === undefined) return { hp: HP_MAX, lostToday: 0 };
  const today = appDayKey();
  if (!p.hp_checked_day) {
    await db.from("profiles").update({ hp_checked_day: today }).eq("id", ownerId);
    return { hp: p.hp, lostToday: 0 };
  }
  if (p.hp_checked_day >= today) return { hp: p.hp, lostToday: 0 };
  // Days from the last check up to yesterday (a week at most).
  const days: string[] = [];
  for (let d = p.hp_checked_day; d < today && days.length < 7; d = nextDayKey(d)) days.push(d);
  const [{ data: rites }, { data: done }] = await Promise.all([
    db.from("rites").select("id, created_at").eq("owner_id", ownerId).eq("is_core", true).eq("archived", false),
    db.from("rite_completions").select("rite_id, day").eq("owner_id", ownerId).in("day", days),
  ]);
  let loss = 0;
  for (const d of days) {
    const due = (rites ?? []).filter((r) => (r.created_at as string).slice(0, 10) <= d);
    const did = new Set((done ?? []).filter((c) => c.day === d).map((c) => c.rite_id as string));
    loss += Math.min(4, due.filter((r) => !did.has(r.id as string)).length);
  }
  const hp = Math.max(0, p.hp - loss);
  await db.from("profiles").update({ hp, hp_checked_day: today }).eq("id", ownerId);
  return { hp, lostToday: loss };
}

/** Finishing a quest restores half a heart. */
export async function heal(ownerId: string, halves = 1): Promise<void> {
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("hp").eq("id", ownerId).maybeSingle<{ hp: number | null }>();
  if (!data || data.hp === null || data.hp >= HP_MAX) return;
  await db.from("profiles").update({ hp: Math.min(HP_MAX, data.hp + halves) }).eq("id", ownerId);
}
