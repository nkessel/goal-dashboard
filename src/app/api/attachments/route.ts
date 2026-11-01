import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanFileRefs } from "@/lib/file-refs";

const MAX = 4 * 1024 * 1024; // under Vercel's request limit

/** Keep a private file with an import card or a quest (form data: file, and cardId or taskId). */
export async function POST(req: Request) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const cardId = String(form.get("cardId") ?? "");
  const taskId = String(form.get("taskId") ?? "");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Pick a file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ ok: false, error: "That file is over 4 MB." }, { status: 400 });
  const table = cardId ? "import_cards" : taskId ? "tasks" : null;
  const id = cardId || taskId;
  if (!table) return NextResponse.json({ ok: false, error: "Nothing to attach it to." }, { status: 400 });
  const db = supabaseAdmin();
  const { data: row } = await db.from(table).select("attachments").eq("owner_id", ownerId).eq("id", id).maybeSingle<{ attachments: unknown }>();
  if (!row) return NextResponse.json({ ok: false, error: "That's gone." }, { status: 404 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "File").slice(0, 200);
  const { data: made, error } = await db
    .from("attachments")
    .insert({ owner_id: ownerId, name, mime: file.type || "application/octet-stream", size: file.size, data: `\\x${bytes.toString("hex")}` })
    .select("id")
    .single<{ id: string }>();
  if (error || !made) return NextResponse.json({ ok: false, error: "Couldn't keep that file." }, { status: 500 });
  const refs = [...cleanFileRefs(row.attachments), { id: made.id, name, size: file.size }];
  await db.from(table).update({ attachments: refs }).eq("owner_id", ownerId).eq("id", id);
  revalidatePath(table === "tasks" ? "/" : "/import");
  return NextResponse.json({ ok: true, file: { id: made.id, name, size: file.size } });
}
