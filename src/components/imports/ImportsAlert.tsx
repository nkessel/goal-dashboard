"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImportReview } from "./ImportReview";

/**
 * When quests/rewards were imported for you: a one-time alert offering to
 * categorize them now or later, plus an inbox chip in the top bar that
 * reopens the review any time.
 */
export function ImportsAlert({
  quests,
  rewards,
  theme,
}: {
  quests: number;
  rewards: number;
  theme: "calm" | "adventure";
}) {
  const total = quests + rewards;
  const [alertOpen, setAlertOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const isAdventure = theme === "adventure";

  useEffect(() => {
    if (!total) return;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem("imports-alert-seen") === String(total);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
    if (!seen) setAlertOpen(true);
  }, [total]);

  function later() {
    try {
      window.sessionStorage.setItem("imports-alert-seen", String(total));
    } catch {
      /* storage unavailable */
    }
    setAlertOpen(false);
  }

  function now() {
    later();
    setReviewing(true);
  }

  const parts = [
    quests ? `${quests} ${quests === 1 ? "quest" : "quests"}` : null,
    rewards ? `${rewards} ${rewards === 1 ? "reward" : "rewards"}` : null,
  ].filter(Boolean);

  return (
    <>
      {total > 0 && (
        <button
          type="button"
          onClick={() => setReviewing(true)}
          aria-label={`${total} new imports to organize`}
          title="New imports to organize"
          className="hover-glow relative flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold"
          style={{
            background: isAdventure ? "rgba(209,161,60,.25)" : "var(--t-accent-soft)",
            border: `1px solid ${isAdventure ? "var(--t-gold)" : "var(--t-card-border)"}`,
            color: isAdventure ? "var(--t-cream)" : "var(--t-accent)",
          }}
        >
          <span aria-hidden>📜</span>
          {total} new
        </button>
      )}

      {alertOpen &&
        createPortal(
          <div className="overlay-fade-in fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }}>
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="New imports"
              className="sheet-slide-up-in flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl p-5 text-center shadow-2xl"
              style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: "2px solid var(--t-gold)", color: "var(--t-ink)" }}
            >
              <span className="text-4xl" aria-hidden>
                📜
              </span>
              <p className={isAdventure ? "font-display text-xl" : "text-xl font-bold"}>New arrivals!</p>
              <p className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
                {parts.join(" and ")} {total === 1 ? "was" : "were"} added for you. Take a look and confirm or tweak each one.
              </p>
              <div className="mt-1 flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={now}
                  className="hover-glow h-11 rounded-full text-[15px] font-semibold"
                  style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
                >
                  ✦ Categorize these now
                </button>
                <button type="button" onClick={later} className="h-10 rounded-full text-sm" style={{ color: "var(--t-ink-soft)" }}>
                  ~ Organize later
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {reviewing && <ImportReview theme={theme} onDone={() => setReviewing(false)} />}
    </>
  );
}
