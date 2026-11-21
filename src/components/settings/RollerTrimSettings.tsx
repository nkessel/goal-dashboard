"use client";

import { RollerTrimMark, useRollerTrim, type RollerTrim } from "@/components/boards/RollerTrim";

const CHOICES: { id: RollerTrim; label: string }[] = [
  { id: "ornaments", label: "Ornaments" },
  { id: "lines", label: "Lines" },
  { id: "plain", label: "Plain" },
];

/** Settings › Boards: how the roller under a board's scroll is trimmed (this device). */
export function RollerTrimSettings() {
  const [trim, setTrim] = useRollerTrim();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--t-ink)" }}>Roller trim</span>
        <div role="radiogroup" aria-label="Roller trim" className="flex gap-1.5">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={trim === c.id}
              onClick={() => setTrim(c.id)}
              className="h-8 rounded-full border px-3 text-[12.5px]"
              style={{
                borderColor: "var(--t-gold)",
                background: trim === c.id ? "var(--t-gold)" : "transparent",
                color: trim === c.id ? "#3a2a0c" : "var(--t-ink)",
                fontWeight: trim === c.id ? 600 : 400,
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-pull" style={{ position: "relative", height: 24, borderRadius: 7, cursor: "default" }} aria-hidden>
        <span className="scroll-pull-count">
          <RollerTrimMark side="l" trim={trim} />
          <svg width="9" height="9" viewBox="0 0 12 12"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          1 more
          <RollerTrimMark side="r" trim={trim} />
        </span>
      </div>
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>On this device. The preview is how a board scroll&apos;s bottom roller looks.</p>
    </div>
  );
}
