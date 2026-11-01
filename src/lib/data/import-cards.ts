import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Something waiting to be sorted into the app: imported, snoozed or skipped, one card at a time. */
export type ImportCard = {
  id: string;
  created_at: string;
  kind: "quest" | "habit";
  title: string;
  description: string | null;
  steps: string[];
  repeat: { every?: number; unit?: "day" | "week" | "month" | "year"; times?: number; weekdays?: number[] } | null;
  repeat_text: string | null;
  due_on: string | null;
  minutes: number | null;
  board_hint: string | null;
  source_label: string | null;
  source_text: string | null;
  batch: string | null;
  status: "new" | "snoozed" | "imported" | "skipped";
  snoozed_until: string | null;
  sort: number;
};

const COLS = "id, created_at, kind, title, description, steps, repeat, repeat_text, due_on, minutes, board_hint, source_label, source_text, batch, status, snoozed_until, sort";

function clean(row: Record<string, unknown>): ImportCard {
  const r = row as unknown as ImportCard;
  return { ...r, steps: Array.isArray(row.steps) ? (row.steps as unknown[]).filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 30) : [] };
}

/** Cards to sort now: new ones, and snoozed ones whose time has come. Before migration 0077, none. */
export async function listWaitingImportCards(ownerId: string, nowIso: string = new Date().toISOString()): Promise<ImportCard[]> {
  const { data, error } = await supabaseAdmin()
    .from("import_cards")
    .select(COLS)
    .eq("owner_id", ownerId)
    .or(`status.eq.new,and(status.eq.snoozed,snoozed_until.lte.${nowIso})`)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) return [];
  return (data ?? []).map(clean);
}

/** Skipped and still-snoozed cards, to bring back. */
export async function listSetAsideImportCards(ownerId: string, nowIso: string = new Date().toISOString()): Promise<ImportCard[]> {
  const { data, error } = await supabaseAdmin()
    .from("import_cards")
    .select(COLS)
    .eq("owner_id", ownerId)
    .or(`status.eq.skipped,and(status.eq.snoozed,snoozed_until.gt.${nowIso})`)
    .order("decided_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map(clean);
}

export async function countWaitingImportCards(ownerId: string, nowIso: string = new Date().toISOString()): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("import_cards")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .or(`status.eq.new,and(status.eq.snoozed,snoozed_until.lte.${nowIso})`);
  return error ? 0 : (count ?? 0);
}

export async function getImportCard(ownerId: string, id: string): Promise<ImportCard | null> {
  const { data } = await supabaseAdmin().from("import_cards").select(COLS).eq("owner_id", ownerId).eq("id", id).maybeSingle();
  return data ? clean(data) : null;
}

export async function setImportCardStatus(
  ownerId: string,
  id: string,
  patch: { status: ImportCard["status"]; snoozed_until?: string | null; task_id?: string | null }
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("import_cards")
    .update({ snoozed_until: null, ...patch, decided_at: patch.status === "new" ? null : new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("id", id);
  if (error) throw new Error(`Couldn't update that card: ${error.message}`);
}

export async function deleteImportCard(ownerId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("import_cards").delete().eq("owner_id", ownerId).eq("id", id);
  if (error) throw new Error(`Couldn't delete that card: ${error.message}`);
}
