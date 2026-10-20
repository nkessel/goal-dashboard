export const maxDuration = 60;

import { NextResponse } from "next/server";
import { inventoryPhotoAction } from "@/app/actions";

/** An inventory item's picture from a photo (plain endpoint: file uploads). */
export async function POST(req: Request) {
  try {
    const url = await inventoryPhotoAction(await req.formData());
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't use that photo." }, { status: 400 });
  }
}
