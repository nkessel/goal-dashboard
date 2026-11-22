import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Args, Change } from "./types";

export type LoggedChange = { id: string; at: string; action: string; args: Args; target_kind: string | null; target_id: string | null; before: unknown; after: unknown; undone_at: string | null };

/** Saves what a change did so it can be undone. Returns its id, or null when the log isn't there (the change itself still stands). */
export async function recordChange(ownerId: string, action: string, args: Args, change: Change): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("duet_changes")
    .insert({ owner_id: ownerId, action, args, target_kind: change.kind, target_id: change.id, before: change.before ?? null, after: change.after ?? null })
    .select("id")
    .single<{ id: string }>();
  return error ? null : data.id;
}

export async function getChange(ownerId: string, id: string): Promise<LoggedChange | null> {
  const { data } = await supabaseAdmin().from("duet_changes").select("*").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  return (data as LoggedChange | null) ?? null;
}

export async function latestChange(ownerId: string): Promise<LoggedChange | null> {
  const { data } = await supabaseAdmin().from("duet_changes").select("*").eq("owner_id", ownerId).is("undone_at", null).order("at", { ascending: false }).limit(1).maybeSingle();
  return (data as LoggedChange | null) ?? null;
}

export async function markUndone(ownerId: string, id: string) {
  await supabaseAdmin().from("duet_changes").update({ undone_at: new Date().toISOString() }).eq("owner_id", ownerId).eq("id", id);
}
