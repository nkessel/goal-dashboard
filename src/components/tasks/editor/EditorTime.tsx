"use client";

import { ESTIMATE_PICKS } from "./dates";

/** Time to complete: 5, 10, 15 or 30 minutes, or your own (owner, Nov 3). The minutes stay with the dialog (Save and drafts read them). */
export function EditorTime({ doingNow, labelCls, chipBorder, estimate, estOther, setEstOther, pickEstimate }: {
  doingNow: boolean;
  labelCls: string;
  chipBorder: string;
  estimate: string;
  estOther: boolean;
  setEstOther: (b: boolean) => void;
  pickEstimate: (v: string) => void;
}) {
  return (
    <>
    {/* Time to complete */}
    {!doingNow && (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- same clock glyph as the quest card */}
          <img src="/design/ui-clock.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
          <span className={`${labelCls} shrink-0`}>Time</span>
          {/* 5, 10, 15 or 30 minutes, or your own (owner, Nov 3). */}
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {ESTIMATE_PICKS.map((m) => {
              const on = Number(estimate) === m && !estOther;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (setEstOther(false), pickEstimate(on ? "" : String(m)))}
                  className="h-8 min-w-10 rounded-full px-2.5 text-[13px] font-semibold tabular-nums"
                  style={on ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" } : { border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: "rgba(255,250,235,.35)" }}
                >
                  {m}m
                </button>
              );
            })}
            {estOther ? (
              <span className="reveal flex h-8 items-center gap-1 rounded-full border pl-1 pr-2.5" style={{ borderColor: "#8a6116" }}>
                <input
                  type="number"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  inputMode="numeric"
                  min={0}
                  step={5}
                  value={estimate}
                  onChange={(e) => pickEstimate(e.target.value)}
                  placeholder="—"
                  aria-label="Minutes to complete"
                  // One colour inside the pill: no field wash behind the number (owner, Nov 5).
                  style={{ background: "transparent", boxShadow: "none" }}
                  className="bare-input h-7 w-14 rounded-full border-0 bg-transparent px-1 text-center text-[16px] tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                  min
                </span>
              </span>
            ) : (
              <button type="button" onClick={() => setEstOther(true)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: "rgba(255,250,235,.35)" }}>
                Other
              </button>
            )}
          </span>
        </div>
      </div>
    )}
    </>
  );
}
