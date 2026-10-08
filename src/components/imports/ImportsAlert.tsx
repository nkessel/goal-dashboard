"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ImportReview } from "./ImportReview";

const SEEN_KEY = "imports-alert-seen"; // highest count already announced this session
const OFF_KEY = "imports-alert-off"; // "don't show this again"

/**
 * When quests/rewards were imported for you: an alert (once per session, and
 * only when the count goes up) offering to categorize them now or later, plus
 * a number badge on your profile icon that reopens the review any time.
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

  const [dontShow, setDontShow] = useState(false);

  function remember() {
    try {
      window.sessionStorage.setItem(SEEN_KEY, String(Math.max(total, Number(window.sessionStorage.getItem(SEEN_KEY) ?? "0"))));
      if (dontShow) window.localStorage.setItem(OFF_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  }

  function later() {
    remember();
    setAlertOpen(false);
  }

  function now() {
    remember();
    setAlertOpen(false);
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
          aria-label={`${total} new ${total === 1 ? "import" : "imports"} to organize`}
          title={`${total} new to organize`}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12.5px] font-bold tabular-nums"
          style={{
            background: isAdventure ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "var(--t-accent)",
            color: isAdventure ? "#2a1c10" : "#fff",
            border: `1.5px solid ${isAdventure ? "#2a2416" : "#fff"}`,
            boxShadow: "0 1px 4px rgba(0,0,0,.45)",
          }}
        >
          {total}
        </button>
      )}

      {alertOpen &&
        createPortal(
          <div className="overlay-fade-in fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }}>
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="New imports"
              className="sheet-slide-up-in flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl p-5 text-center parchment parchment-framed shadow-2xl"
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
              <label className="flex cursor-pointer items-center gap-2 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={(e) => setDontShow(e.target.checked)}
                  className="h-4 w-4"
                  style={{ accentColor: isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)" }}
                />
                Don&apos;t show this again — I&apos;ll use the badge on my profile icon
              </label>
            </div>
          </div>,
          document.body
        )}

      {reviewing && <ImportReview theme={theme} onDone={() => setReviewing(false)} />}
    </>
  );
}
