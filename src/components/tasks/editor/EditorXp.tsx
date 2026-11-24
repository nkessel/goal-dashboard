"use client";

import type { Dispatch, SetStateAction } from "react";
import { XpGuide } from "@/components/tour/XpGuide";
import { NumberInput } from "@/components/ui/NumberInput";
import { CoinIcon } from "@/components/ui/Icons";
import { XP_PER_COIN } from "@/lib/coins";
import { StatSplitEditor } from "../StatSplitEditor";
import { StatXpLine } from "../StatXpLine";

export const XP_MAX = 350;
export const XP_STEP = 10;

/** XP and coins: the reward slider with its nudges, the coin counter, and the "Add to stats" pill with its tray. The values and the stat split stay with the dialog (Save and drafts read them). */
export function EditorXp({ doingNow, isAdventure, labelCls, chipBorder, fieldStyle, xp, setXp, setXpOwn, coinValue, setCoinValue, coinsShown, statsOpen, setStatsOpen, statTotal, statSplit, changeStatSplit }: {
  doingNow: boolean;
  isAdventure: boolean;
  labelCls: string;
  chipBorder: string;
  fieldStyle: React.CSSProperties;
  xp: number;
  setXp: (n: number) => void;
  setXpOwn: (b: boolean) => void;
  coinValue: number | null;
  setCoinValue: (n: number | null) => void;
  coinsShown: number;
  statsOpen: boolean;
  setStatsOpen: Dispatch<SetStateAction<boolean>>;
  statTotal: number;
  statSplit: Record<string, number>;
  changeStatSplit: (next: Record<string, number>) => void;
}) {
  return (
    <>
    {/* XP and coins */}
    <div className="flex flex-col gap-1">
      {!doingNow && <XpGuide />}
      <div className="flex items-center gap-2">
        <span className="flex flex-col items-start gap-0.5">
          <span className={labelCls}>{isAdventure ? "XP reward" : "Points"}</span>
          {/* Under the title: send some of the XP to character stats (the tray opens below the XP bar). */}
          {!doingNow && (
            <button type="button" onClick={() => setStatsOpen((o) => !o)} aria-expanded={statsOpen} className="flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold" style={{ border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: statsOpen ? "rgba(217,180,95,.3)" : "rgba(255,250,235,.35)" }}>
              {/* The amounts per stat sit under the XP slider, so the pill never overflows (owner, Nov 19). */}
              {statTotal > 0 ? "Stats" : "＋ Add to stats"}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: statsOpen ? "rotate(90deg)" : undefined }}>
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </span>
        <span className="ml-auto text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {coinValue === null ? `coins follow XP (1 per ${XP_PER_COIN})` : (
            <button type="button" onClick={() => setCoinValue(null)} className="underline">
              custom coins · reset to auto
            </button>
          )}
        </span>
      </div>
      {!doingNow && <StatSplitEditor xp={xp} split={statSplit} onChange={changeStatSplit} isAdventure={isAdventure} open={statsOpen} onOpenChange={setStatsOpen} />}
      <div className="flex items-center gap-2" data-tour="xp-row">
        {/* −5 and +5 either side of the bar, the amount to its right. */}
        <button type="button" onClick={() => (setXp(Math.max(0, xp - 5)), setXpOwn(true))} aria-label="5 XP less" title="−5 XP" className="xp-nudge flex h-9 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold tabular-nums">
          −5
        </button>
        <input
          type="range"
          min={0}
          max={XP_MAX}
          step={XP_STEP}
          value={Math.min(XP_MAX, xp)}
          onChange={(e) => (setXp(Number(e.target.value)), setXpOwn(true))}
          aria-label="XP reward"
          className="h-8 min-w-0 flex-1"
          style={{ accentColor: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
        />
        <button type="button" onClick={() => (setXp(Math.min(1000, xp + 5)), setXpOwn(true))} aria-label="5 XP more" title="+5 XP" className="xp-nudge flex h-9 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold tabular-nums">
          +5
        </button>
        {/* No box (owner, Nov 9: option 3): tap the number and it glows and pulses; what you type replaces it, a gold bar for the cursor. */}
        <span className="flex h-9 shrink-0 items-center gap-0.5">
        <span className="xp-type flex h-full items-center pr-px">
          <NumberInput
            min={0}
            max={1000}
            value={xp}
            onValueChange={(v) => (setXp(v), setXpOwn(true))}
            blankZero
            aria-label="XP amount"
            className="bare-input h-full w-11 bg-transparent px-1 text-right text-[18px] font-bold tabular-nums placeholder:opacity-60 placeholder:text-[var(--t-xp)] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
          />
        </span>
          <span className="text-[12px] font-bold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
            XP
          </span>
        </span>
      </div>
      {/* Each stat's XP under the slider (owner, Nov 19: C3, divided, no "+"); hidden while the tray (which lists them) is open, so the editor doesn't jump as you tap. */}
      {!doingNow && statTotal > 0 && !statsOpen && <StatXpLine xp={xp} split={statSplit} isAdventure={isAdventure} onOpen={() => setStatsOpen(true)} />}
      <div className="flex flex-wrap items-center gap-2">
        {!doingNow && (
          <span className="ml-auto flex h-9 shrink-0 items-center gap-0.5 rounded-lg border px-1" style={fieldStyle} title="Coins earned on completion">
            <button
              type="button"
              onClick={() => setCoinValue(Math.max(0, coinsShown - 1))}
              aria-label="Fewer coins"
              className="flex h-7 w-6 items-center justify-center text-[17px] leading-none"
              style={{ color: "var(--t-ink-soft)" }}
            >
              −
            </button>
            <CoinIcon size={16} />
            <NumberInput
              min={0}
              value={coinsShown}
              onValueChange={setCoinValue}
              aria-label="Coins"
              className="bare-input h-full w-8 bg-transparent text-center text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              style={{ color: coinValue === null ? "var(--t-ink-soft)" : "#8a6116" }}
            />
            <button
              type="button"
              onClick={() => setCoinValue(coinsShown + 1)}
              aria-label="More coins"
              className="flex h-7 w-6 items-center justify-center text-[17px] leading-none"
              style={{ color: "var(--t-ink-soft)" }}
            >
              +
            </button>
          </span>
        )}
      </div>
    </div>
    </>
  );
}
