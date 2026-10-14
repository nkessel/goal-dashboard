import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type JournalEntry = { id: string; body: string; mood: number | null; created_at: string };

function missingTable(error: { code?: string; message: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /journal_entries/.test(error.message));
}

/** Newest first; null when the journal table hasn't been created yet. */
export async function listJournalEntries(ownerId: string, limit = 100): Promise<JournalEntry[] | null> {
  const { data, error } = await supabaseAdmin()
    .from("journal_entries")
    .select("id, body, mood, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (missingTable(error)) return null;
  if (error) throw new Error(`Failed to load journal: ${error.message}`);
  return (data ?? []) as JournalEntry[];
}

export async function addJournalEntry(ownerId: string, body: string, mood: number | null): Promise<JournalEntry> {
  const { data, error } = await supabaseAdmin()
    .from("journal_entries")
    .insert({ owner_id: ownerId, body, mood })
    .select("id, body, mood, created_at")
    .single();
  if (missingTable(error)) throw new Error("The journal needs a quick database update first.");
  if (error) throw new Error(`Failed to save entry: ${error.message}`);
  return data as JournalEntry;
}

export async function deleteJournalEntry(ownerId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("journal_entries").delete().eq("owner_id", ownerId).eq("id", id);
  if (error) throw new Error(`Failed to delete entry: ${error.message}`);
}
