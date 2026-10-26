"use client";

import { useState, useTransition } from "react";
import { addReactionAction, removeReactionAction } from "@/app/actions";
import type { ActivityReaction } from "@/lib/data/types";

/**
 * Three cheers in the guild's own language: a raised banner, a shield struck
 * in salute, a goblet raised. (The stored keys stay the old emoji, so earlier
 * cheers still count under their new look.)
 */
const CHEERS: { emoji: string; label: string; glyph: React.ReactNode }[] = [
  { emoji: "📣", label: "Huzzah!", glyph: <BannerGlyph /> },
  { emoji: "👏", label: "Well fought", glyph: <ShieldGlyph /> },
  { emoji: "🥂", label: "Raise a goblet", glyph: <GobletGlyph /> },
];

function BannerGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 2.5v19" stroke="#6b4a1c" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.8 4h11.5l-2.6 4 2.6 4H6.8z" fill="#b0342a" stroke="#5a1a12" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="6" cy="2.6" r="1.6" fill="#e2bb5c" stroke="#6b4a1c" strokeWidth=".8" />
      <path d="M10 7.2l.8 1.5 1.6.2-1.2 1.1.3 1.6-1.5-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" fill="#f6dc8e" />
    </svg>
  );
}
function ShieldGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2l8 3v6.2c0 5-3.4 8.8-8 10.8-4.6-2-8-5.8-8-10.8V5z" fill="url(#rb-sh)" stroke="#4a3913" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 8l8 8M16 8l-8 8" stroke="#3a2a0e" strokeWidth="1.6" strokeLinecap="round" />
      <defs>
        <linearGradient id="rb-sh" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dc8e" />
          <stop offset="1" stopColor="#a88a3f" />
        </linearGradient>
      </defs>
    </svg>
  );
}
function GobletGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 3h12c0 5-2.4 8.2-6 8.6C8.4 11.2 6 8 6 3z" fill="#d9b45f" stroke="#4a3913" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M7 5.2h10" stroke="#8a2a3a" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11.6V18M8 21h8M9.5 18h5" stroke="#4a3913" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

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
      {CHEERS.map(({ emoji, label, glyph }) => {
        const g = grouped.get(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            aria-pressed={!!g?.mine}
            className="hover-glow flex h-8 items-center gap-1 rounded-full px-3 text-[13.5px] font-semibold"
            style={chipStyle(!!g?.mine)}
            title={g?.mine ? `Take back your “${label}”` : label}
          >
            {glyph}
            <span className={isAdventure ? "font-display tracking-wide" : ""}>{label}</span>
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
