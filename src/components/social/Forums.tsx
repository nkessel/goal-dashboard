"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/settings/Avatar";
import { LevelPill } from "./LevelPill";
import { formatRelativeTime } from "@/lib/format-time";
import { createForumThreadAction, voteForumAction } from "@/app/actions";

export type ForumScope = "party" | "community" | "ideas";
export type ThreadView = {
  id: string;
  scope: ForumScope;
  author_id: string | null;
  title: string;
  body: string;
  status: "idea" | "waiting" | "building" | "released" | null;
  pinned: boolean;
  reply_count: number;
  vote_count: number;
  last_post_at: string;
};
export type AuthorView = { id: string; name: string; level: number; avatar_color: string; avatar_image_url: string | null; champion?: boolean };

const TABS: { key: ForumScope; label: string; blurb: string }[] = [
  { key: "party", label: "Party", blurb: "Just you and your party." },
  { key: "community", label: "Community", blurb: "Everyone on the app." },
  { key: "ideas", label: "Feature ideas", blurb: "Suggest and vote on what gets built next." },
];

export const STATUS: Record<NonNullable<ThreadView["status"]>, { label: string; bg: string; fg: string }> = {
  idea: { label: "Idea", bg: "rgba(110,85,40,.14)", fg: "#5a4520" },
  waiting: { label: "Coming soon", bg: "#e9d49a", fg: "#4a3913" },
  building: { label: "Being built", bg: "#3f6a2c", fg: "#f3ead2" },
  released: { label: "Released", bg: "#2a1c10", fg: "#f2d27e" },
};

