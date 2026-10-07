"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Reward } from "@/lib/data/types";
import { claimRewardAction, listAvailableRewardsAction } from "@/app/actions";

export type RewardChoiceEvent = CustomEvent<{ taskId: string; title: string }>;

/** Ask the app to offer a reward pick (e.g. after completing a 🎁 quest). */
export function offerRewardChoice(taskId: string, title: string) {
  window.dispatchEvent(new CustomEvent("offer-reward", { detail: { taskId, title } }));
}

/**
 * App-wide listener: when a reward-granting quest is completed, shows your
 * available rewards to pick one. Lives in the app shell so it survives the
 * completed quest's card disappearing from the list.
 */
export function RewardChooser({ theme }: { theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [offer, setOffer] = useState<{ taskId: string; title: string } | null>(null);
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [claimed, setClaimed] = useState<Reward | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function onOffer(e: Event) {
      const detail = (e as RewardChoiceEvent).detail;
      setOffer(detail);
      setClaimed(null);
      setRewards(null);
      listAvailableRewardsAction()
        .then(setRewards)
        .catch(() => setRewards([]));
    }
    window.addEventListener("offer-reward", onOffer);
    return () => window.removeEventListener("offer-reward", onOffer);
  }, []);

  if (!offer) return null;

  function pick(r: Reward) {
    startTransition(async () => {
      await claimRewardAction(r.id, offer!.taskId);
      setClaimed(r);
      setTimeout(() => setOffer(null), 2400);
    });
  }

  const panel: React.CSSProperties = {
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    border: "2px solid var(--t-gold)",
    color: "var(--t-ink)",
  };

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }}>
      <div role="dialog" aria-modal="true" aria-label="Pick your reward" className="sheet-slide-up-in flex w-full max-w-md flex-col gap-3 rounded-2xl p-5 shadow-2xl" style={panel}>
        {claimed ? (
          <div className="flex flex-col items-center gap-2 py-3 text-center">
            <span className="daily-login-pop text-5xl" aria-hidden>
              🎁
            </span>
            <p className={isAdventure ? "font-display text-xl" : "text-xl font-bold"}>Enjoy it!</p>
            <p className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
              {claimed.title} — earned by “{offer.title}”.
            </p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className={isAdventure ? "font-display text-xl" : "text-xl font-bold"}>Pick your reward</p>
              <p className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
                You finished “{offer.title}”.
              </p>
            </div>
            {rewards === null && <p className="text-center text-sm" style={{ color: "var(--t-ink-soft)" }}>Opening the chest…</p>}
            {rewards && rewards.length === 0 && (
              <p className="text-center text-sm" style={{ color: "var(--t-ink-soft)" }}>
                Your treasure chest is empty — add rewards from the chest in the top bar.
              </p>
            )}
            {rewards && rewards.length > 0 && (
              <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
                {rewards.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => pick(r)}
                    className="hover-glow flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center disabled:opacity-50"
                    style={{ border: `1.5px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`, background: "rgba(255,255,255,.3)" }}
                  >
                    <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-2xl">
                      {r.icon_key ? (
                        // eslint-disable-next-line @next/next/no-img-element -- generated portrait
                        <img src={r.icon_key} alt="" className="h-full w-full object-cover" />
                      ) : (
                        "🎁"
                      )}
                    </span>
                    <span className="text-[13px] font-semibold leading-tight">{r.title}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setOffer(null)} className="h-10 self-center rounded-full px-4 text-sm" style={{ color: "var(--t-ink-soft)" }}>
              Save it for later
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
