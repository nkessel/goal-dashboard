"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";

/** How long to snooze: a time it comes back (`until`), or "tomorrow" (to the top of tomorrow's plan). */
export type SnoozeChoice = { tomorrow: true } | { until: Date; label: string };

const INK = "#2a1c10";
// The clock, read when the picker draws (it opens fresh each time).
const clock = () => Date.now();
const SOFT = "#6b5631";

/**
 * Snooze a quest: 30 minutes, 2 hours, tomorrow, or Other… (this evening,
 * 4 hours, or a time you pick). Other always has a way back; closing changes
 * nothing.
 */
export function SnoozePicker({ title, onPick, onClose }: { title: string; onPick: (c: SnoozeChoice) => void; onClose: () => void }) {
  const [other, setOther] = useState(false);
  const [at, setAt] = useState("");
  useEscape(() => (other ? setOther(false) : onClose()));
  const inMin = (m: number, label: string): SnoozeChoice => ({ until: new Date(clock() + m * 60_000), label });
  const evening = () => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  };
  const choice = (label: string, run: () => void, hint?: string) => (
    <button key={label} type="button" onClick={run} className="snooze-choice flex h-10 items-center justify-between rounded-xl px-3.5 text-left text-[14.5px] font-semibold" style={{ color: INK }}>
      {label}
      {hint && (
        <span className="text-[12px] font-normal" style={{ color: SOFT }}>
          {hint}
        </span>
      )}
    </button>
  );
  const hm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const picked = at ? new Date(at) : null;
  const pickedOk = !!picked && Number.isFinite(picked.getTime()) && picked.getTime() > clock();

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "var(--t-overlay, rgba(10,8,4,.55))" }} onClick={(e) => (e.stopPropagation(), onClose())} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key !== "Escape" && e.stopPropagation()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Snooze until…"
        className="card-pop-in relative flex w-full max-w-[320px] flex-col gap-1.5 rounded-2xl p-3.5"
        style={{ background: "linear-gradient(180deg,#fbf3df,#f1e3c0)", border: "1.5px solid #a88a3f", boxShadow: "0 16px 40px rgba(0,0,0,.45)", color: INK }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none" style={{ color: SOFT }}>
          ×
        </button>
        <div className="flex items-center gap-1.5 pr-8">
          {other && (
            <button type="button" onClick={() => setOther(false)} aria-label="Back to the choices" className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-[18px]" style={{ color: SOFT }}>
              ‹
            </button>
          )}
          <h3 className="m-0 font-display text-[18px]">Snooze until…</h3>
        </div>
        <p className="m-0 mb-1 truncate text-[12.5px]" style={{ color: SOFT }}>
          {title}
        </p>
        {!other ? (
          <div key="main" className="reveal flex flex-col gap-1">
            {choice("30 minutes", () => onPick(inMin(30, "for 30 minutes")), hm(new Date(clock() + 30 * 60_000)))}
            {choice("2 hours", () => onPick(inMin(120, "for 2 hours")), hm(new Date(clock() + 120 * 60_000)))}
            {choice("Tomorrow", () => onPick({ tomorrow: true }), "top of tomorrow's plan")}
            {choice("Other…", () => setOther(true))}
          </div>
        ) : (
          <div key="other" className="reveal flex flex-col gap-1">
            {evening().getTime() - clock() > 30 * 60_000 && choice("This evening", () => onPick({ until: evening(), label: "until this evening" }), hm(evening()))}
            {choice("4 hours", () => onPick(inMin(240, "for 4 hours")), hm(new Date(clock() + 240 * 60_000)))}
            <label className="mt-1 flex flex-col gap-1 text-[12.5px] font-semibold" style={{ color: SOFT }}>
              Pick a time
              <span className="flex items-center gap-1.5">
                <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="time-field h-10 min-w-0 flex-1 rounded-xl px-2.5 text-[15px] font-normal" />
                <button type="button" disabled={!pickedOk} onClick={() => picked && onPick({ until: picked, label: `until ${picked.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` })} className="h-10 shrink-0 rounded-full px-4 text-[14px] font-semibold disabled:opacity-40" style={{ background: "var(--t-gold, #e2bb5c)", color: INK, border: "1px solid #8a6116" }}>
                  Snooze
                </button>
              </span>
            </label>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
