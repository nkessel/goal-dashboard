"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteForumPostAction, deleteForumThreadAction, replyForumAction, setIdeaStatusAction, voteForumAction } from "@/app/actions";
import { Byline, STATUS, type AuthorView, type ThreadView } from "./Forums";

type Post = { id: string; author_id: string | null; body: string; created_at: string };

const SCOPE_LABEL = { party: "Party", community: "Community", ideas: "Feature ideas" } as const;

/** One forum thread: the opening post, its replies, and a reply box. */
export function ThreadPage({
  thread,
  posts,
  voted: initialVoted,
  authors,
  viewerId,
  admin,
  theme,
}: {
  thread: ThreadView & { created_at: string };
  posts: Post[];
  voted: boolean;
  authors: Record<string, AuthorView>;
  viewerId: string;
  admin: boolean;
  theme: "calm" | "adventure";
}) {
  const router = useRouter();
  const isAdventure = theme === "adventure";
  const [text, setText] = useState("");
  const [voted, setVoted] = useState(initialVoted);
  const [votes, setVotes] = useState(thread.vote_count);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const card = `flex flex-col gap-2 rounded-2xl px-4 py-3.5 ${isAdventure ? "parchment parchment-framed" : ""}`;
  const cardStyle = isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  const canRemove = (authorId: string | null) => admin || (authorId !== null && authorId === viewerId);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await replyForumAction(thread.id, text);
        setText("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't post that.");
      }
    });
  }
  function vote() {
    setVoted(!voted);
    setVotes((v) => v + (voted ? -1 : 1));
    startTransition(async () => {
      try {
        const r = await voteForumAction(thread.id);
        setVotes(r.count);
        setVoted(r.voted);
      } catch {
        setVoted(voted);
        setVotes(thread.vote_count);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <article className={card} style={cardStyle}>
        <div className="relative z-[1] flex items-start gap-3">
          {thread.scope === "ideas" && (
            <button
              type="button"
              onClick={vote}
              aria-pressed={voted}
              aria-label={`${voted ? "Remove your vote" : "Vote for this idea"} (${votes})`}
              className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-[15px] font-bold tabular-nums"
              style={voted ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "var(--t-ink)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path d="M12 5l7 9H5z" fill="currentColor" />
              </svg>
              {votes}
            </button>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
              {SCOPE_LABEL[thread.scope]}
            </span>
            <h1 className={`m-0 leading-tight ${isAdventure ? "font-display text-[24px]" : "text-[20px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
              {thread.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Byline author={thread.author_id ? authors[thread.author_id] : undefined} at={thread.created_at} />
              {thread.scope === "ideas" && thread.status && !admin && (
                <span className="rounded-full px-2 py-px text-[12px] font-bold" style={{ background: STATUS[thread.status].bg, color: STATUS[thread.status].fg }}>
                  {STATUS[thread.status].label}
                </span>
              )}
              {thread.scope === "ideas" && admin && (
                <select
                  aria-label="Where this idea stands"
                  defaultValue={thread.status ?? "idea"}
                  onChange={(e) => {
                    const v = e.target.value as NonNullable<ThreadView["status"]>;
                    startTransition(async () => {
                      await setIdeaStatusAction(thread.id, v).catch(() => {});
                      router.refresh();
                    });
                  }}
                  className="h-8 rounded-full border px-2 text-[13px] font-semibold"
                  style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)" }}
                >
                  {Object.entries(STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
        {thread.body && (
          <p className="relative z-[1] m-0 whitespace-pre-wrap text-[16px] leading-relaxed" style={{ color: "var(--t-ink)" }}>
            {thread.body}
          </p>
        )}
        {canRemove(thread.author_id) &&
          (confirming ? (
            <span className="relative z-[1] flex items-center gap-2 self-end text-[13.5px]" style={{ color: "var(--t-ink)" }}>
              Remove this thread and its replies?
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await deleteForumThreadAction(thread.id).catch(() => {});
                    router.push("/feed");
                  })
                }
                className="h-8 rounded-full px-3 font-bold"
                style={{ background: "#8a2f22", color: "#fbf3df" }}
              >
                Remove
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-full px-3 font-semibold hover:bg-black/[.06]">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="relative z-[1] self-end text-[13px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
              Remove thread
            </button>
          ))}
      </article>

      {posts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {posts.map((p) => (
            <li key={p.id} className={card} style={cardStyle}>
              <div className="relative z-[1] flex items-center gap-2">
                <Byline author={p.author_id ? authors[p.author_id] : undefined} at={p.created_at} small />
                {canRemove(p.author_id) && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteForumPostAction(p.id, thread.id).catch(() => {});
                        router.refresh();
                      })
                    }
                    className="ml-auto text-[12.5px] underline underline-offset-2"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="relative z-[1] m-0 whitespace-pre-wrap text-[15.5px] leading-relaxed" style={{ color: "var(--t-ink)" }}>
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={send} className={card} style={cardStyle}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a reply…"
          rows={3}
          className="relative z-[1] rounded-lg border px-3 py-2 text-[15.5px]"
          style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)" }}
        />
        {error && (
          <p className="relative z-[1] m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={pending || !text.trim()} className="relative z-[1] h-10 self-end rounded-full px-5 text-[14.5px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
          {pending ? "Posting…" : "Reply"}
        </button>
      </form>
    </div>
  );
}
