"use client";

import { useState, useTransition } from "react";
import type { Reward } from "@/lib/data/types";
import { unclaimRewardAction } from "@/app/actions";
import { RewardEditorDialog } from "./RewardEditorDialog";

export function RewardsList({ rewards, theme }: { rewards: Reward[]; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const [, startTransition] = useTransition();
  const available = rewards.filter((r) => r.status === "available");
  const claimed = rewards.filter((r) => r.status === "claimed");

  const card: React.CSSProperties = {
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    color: "var(--t-ink)",
  };

  const portrait = (r: Reward) => (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl"
      style={{ border: `2px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, background: "rgba(255,255,255,.35)" }}
    >
      {r.icon_key ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated portrait
        <img src={r.icon_key} alt="" className="h-full w-full object-cover" />
      ) : (
        "🎁"
      )}
    </span>
  );

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {available.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setEditing(r)}
            className="hover-glow flex items-center gap-3 rounded-xl p-3 text-left"
            style={card}
          >
            {portrait(r)}
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[16px] font-bold ${isAdventure ? "font-display" : ""}`}>{r.title}</span>
              {r.description && (
                <span className="block truncate text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                  {r.description}
                </span>
              )}
            </span>
            {r.needs_review && (
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(209,161,60,.25)" }}>
                new
              </span>
            )}
          </button>
        ))}
        {available.length === 0 && (
          <p className="rounded-xl p-4 text-sm" style={card}>
            No rewards yet — add something to look forward to.
          </p>
        )}
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="hover-glow h-12 rounded-xl border border-dashed text-sm font-semibold"
          style={{ borderColor: isAdventure ? "rgba(243,233,207,.4)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
        >
          + Add a reward
        </button>
      </div>

      {claimed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}>
            Claimed
          </h2>
          {claimed.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl p-3 opacity-80" style={card}>
              {portrait(r)}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.title}</span>
                <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  Claimed {r.claimed_at ? new Date(r.claimed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => startTransition(() => unclaimRewardAction(r.id))}
                className="text-xs underline"
                style={{ color: "var(--t-ink-soft)" }}
              >
                Put back
              </button>
            </div>
          ))}
        </section>
      )}

      {editing && (
        <RewardEditorDialog
          reward={editing === "new" ? undefined : editing}
          theme={theme}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
