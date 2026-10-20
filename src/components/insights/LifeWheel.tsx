"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLifeWheelAction } from "@/app/actions";
import { snapTo, useSliderStep } from "@/lib/use-slider-step";

const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
export const DEFAULT_WHEEL = ["Health", "Relationships", "Career", "Money", "Fun", "Growth", "Home", "Spirit"];
const R = 120;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * The life wheel: one spoke per area of life. Drag a point along its spoke
 * (or use the sliders) to say how that area feels right now, then check in.
 * Your last check-in shows faintly behind, so you can see what moved.
 */
export function LifeWheel({ topics: initialTopics, last }: { topics: string[]; last: Record<string, { level: number; at: string }> }) {
  const router = useRouter();
  const [topics] = useState(initialTopics.length ? initialTopics : DEFAULT_WHEEL);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries((initialTopics.length ? initialTopics : DEFAULT_WHEEL).map((t) => [t, last[t]?.level ?? 5])));
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const step = useSliderStep();
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);

  const n = topics.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number) => [Math.cos(ang(i)) * (v / 10) * R, Math.sin(ang(i)) * (v / 10) * R] as const;
  const poly = (get: (t: string) => number | undefined) =>
    topics
      .map((t, i) => {
        const v = get(t);
        return v === undefined ? null : pt(i, v);
      })
      .filter((p): p is readonly [number, number] => !!p)
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
  const hasLast = topics.some((t) => last[t]);

  function setVal(t: string, v: number) {
    setSaved(null);
    setVals((o) => ({ ...o, [t]: Math.max(1, Math.min(10, Math.round(snapTo(v, step) * 10) / 10)) }));
  }
  /** Where the pointer is, in wheel units. */
  function at(e: React.PointerEvent) {
    const el = svg.current!;
    const r = el.getBoundingClientRect();
    const scale = r.width / 320;
    return { x: (e.clientX - r.left) / scale - 160, y: (e.clientY - r.top) / scale - 160 };
  }
  function dragTo(e: React.PointerEvent) {
    const t = dragging.current;
    if (!t || !svg.current) return;
    const i = topics.indexOf(t);
    const { x, y } = at(e);
    // Distance along the spoke.
    const along = x * Math.cos(ang(i)) + y * Math.sin(ang(i));
    setVal(t, (along / R) * 10);
  }
  /** Press anywhere on the wheel: the nearest spoke's marker jumps there, and follows the drag. */
  function grab(e: React.PointerEvent<SVGSVGElement>) {
    if (!svg.current) return;
    const { x, y } = at(e);
    if (Math.hypot(x, y) > R * 1.12) return;
    const a = Math.atan2(y, x);
    let best = 0;
    let bestD = Infinity;
    topics.forEach((_, i) => {
      const d = Math.abs(Math.atan2(Math.sin(a - ang(i)), Math.cos(a - ang(i))));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    dragging.current = topics[best];
    e.currentTarget.setPointerCapture(e.pointerId);
    dragTo(e);
  }
  function checkIn() {
    setError(null);
    start(async () => {
      try {
        await saveLifeWheelAction(topics.map((t) => ({ topic: t, level: vals[t] ?? 5 })));
        setSaved(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        <svg
          ref={svg}
          viewBox="-160 -160 320 320"
          className="w-full max-w-[340px] touch-none select-none"
          role="img"
          aria-label="Life wheel"
          onPointerDown={grab}
          onPointerMove={dragTo}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        >
          {[2, 4, 6, 8, 10].map((r) => (
            <circle key={r} r={(r / 10) * R} fill={r === 10 ? "rgba(255,250,235,.55)" : "none"} stroke="rgba(110,85,40,.25)" strokeWidth={r === 10 ? 1.4 : 0.8} />
          ))}
          {topics.map((t, i) => {
            const [x, y] = pt(i, 10);
            const [lx, ly] = pt(i, 11.9);
            return (
              <g key={t}>
                <line x1="0" y1="0" x2={x} y2={y} stroke="rgba(110,85,40,.3)" strokeWidth=".8" />
                <text x={lx} y={ly} textAnchor={Math.abs(lx) < 8 ? "middle" : lx > 0 ? "start" : "end"} dominantBaseline="middle" fontSize={n > 8 ? 10 : 11.5} fontWeight="600" fill={INK}>
                  {t}
                </text>
              </g>
            );
          })}
          {hasLast && <polygon points={poly((t) => last[t]?.level)} fill="rgba(110,85,40,.08)" stroke="rgba(110,85,40,.45)" strokeWidth="1.2" strokeDasharray="3 3" />}
          <polygon points={poly((t) => vals[t])} fill="rgba(217,180,95,.35)" stroke="#a8761c" strokeWidth="2" strokeLinejoin="round" />
          {topics.map((t, i) => {
            const [x, y] = pt(i, vals[t] ?? 5);
            const [vx, vy] = pt(i, Math.min(10, (vals[t] ?? 5) + 1.3));
            return (
              <g key={t} style={{ cursor: "grab" }}>
                {/* A generous, invisible grip around each marker for fingers. */}
                <circle cx={x} cy={y} r="18" fill="transparent" />
                <circle cx={x} cy={y} r="8.5" fill="#f2d27e" stroke="#5a3e12" strokeWidth="1.6" />
                <text x={vx} y={vy} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#5a3e12" style={{ pointerEvents: "none" }}>
                  {fmt(vals[t] ?? 5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={checkIn} disabled={pending} className="hover-glow h-10 rounded-full px-5 text-[14.5px] font-bold disabled:opacity-60" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          {pending ? "Saving…" : "Check in the wheel"}
        </button>
        <span className="text-[12.5px]" style={{ color: INK_SOFT }}>
          Drag a marker, or tap along a spoke · the areas are your top-level boards
        </span>
        {saved && <span className="text-[13px]" style={{ color: INK_SOFT }}>✓ Checked in at {saved}</span>}
        {!saved && hasLast && <span className="text-[12.5px]" style={{ color: INK_SOFT }}>Dashed: your last wheel</span>}
      </div>
    </div>
  );
}