/** A name and portrait for a post's author ("Guild Hall" for posts from the app itself). */
export function Byline({ author, at, small = false }: { author: AuthorView | undefined; at: string; small?: boolean }) {
  const size = small ? 7 : 8;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
      {author && <Avatar profile={author} size={size} />}
      {author ? (
        <a href={`/friends/${author.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-semibold underline-offset-2 hover:underline" style={{ color: "var(--t-ink)" }}>
          {author.name}
        </a>
      ) : (
        <span className="truncate font-semibold" style={{ color: "var(--t-ink)" }}>
          Guild Hall
        </span>
      )}
      {author && <LevelPill level={author.level} champion={author.champion} />}
      <span className="shrink-0">· {formatRelativeTime(at)}</span>
    </span>
  );
}

/**
 * The Guild Hall forums: one for your party, one for everyone, and one where
 * everyone suggests and votes on new features.
 */
export function Forums({
  threads,
  voted: initialVoted,
  authors,
  theme,
}: {
  threads: ThreadView[];
  voted: string[];
  authors: Record<string, AuthorView>;
  theme: "calm" | "adventure";
}) {
  const router = useRouter();
  const isAdventure = theme === "adventure";
  const [tab, setTab] = useState<ForumScope>("party");
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [voted, setVoted] = useState(new Set(initialVoted));
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const list = threads.filter((t) => t.scope === tab);
  const current = TABS.find((t) => t.key === tab)!;

  function post(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const id = await createForumThreadAction(tab, title, body);
        setTitle("");
        setBody("");
        setComposing(false);
        router.push(`/feed/forum/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't post that.");
      }
    });
  }
  function vote(t: ThreadView) {
    const was = voted.has(t.id);
    const next = new Set(voted);
    if (was) next.delete(t.id);
    else next.add(t.id);
    setVoted(next);
    setVotes((v) => ({ ...v, [t.id]: (v[t.id] ?? t.vote_count) + (was ? -1 : 1) }));
    startTransition(async () => {
      try {
        const res = await voteForumAction(t.id);
        setVotes((v) => ({ ...v, [t.id]: res.count }));
      } catch {
        setVoted(voted);
        setVotes((v) => ({ ...v, [t.id]: t.vote_count }));
      }
    });
  }

  const field = { borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)" };

  return (
    <section
      aria-label="Forums"
      className={`flex flex-col gap-3 rounded-2xl px-4 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <div className="relative z-[1] flex items-center gap-2">
        <h2 className={`m-0 flex-1 ${isAdventure ? "font-display text-[21px]" : "text-[17px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
          Forums
        </h2>
        <button
          type="button"
          onClick={() => setComposing((c) => !c)}
          aria-expanded={composing}
          className="h-9 rounded-full px-3.5 text-[14px] font-bold"
          style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
        >
          {composing ? "Cancel" : tab === "ideas" ? "+ Suggest" : "+ New post"}
        </button>
      </div>

      <div role="tablist" aria-label="Forums" className="relative z-[1] flex rounded-full p-1" style={{ background: "rgba(110,85,40,.14)" }}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => (setTab(t.key), setComposing(false))}
              className={`h-9 flex-1 rounded-full px-2 text-[14px] font-semibold ${isAdventure ? "font-display" : ""}`}
              style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", boxShadow: "0 1px 3px rgba(60,40,10,.3)" } : { color: "var(--t-ink)" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="relative z-[1] m-0 -mt-1 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
        {current.blurb}
      </p>

      {composing && (
        <form onSubmit={post} className="reveal relative z-[1] flex flex-col gap-2 rounded-xl p-3" style={{ background: "rgba(255,250,235,.55)", border: "1px solid rgba(110,85,40,.25)" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tab === "ideas" ? "Your idea in a line" : "Title"} maxLength={140} autoFocus className="h-10 rounded-lg border px-3 text-[15.5px] font-semibold" style={field} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tab === "ideas" ? "How would it work? Why would it help?" : "Say more (optional)"} rows={3} className="rounded-lg border px-3 py-2 text-[15px]" style={field} />
          {error && (
            <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <button type="submit" disabled={pending || !title.trim()} className="h-10 self-end rounded-full px-5 text-[14.5px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
            {pending ? "Posting…" : "Post"}
          </button>
        </form>
      )}

      <ul key={tab} className="fade-in relative z-[1] m-0 flex list-none flex-col gap-1.5 p-0">
        {list.length === 0 && (
          <li className="rounded-xl border border-dashed px-3 py-3 text-[14px]" style={{ borderColor: "rgba(110,85,40,.35)", color: "var(--t-ink-soft)" }}>
            {tab === "party" ? "No posts in your party yet — start one, or invite friends to join." : "Nothing here yet — be the first to post."}
          </li>
        )}
        {list.map((t) => {
          const count = votes[t.id] ?? t.vote_count;
          const mine = voted.has(t.id);
          return (
            <li key={t.id} className="flex items-stretch gap-2 rounded-xl px-2.5 py-2 hover:bg-black/[.035]" style={{ background: t.pinned ? "rgba(217,180,95,.16)" : undefined }}>
              {tab === "ideas" && !t.pinned && (
                <button
                  type="button"
                  onClick={() => vote(t)}
                  aria-pressed={mine}
                  aria-label={`${mine ? "Remove your vote for" : "Vote for"} ${t.title} (${count})`}
                  className="flex w-11 shrink-0 flex-col items-center justify-center rounded-lg text-[13px] font-bold tabular-nums"
                  style={mine ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "var(--t-ink)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 5l7 9H5z" fill="currentColor" />
                  </svg>
                  {count}
                </button>
              )}
              <Link href={`/feed/forum/${t.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  {t.pinned && <span aria-label="Pinned">📌</span>}
                  <span className="text-[15.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
                    {t.title}
                  </span>
                  {t.status && t.scope === "ideas" && (
                    <span className="rounded-full px-2 py-px text-[11.5px] font-bold" style={{ background: STATUS[t.status].bg, color: STATUS[t.status].fg }}>
                      {STATUS[t.status].label}
                    </span>
                  )}
                </span>
                {t.body && (
                  <span className="line-clamp-1 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    {t.body}
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <Byline author={t.author_id ? authors[t.author_id] : undefined} at={t.last_post_at} small />
                  <span className="ml-auto shrink-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    💬 {t.reply_count}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
