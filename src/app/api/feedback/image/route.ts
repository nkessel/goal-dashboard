import { NextResponse } from "next/server";
import { uploadFeedbackImageAction } from "@/app/actions";

/** Attach a screenshot to feedback (a plain endpoint, so it survives app updates). */
export async function POST(req: Request) {
  try {
    const url = await uploadFeedbackImageAction(await req.formData());
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't attach that image." }, { status: 400 });
  }
}
