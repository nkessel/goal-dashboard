"use client";

import { NumberInput } from "@/components/ui/NumberInput";
import type { ProgressUnit } from "@/lib/progress-units";

/**
 * The quest's progress part: percent or a count ("12 of 32 pages"). Its state stays with the dialog,
 * because closing pays the progress out (`commitProgress`) and saves the count (`saveProgressUnit`).
 */
export function EditorProgress({ hasTask, isCompleted, progressTracked, progress, initialProgress, setProgress, xp, unit, setCount, setUnitEdit, labelCls, fieldStyle, isAdventure }: {
  hasTask: boolean;
  isCompleted: boolean;
  progressTracked: boolean;
  progress: number;
  initialProgress: number;
  setProgress: (v: number) => void;
  xp: number;
  unit: ProgressUnit | null;
  setCount: (u: ProgressUnit) => void;
  setUnitEdit: (u: ProgressUnit | null) => void;
  labelCls: string;
  fieldStyle: React.CSSProperties;
  isAdventure: boolean;
}) {
  return (
    <>
              {/* Quest progress: partial progress earns its share of the XP (same look as the XP row). */}
              {hasTask && !isCompleted && (
                <div className="flex flex-col gap-1" style={{ opacity: progressTracked ? 1 : 0.6 }}>
                  <div className="flex items-center gap-2">
                    <span className={labelCls}>Progress</span>
                    <span className="ml-auto text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                      {!progressTracked
                        ? "available after the next database update"
                        : progress >= 100
                          ? "closing at 100% completes it"
                          : progress !== initialProgress
                            ? `+${Math.round((xp * (progress - initialProgress)) / 100)} XP when you close this`
                            : `${Math.round((xp * progress) / 100)} XP earned · ${xp - Math.round((xp * progress) / 100)} more on completion`}
                    </span>
                  </div>
                  {/* Count it in percent, or in pages (or anything): "12 of 32 pages" (owner, Nov 2). */}
                  <div className="flex items-center gap-1.5">
                    <span role="radiogroup" aria-label="Count progress in" className="flex rounded-full p-0.5" style={{ background: "rgba(70,50,20,.09)" }}>
                      {(["percent", "count"] as const).map((m) => {
                        const on = m === "count" ? !!unit : !unit;
                        return (
                          <button
                            key={m}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={!progressTracked}
                            onClick={() => (m === "count" ? !unit && setCount({ total: 32, unit: "pages", done: Math.round((progress / 100) * 32) }) : unit && setUnitEdit(null))}
                            className="h-7 rounded-full px-2.5 text-[12.5px] font-semibold"
                            style={on ? { background: isAdventure ? "linear-gradient(180deg,#f6e3a8,#dcb763)" : "var(--t-card)", color: "#2a1c10", boxShadow: "0 1px 2px rgba(60,40,10,.3)" } : { color: "var(--t-ink-soft)" }}
                          >
                            {m === "percent" ? "Percent" : "Count"}
                          </button>
                        );
                      })}
                    </span>
                    {unit && (
                      <span className="fade-in flex min-w-0 items-center gap-1 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
                        <span>of</span>
                        <span className="flex h-8 items-center rounded-lg border px-1" style={fieldStyle}>
                          <NumberInput min={1} max={100000} value={unit.total} onValueChange={(v) => setCount({ ...unit, total: Math.max(1, v) })} aria-label="Out of" className="bare-input h-full w-12 bg-transparent px-1 text-right text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                        </span>
                        <input value={unit.unit} onChange={(e) => setCount({ ...unit, unit: e.target.value.slice(0, 24) })} onBlur={(e) => !e.target.value.trim() && setCount({ ...unit, unit: "pages" })} aria-label="What you're counting" className="bare-input h-8 min-w-0 w-[84px] rounded-lg border bg-transparent px-2 text-[16px]" style={fieldStyle} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={unit ? unit.total : 100}
                      step={unit ? 1 : 5}
                      value={unit ? unit.done : progress}
                      disabled={!progressTracked}
                      onChange={(e) => (unit ? setCount({ ...unit, done: Number(e.target.value) }) : setProgress(Number(e.target.value)))}
                      aria-label="Quest progress"
                      className="h-8 min-w-0 flex-1"
                      style={{ accentColor: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
                    />
                    <span className="flex h-9 shrink-0 items-center rounded-lg border pr-1.5" style={fieldStyle}>
                      <NumberInput
                        min={0}
                        max={unit ? unit.total : 100}
                        value={unit ? unit.done : progress}
                        disabled={!progressTracked}
                        onValueChange={(v) => (unit ? setCount({ ...unit, done: v }) : setProgress(v))}
                        aria-label={unit ? `${unit.unit} done` : "Progress percent"}
                        className="bare-input h-full w-11 bg-transparent px-1 text-right text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
                      />
                      <span className="max-w-[64px] truncate text-[12px] font-bold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
                        {unit ? `/${unit.total}` : "%"}
                      </span>
                    </span>
                  </div>
                </div>
              )}
    </>
  );
}
