"use client";

import { useSyncExternalStore } from "react";
import { hideTip, subscribeTour, tipHidden } from "@/lib/tour-store";
import { CloseIcon } from "@/components/ui/Icons";

/**
 * What a quest is worth, at a glance, in the quest editor's XP panel until you hide it (owner, Nov 13):
 * XP grows your level and character stats; coins buy the rewards you set yourself.
 */
export function XpGuide() {
  const hidden = useSyncExternalStore(subscribeTour, () => tipHidden("xp-guide"), () => true);
  if (hidden) return null;
  // A tip you can hide, no buttons that fill the reward in (owner, Nov 16: "get rid of them completely").
  return (
    <div data-xp-guide className="relative rounded-xl px-3 py-2 pr-8 text-[12.5px] leading-snug" style={{ background: "rgba(255,250,235,.6)", border: "1px dashed rgba(139,112,64,.5)", color: "var(--t-ink)" }}>
      <button type="button" onClick={() => hideTip("xp-guide")} aria-label="Hide this tip" title="Hide this tip" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full" style={{ color: "var(--t-ink-soft)" }}>
        <CloseIcon size={11} />
      </button>
      <b>Tip:</b> match the reward to the effort. A small quest is worth about 15 XP and a coin, a medium one about 30 XP and 1–2 coins, a hard one 50 XP or more and 3+ coins. Pick the smallest amount that still makes you want to start.
    </div>
  );
}
