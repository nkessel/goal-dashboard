"use client";

import { useSyncExternalStore } from "react";
import { hideTip, subscribeTour, tipHidden } from "@/lib/tour-store";
import { CloseIcon } from "@/components/ui/Icons";

/**
 * What a quest is worth, at a glance, in the quest editor's XP panel until you hide it (owner, Nov 13):
 * XP grows your level and character stats; coins buy the rewards you set yourself.
 */
export function XpGuide({ onPick }: { onPick?: (xp: number, coins: number) => void }) {
  const hidden = useSyncExternalStore(subscribeTour, () => tipHidden("xp-guide"), () => true);
  if (hidden) return null;
  const rungs = [
    { label: "Small", xp: 15, coins: 1, coinWords: "0–1 coin" },
    { label: "Medium", xp: 30, coins: 2, coinWords: "1–2 coins" },
    { label: "Hard", xp: 50, coins: 3, coinWords: "3+ coins" },
  ];
  return (
    <div data-xp-guide className="relative flex flex-col gap-1.5 rounded-xl px-3 py-2 pr-8" style={{ background: "rgba(255,250,235,.6)", border: "1px dashed rgba(139,112,64,.5)", color: "var(--t-ink)" }}>
      <button type="button" onClick={() => hideTip("xp-guide")} aria-label="Hide this tip" title="Hide this tip" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full" style={{ color: "var(--t-ink-soft)" }}>
        <CloseIcon size={11} />
      </button>
      <span className="text-[12.5px] leading-snug">
        <b>XP</b> grows your level and character stats. <b>Coins</b> buy the rewards you set yourself. Pick the smallest amount that still makes you want to do it.
      </span>
      <div className="flex flex-wrap gap-1.5">
        {rungs.map((r) => (
          <button key={r.label} type="button" onClick={() => onPick?.(r.xp, r.coins)} className="qe-fact flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold" title={onPick ? `Set ${r.xp} XP and ${r.coins} coin${r.coins === 1 ? "" : "s"}` : undefined}>
            {r.label} · {r.xp}{r.label === "Hard" ? "+" : ""} XP · {r.coinWords}
          </button>
        ))}
      </div>
    </div>
  );
}
