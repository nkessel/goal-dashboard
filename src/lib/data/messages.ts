import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { listFriendIds } from "./friendships";
import { createNotification, markEmailSent } from "./notifications";

export type DirectMessage = { id: string; from_id: string; to_id: string; body: string; read_at: string | null; created_at: string };

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function mustBeParty(me: string, other: string) {
  if (me === other) throw new Error("That's you.");
  const friends = await listFriendIds(me);
  if (!friends.includes(other)) throw new Error("You can message people in your party.");
}

/** The latest messages between two party members, oldest first; reading it marks theirs as read. */
export async function listThread(me: string, other: string, limit = 60): Promise<DirectMessage[]> {
  await mustBeParty(me, other);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("direct_messages")
    .select("*")
    .or(`and(from_id.eq.${me},to_id.eq.${other}),and(from_id.eq.${other},to_id.eq.${me})`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load your messages: ${error.message}`);
  await db.from("direct_messages").update({ read_at: new Date().toISOString() }).eq("to_id", me).eq("from_id", other).is("read_at", null);
  return ((data ?? []) as DirectMessage[]).reverse();
}

/** How many unread messages wait from each party member. */
export async function unreadByFriend(me: string): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin().from("direct_messages").select("from_id").eq("to_id", me).is("read_at", null).limit(500);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.from_id as string] = (out[r.from_id as string] ?? 0) + 1;
  return out;
}

/** Send one: kept in the app, told in their notifications, and emailed whole when they take emails (owner, Nov 1). */
export async function sendMessage(me: string, myName: string, other: string, body: string): Promise<DirectMessage> {
  const text = body.replace(/\r/g, "").trim().slice(0, 4000);
  if (!text) throw new Error("Write something first.");
  await mustBeParty(me, other);
  const db = supabaseAdmin();
  const { data, error } = await db.from("direct_messages").insert({ from_id: me, to_id: other, body: text }).select("*").single();
  if (error) throw new Error(`Couldn't send that: ${error.message}`);
  const flat = text.replace(/\s+/g, " ");
  const n = await createNotification({ profileId: other, actorId: me, kind: "message", body: `💬 ${myName}: ${flat.length > 140 ? flat.slice(0, 139) + "…" : flat}` }).catch(() => null);
  const { data: p } = await db.from("profiles").select("email, notify_email").eq("id", other).maybeSingle<{ email: string | null; notify_email: boolean | null }>();
  if (n && p?.notify_email && p.email) {
    const sent = await sendEmail({
      to: p.email,
      subject: `${myName} sent you a message`,
      html: `<p><strong>${esc(myName)}</strong> wrote:</p><blockquote style="white-space:pre-wrap">${esc(text)}</blockquote><p>Answer in the Guild Hall, under Messages.</p>`,
    }).catch(() => false);
    if (sent) await markEmailSent(n.id).catch(() => {});
  }
  return data as DirectMessage;
}
