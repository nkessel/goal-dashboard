import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseTasks } from "@/lib/smart-import";

/**
 * POST { text?, image?: { data (base64, no data: prefix), mediaType }, today: "YYYY-MM-DD" }
 * → { tasks: ImportedTask[] }
 *
 * A route handler rather than a server action because a phone photo is
 * bigger than a server action's default 1MB body limit (the client also
 * downsizes images before sending). Read-only: proposals are written only
 * after the user reviews them (createImportedQuestsAction).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { text?: unknown; image?: { data?: unknown; mediaType?: unknown }; today?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const today =
    typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today
      : new Date().toISOString().slice(0, 10);
  const image =
    body.image && typeof body.image.data === "string" && typeof body.image.mediaType === "string"
      ? { data: body.image.data, mediaType: body.image.mediaType }
      : undefined;
  if (image && image.data.length > 7_000_000) {
    return NextResponse.json({ error: "That photo is too large — try a smaller one." }, { status: 413 });
  }

  try {
    const tasks = await parseTasks({
      text: typeof body.text === "string" ? body.text : undefined,
      image,
      today,
    });
    return NextResponse.json({ tasks });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't read that list.";
    console.error("[smart-import]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
