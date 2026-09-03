"use client";

import { useRef, useState, useTransition } from "react";
import { addCommentAction } from "@/app/actions";

export type CommentWithAuthor = {
  id: string;
  body: string;
  created_at: string;
  authorName: string;
  authorLevel: number;
};

export function CommentThread({
  activityId,
  comments,
}: {
  activityId: string;
  comments: CommentWithAuthor[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {c.authorName}
                {c.authorLevel >= 8 && <span className="ml-1 text-amber-500">Lv{c.authorLevel}</span>}
              </span>
              <span className="text-zinc-500">: {c.body}</span>
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
        className="flex gap-1"
      >
        <input type="hidden" name="activityId" value={activityId} />
        <input
          name="body"
          placeholder="Write a comment…"
          className="flex-1 rounded border border-zinc-300 bg-transparent px-2 py-1 text-xs dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Send
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
