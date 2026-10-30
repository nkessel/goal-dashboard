import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type Click = { at?: string; path?: string; label?: string; kind?: string; gap?: number | null; device?: string };

/** The click trail (`ClickTrail`), sent in small batches (also by sendBeacon as the page goes away). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: false }, { status: 401 });
  let rows: Click[] = [];
  try {
    const body = (await req.json()) as { clicks?: Click[] };
    rows = Array.isArray(body.clicks) ? body.clicks.slice(0, 200) : [];
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const clean = rows
    .filter((r) => r && typeof r.at === "string" && !Number.isNaN(Date.parse(r.at)))
    .map((r) => ({
      owner_id: session.user!.id,
      at: new Date(r.at!).toISOString(),
      path: s(r.path, 200) || "/",
      label: s(r.label, 120) || "(unnamed)",
      kind: s(r.kind, 20) || null,
      gap_ms: Number.isFinite(Number(r.gap)) ? Math.max(0, Math.min(86_400_000, Math.round(Number(r.gap)))) : null,
      device: s(r.device, 40) || null,
    }));
  if (clean.length) {
    const { error } = await supabaseAdmin().from("ui_clicks").insert(clean);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, n: clean.length });
}
