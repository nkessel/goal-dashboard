"use client";

import { useState } from "react";
import { Panel, Portrait, type LabTask } from "./shared";

const D = 86_400_000;
/** The pull at which a quest starts to feel worth doing. */
const THRESHOLD = 0.25;
const DULLING = [
  { k: 0.4, label: "A little" },
  { k: 1, label: "Some" },
  { k: 2, label: "A lot" },
];

const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/**
 * After Piers Steel's procrastination equation: the pull of a task is
 * expectancy × value, divided by (1 + delay sensitivity × time left). As a
 * deadline nears, the pull rises. This shows when each quest will start to
 * feel urgent, and whether that's later than when you'd need to start.
 */
export function MotivationForecast<T extends LabTask>({ tasks, now, isAdventure, onOpen }: { tasks: T[]; now: number; isAdventure: boolean; onOpen: (t: T) => void }) {
  const [dull, setDull] = useState(1);

  const items = tasks
    .map((t) => {
      const iso = t.due_at ?? (t.is_on_calendar ? t.scheduled_start : null);
      if (!iso) return null;
      const due = new Date(iso).getTime();
      if (due < now || due > now + 45 * D) return null;
      const effort = t.effort ?? 0;
      const E = 0.35 + 0.65 * (effort > 0 ? 1 - (effort - 1) / 4 : 0.5);
      const V = 0.3 + 0.7 * ((t.importance ?? 0) / 5);
      // Days ahead it starts to feel worth doing: E·V / (1 + k·d) = threshold.
      const feltDays = Math.max(0, (E * V / THRESHOLD - 1) / dull);
      const felt = due - feltDays * D;
      // When you'd need to begin: a day of slack plus the work itself (about 3 focused hours a day).
      const leadDays = 1 + (t.estimate_minutes ?? 60) / 60 / 3;
      const needed = due - leadDays * D;
      return { t, due, E, V, felt, needed, late: felt > needed };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => Number(b.late) - Number(a.late) || a.needed - b.needed);

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-3 px-4 py-4">
      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 max-w-[460px] text-[13.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
          A quest pulls harder as its deadline nears. Where the curve crosses the dashed line, it starts to feel worth doing. Start by the gold line.
        </p>
        <div role="radiogroup" aria-label="How much distance dulls things for you" className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--t-ink)" }}>
          <span style={{ color: "var(--t-ink-soft)" }}>Distance dulls things</span>
          {DULLING.map((d) => (
            <button key={d.k} type="button" role="radio" aria-checked={dull === d.k} onClick={() => setDull(d.k)} className="h-8 rounded-full px-2.5 font-semibold" style={{ background: dull === d.k ? "rgba(217,180,95,.5)" : "rgba(70,50,20,.07)", border: `1.5px solid ${dull === d.k ? "#a88a3f" : "transparent"}` }}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="relative z-[1] m-0 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
          No quests with a due date in the next six weeks. Give one a due date and its forecast appears here.
        </p>
      ) : (
        <ul className="relative z-[1] m-0 flex list-none flex-col gap-2.5 p-0">
          {items.map(({ t, due, E, V, felt, needed, late }) => {
            const W = 300;
            const H = 54;
            const span = Math.max(due - now, D / 4);
            const x = (time: number) => 4 + ((time - now) / span) * (W - 8);
            const y = (m: number) => H - 4 - Math.min(1, m / 0.7) * (H - 10);
            const pts = Array.from({ length: 40 }, (_, i) => {
              const time = now + (i / 39) * span;
              const d = (due - time) / D;
              return `${x(time)},${y((E * V) / (1 + dull * d))}`;
            }).join(" ");
            const startBy = Math.max(now, needed);
            return (
              <li key={t.id}>
                <button type="button" onClick={() => onOpen(t)} className="flex w-full flex-col gap-1 rounded-xl px-3 py-2.5 text-left hover:bg-black/[.03]" style={{ background: "rgba(255,250,238,.55)", border: `1px solid ${late ? "rgba(176,64,44,.5)" : "rgba(139,112,64,.3)"}` }}>
                  <span className="flex items-center gap-2">
                    <Portrait t={t} size={24} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                      {t.title}
                    </span>
                    <span className="shrink-0 text-[12.5px]" style={{ color: "#5a4a30" }}>
                      due {fmt(due)}
                    </span>
                  </span>
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
                    <line x1={4} x2={W - 4} y1={y(THRESHOLD)} y2={y(THRESHOLD)} stroke="rgba(90,70,30,.45)" strokeDasharray="3 3" />
                    <polyline points={pts} fill="none" stroke="#6f4f12" strokeWidth="2" strokeLinejoin="round" />
                    <line x1={x(startBy)} x2={x(startBy)} y1={4} y2={H - 4} stroke="#c9a14e" strokeWidth="2" />
                    {felt > now && felt < due && <circle cx={x(felt)} cy={y(THRESHOLD)} r={3.5} fill={late ? "#b0402c" : "#3f6a2c"} stroke="#fbf3df" strokeWidth="2" />}
                  </svg>
                  <span className="text-[13px] leading-snug" style={{ color: late ? "#a33a26" : "#3f5a2c", fontWeight: 600 }}>
                    {needed <= now
                      ? "Start now: there's no slack left before it's due."
                      : late
                        ? `It won't feel urgent until ${fmt(felt)}, after you'd need to start. Plan it for ${fmt(needed)}.`
                        : `You'll likely feel ready by ${fmt(Math.max(now, felt))}, in time to start by ${fmt(needed)}.`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
