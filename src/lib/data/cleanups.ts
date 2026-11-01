import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * One-time data cleanups the app runs for an account on its next visit (approved by the owner).
 * Each runs once: when it's done, its name is recorded in `life_wheel.cleanups`.
 */
const SLEEP_DUPES = "sleep-quality-dupes-2026-11-01";
const FORMS = "forms-on-cards-2026-11-01";
// Files uploaded for the owner on Nov 1 (bytes already in `attachments`), put on their import cards.
const FORM_CARDS: { card: string; files: { id: string; name: string; size: number }[] }[] = [
  { card: "13b3a450-7045-40d6-b27a-0298aa225349", files: [{ id: "d5435823-2ce6-4551-8d86-cd0e293a6502", name: "MA unclaimed money claim form.pdf", size: 95488 }] },
  {
    card: "d23f2e67-fd71-4301-b42c-a36fe5d0aef7",
    files: [
      { id: "d98923ca-c85b-4af7-94ab-c06db11a81c1", name: "Subway performer application (blank).pdf", size: 448806 },
      { id: "05ee464e-3117-4320-9f6d-9041244c6f75", name: "Subway performer application (filled).pdf", size: 1423081 },
    ],
  },
];

export async function runCleanups(ownerId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: prof } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const done = Array.isArray(prof?.life_wheel?.cleanups) ? (prof!.life_wheel!.cleanups as string[]) : [];
  if (done.includes(SLEEP_DUPES) && done.includes(FORMS)) return;
  const finished: string[] = [];
  if (!done.includes(FORMS)) {
    // Only the attachments this account owns (the cards and files are scoped to it).
    const ids = FORM_CARDS.flatMap((c) => c.files.map((f) => f.id));
    const { data: own } = await db.from("attachments").select("id").eq("owner_id", ownerId).in("id", ids);
    const mine = new Set((own ?? []).map((r) => r.id as string));
    if (mine.size) {
      for (const c of FORM_CARDS) {
        const files = c.files.filter((f) => mine.has(f.id));
        if (!files.length) continue;
        const { data: card } = await db.from("import_cards").select("attachments, task_id").eq("owner_id", ownerId).eq("id", c.card).maybeSingle<{ attachments: unknown; task_id: string | null }>();
        if (!card) continue;
        const keep = (cur: unknown) => [...(Array.isArray(cur) ? (cur as { id: string }[]) : []).filter((x) => !files.some((f) => f.id === x.id)), ...files];
        await db.from("import_cards").update({ attachments: keep(card.attachments) }).eq("owner_id", ownerId).eq("id", c.card);
        // Already imported: onto its quest too.
        if (card.task_id) {
          const { data: t } = await db.from("tasks").select("attachments").eq("owner_id", ownerId).eq("id", card.task_id).maybeSingle<{ attachments: unknown }>();
          if (t) await db.from("tasks").update({ attachments: keep(t.attachments) }).eq("owner_id", ownerId).eq("id", card.task_id);
        }
      }
      finished.push(FORMS);
    } else if (ownerId === "42ed6196-bfb0-474d-96a9-1a6cd6807b8b") {
      // Not uploaded yet (or not this account's): try again next visit.
    } else finished.push(FORMS);
  }
  if (done.includes(SLEEP_DUPES)) return markDone(ownerId, finished);
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
  await markDone(ownerId, [...finished, SLEEP_DUPES]);
}

async function markDone(ownerId: string, names: string[]): Promise<void> {
  if (!names.length) return;
  const db = supabaseAdmin();
  // Merge into the freshest copy (never overwrite the catch-all).
  const { data: cur } = await db.from("profiles").select("life_wheel").eq("id", ownerId).maybeSingle<{ life_wheel: Record<string, unknown> | null }>();
  const lw = cur?.life_wheel ?? {};
  const list = Array.isArray(lw.cleanups) ? (lw.cleanups as string[]) : [];
  await db.from("profiles").update({ life_wheel: { ...lw, cleanups: [...new Set([...list, ...names])] } }).eq("id", ownerId);
}
