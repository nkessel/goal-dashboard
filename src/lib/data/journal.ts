import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

import { JOURNAL_KINDS, splitKindPrefix } from "@/lib/journal-kinds";

export type JournalEntry = { id: string; body: string; mood: number | null; kind: string | null; created_at: string; review_status?: string | null };

function missingTable(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /journal_entries/.test(error.message));
}

/** Newest first; null when the journal table hasn't been created yet. */
export async function listJournalEntries(ownerId: string, limit = 100): Promise<JournalEntry[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("journal_entries")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (missingTable(error)) return null;
  if (error) throw new Error(`Failed to load journal: ${error.message}`);
  return ((data ?? []) as (Omit<JournalEntry, "kind"> & { kind?: string | null })[]).map((e) => {
    if (e.kind) return { ...e, kind: e.kind };
    const split = splitKindPrefix(e.body);
    return { ...e, body: split.body, kind: split.kind };
  });
}

export async function addJournalEntry(ownerId: string, body: string, mood: number | null, kind: string | null = null): Promise<JournalEntry> {
  const db = supabaseAdmin();
  let { data, error } = await db.from("journal_entries").insert({ owner_id: ownerId, body, mood, ...(kind ? { kind } : {}) }).select("*").single();
  if (error && kind && /kind/.test(error.message)) {
    // Before the kind column exists: keep the kind as a "[Label] " prefix.
    const label = JOURNAL_KINDS.find((k) => k.key === kind)?.label;
    ({ data, error } = await db.from("journal_entries").insert({ owner_id: ownerId, body: label ? `[${label}] ${body}` : body, mood }).select("*").single());
  }
  if (missingTable(error)) throw new Error("The journal needs a quick database update first.");
  if (error) throw new Error(`Failed to save entry: ${error.message}`);
  return { ...(data as JournalEntry), kind };
}

export async function deleteJournalEntry(ownerId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("journal_entries").delete().eq("owner_id", ownerId).eq("id", id);
  if (error) throw new Error(`Failed to delete entry: ${error.message}`);
}
