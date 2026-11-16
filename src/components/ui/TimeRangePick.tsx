"use client";

import { useState } from "react";
import { TimeToken } from "@/components/xp/NightFields";

export type TimeRange = { from: string; to: string };
type Mode = "any" | "start" | "before" | "between";

const modeOf = (v: TimeRange): Mode => (v.from && v.to ? "between" : v.to ? "before" : v.from ? "start" : "any");
const plus = (t: string, hours: number) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return "";
  return `${String(Math.max(0, Math.min(23, Number(m[1]) + hours))).padStart(2, "0")}:${m[2]}`;
};

/**
 * When in the day something may go (owner, Nov 16: "the time range can be something any item can have"):
 * any time, from one time ("At" for a habit, "After" for a quest), sometime before a time, or between two.
 * The quest editor's pills; the times are the parchment time picker.
 */
export function TimeRangePick({ value, onChange, startWord, small = false }: { value: TimeRange; onChange: (v: TimeRange) => void; /** What a lone start time means: a habit happens "At" it, a quest any time "After" it. */ startWord: "At" | "After"; small?: boolean }) {
  const [mode, setMode] = useState<Mode>(modeOf(value));
  const cls = `qe-fact flex items-center whitespace-nowrap rounded-full font-semibold ${small ? "h-7 px-2 text-[12px]" : "h-8 px-2.5 text-[12.5px]"}`;
  const soft = { color: "var(--t-ink-soft)" };
  const pick = (m: Mode) => {
    setMode(m);
    const from = value.from || (value.to ? plus(value.to, -3) : "09:00");
    const to = value.to || (value.from ? plus(value.from, 3) : "12:00");
    if (m === "any") onChange({ from: "", to: "" });
    else if (m === "start") onChange({ from, to: "" });
    else if (m === "before") onChange({ from: "", to });
    else onChange({ from, to });
  };
  const modes: [Mode, string][] = [["any", "Any time"], ["start", startWord], ["before", "Before"], ["between", "Between"]];
  return (
    <div data-time-range className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {modes.map(([m, label]) => (
          <button key={m} type="button" data-open={mode === m} aria-pressed={mode === m} onClick={() => pick(m)} className={cls}>
            {label}
          </button>
        ))}
      </div>
      {mode !== "any" && (
        <div className="reveal flex flex-wrap items-center gap-2 text-[13px]">
          {mode === "before" && <span style={soft}>sometime before</span>}
          {mode === "start" && startWord === "After" && <span style={soft}>any time after</span>}
          {mode !== "before" && <TimeToken value={value.from} onChange={(v) => onChange({ ...value, from: v })} label={mode === "between" ? "From" : startWord} kind="any" compact />}
          {mode === "between" && <span style={soft}>and</span>}
          {mode !== "start" && <TimeToken value={value.to} onChange={(v) => onChange({ ...value, to: v })} label={mode === "between" ? "Until" : "Before"} kind="any" compact />}
          {mode !== "start" || startWord === "After" ? <span style={soft}>the calendar finds it a free spot</span> : null}
        </div>
      )}
    </div>
  );
}
