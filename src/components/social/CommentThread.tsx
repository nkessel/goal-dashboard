"use client";

import { useRef, useState, useTransition } from "react";
import { addCommentAction } from "@/app/actions";

export type CommentWithAuthor = {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  authorLevel: number;
  /** Their profile, so the name opens their screens. */
  authorId?: string | null;
};

export function CommentThread({
  activityId,
  comments,
  theme = "calm",
}: {
  activityId: string;
  comments: CommentWithAuthor[];
  theme?: "calm" | "adventure";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const isAdventure = theme === "adventure";
  const dim = { color: isAdventure ? "var(--t-ink-soft)" : "var(--t-ink-soft)" };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="self-end text-xs underline"
        style={dim}
      >
        {comments.length > 0 ? `View ${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Add a comment"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="text-xs" style={{ color: "var(--t-ink)" }}>
              <span className="font-semibold">
                {c.authorId ? (
                  <a href={`/friends/${c.authorId}`} className="underline-offset-2 hover:underline" title={`See ${c.authorName}'s screens`}>
                    {c.authorName}
                  </a>
                ) : (
                  c.authorName
                )}
                {c.authorLevel >= 8 && (
                  <span className="ml-1" style={{ color: "var(--t-gold-deep)" }}>
                    Lv{c.authorLevel}
                  </span>
                )}
              </span>
              <span style={dim}>: {c.body}</span>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            try {
              await addCommentAction(formData);
              formRef.current?.reset();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
            }
          });
        }}
        className="flex gap-1.5"
      >
        <input type="hidden" name="activityId" value={activityId} />
        <input
          name="body"
          placeholder="Write a comment…"
          className="flex-1 rounded border px-2 py-1 text-xs"
          style={{
            borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
            background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
            color: "var(--t-ink)",
          }}
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#3b2a10" : "#fff" }}
        >
          Send
        </button>
      </form>
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
