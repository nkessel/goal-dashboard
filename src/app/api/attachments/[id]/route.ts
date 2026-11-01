import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/** A private file, only to its owner (signed in). Opens in the browser (PDFs show inline). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Sign in to open this file.", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const { data } = await supabaseAdmin()
    .from("attachments")
    .select("name, mime, data")
    .eq("id", id)
    .eq("owner_id", session.user.id)
    .maybeSingle<{ name: string; mime: string; data: string | null }>();
  if (!data?.data) return new Response("Not found", { status: 404 });
  // bytea comes back as "\x…" hex.
  const hex = data.data.startsWith("\\x") ? data.data.slice(2) : data.data;
  const bytes = Buffer.from(hex, "hex");
  const safe = data.name.replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": data.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safe.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
