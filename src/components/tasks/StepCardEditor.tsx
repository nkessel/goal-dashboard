"use client";

import { useState } from "react";
import { InlineNumber } from "@/components/ui/InlineNumber";
import { Fold } from "@/components/ui/Fold";
import { StatSplitEditor } from "./StatSplitEditor";
import type { StepDraft } from "@/lib/quest-steps";

type Pill = "time" | "xp" | "stats";

/**
 * The small editor inside a sub-quest's card (owner, Nov 21, option C): the quest editor's own `.qe-fact`
 * pills for this one sub-quest: Time, XP, Stats, and Make it a quest. The tray of the pill you tap opens
 * under the pills. Stats uses the app's one StatSplitEditor. (Its When pill is the next step.)
 */
export function StepCardEditor({
  step,
  xpTotal,
  defaultShare,
  questStats,
  isAdventure,
  onUpdate,
  onMakeQuest,
}: {
  step: StepDraft;
  /** XP this sub-quest brings (its share of the quest's XP plus its own). */
  xpTotal: number;
  /** Its equal or chosen share of the quest's XP, in percent. */
  defaultShare: number;
  /** Whether the quest itself has a stat split (a sub-quest without its own follows it). */
  questStats: boolean;
  isAdventure: boolean;
  onUpdate: (patch: Partial<StepDraft>) => void;
  onMakeQuest: () => void;
}) {
  const [pill, setPill] = useState<Pill | null>(null);
  const toggle = (p: Pill) => setPill((o) => (o === p ? null : p));
  const own = step.statSplit ?? {};
  const ownKeys = Object.keys(own).filter((k) => own[k] > 0);
  const statsLabel = ownKeys.length ? ownKeys.map((k) => `${k.slice(0, 3).toUpperCase()} ${own[k]}%`).join(" · ") : "Stats";
  const mins = step.minutes ?? 0;
  const timeLabel = mins ? (mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}` : `${mins} min`) : "Time";
  const pillCls = "qe-fact flex h-8 shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold";
  const soft = "var(--t-ink-soft)";
  return (
    <div className="reveal ml-[26px] mr-1 flex flex-col gap-1.5 pb-1.5 pt-0.5" data-step-card-editor>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={pillCls} onClick={() => toggle("time")} aria-expanded={pill === "time"} data-open={pill === "time" ? "true" : undefined}>
          {timeLabel}
        </button>
        <button type="button" className={pillCls} onClick={() => toggle("xp")} aria-expanded={pill === "xp"} data-open={pill === "xp" ? "true" : undefined}>
          {xpTotal} XP
        </button>
        <button type="button" className={pillCls} onClick={() => toggle("stats")} aria-expanded={pill === "stats"} data-open={pill === "stats" ? "true" : undefined}>
          {statsLabel}
        </button>
        <button type="button" className={`${pillCls} ml-auto`} onClick={onMakeQuest}>
          Make it a quest
        </button>
      </div>
      <Fold open={pill === "time"}>
        <div className="qe-fact-panel flex items-center gap-2 rounded-xl p-2.5 text-[12.5px]" style={{ color: soft }}>
          <span className="w-[74px] shrink-0">Time</span>
          <InlineNumber value={mins} min={0} max={1440} suffix=" min" label={`Time estimate for ${step.title}, in minutes`} onChange={(v) => onUpdate({ minutes: v > 0 ? v : null })} className="justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
        </div>
      </Fold>
      <Fold open={pill === "xp"}>
        <div className="qe-fact-panel flex flex-col gap-1 rounded-xl p-2.5 text-[12.5px]" style={{ color: soft }}>
          {!step.done && !step.state && (
            <span className="flex items-center gap-2">
              <span className="w-[74px] shrink-0">Done</span>
              <InlineNumber value={step.progress ?? 0} label={`How far along ${step.title} is, in percent`} onChange={(v) => onUpdate({ progress: v, done: v >= 100 })} className="w-[38px] justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
              <input type="range" min={0} max={100} step={5} value={step.progress ?? 0} onChange={(e) => onUpdate({ progress: Number(e.target.value), done: Number(e.target.value) >= 100 })} aria-label={`How far along ${step.title} is`} className="step-progress min-w-0 flex-1" style={{ ["--p" as string]: `${step.progress ?? 0}%` }} />
            </span>
          )}
          <span className="flex items-center gap-2">
            <span className="w-[74px] shrink-0">Share of XP</span>
            <InlineNumber value={step.weight ?? defaultShare} min={1} label={`Share of the quest's XP for ${step.title}, in percent`} onChange={(v) => onUpdate({ weight: v })} className="w-[38px] justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
            <input type="range" min={1} max={100} value={step.weight ?? defaultShare} onChange={(e) => onUpdate({ weight: Number(e.target.value) })} aria-label={`Share of the quest's XP for ${step.title}, in percent`} className="step-progress min-w-0 flex-1" style={{ ["--p" as string]: `${step.weight ?? defaultShare}%` }} />
            {step.weight != null && (
              <button type="button" onClick={() => onUpdate({ weight: null })} className="shrink-0 underline underline-offset-2" title="Back to an equal share">
                equal
              </button>
            )}
          </span>
        </div>
      </Fold>
      <Fold open={pill === "stats"}>
        <div className="flex flex-col gap-1">
          <p className="m-0 px-1 text-[12px]" style={{ color: soft }}>
            {ownKeys.length ? "This sub-quest's XP goes to its own stats." : questStats ? "Follows the quest's stats until you choose its own." : "Share this sub-quest's XP with your stats."}
          </p>
          <StatSplitEditor xp={xpTotal} split={own} onChange={(next) => onUpdate({ statSplit: next })} isAdventure={isAdventure} open={pill === "stats"} onOpenChange={(o) => setPill(o ? "stats" : null)} />
        </div>
      </Fold>
    </div>
  );
}
