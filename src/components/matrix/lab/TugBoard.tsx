"use client";

import { useEffect, useRef, useState } from "react";
import { FACTORS, MAX_WEIGHT, hash01, type FactorKey, type Scored, type Weights } from "@/lib/priority";
import { Portrait, QuestTip, Swatch, type LabTask } from "./shared";

type Pos = { x: number; y: number };
const KEY = "tug-magnets";
/** Starting spots around the edges (0–1 across the board). */
const HOME: Record<FactorKey, Pos> = {
  importance: { x: 0.5, y: 0.06 },
  due: { x: 0.88, y: 0.06 },
  reward: { x: 0.12, y: 0.06 },
  urgency: { x: 0.92, y: 0.5 },
  quick: { x: 0.08, y: 0.5 },
  ease: { x: 0.12, y: 0.94 },
  momentum: { x: 0.5, y: 0.94 },
  stuck: { x: 0.88, y: 0.94 },
};
/** How strongly the center holds a quest that nothing pulls on. */
const ANCHOR = 0.6;

/**
 * Factors are magnets: drag them to any spot on the board, and set how hard
 * each one pulls with its slider. Quests drift toward the magnets they're
 * strong in; a quest nothing pulls on rests in the middle. (After Dust &
 * Magnet, Georgia Tech, 2005.)
 */
