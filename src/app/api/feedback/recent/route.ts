import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

async function me(): Promise<string | null> {
  const s = await auth();
  return (s?.user as { id?: string } | undefined)?.id ?? null;
}

/** Your latest sent feedback notes (owner, Nov 3: "a list of your latest notes so you can edit them"). */
export async function GET() {
  const id = await me();
  if (!id) return NextResponse.json({ notes: [] }, { status: 401 });
  const { data } = await supabaseAdmin()
    .from("journal_entries")
    .select("id, body, created_at, kind")
    .eq("owner_id", id)
    .in("kind", ["feedback", "refill", "future"])
    .order("created_at", { ascending: false })
    .limit(12);
  return NextResponse.json({ notes: (data ?? []).map((n) => ({ id: n.id, body: n.body, at: n.created_at })) });
}

/** Change a note you sent (its words only). */
export async function PATCH(req: Request) {
  const id = await me();
  if (!id) return NextResponse.json({ ok: false }, { status: 401 });
  const { noteId, body } = ((await req.json().catch(() => ({}))) as { noteId?: string; body?: string }) ?? {};
  const text = String(body ?? "").trim().slice(0, 20000);
  if (!noteId || !/^[0-9a-f-]{36}$/i.test(noteId) || !text) return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
  const { data, error } = await supabaseAdmin().from("journal_entries").update({ body: text }).eq("id", noteId).eq("owner_id", id).select("id");
  if (error || !data?.length) return NextResponse.json({ ok: false, error: error?.message ?? "That note isn't yours." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
