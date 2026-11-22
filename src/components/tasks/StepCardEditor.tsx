"use client";

import { useRef, useState } from "react";
import { InlineNumber } from "@/components/ui/InlineNumber";
import { StatSplitEditor } from "./StatSplitEditor";
import { WhenPicker } from "@/components/calendar/WhenPicker";
import { scheduleStepAction, unscheduleStepAction } from "@/app/actions";
import type { StepDraft } from "@/lib/quest-steps";

type Pill = "time" | "xp" | "stats" | "when";

/**
 * The small editor inside a sub-quest's card (owner, Nov 21, option C): the quest editor's own `.qe-fact`
 * pills for this one sub-quest: Time, XP, Stats and When (Make it a quest is in its ⋯). They show only while the sub-quest is
 * being edited (its ✎; owner, Nov 22). A pill opens the app's one pill drawer: it slides down right under the pill
 * row, its point touching that pill (owner, Nov 22: "a drawer sliding down, with a carat pointing to the pill …
 * No floating drawers far away from pills"). When's drawer runs the full width of the sub-quests list, without an
 * extra frame (owner, Nov 22: "four nested cards … should be fuller width"). Stats uses the app's one StatSplitEditor.
 */
export function StepCardEditor({
  step,
  xpTotal,
  defaultShare,
  questStats,
  isAdventure,
  onUpdate,
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
}) {
  const [pill, setPill] = useState<Pill | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const placed =
    step.slotStart && step.slotEnd
      ? { start: step.slotStart, end: step.slotEnd }
      : null;
  async function place(s: { start: string; end: string }) {
    if (!step.id) return;
    setBusy(true);
    setErr(null);
    try {
      await scheduleStepAction(step.id, s.start, s.end);
      onUpdate({ slotStart: s.start, slotEnd: s.end });
      setPill(null);
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Couldn't put it on the calendar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function takeOff() {
    if (!step.id) return;
    setBusy(true);
    try {
      await unscheduleStepAction(step.id);
      onUpdate({ slotStart: null, slotEnd: null });
    } catch {
      setErr("Couldn't take it off.");
    } finally {
      setBusy(false);
    }
  }
  const whenLabel = placed
    ? new Date(placed.start)
        .toLocaleString(undefined, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
        .replace(/\s?([AaPp])\.?\s?[Mm]\.?$/, (_, p: string) => p.toLowerCase())
    : "When";
  const [x, setX] = useState(28);
  const rowRef = useRef<HTMLDivElement>(null);
  const toggle = (p: Pill, e: React.MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const row = rowRef.current?.getBoundingClientRect();
    // When's drawer is wider than the row (it starts at the card's edge), so its point is measured from there.
    if (row)
      setX(
        Math.round(b.left + b.width / 2 - row.left + (p === "when" ? 34 : 0)),
      );
    setPill((o) => (o === p ? null : p));
  };
  const own = step.statSplit ?? {};
  const ownKeys = Object.keys(own).filter((k) => own[k] > 0);
  const statsLabel = ownKeys.length
    ? ownKeys
        .map((k) => `${k.slice(0, 3).toUpperCase()} ${own[k]}%`)
        .join(" · ")
    : "Stats";
  const mins = step.minutes ?? 0;
  const timeLabel = mins
    ? mins >= 60
      ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`
      : `${mins} min`
    : "Time";
  const pillCls =
    "qe-fact flex h-8 shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold";
  const soft = "var(--t-ink-soft)";
  return (
    <div className="due-in ml-[26px] mr-1 pb-1.5 pt-1" data-step-card-editor>
      <div ref={rowRef} className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={pillCls}
          onClick={(e) => toggle("time", e)}
          aria-expanded={pill === "time"}
          data-open={pill === "time" ? "true" : undefined}
        >
          {timeLabel}
        </button>
        <button
          type="button"
          className={pillCls}
          onClick={(e) => toggle("xp", e)}
          aria-expanded={pill === "xp"}
          data-open={pill === "xp" ? "true" : undefined}
        >
          {xpTotal} XP
        </button>
        <button
          type="button"
          className={pillCls}
          onClick={(e) => toggle("stats", e)}
          aria-expanded={pill === "stats"}
          data-open={pill === "stats" ? "true" : undefined}
        >
          {statsLabel}
        </button>
        <button
          type="button"
          className={pillCls}
          onClick={(e) => toggle("when", e)}
          aria-expanded={pill === "when"}
          data-open={pill === "when" ? "true" : undefined}
        >
          {whenLabel}
        </button>
      </div>
      {pill && (
        // The app's one pill drawer: it slides down under the pill row, its point on the open pill.
        <div
          key={pill}
          className={`reveal pill-tray-box mt-[9px] p-2.5 ${pill === "when" ? "-ml-[34px] -mr-[6px] rounded-lg" : "rounded-xl"}`}
          style={{ ["--tray-x" as string]: `${x}px` }}
          data-step-tray
        >
          {pill === "time" && (
            <div
              className="flex items-center gap-2 text-[12.5px]"
              style={{ color: soft }}
            >
              <span className="w-[74px] shrink-0">Time</span>
              <InlineNumber
                value={mins}
                min={0}
                max={1440}
                suffix=" min"
                label={`Time estimate for ${step.title}, in minutes`}
                onChange={(v) => onUpdate({ minutes: v > 0 ? v : null })}
                className="justify-end font-semibold"
                style={{ color: "var(--t-ink)" }}
              />
            </div>
          )}
          {pill === "xp" && (
            <div
              className="flex flex-col gap-1 text-[12.5px]"
              style={{ color: soft }}
            >
              {!step.done && !step.state && (
                <span className="flex items-center gap-2">
                  <span className="w-[74px] shrink-0">Done</span>
                  {/* No "0%" (owner, Nov 16 and 22): the number shows once you've begun. */}
                  <span className="w-[38px] shrink-0">
                    {(step.progress ?? 0) > 0 && (
                      <InlineNumber
                        value={step.progress ?? 0}
                        label={`How far along ${step.title} is, in percent`}
                        onChange={(v) =>
                          onUpdate({ progress: v, done: v >= 100 })
                        }
                        className="w-[38px] justify-end font-semibold"
                        style={{ color: "var(--t-ink)" }}
                      />
                    )}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={step.progress ?? 0}
                    onChange={(e) =>
                      onUpdate({
                        progress: Number(e.target.value),
                        done: Number(e.target.value) >= 100,
                      })
                    }
                    aria-label={`How far along ${step.title} is`}
                    className="step-progress min-w-0 flex-1"
                    style={{ ["--p" as string]: `${step.progress ?? 0}%` }}
                  />
                </span>
              )}
              <span className="flex items-center gap-2">
                <span className="w-[74px] shrink-0">Share of XP</span>
                <InlineNumber
                  value={step.weight ?? defaultShare}
                  min={1}
                  label={`Share of the quest's XP for ${step.title}, in percent`}
                  onChange={(v) => onUpdate({ weight: v })}
                  className="w-[38px] justify-end font-semibold"
                  style={{ color: "var(--t-ink)" }}
                />
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={step.weight ?? defaultShare}
                  onChange={(e) => onUpdate({ weight: Number(e.target.value) })}
                  aria-label={`Share of the quest's XP for ${step.title}, in percent`}
                  className="step-progress min-w-0 flex-1"
                  style={{
                    ["--p" as string]: `${step.weight ?? defaultShare}%`,
                  }}
                />
                {step.weight != null && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ weight: null })}
                    className="shrink-0 underline underline-offset-2"
                    title="Back to an equal share"
                  >
                    equal
                  </button>
                )}
              </span>
            </div>
          )}
          {pill === "when" && (
            <div
              className="flex flex-col gap-1.5 text-[12.5px]"
              style={{ color: soft }}
            >
              {step.id ? (
                <>
                  <WhenPicker
                    bare
                    minutes={mins || 15}
                    title={step.title}
                    isAdventure={isAdventure}
                    initial={placed?.start ?? null}
                    placing={busy}
                    onPick={(s) => void place(s)}
                  />
                  {placed && (
                    <button
                      type="button"
                      onClick={() => void takeOff()}
                      disabled={busy}
                      className="self-start underline underline-offset-2 disabled:opacity-50"
                    >
                      Take it off the calendar
                    </button>
                  )}
                </>
              ) : (
                <span>
                  Save the quest first, then you can give this sub-quest a time.
                </span>
              )}
              {err && <span style={{ color: "var(--t-warn)" }}>{err}</span>}
            </div>
          )}
          {pill === "stats" && (
            <div className="flex flex-col gap-1">
              <p className="m-0 px-1 text-[12px]" style={{ color: soft }}>
                {ownKeys.length
                  ? "This sub-quest's XP goes to its own stats."
                  : questStats
                    ? "Follows the quest's stats until you choose its own."
                    : "Share this sub-quest's XP with your stats."}
              </p>
              <StatSplitEditor
                xp={xpTotal}
                split={own}
                onChange={(next) => onUpdate({ statSplit: next })}
                isAdventure={isAdventure}
                open={pill === "stats"}
                onOpenChange={(o) => setPill(o ? "stats" : null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