export function TugBoard<T extends LabTask>({
  scored,
  weights,
  onWeights,
  isAdventure,
  onOpen,
}: {
  scored: Scored<T>[];
  weights: Weights;
  onWeights: (w: Weights) => void;
  isAdventure: boolean;
  onOpen: (t: T) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const [magnets, setMagnets] = useState<Record<FactorKey, Pos>>(HOME);
  const [dragging, setDragging] = useState<FactorKey | null>(null);
  const [tip, setTip] = useState<{ s: Scored<T>; x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved spots are only readable after hydration
      if (raw) setMagnets({ ...HOME, ...(JSON.parse(raw) as Record<FactorKey, Pos>) });
    } catch {
      /* storage unavailable */
    }
  }, []);

  function moveTo(key: FactorKey, clientX: number, clientY: number) {
    const r = board.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0.05, Math.min(0.95, (clientX - r.left) / r.width));
    const y = Math.max(0.05, Math.min(0.95, (clientY - r.top) / r.height));
    setMagnets((m) => ({ ...m, [key]: { x, y } }));
  }

  function save(next: Record<FactorKey, Pos>) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  // Where each quest settles: a weighted pull toward every magnet, anchored to the center.
  const dust = scored.map((s, i) => {
    let x = 0.5 * ANCHOR;
    let y = 0.5 * ANCHOR;
    let total = ANCHOR;
    for (const f of FACTORS) {
      const pull = (weights[f.key] / MAX_WEIGHT) * s.values[f.key];
      x += pull * magnets[f.key].x;
      y += pull * magnets[f.key].y;
      total += pull;
    }
    const jx = (hash01(s.task.id) - 0.5) * 0.04;
    const jy = (hash01(`${s.task.id}y`) - 0.5) * 0.04;
    return { s, rank: i, x: x / total + jx, y: y / total + jy };
  });

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={board}
        className={`relative aspect-[4/3] w-full select-none overflow-visible rounded-2xl ${isAdventure ? "parchment parchment-framed" : ""}`}
        style={isAdventure ? { borderRadius: 18 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 18 }}
        onPointerMove={(e) => dragging && moveTo(dragging, e.clientX, e.clientY)}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(null);
          save(magnets);
        }}
        onClick={() => setTip(null)}
      >
        {/* Faint pull lines from the center to each live magnet. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 75" preserveAspectRatio="none" aria-hidden>
          {FACTORS.filter((f) => weights[f.key] > 0).map((f) => (
            <line key={f.key} x1="50" y1="37.5" x2={magnets[f.key].x * 100} y2={magnets[f.key].y * 75} stroke={f.color} strokeOpacity={0.12 + (weights[f.key] / MAX_WEIGHT) * 0.25} strokeWidth={0.4} strokeDasharray="1 1.2" />
          ))}
        </svg>

        {/* The quests, gliding as magnets move. */}
        {dust.map((d) => (
          <button
            key={d.s.task.id}
            type="button"
            aria-label={`${d.s.task.title}, priority ${Math.round(d.s.score * 100)}`}
            onPointerEnter={(e) => {
              if (e.pointerType !== "mouse" || dragging) return;
              const r = board.current!.getBoundingClientRect();
              setTip({ s: d.s, x: d.x * r.width, y: d.y * r.height, w: r.width, h: r.height });
            }}
            onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (tip?.s.task.id === d.s.task.id) return onOpen(d.s.task);
              const r = board.current!.getBoundingClientRect();
              setTip({ s: d.s, x: d.x * r.width, y: d.y * r.height, w: r.width, h: r.height });
            }}
            className="absolute z-[2] flex items-center gap-1 rounded-full"
            style={{
              left: `${d.x * 100}%`,
              top: `${d.y * 100}%`,
              transform: "translate(-50%, -50%)",
              transition: dragging ? "left 120ms linear, top 120ms linear" : "left 500ms cubic-bezier(.2,.8,.2,1), top 500ms cubic-bezier(.2,.8,.2,1)",
              padding: 2,
            }}
          >
            <span className="rounded-full" style={{ boxShadow: "0 0 0 2px #fbf3df, 0 2px 4px rgba(0,0,0,.25)" }}>
              <Portrait t={d.s.task} size={d.rank < 5 ? 26 : 20} />
            </span>
            {d.rank < 5 && (
              <span className="max-w-[110px] truncate rounded-md px-1 text-[11.5px] font-semibold" style={{ background: "rgba(251,243,223,.85)", color: "var(--t-ink)" }}>
                {d.s.task.title}
              </span>
            )}
          </button>
        ))}

        {/* The magnets: drag to place, slider to set the pull. */}
        {FACTORS.map((f) => {
          const m = magnets[f.key];
          const off = weights[f.key] === 0;
          return (
            <div
              key={f.key}
              className="absolute z-[3] flex flex-col items-center gap-0.5"
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, transform: "translate(-50%, -50%)", opacity: off ? 0.55 : 1 }}
            >
              <span
                role="button"
                tabIndex={0}
                aria-label={`${f.label} magnet — drag to move`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setDragging(f.key);
                  setTip(null);
                }}
                onPointerMove={(e) => dragging === f.key && moveTo(f.key, e.clientX, e.clientY)}
                onPointerUp={() => {
                  setDragging(null);
                  save(magnets);
                }}
                className={`flex h-7 touch-none items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold ${dragging === f.key ? "cursor-grabbing" : "cursor-grab"}`}
                style={{
                  background: "linear-gradient(180deg,#fbf0d2,#ecd7a4)",
                  border: "1.5px solid #8a6c2c",
                  color: "#2a1c10",
                  boxShadow: dragging === f.key ? "0 6px 14px rgba(0,0,0,.35)" : "0 2px 5px rgba(0,0,0,.25)",
                }}
              >
                <Swatch color={f.color} size={9} />
                {f.short}
              </span>
              <input
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={1}
                value={weights[f.key]}
                onChange={(e) => onWeights({ ...weights, [f.key]: Number(e.target.value) })}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={`${f.label} pull`}
                className="w-[64px] sm:w-[78px]"
                style={{ accentColor: f.color }}
              />
            </div>
          );
        })}

        {tip && <QuestTip s={tip.s} x={tip.x} y={tip.y} bounds={{ w: tip.w, h: tip.h }} onOpen={() => onOpen(tip.s.task)} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[13px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.9 }}>
          Drag a magnet anywhere; its slider sets how hard it pulls. Quests drift toward what they&apos;re strong in.
        </p>
        <button
          type="button"
          onClick={() => {
            setMagnets(HOME);
            save(HOME);
          }}
          className="text-[13px] underline"
          style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
        >
          Reset magnets
        </button>
      </div>
    </div>
  );
}
