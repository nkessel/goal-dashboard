import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ReviewStatus = "global" | "personal" | "later" | "skipped";
export const FEEDBACK_KINDS = ["feedback", "refill", "future"] as const;

export type FeedbackForReview = {
  id: string;
  body: string;
  kind: string;
  created_at: string;
  review_status: ReviewStatus | null;
  reviewed_at: string | null;
  author: { id: string; name: string | null; avatar: string | null };
};

/** Whether this person reviews everyone's feedback (the app's owner). */
export async function isAdmin(profileId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("profiles").select("is_admin").eq("id", profileId).maybeSingle<{ is_admin: boolean }>();
  return !error && !!data?.is_admin;
}

async function adminIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin().from("profiles").select("id").eq("is_admin", true);
  return error ? [] : (data ?? []).map((r) => r.id as string);
}

/** Feedback from everyone except the reviewers themselves, newest first. Never other journal entries. */
export async function listFeedbackForReview(): Promise<FeedbackForReview[]> {
  const db = supabaseAdmin();
  const admins = await adminIds();
  let q = db
    .from("journal_entries")
    .select("id, body, kind, created_at, review_status, reviewed_at, owner_id")
    .in("kind", [...FEEDBACK_KINDS])
    .order("created_at", { ascending: false })
    .limit(300);
  if (admins.length) q = q.not("owner_id", "in", `(${admins.join(",")})`);
  const { data, error } = await q;
  if (error) return [];
  const ownerIds = [...new Set((data ?? []).map((r) => r.owner_id as string))];
  const people = new Map<string, { name: string | null; avatar: string | null }>();
  if (ownerIds.length) {
    const { data: ps } = await db.from("profiles").select("id, name, avatar_image_url, avatar_url").in("id", ownerIds);
    for (const p of ps ?? []) people.set(p.id as string, { name: (p.name as string | null) ?? null, avatar: ((p.avatar_image_url ?? p.avatar_url) as string | null) ?? null });
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    body: r.body as string,
    kind: r.kind as string,
    created_at: r.created_at as string,
    review_status: (r.review_status as ReviewStatus | null) ?? null,
    reviewed_at: (r.reviewed_at as string | null) ?? null,
    author: { id: r.owner_id as string, ...(people.get(r.owner_id as string) ?? { name: null, avatar: null }) },
  }));
}

export async function setReviewStatus(entryId: string, status: ReviewStatus | null): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("journal_entries")
    .update({ review_status: status, reviewed_at: status ? new Date().toISOString() : null })
    .eq("id", entryId)
    .in("kind", [...FEEDBACK_KINDS]);
  if (error) throw new Error(`Couldn't save that decision: ${error.message}`);
}

export async function countUnreviewed(): Promise<number> {
  const db = supabaseAdmin();
  const admins = await adminIds();
  let q = db.from("journal_entries").select("id", { count: "exact", head: true }).in("kind", [...FEEDBACK_KINDS]).is("review_status", null);
  if (admins.length) q = q.not("owner_id", "in", `(${admins.join(",")})`);
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

/** Tell the reviewers that someone sent feedback (not when a reviewer sends their own). */
export async function notifyReviewers(fromId: string, fromName: string, body: string): Promise<void> {
  const admins = (await adminIds()).filter((id) => id !== fromId);
  if (!admins.length) return;
  const preview = body.length > 90 ? `${body.slice(0, 90)}…` : body;
  await supabaseAdmin()
    .from("notifications")
    .insert(admins.map((id) => ({ profile_id: id, actor_id: fromId, kind: "feedback", body: `${fromName} sent feedback: “${preview}”` })));
}
