"use client";

import { useState } from "react";
import { FACTORS, topReasons, type Scored } from "@/lib/priority";
import { Breakdown, Legend, Panel, Portrait, type LabTask } from "./shared";

/**
 * Your quests ranked by the weights you've set. Each bar is split into the
 * factors pulling it up, so the reason for its place is visible at a glance.
 * Tap a row for the full breakdown.
 */
export function Ladder<T extends LabTask>({ scored, isAdventure, onOpen }: { scored: Scored<T>[]; isAdventure: boolean; onOpen: (t: T) => void }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const top = scored[0]?.score || 1;
  const rows = all ? scored : scored.slice(0, 12);

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-3 px-4 py-4">
      <div className="relative z-[1]">
        <Legend />
      </div>
      <ol className="relative z-[1] m-0 flex list-none flex-col p-0">
        {rows.map((s, i) => {
          const why = topReasons(s.parts);
          const expanded = open === s.task.id;
          return (
            <li key={s.task.id} className="py-1.5" style={i ? { borderTop: "1px solid rgba(139,112,64,.18)" } : undefined}>
              <button type="button" onClick={() => setOpen(expanded ? null : s.task.id)} aria-expanded={expanded} className="flex w-full items-center gap-2.5 rounded-lg py-1 text-left hover:bg-black/[.03]">
                <span className="font-display w-6 shrink-0 text-right text-[16px] tabular-nums" style={{ color: "#6f5a24" }}>
                  {i + 1}
                </span>
                <Portrait t={s.task} size={30} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                      {s.task.title}
                    </span>
                    {why.length > 0 && (
                      <span className="hidden shrink-0 text-[12.5px] sm:inline" style={{ color: "var(--t-ink-soft)" }}>
                        {why.join(", ")}
                      </span>
                    )}
                  </span>
                  {/* Segments in fixed factor order with 2px gaps; bar length is the score. */}
                  <span className="flex h-2.5 gap-[2px]" style={{ width: `${Math.max(4, (s.score / top) * 100)}%` }} aria-hidden>
                    {FACTORS.filter((f) => s.parts[f.key] > 0.001).map((f, j, arr) => (
                      <span
                        key={f.key}
                        style={{
                          flexGrow: s.parts[f.key],
                          flexBasis: 0,
                          background: f.color,
                          borderRadius: `${j === 0 ? 4 : 0}px ${j === arr.length - 1 ? 4 : 0}px ${j === arr.length - 1 ? 4 : 0}px ${j === 0 ? 4 : 0}px`,
                        }}
                      />
                    ))}
                  </span>
                </span>
                <span className="w-8 shrink-0 text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--t-ink-soft)" }} title="Priority score out of 100">
                  {Math.round(s.score * 100)}
                </span>
              </button>
              {expanded && (
                <div className="ml-8 mt-1.5 flex flex-col gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,250,238,.55)" }}>
                  <Breakdown s={s} />
                  <button type="button" onClick={() => onOpen(s.task)} className="h-8 w-fit rounded-full px-3 text-[13px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                    Open quest
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {scored.length > 12 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="relative z-[1] w-fit text-[14px] underline" style={{ color: "var(--t-ink-soft)" }}>
          {all ? "Show the top 12" : `Show all ${scored.length}`}
        </button>
      )}
      {scored.length === 0 && (
        <p className="relative z-[1] m-0 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
          No open quests to weigh yet.
        </p>
      )}
    </Panel>
  );
}
