"use server";

// The leaf (cannabis) log's follow-up (owner, Nov 24): what is waiting for one, the reasons to offer as chips, and saving it.
// The log itself goes through logEventAction (journal.ts). Types and helpers live in src/lib/leaf.ts.

import { supabaseAdmin } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { LEAF_EVENT, cleanAfterNote, cleanFace, cleanFeelings, cleanOutcome, reasonChips, type LeafInfo } from "@/lib/leaf";
import { requireProfileId } from "./_shared";

type Row = { id: string; created_at: string; reason: string | null; details: string | null; before_tone: number | null; before_feelings: string[] | null; tone: number | null; reflected_at: string | null };

/** Leaf logs from the last two days still waiting for a follow-up, newest first. */
export async function leafPendingAction(): Promise<LeafInfo[]> {
  const ownerId = await requireProfileId();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const { data, error } = await supabaseAdmin()
    .from("check_in_notes")
    .select("id, created_at, reason, details, before_tone, before_feelings, tone, reflected_at")
    .eq("owner_id", ownerId)
    .eq("body", LEAF_EVENT)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return ((data ?? []) as Row[])
    .filter((r) => !r.reflected_at && r.tone == null)
    .map((r) => ({ id: r.id, at: r.created_at, reason: r.reason ?? r.details ?? null, beforeTone: r.before_tone ?? null, beforeFeelings: r.before_feelings ?? [] }));
}

/** The reasons you have typed at least twice, newest first, at most five. */
export async function leafReasonsAction(): Promise<string[]> {
  const ownerId = await requireProfileId();
  const { data, error } = await supabaseAdmin().from("check_in_notes").select("reason, created_at").eq("owner_id", ownerId).eq("body", LEAF_EVENT).order("created_at", { ascending: false }).limit(300);
  if (error) return [];
  return reasonChips((data ?? []).map((r: { reason: string | null }) => r.reason));
}

/** Save the "after" check-in: the face (as the row's tone), the words, whether it gave what you wanted, a line. */
export async function saveLeafFollowUpAction(id: string, input: { tone: number | null; afterFeelings: string[]; outcome: string | null; afterNote: string | null }) {
  try {
    const ownerId = await requireProfileId();
    const { error } = await supabaseAdmin()
      .from("check_in_notes")
      .update({ tone: cleanFace(input.tone), after_feelings: cleanFeelings(input.afterFeelings), outcome: cleanOutcome(input.outcome), after_note: cleanAfterNote(input.afterNote), reflected_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .eq("id", id)
      .eq("body", LEAF_EVENT);
    if (error) throw new Error(error.message);
    revalidatePath("/insights");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Couldn't save that." };
  }
}
