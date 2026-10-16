"use client";

import { useState } from "react";
import { FACTORS, MAX_WEIGHT, PRESETS, type FactorKey, type Scored, type Weighable, type Weights } from "@/lib/priority";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";

export type LabTask = Weighable & { description?: string | null };

/** The parchment (or card) surface every view sits on. */
export function Panel({ isAdventure, children, className = "", style }: { isAdventure: boolean; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`relative rounded-2xl ${isAdventure ? "parchment parchment-framed" : ""} ${className}`}
      style={isAdventure ? { borderRadius: 18, ...style } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 18, ...style }}
    >
      {children}
    </div>
  );
}

export function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-[3px]" style={{ width: size, height: size, background: color }} />;
}

/** Presets and one slider per factor. Every view reads the same weights. */
export function WeightsPanel({
  weights,
  onChange,
  isAdventure,
  only,
  defaultOpen = false,
  title = "What matters right now",
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
  isAdventure: boolean;
  /** Limit to these factors (e.g. the magnets on the tug board). */
  only?: FactorKey[];
  defaultOpen?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const preset = PRESETS.find((p) => FACTORS.every((f) => p.weights[f.key] === weights[f.key]));
  const shown = FACTORS.filter((f) => !only || only.includes(f.key));
  return (
    <Panel isAdventure={isAdventure} className="px-4 py-3">
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`mr-auto flex items-center gap-2 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
          {title}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 200ms" }}>
            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div role="radiogroup" aria-label="Presets" className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const on = preset?.key === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ...p.weights })}
                className="h-8 rounded-full px-3 text-[13px] font-semibold"
                style={{ background: on ? (isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)") : "rgba(70,50,20,.07)", border: `1.5px solid ${on ? "#8a6116" : "transparent"}`, color: on && !isAdventure ? "#fff" : "var(--t-ink)" }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      {open && (
        <div className="relative z-[1] mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {shown.map((f) => (
            <label key={f.key} className="flex items-center gap-2.5 text-[14px]" style={{ color: "var(--t-ink)" }} title={f.about}>
              <Swatch color={f.color} />
              <span className="w-[86px] shrink-0">{f.label}</span>
              <input
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={1}
                value={weights[f.key]}
                onChange={(e) => onChange({ ...weights, [f.key]: Number(e.target.value) })}
                aria-label={`${f.label} weight`}
                className="min-w-0 flex-1"
                style={{ accentColor: isAdventure ? "#8a6c2c" : "var(--t-accent)" }}
              />
              <span className="w-4 text-right tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                {weights[f.key]}
              </span>
            </label>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** The quest's portrait, or its monogram. */
export function Portrait({ t, size }: { t: LabTask; size: number }) {
  const art = t.icon_source === "ai" || t.icon_source === "library" ? t.icon_key : null;
  return (
    <span className="inline-flex shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
        <img src={art} alt="" className="h-full w-full object-cover" />
      ) : (
        <QuestMonogram id={t.id} title={t.title} size={size} />
      )}
    </span>
  );
}

/** A readable breakdown: every factor named, its weight's share as a bar. Doubles as the table view. */
export function Breakdown<T extends LabTask>({ s }: { s: Scored<T> }) {
  const max = Math.max(...FACTORS.map((f) => s.parts[f.key]), 0.001);
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {FACTORS.filter((f) => s.parts[f.key] > 0.001).map((f) => (
        <li key={f.key} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--t-ink)" }}>
          <Swatch color={f.color} size={8} />
          <span className="w-[74px] shrink-0">{f.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.1)" }}>
            <span className="block h-full rounded-full" style={{ width: `${(s.parts[f.key] / max) * 100}%`, background: f.color }} />
          </span>
          <span className="w-7 text-right tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
            {Math.round(s.values[f.key] * 100)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Floating card for a hovered/tapped quest: title, score, why, and Open. */
export function QuestTip<T extends LabTask>({ s, x, y, bounds, onOpen }: { s: Scored<T>; x: number; y: number; bounds: { w: number; h: number }; onOpen: () => void }) {
  const W = 240;
  const left = Math.max(6, Math.min(bounds.w - W - 6, x + 14));
  const below = y < bounds.h * 0.55;
  return (
    <div
      role="tooltip"
      className="card-pop-in absolute z-30 flex flex-col gap-1.5 rounded-xl px-3 py-2.5 shadow-xl"
      style={{ left, ...(below ? { top: y + 14 } : { bottom: bounds.h - y + 14 }), width: W, background: "#fbf3df", border: "1.5px solid #a58c66", color: "var(--t-ink)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Portrait t={s.task} size={26} />
        <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight">{s.task.title}</span>
        <span className="text-[13px] font-bold tabular-nums" title="Priority score">
          {Math.round(s.score * 100)}
        </span>
      </div>
      <Breakdown s={s} />
      <button type="button" onClick={onOpen} className="mt-0.5 h-8 w-fit rounded-full px-3 text-[13px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
        Open quest
      </button>
    </div>
  );
}

/** The factor legend: always present, every factor named in text. */
export function Legend({ keys }: { keys?: FactorKey[] }) {
  return (
    <ul aria-label="Factors" className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[12.5px]" style={{ color: "var(--t-ink)" }}>
      {FACTORS.filter((f) => !keys || keys.includes(f.key)).map((f) => (
        <li key={f.key} className="flex items-center gap-1.5">
          <Swatch color={f.color} />
          {f.label}
        </li>
      ))}
    </ul>
  );
}
