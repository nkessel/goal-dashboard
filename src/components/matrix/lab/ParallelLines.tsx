"use client";

import { useRef, useState } from "react";
import { FACTORS, type Scored } from "@/lib/priority";
import { Panel, QuestTip, type LabTask } from "./shared";

const W = 420;
const H = 260;
const TOP = 34;
const BOTTOM = 16;
const AXES = [...FACTORS.map((f) => ({ key: f.key as string, label: f.short })), { key: "score", label: "Priority" }];

function ramp(v: number) {
  const a = [214, 190, 130];
  const b = [107, 68, 16];
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, v))));
  return `rgb(${c.join(",")})`;
}

/**
 * Every factor is an upright axis and each quest is a line across them.
 * Drag along an axis to keep only quests in that range; tap the axis name
 * to clear it. Darker lines rank higher.
 */
export function ParallelLines<T extends LabTask>({ scored, isAdventure, onOpen }: { scored: Scored<T>[]; isAdventure: boolean; onOpen: (t: T) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [brush, setBrush] = useState<Record<string, [number, number]>>({});
  const [drag, setDrag] = useState<{ key: string; from: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ s: Scored<T>; x: number; y: number; w: number; h: number } | null>(null);

  const top = scored[0]?.score || 1;
  const step = (W - 40) / (AXES.length - 1);
  const ax = (i: number) => 20 + i * step;
  const ay = (v: number) => H - BOTTOM - v * (H - TOP - BOTTOM);
  const valueOf = (s: Scored<T>, key: string) => (key === "score" ? s.score / top : s.values[key as keyof typeof s.values]);
  const inBrush = (s: Scored<T>) => Object.entries(brush).every(([k, [lo, hi]]) => {
    const v = valueOf(s, k);
    return v >= lo && v <= hi;
  });

  function toValue(clientY: number) {
    const r = svg.current!.getBoundingClientRect();
    const y = ((clientY - r.top) / r.height) * H;
    return Math.max(0, Math.min(1, (H - BOTTOM - y) / (H - TOP - BOTTOM)));
  }

  const kept = scored.filter(inBrush).length;

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-2 px-3 py-4">
      <div ref={wrap} className="relative z-[1]" onClick={() => setTip(null)}>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" role="img" aria-label="Each quest as a line across every factor">
          {/* Lines first, faded ones under kept ones. */}
          {[...scored].reverse().map((s) => {
            const keep = inBrush(s);
            const pts = AXES.map((a, i) => `${ax(i)},${ay(valueOf(s, a.key))}`).join(" ");
            const hot = hover === s.task.id;
            return (
              <polyline
                key={s.task.id}
                points={pts}
                fill="none"
                stroke={keep ? ramp(s.score / top) : "rgba(90,70,30,.12)"}
                strokeWidth={hot ? 3.5 : 2}
                strokeLinejoin="round"
                style={{ cursor: "pointer", transition: "stroke 200ms" }}
                onPointerEnter={(e) => {
                  setHover(s.task.id);
                  if (e.pointerType === "mouse") {
                    const b = wrap.current!.getBoundingClientRect();
                    const r = svg.current!.getBoundingClientRect();
                    setTip({ s, x: e.clientX - b.left, y: e.clientY - b.top - (r.top - b.top), w: b.width, h: b.height });
                  }
                }}
                onPointerLeave={() => {
                  setHover(null);
                  setTip(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tip?.s.task.id === s.task.id) return onOpen(s.task);
                  const b = wrap.current!.getBoundingClientRect();
                  setTip({ s, x: e.clientX - b.left, y: e.clientY - b.top, w: b.width, h: b.height });
                }}
              />
            );
          })}
          {/* Axes, labels, and brushes. */}
          {AXES.map((a, i) => {
            const b = brush[a.key];
            return (
              <g key={a.key}>
                <line x1={ax(i)} x2={ax(i)} y1={ay(0)} y2={ay(1)} stroke="rgba(90,70,30,.45)" strokeWidth="1" />
                <text
                  x={ax(i)}
                  y={TOP - 14}
                  textAnchor="middle"
                  fontSize="10"
                  fill={b ? "#6f4f12" : "#4d4535"}
                  fontWeight={b ? 700 : 400}
                  style={{ cursor: b ? "pointer" : "default" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBrush((x) => {
                      const n = { ...x };
                      delete n[a.key];
                      return n;
                    });
                  }}
                >
                  {a.label}
                </text>
                {b && <rect x={ax(i) - 6} y={ay(b[1])} width={12} height={Math.max(2, ay(b[0]) - ay(b[1]))} rx={3} fill="rgba(242,210,126,.55)" stroke="#8a6116" strokeWidth="1" />}
                {/* Generous hit area for brushing. */}
                <rect
                  x={ax(i) - step / 2.4}
                  y={ay(1)}
                  width={(step / 2.4) * 2}
                  height={ay(0) - ay(1)}
                  fill="transparent"
                  style={{ cursor: "ns-resize", touchAction: "none" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as Element).setPointerCapture(e.pointerId);
                    const v = toValue(e.clientY);
                    setDrag({ key: a.key, from: v });
                    setBrush((x) => ({ ...x, [a.key]: [v, v] }));
                  }}
                  onPointerMove={(e) => {
                    if (drag?.key !== a.key) return;
                    const v = toValue(e.clientY);
                    setBrush((x) => ({ ...x, [a.key]: [Math.min(drag.from, v), Math.max(drag.from, v)] }));
                  }}
                  onPointerUp={() => {
                    // A tap without a drag clears this axis.
                    const b2 = brush[a.key];
                    if (b2 && b2[1] - b2[0] < 0.02) {
                      setBrush((x) => {
                        const n = { ...x };
                        delete n[a.key];
                        return n;
                      });
                    }
                    setDrag(null);
                  }}
                />
              </g>
            );
          })}
          <text x={4} y={ay(1) + 3} fontSize="9" fill="#7a6a4c">
            high
          </text>
          <text x={4} y={ay(0)} fontSize="9" fill="#7a6a4c">
            low
          </text>
        </svg>
        {tip && <QuestTip s={tip.s} x={tip.x} y={tip.y} bounds={{ w: tip.w, h: tip.h }} onOpen={() => onOpen(tip.s.task)} />}
      </div>
      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2 px-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
        <span>{Object.keys(brush).length ? `${kept} of ${scored.length} quests in range` : "Drag along any axis to narrow it down. Darker lines rank higher."}</span>
        {Object.keys(brush).length > 0 && (
          <button type="button" onClick={() => setBrush({})} className="underline">
            Clear all
          </button>
        )}
      </div>
    </Panel>
  );
}
