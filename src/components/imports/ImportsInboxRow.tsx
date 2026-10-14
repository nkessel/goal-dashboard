"use client";

import { useState } from "react";
import { ImportReview } from "./ImportReview";

/** Settings row for the badge on your profile icon: new quests/rewards to sort. */
export function ImportsInboxRow({ quests, rewards, theme }: { quests: number; rewards: number; theme: "calm" | "adventure" }) {
  const [reviewing, setReviewing] = useState(false);
  const total = quests + rewards;
  const isAdventure = theme === "adventure";
  if (total === 0 && !reviewing) return null;
  const parts = [quests ? `${quests} ${quests === 1 ? "quest" : "quests"}` : null, rewards ? `${rewards} ${rewards === 1 ? "reward" : "rewards"}` : null].filter(Boolean);
  return (
    <>
      <button
        type="button"
        onClick={() => setReviewing(true)}
        className={`hover-glow flex w-full items-center gap-3 px-4 py-3.5 text-left ${isAdventure ? "parchment" : ""}`}
        style={
          isAdventure
            ? { borderRadius: 14, boxShadow: "0 0 0 2px rgba(242,210,126,.7), 0 0 14px rgba(242,210,126,.35)" }
            : { background: "var(--t-card)", border: "1px solid var(--t-accent)", borderRadius: 14 }
        }
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[16px]" style={{ background: isAdventure ? "rgba(209,161,60,.2)" : "var(--t-accent-soft)" }}>
          📜
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
            New Quests to Prioritize
          </span>
          <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            {parts.join(" and ")} waiting for you to sort and categorize
          </span>
        </span>
        <span
          className="badge-pulse flex h-[32px] min-w-[32px] items-center justify-center rounded-full px-2 text-[16px] font-extrabold tabular-nums"
          style={{ background: "radial-gradient(circle at 35% 30%, #f07a5c, #c43a22 60%, #8e2414)", color: "#fff", border: "2px solid #fff3dc", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}
          aria-label={`${total} waiting`}
        >
          {total}
        </span>
      </button>
      {reviewing && <ImportReview theme={theme} onDone={() => setReviewing(false)} />}
    </>
  );
}
