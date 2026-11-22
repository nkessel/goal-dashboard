"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { listQuestStepsAction, saveQuestStepsAction } from "@/app/actions";
import { stepPayload, treeOrder } from "@/lib/quest-steps";
import type { QuestStep } from "@/lib/data/steps";

/** A sub-quest with its own calendar slot, with its quest's title (from `listScheduledSteps`). */
export type ScheduledStep = QuestStep & { quest_title: string };

/**
 * A sub-quest's block on the calendar: its name, the quest's name under it, the time. The ring on the left
 * ticks it (its share of XP, through the quest's own steps save); the quest stays open until the rest are done.
 */
export function SubQuestBlock({ step, timeLabel, oneLine, theme = "calm" }: { step: ScheduledStep; timeLabel: string; oneLine: boolean; theme?: "calm" | "adventure" }) {
  const router = useRouter();
  const [done, setDone] = useState(step.done);
  const [busy, setBusy] = useState(false);
  const isAdventure = theme === "adventure";
  async function toggle() {
    if (busy) return;
    const next = !done;
    setBusy(true);
    setDone(next);
    try {
      const rows = (await listQuestStepsAction(step.task_id)) ?? [];
      const list = treeOrder(rows.map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.id === step.id ? next : r.done, xp: r.xp ?? 0, coins: r.coins ?? 0, minutes: r.minutes ?? null, statSplit: r.stat_split ?? null, weight: r.weight ?? null, progress: r.progress ?? (r.done ? 100 : 0), state: r.state ?? null, parentKey: r.parent_id ?? null })));
      await saveQuestStepsAction(step.task_id, stepPayload(list));
      router.refresh();
    } catch {
      setDone(!next);
    } finally {
      setBusy(false);
    }
  }
  const ink = isAdventure ? "#3a2a14" : "var(--t-ink)";
  const line = isAdventure ? "rgba(120,86,30,.55)" : "var(--t-line, rgba(60,50,30,.3))";
  return (
    <div
      data-subquest-block
      className="flex h-full w-full items-start gap-1.5 overflow-hidden rounded-[6px] px-1.5 py-1"
      style={{ background: isAdventure ? "rgba(236,218,170,.92)" : "var(--t-card, #fbf6e8)", border: `1px dashed ${line}`, color: ink, opacity: done ? 0.7 : 1 }}
    >
      <button
        type="button"
        data-no-drag
        aria-label={done ? `Undo ${step.title}` : `Tick ${step.title}`}
        aria-pressed={done}
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
        style={{ border: `1.5px solid ${line}`, background: done ? "var(--t-gold, #d9b45f)" : "transparent" }}
      >
        {done && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12px] font-semibold" style={{ textDecoration: done ? "line-through" : undefined }}>
          {step.title}
          {oneLine ? <span className="font-normal opacity-70"> · {timeLabel}</span> : null}
        </div>
        {!oneLine && (
          <>
            <div className="truncate text-[10.5px] opacity-75">{step.quest_title}</div>
            <div className="truncate text-[10.5px] opacity-60">{timeLabel}</div>
          </>
        )}
      </div>
    </div>
  );
}
