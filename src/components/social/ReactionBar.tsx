"use client";

import { useState, useTransition } from "react";
import { addReactionAction, removeReactionAction } from "@/app/actions";
import type { ActivityReaction } from "@/lib/data/types";

const QUICK_PICKS = ["👍", "❤️", "🎉", "🔥", "👏"];

export function ReactionBar({
  activityId,
  reactions,
  profileId,
}: {
  activityId: string;
  reactions: ActivityReaction[];
  profileId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [customEmoji, setCustomEmoji] = useState("");

  // Group by emoji -> count + whether the current user reacted with it.
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.profile_id === profileId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }

  function toggle(emoji: string) {
    const mine = grouped.get(emoji)?.mine;
    startTransition(async () => {
      if (mine) {
        await removeReactionAction(activityId, emoji);
      } else {
        try {
          await addReactionAction(activityId, emoji);
        } catch {
          // duplicate reaction race — ignore, UI will settle on revalidate
        }
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {[...grouped.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          disabled={isPending}
          onClick={() => toggle(emoji)}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            mine
              ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          {emoji} {count}
        </button>
      ))}

      {QUICK_PICKS.filter((e) => !grouped.has(e)).map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={isPending}
          onClick={() => toggle(emoji)}
          className="rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
        >
          {emoji}
        </button>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (customEmoji.trim()) {
            toggle(customEmoji.trim());
            setCustomEmoji("");
          }
        }}
        className="flex items-center gap-1"
      >
        <input
          value={customEmoji}
          onChange={(e) => setCustomEmoji(e.target.value)}
          placeholder="🦖"
          maxLength={8}
          className="w-10 rounded border border-zinc-300 bg-transparent px-1 py-0.5 text-xs dark:border-zinc-700"
        />
      </form>
    </div>
  );
}
