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
          <span className="text-[16px] font-medium" style={{ color: "var(--t-ink)" }}>
            New arrivals to sort
          </span>
          <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            {parts.join(" and ")} waiting for you to confirm
          </span>
        </span>
        <span
          className="flex h-[24px] min-w-[24px] items-center justify-center rounded-full px-1.5 text-[13px] font-bold tabular-nums"
          style={{ background: isAdventure ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {total}
        </span>
      </button>
      {reviewing && <ImportReview theme={theme} onDone={() => setReviewing(false)} />}
    </>
  );
}
