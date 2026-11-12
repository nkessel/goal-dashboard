import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanFileRefs, type FileRef } from "@/lib/file-refs";

/** Something waiting to be sorted into the app: imported, snoozed or skipped, one card at a time. */
export type ImportCard = {
  id: string;
  created_at: string;
  kind: "quest" | "habit" | "schedule" | "reward" | "project" | "shopping" | "done" | "ritual";
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
  plan_within_days: number | null;
  /** Private files kept with it (they go with it onto the quest). */
  attachments?: FileRef[];
};

const COLS = "id, created_at, kind, title, description, steps, repeat, repeat_text, due_on, minutes, board_hint, source_label, source_text, batch, status, snoozed_until, sort, plan_within_days, attachments";

function clean(row: Record<string, unknown>): ImportCard {
  const r = row as unknown as ImportCard;
  return { ...r, attachments: cleanFileRefs(row.attachments), steps: Array.isArray(row.steps) ? (row.steps as unknown[]).filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 30) : [] };
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

/** Change a card before sorting it: its name, notes or kind. */
export async function editImportCard(ownerId: string, id: string, patch: { title?: string; description?: string | null; kind?: ImportCard["kind"]; plan_within_days?: number | null; steps?: string[] }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.plan_within_days !== undefined) row.plan_within_days = patch.plan_within_days;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.steps !== undefined) row.steps = patch.steps;
  if (!Object.keys(row).length) return;
  const { error } = await supabaseAdmin().from("import_cards").update(row).eq("owner_id", ownerId).eq("id", id);
  if (error) throw new Error("Couldn't save that change.");
}

export async function deleteImportCard(ownerId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin().from("import_cards").delete().eq("owner_id", ownerId).eq("id", id);
  if (error) throw new Error(`Couldn't delete that card: ${error.message}`);
}

/**
 * "Plan it within…": set the quest's plan-by and put it on the scheduling
 * list, ahead of anything due to be planned later (or with no plan-by).
 */
export async function queueToSchedule(ownerId: string, taskId: string, planBy: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("tasks").update({ plan_by: planBy, schedule_folder: null }).eq("owner_id", ownerId).eq("id", taskId);
  if (error) throw new Error(`Couldn't add it to your list to schedule: ${error.message}`);
  const { listSchedulingList, setSchedulingOrder } = await import("./scheduling");
  const all = (await listSchedulingList(ownerId)).filter((t) => t.id !== taskId);
  const loose = all.filter((t) => !t.schedule_folder);
  const filed = all.filter((t) => t.schedule_folder).map((t) => t.id);
  let at = loose.findIndex((t) => !t.plan_by || t.plan_by > planBy);
  if (at < 0) at = loose.length;
  const ids = loose.map((t) => t.id);
  ids.splice(at, 0, taskId);
  await setSchedulingOrder(ownerId, [...ids, ...filed]);
}
