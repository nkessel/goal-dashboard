import { NextResponse } from "next/server";
import { addFeedbackAttachmentAction } from "@/app/actions";

/** A picture that landed after its note was sent joins the note (a plain endpoint, so it survives app updates). */
export async function POST(req: Request) {
  try {
    const { id, url } = (await req.json()) as { id?: string; url?: string };
    await addFeedbackAttachmentAction(String(id ?? ""), String(url ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't attach that picture." }, { status: 400 });
  }
}
