import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listFriendIds } from "./friendships";
import { isAdmin } from "./feedback";

export type ForumScope = "party" | "community" | "ideas";
export type IdeaStatus = "idea" | "waiting" | "building" | "released";

export type ForumThread = {
  id: string;
  scope: ForumScope;
  author_id: string | null;
  title: string;
  body: string;
  status: IdeaStatus | null;
  pinned: boolean;
  reply_count: number;
  vote_count: number;
  created_at: string;
  last_post_at: string;
};
export type ForumPost = { id: string; thread_id: string; author_id: string | null; body: string; created_at: string };

export const SCOPES: ForumScope[] = ["party", "community", "ideas"];

function clean(s: string, max: number) {
  return s.replace(/\r\n/g, "\n").trim().slice(0, max);
}

/** Who a party thread is visible to: its author and the author's party. */
async function canSee(thread: ForumThread, viewerId: string): Promise<boolean> {
  if (thread.scope !== "party") return true;
  if (!thread.author_id || thread.author_id === viewerId) return true;
  return (await listFriendIds(viewerId)).includes(thread.author_id);
}

export async function listThreads(scope: ForumScope, viewerId: string): Promise<{ threads: ForumThread[]; voted: string[] }> {
  const db = supabaseAdmin();
  let q = db.from("forum_threads").select("*").eq("scope", scope);
  if (scope === "party") q = q.in("author_id", [viewerId, ...(await listFriendIds(viewerId))]);
  q = scope === "ideas" ? q.order("pinned", { ascending: false }).order("vote_count", { ascending: false }).order("last_post_at", { ascending: false }) : q.order("pinned", { ascending: false }).order("last_post_at", { ascending: false });
  const { data, error } = await q.limit(100);
  if (error) return { threads: [], voted: [] };
  const threads = (data ?? []) as ForumThread[];
  let voted: string[] = [];
  if (scope === "ideas" && threads.length) {
    const { data: v } = await db.from("forum_votes").select("thread_id").eq("voter_id", viewerId).in("thread_id", threads.map((t) => t.id));
    voted = (v ?? []).map((r) => r.thread_id as string);
  }
  return { threads, voted };
}

export async function getThread(id: string, viewerId: string): Promise<{ thread: ForumThread; posts: ForumPost[]; voted: boolean } | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("forum_threads").select("*").eq("id", id).maybeSingle();
  const thread = data as ForumThread | null;
  if (!thread || !(await canSee(thread, viewerId))) return null;
  const [{ data: posts }, { data: vote }] = await Promise.all([
    db.from("forum_posts").select("*").eq("thread_id", id).order("created_at", { ascending: true }).limit(500),
    db.from("forum_votes").select("thread_id").eq("thread_id", id).eq("voter_id", viewerId).maybeSingle(),
  ]);
  return { thread, posts: (posts ?? []) as ForumPost[], voted: !!vote };
}

export async function createThread(authorId: string, scope: ForumScope, title: string, body: string): Promise<ForumThread> {
  const t = clean(title, 140);
  if (!t) throw new Error("Give your post a title.");
  const { data, error } = await supabaseAdmin()
    .from("forum_threads")
    .insert({ scope, author_id: authorId, title: t, body: clean(body, 6000), status: scope === "ideas" ? "idea" : null })
    .select("*")
    .single();
  if (error) throw new Error(`Couldn't post that: ${error.message}`);
  return data as ForumThread;
}

export async function reply(authorId: string, threadId: string, body: string): Promise<ForumPost> {
  const b = clean(body, 6000);
  if (!b) throw new Error("Write something first.");
  const found = await getThread(threadId, authorId);
  if (!found) throw new Error("That thread isn't here anymore.");
  const db = supabaseAdmin();
  const { data, error } = await db.from("forum_posts").insert({ thread_id: threadId, author_id: authorId, body: b }).select("*").single();
  if (error) throw new Error(`Couldn't post that: ${error.message}`);
  await db.from("forum_threads").update({ reply_count: found.thread.reply_count + 1, last_post_at: new Date().toISOString() }).eq("id", threadId);
  return data as ForumPost;
}

export async function toggleVote(voterId: string, threadId: string): Promise<{ voted: boolean; count: number }> {
  const db = supabaseAdmin();
  const found = await getThread(threadId, voterId);
  if (!found || found.thread.scope !== "ideas") throw new Error("Only feature ideas take votes.");
  if (found.voted) await db.from("forum_votes").delete().eq("thread_id", threadId).eq("voter_id", voterId);
  else await db.from("forum_votes").insert({ thread_id: threadId, voter_id: voterId });
  const { count } = await db.from("forum_votes").select("thread_id", { count: "exact", head: true }).eq("thread_id", threadId);
  await db.from("forum_threads").update({ vote_count: count ?? 0 }).eq("id", threadId);
  return { voted: !found.voted, count: count ?? 0 };
}

/** Authors remove their own posts; admins can remove anything. */
export async function deleteThread(viewerId: string, threadId: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("forum_threads").select("author_id").eq("id", threadId).maybeSingle();
  if (!data) return;
  if (data.author_id !== viewerId && !(await isAdmin(viewerId))) throw new Error("Only the author can remove this.");
  await db.from("forum_threads").delete().eq("id", threadId);
}

export async function deletePost(viewerId: string, postId: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("forum_posts").select("author_id, thread_id").eq("id", postId).maybeSingle();
  if (!data) return;
  if (data.author_id !== viewerId && !(await isAdmin(viewerId))) throw new Error("Only the author can remove this.");
  await db.from("forum_posts").delete().eq("id", postId);
  const { count } = await db.from("forum_posts").select("id", { count: "exact", head: true }).eq("thread_id", data.thread_id);
  await db.from("forum_threads").update({ reply_count: count ?? 0 }).eq("id", data.thread_id);
}

/** Admins mark where a feature idea stands. */
export async function setIdeaStatus(viewerId: string, threadId: string, status: IdeaStatus) {
  if (!(await isAdmin(viewerId))) throw new Error("Only the app's admins can change that.");
  await supabaseAdmin().from("forum_threads").update({ status }).eq("id", threadId).eq("scope", "ideas");
}
