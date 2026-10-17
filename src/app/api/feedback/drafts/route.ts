import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type D = { id: string; body: string; kind: string; xp?: number; images?: string[]; page?: string; shot?: string | null; updatedAt?: number; deleted?: boolean };

async function me(): Promise<string | null> {
  const s = await auth();
  return (s?.user as { id?: string } | undefined)?.id ?? null;
}

/** Your unsent feedback drafts, kept on your account. */
export async function GET() {
  const id = await me();
  if (!id) return NextResponse.json({ drafts: [] }, { status: 401 });
  const { data } = await supabaseAdmin().from("profiles").select("feedback_drafts").eq("id", id).maybeSingle<{ feedback_drafts: D[] | null }>();
  return NextResponse.json({ drafts: data?.feedback_drafts ?? [] });
}

/** Merge drafts in (newest edit wins; deletions are remembered for a day). */
export async function PUT(req: Request) {
  const id = await me();
  if (!id) return NextResponse.json({ ok: false }, { status: 401 });
  const incoming = ((await req.json().catch(() => ({}))) as { drafts?: D[] }).drafts ?? [];
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("feedback_drafts").eq("id", id).maybeSingle<{ feedback_drafts: D[] | null }>();
  const byId = new Map<string, D>((data?.feedback_drafts ?? []).map((d) => [d.id, d]));
  for (const d of incoming.slice(0, 50)) {
    if (!d || typeof d.id !== "string") continue;
    const prev = byId.get(d.id);
    if (!prev || (d.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) byId.set(d.id, { ...d, body: String(d.body ?? "").slice(0, 20000) });
  }
  const dayAgo = Date.now() - 86_400_000;
  const merged = [...byId.values()].filter((d) => !(d.deleted && (d.updatedAt ?? 0) < dayAgo)).slice(-50);
  await db.from("profiles").update({ feedback_drafts: merged }).eq("id", id);
  return NextResponse.json({ ok: true, drafts: merged });
}
