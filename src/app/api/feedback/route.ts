import { NextResponse } from "next/server";
import { addJournalEntryAction } from "@/app/actions";

/**
 * Sending feedback goes through this plain endpoint rather than a server
 * action, so a tab left open across an app update can still send.
 */
export async function POST(req: Request) {
  try {
    const { body, kind, xp, images, page, context } = (await req.json()) as { body?: string; kind?: string; xp?: number; images?: string[]; page?: string; context?: string };
    // What was on screen, in words: plain text only, kept short.
    const seen = typeof context === "string" ? context.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) : "";
    const where = typeof page === "string" && /^\/[\w\-/?=&%.]*$/.test(page) ? `\n\n— sent from ${page.slice(0, 120)}${seen ? ` (${seen})` : ""}` : "";
    const res = await addJournalEntryAction(String(body ?? "") + (String(body ?? "").trim() ? where : ""), null, kind ?? "feedback", Number(xp ?? 1), Array.isArray(images) ? images : []);
    return NextResponse.json({ ok: true, id: res.id, xpAwarded: res.xpAwarded });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't send it." }, { status: 400 });
  }
}
