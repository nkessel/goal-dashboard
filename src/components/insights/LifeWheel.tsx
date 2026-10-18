"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLifeWheelAction, setLifeWheelTopicsAction } from "@/app/actions";
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
  const [topics, setTopics] = useState(initialTopics.length ? initialTopics : DEFAULT_WHEEL);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries((initialTopics.length ? initialTopics : DEFAULT_WHEEL).map((t) => [t, last[t]?.level ?? 5])));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
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
  function dragTo(e: React.PointerEvent) {
    const t = dragging.current;
    const el = svg.current;
    if (!t || !el) return;
    const i = topics.indexOf(t);
    const r = el.getBoundingClientRect();
    const scale = r.width / 320;
    const x = (e.clientX - r.left) / scale - 160;
    const y = (e.clientY - r.top) / scale - 160;
    // Distance along the spoke.
    const along = x * Math.cos(ang(i)) + y * Math.sin(ang(i));
    setVal(t, (along / R) * 10);
  }
  function saveTopics(next: string[]) {
    setTopics(next);
    setVals((o) => Object.fromEntries(next.map((t) => [t, o[t] ?? last[t]?.level ?? 5])));
    start(async () => {
      try {
        await setLifeWheelTopicsAction(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
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
          onPointerMove={dragTo}
          onPointerUp={() => (dragging.current = null)}
          onPointerLeave={() => (dragging.current = null)}
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
                <text x={lx} y={ly} textAnchor={Math.abs(lx) < 8 ? "middle" : lx > 0 ? "start" : "end"} dominantBaseline="middle" fontSize="11.5" fontWeight="600" fill={INK}>
                  {t}
                </text>
              </g>
            );
          })}
          {hasLast && <polygon points={poly((t) => last[t]?.level)} fill="rgba(110,85,40,.08)" stroke="rgba(110,85,40,.45)" strokeWidth="1.2" strokeDasharray="3 3" />}
          <polygon points={poly((t) => vals[t])} fill="rgba(217,180,95,.35)" stroke="#a8761c" strokeWidth="2" strokeLinejoin="round" />
          {topics.map((t, i) => {
            const [x, y] = pt(i, vals[t] ?? 5);
            return (
              <circle
                key={t}
                cx={x}
                cy={y}
                r="8"
                fill="#f2d27e"
                stroke="#5a3e12"
                strokeWidth="1.6"
                style={{ cursor: "grab" }}
                onPointerDown={(e) => {
                  dragging.current = t;
                  (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                }}
              />
            );
          })}
        </svg>
      </div>

      <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 sm:grid-cols-2">
        {topics.map((t) => (
          <li key={t} className="flex items-center gap-2">
            {editing ? (
              <>
                <input
                  defaultValue={t}
                  onBlur={(e) => {
                    const v = e.target.value.replace(/\s+/g, " ").trim().slice(0, 20);
                    if (v && v !== t && !topics.includes(v)) saveTopics(topics.map((x) => (x === t ? v : x)));
                  }}
                  aria-label={`Rename ${t}`}
                  className="h-8 min-w-0 flex-1 rounded-md border px-2 text-[14px]"
                  style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: INK }}
                />
                <button type="button" onClick={() => topics.length > 3 && saveTopics(topics.filter((x) => x !== t))} disabled={topics.length <= 3} aria-label={`Remove ${t}`} className="h-8 w-8 shrink-0 rounded-full text-[17px] disabled:opacity-30" style={{ color: INK_SOFT }}>
                  ×
                </button>
              </>
            ) : (
              <>
                <span className="w-[96px] shrink-0 truncate text-[14px] font-semibold" style={{ color: INK }}>
                  {t}
                </span>
                <input type="range" min={1} max={10} step={step} value={vals[t] ?? 5} onChange={(e) => setVal(t, Number(e.target.value))} aria-label={`${t}, 1 to 10`} className="min-w-0 flex-1" />
                <span className="w-8 shrink-0 text-right font-display text-[16px] tabular-nums" style={{ color: INK }}>
                  {fmt(vals[t] ?? 5)}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {editing && topics.length < 12 && (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() && !topics.includes(draft.trim())) {
                saveTopics([...topics, draft.trim().slice(0, 20)]);
                setDraft("");
              }
            }}
            maxLength={20}
            placeholder="Another area…"
            aria-label="Add an area"
            className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[15px]"
            style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: INK }}
          />
          <button
            type="button"
            onClick={() => {
              if (draft.trim() && !topics.includes(draft.trim())) {
                saveTopics([...topics, draft.trim().slice(0, 20)]);
                setDraft("");
              }
            }}
            className="h-9 rounded-full px-3.5 text-[13.5px] font-bold"
            style={{ background: "#2a1c10", color: "#f2d27e" }}
          >
            Add
          </button>
        </div>
      )}
      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={checkIn} disabled={pending || editing} className="hover-glow h-10 rounded-full px-5 text-[14.5px] font-bold disabled:opacity-60" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          {pending ? "Saving…" : "Check in the wheel"}
        </button>
        <button type="button" onClick={() => setEditing((v) => !v)} className="text-[13.5px] underline underline-offset-2" style={{ color: INK_SOFT }}>
          {editing ? "Done editing areas" : "Edit areas"}
        </button>
        {saved && <span className="text-[13px]" style={{ color: INK_SOFT }}>✓ Checked in at {saved}</span>}
        {!saved && hasLast && <span className="text-[12.5px]" style={{ color: INK_SOFT }}>Dashed: your last wheel</span>}
      </div>
    </div>
  );
}
