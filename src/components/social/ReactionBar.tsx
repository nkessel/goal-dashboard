"use client";

import { useState, useTransition } from "react";
import { addReactionAction, removeReactionAction } from "@/app/actions";
import type { ActivityReaction } from "@/lib/data/types";

/** Three cheers, calm and in theme: a raised banner, applause, a toast. */
const CHEERS: { emoji: string; label: string }[] = [
  { emoji: "📣", label: "Cheer" },
  { emoji: "👏", label: "Bravo" },
  { emoji: "🥂", label: "Toast" },
];

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
  const [, startTransition] = useTransition();
  // Taps show at once; the server catches up behind.
  const [mineNow, setMineNow] = useState<Record<string, boolean>>({});
  const isAdventure = theme === "adventure";

  // Group by emoji -> count + whether the current user reacted with it.
  const grouped = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.profile_id === profileId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }
  for (const [emoji, mine] of Object.entries(mineNow) as [string, boolean][]) {
    const entry = grouped.get(emoji) ?? { count: 0, mine: false };
    if (entry.mine !== mine) grouped.set(emoji, { count: Math.max(0, entry.count + (mine ? 1 : -1)), mine });
  }

  function toggle(emoji: string) {
    const mine = grouped.get(emoji)?.mine;
    setMineNow((m) => ({ ...m, [emoji]: !mine }));
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
      {CHEERS.map(({ emoji, label }) => {
        const g = grouped.get(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            aria-pressed={!!g?.mine}
            className="hover-glow flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px] font-semibold"
            style={chipStyle(!!g?.mine)}
            title={g?.mine ? `Take back your ${label.toLowerCase()}` : label}
          >
            <span aria-hidden>{emoji}</span>
            {label}
            {g && g.count > 0 && <span className="tabular-nums opacity-75">{g.count}</span>}
          </button>
        );
      })}
      {/* Older reactions still count, quietly. */}
      {[...grouped.entries()]
        .filter(([e]) => !CHEERS.some((c) => c.emoji === e))
        .map(([emoji, { count, mine }]) => (
          <button key={emoji} type="button" onClick={() => toggle(emoji)} className="h-8 rounded-full px-2 text-[13px]" style={chipStyle(mine)}>
            {emoji} {count}
          </button>
        ))}
    </div>
  );
}
