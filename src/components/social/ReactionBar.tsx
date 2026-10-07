"use client";

import { useState, useTransition } from "react";
import { addReactionAction, removeReactionAction } from "@/app/actions";
import type { ActivityReaction } from "@/lib/data/types";

const QUICK_PICKS = ["👍", "❤️", "🎉", "🔥", "👏"];

export function ReactionBar({
  activityId,
  reactions,
  profileId,
  theme = "calm",
}: {
  activityId: string;
  reactions: ActivityReaction[];
  profileId: string;
  theme?: "calm" | "adventure";
}) {
  const [isPending, startTransition] = useTransition();
  const [customEmoji, setCustomEmoji] = useState("");
  const isAdventure = theme === "adventure";

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

  const chipStyle = (mine: boolean) => ({
    border: `1px solid ${mine ? "var(--t-gold-deep)" : isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    background: mine ? (isAdventure ? "rgba(209,161,60,.18)" : "var(--t-accent-soft)") : "transparent",
    color: "var(--t-ink)",
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[...grouped.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          disabled={isPending}
          onClick={() => toggle(emoji)}
          className="h-8 rounded-full px-2.5 text-[15px]"
          style={chipStyle(mine)}
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
          className="h-8 rounded-full border border-dashed px-2.5 text-[15px] opacity-70 hover:opacity-100"
          style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
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
          className="w-10 rounded border px-1 py-0.5 text-xs"
          style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", color: "var(--t-ink)" }}
        />
      </form>
    </div>
  );
}
