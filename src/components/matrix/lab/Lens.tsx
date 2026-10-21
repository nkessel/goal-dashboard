"use client";

import { useEffect, useRef, useState } from "react";
import { FACTORS, type FactorKey, type Scored } from "@/lib/priority";
import { Panel, QuestTip, type LabTask } from "./shared";

type Channel = FactorKey | "score";
const W = 400;
const H = 300;
const M = { l: 34, r: 14, t: 14, b: 30 };
const CHOICES: { key: Channel; label: string }[] = [{ key: "score", label: "Overall priority" }, ...FACTORS.map((f) => ({ key: f.key as Channel, label: f.label }))];
const KEY = "lens-channels";

/** One-hue ramp for magnitude (light parchment gold → deep umber). */
function ramp(v: number) {
  const a = [242, 226, 176];
  const b = [107, 68, 16];
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, v))));
  return `rgb(${c.join(",")})`;
}

/**
 * Any four factors at once: pick what runs across, what runs up, what sets
 * a dot's size and what sets its shade. Switch one and the quests glide to
 * their new places.
 */
export function Lens<T extends LabTask>({ scored, isAdventure, onOpen }: { scored: Scored<T>[]; isAdventure: boolean; onOpen: (t: T) => void }) {
  const [ch, setCh] = useState<{ x: Channel; y: Channel; size: Channel; color: Channel }>({ x: "ease", y: "importance", size: "quick", color: "urgency" });
  const [tip, setTip] = useState<{ s: Scored<T>; x: number; y: number; w: number; h: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved choice is only readable after hydration
      if (raw) setCh(JSON.parse(raw));
    } catch {
      /* storage unavailable */
    }
  }, []);
  function pick(k: keyof typeof ch, v: Channel) {
    const next = { ...ch, [k]: v };
    setCh(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  const val = (s: Scored<T>, c: Channel) => (c === "score" ? s.score / (scored[0]?.score || 1) : s.values[c]);
  const label = (c: Channel) => CHOICES.find((x) => x.key === c)!.label;
  const px = (v: number) => M.l + v * (W - M.l - M.r);
  const py = (v: number) => H - M.b - v * (H - M.t - M.b);

  const select = (k: keyof typeof ch, title: string) => (
    <label className="flex items-center gap-1.5 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
      <span style={{ color: "var(--t-ink-soft)" }}>{title}</span>
      <select value={ch[k]} onChange={(e) => pick(k, e.target.value as Channel)} className="h-8 rounded-lg border px-1.5 text-[14px]" style={{ borderColor: "#b39a6a", background: "rgba(255,251,240,.85)", color: "var(--t-ink)" }}>
        {CHOICES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-3 px-4 py-4">
      <div className="relative z-[1] flex flex-wrap gap-x-4 gap-y-2">
        {select("x", "Across")}
        {select("y", "Up")}
        {select("size", "Size")}
        {select("color", "Shade")}
      </div>
      <div ref={wrap} className="relative z-[1]" onClick={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label(ch.y)} against ${label(ch.x)}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={px(0)} x2={px(1)} y1={py(k)} y2={py(k)} stroke="rgba(90,70,30,.12)" strokeWidth="1" />
              <line y1={py(0)} y2={py(1)} x1={px(k)} x2={px(k)} stroke="rgba(90,70,30,.08)" strokeWidth="1" />
            </g>
          ))}
          <text x={px(1)} y={H - 8} textAnchor="end" fontSize="11" fill="#5a4a30">
            {label(ch.x)} →
          </text>
          <text x={12} y={py(1)} fontSize="11" fill="#5a4a30" transform={`rotate(-90 12 ${py(1)})`} textAnchor="end">
            {label(ch.y)} →
          </text>
          {[...scored].reverse().map((s) => {
            const x = px(val(s, ch.x));
            const y = py(val(s, ch.y));
            const r = 4 + Math.sqrt(val(s, ch.size)) * 9;
            return (
              <g
                key={s.task.id}
                style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform 450ms cubic-bezier(.2,.8,.2,1)", cursor: 'url("/design/cursor-hand.svg") 11 3, pointer' }}
                role="button"
                tabIndex={0}
                aria-label={s.task.title}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "mouse") return;
                  const b = wrap.current!.getBoundingClientRect();
                  setTip({ s, x: (x / W) * b.width, y: (y / H) * b.height, w: b.width, h: b.height });
                }}
                onPointerLeave={(e) => e.pointerType === "mouse" && setTip(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (tip?.s.task.id === s.task.id) return onOpen(s.task);
                  const b = wrap.current!.getBoundingClientRect();
                  setTip({ s, x: (x / W) * b.width, y: (y / H) * b.height, w: b.width, h: b.height });
                }}
                onKeyDown={(e) => e.key === "Enter" && onOpen(s.task)}
              >
                <circle r={r + 8} fill="transparent" />
                <circle r={r} fill={ramp(val(s, ch.color))} stroke="#fbf3df" strokeWidth="2" style={{ transition: "r 450ms, fill 450ms" }} />
              </g>
            );
          })}
        </svg>
        {tip && <QuestTip s={tip.s} x={tip.x} y={tip.y} bounds={{ w: tip.w, h: tip.h }} onOpen={() => onOpen(tip.s.task)} />}
      </div>
      <div className="relative z-[1] flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]" style={{ color: "var(--t-ink)" }}>
        <span className="flex items-center gap-1.5">
          Shade: {label(ch.color)}
          <span className="inline-block h-2.5 w-20 rounded-full" style={{ background: `linear-gradient(90deg, ${ramp(0)}, ${ramp(1)})`, border: "1px solid rgba(90,70,30,.25)" }} />
          <span style={{ color: "var(--t-ink-soft)" }}>low → high</span>
        </span>
        <span>Size: {label(ch.size)}</span>
      </div>
    </Panel>
  );
}
