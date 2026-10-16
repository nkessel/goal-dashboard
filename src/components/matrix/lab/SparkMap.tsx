"use client";

import { useState, useTransition } from "react";
import { rateSparkAction } from "@/app/actions";
import { Panel, Portrait, type LabTask } from "./shared";

type SparkTask = LabTask & { interest?: number | null; novelty?: number | null; challenge?: number | null };
type Dim = "interest" | "novelty" | "challenge" | "urgency";
const DIMS: { key: Dim; label: string; hook: string }[] = [
  { key: "interest", label: "Interest", hook: "Pair it with something you enjoy: music, a podcast, or a treat when it's done." },
  { key: "novelty", label: "Novelty", hook: "Change it up: a new place, a new tool, or a different time of day." },
  { key: "challenge", label: "Challenge", hook: "Make it a game: race the focus timer, or try to beat your last time." },
  { key: "urgency", label: "Urgency", hook: "Give it a deadline, or tell someone in your party when you'll do it." },
];

/** A small diamond: Interest up, Novelty right, Challenge down, Urgency left. */
function Diamond({ v, size = 56 }: { v: Record<Dim, number | null>; size?: number }) {
  const c = size / 2;
  const r = size / 2 - 4;
  const pt = (k: Dim, ang: number) => {
    const val = (v[k] ?? 0) / 5;
    return `${c + Math.cos(ang) * r * val},${c + Math.sin(ang) * r * val}`;
  };
  const poly = [pt("interest", -Math.PI / 2), pt("novelty", 0), pt("challenge", Math.PI / 2), pt("urgency", Math.PI)].join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} fill="rgba(255,250,238,.6)" stroke="rgba(139,112,64,.4)" strokeWidth="1" />
      <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="rgba(139,112,64,.2)" />
      <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="rgba(139,112,64,.2)" />
      <polygon points={poly} fill="rgba(226,175,60,.75)" stroke="#8a6116" strokeWidth="1.5" strokeLinejoin="round" />
      <text x={c} y={7} textAnchor="middle" fontSize="7" fill="#5a4a30">I</text>
      <text x={size - 3} y={c + 2.5} textAnchor="end" fontSize="7" fill="#5a4a30">N</text>
      <text x={c} y={size - 1} textAnchor="middle" fontSize="7" fill="#5a4a30">C</text>
      <text x={3} y={c + 2.5} fontSize="7" fill="#5a4a30">U</text>
    </svg>
  );
}

/**
 * ADHD motivation runs on Interest, Novelty, Challenge and Urgency more than
 * on importance (the "interest-based nervous system"). Rate each quest's
 * spark; quests low on spark get a hook matched to what they're missing.
 */
export function SparkMap<T extends SparkTask>({ tasks, isAdventure, onOpen }: { tasks: T[]; isAdventure: boolean; onOpen: (t: T) => void }) {
  const [local, setLocal] = useState<Record<string, Partial<Record<Dim, number | null>>>>({});
  const [rating, setRating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const valuesOf = (t: T): Record<Dim, number | null> => ({
    interest: local[t.id]?.interest !== undefined ? local[t.id]!.interest! : (t.interest ?? null),
    novelty: local[t.id]?.novelty !== undefined ? local[t.id]!.novelty! : (t.novelty ?? null),
    challenge: local[t.id]?.challenge !== undefined ? local[t.id]!.challenge! : (t.challenge ?? null),
    urgency: Math.round(t.urgency ?? 0),
  });
  const rated = (v: Record<Dim, number | null>) => v.interest !== null || v.novelty !== null || v.challenge !== null;
  const spark = (v: Record<Dim, number | null>) => {
    const xs = DIMS.map((d) => v[d.key]).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };

  function rate(t: T, dim: Exclude<Dim, "urgency">, value: number) {
    const before = valuesOf(t)[dim];
    const next = before === value ? null : value;
    setLocal((l) => ({ ...l, [t.id]: { ...l[t.id], [dim]: next } }));
    setError(null);
    startTransition(async () => {
      try {
        await rateSparkAction(t.id, { [dim]: next });
      } catch (e) {
        setLocal((l) => ({ ...l, [t.id]: { ...l[t.id], [dim]: before } }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const rows = tasks.map((t) => ({ t, v: valuesOf(t) }));
  const low = rows.filter((r) => rated(r.v) && spark(r.v) < 2.5).sort((a, b) => spark(a.v) - spark(b.v));
  const lit = rows.filter((r) => rated(r.v) && spark(r.v) >= 2.5).sort((a, b) => spark(b.v) - spark(a.v));
  const unrated = rows.filter((r) => !rated(r.v));

  const card = ({ t, v }: { t: T; v: Record<Dim, number | null> }, withHook: boolean) => {
    const weakest = DIMS.filter((d) => v[d.key] !== null).sort((a, b) => (v[a.key] ?? 0) - (v[b.key] ?? 0))[0];
    const open = rating === t.id;
    return (
      <li key={t.id} className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,250,238,.6)", border: "1px solid rgba(139,112,64,.3)" }}>
        <div className="flex items-center gap-3">
          <Diamond v={v} />
          <button type="button" onClick={() => onOpen(t)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Portrait t={t} size={26} />
            <span className="truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
              {t.title}
            </span>
          </button>
          <button type="button" onClick={() => setRating(open ? null : t.id)} aria-expanded={open} className="shrink-0 text-[13px] underline" style={{ color: "#6f4f12" }}>
            {open ? "Done" : rated(v) ? "Rate" : "Rate it"}
          </button>
        </div>
        {withHook && weakest && (
          <p className="m-0 text-[13.5px] leading-snug" style={{ color: "#4d4535" }}>
            <b>Low on {weakest.label.toLowerCase()}.</b> {weakest.hook}
          </p>
        )}
        {open && (
          <div className="flex flex-col gap-1.5">
            {DIMS.filter((d) => d.key !== "urgency").map((d) => (
              <div key={d.key} role="radiogroup" aria-label={d.label} className="flex items-center gap-2">
                <span className="w-[74px] shrink-0 text-[13px]" style={{ color: "var(--t-ink)" }}>
                  {d.label}
                </span>
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = (v[d.key] ?? 0) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={v[d.key] === n}
                      aria-label={`${d.label} ${n} of 5`}
                      onClick={() => rate(t, d.key as Exclude<Dim, "urgency">, n)}
                      className="h-7 w-7 rounded-full"
                      style={{ background: on ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "rgba(70,50,20,.08)", border: `1.5px solid ${on ? "#5a4520" : "rgba(139,112,64,.35)"}` }}
                    />
                  );
                })}
              </div>
            ))}
            <p className="m-0 text-[12px]" style={{ color: "#5a4a30" }}>
              Urgency comes from the quest itself ({v.urgency ?? 0} of 5).
            </p>
          </div>
        )}
      </li>
    );
  };

  const head = (title: string, n: number, note?: string) => (
    <div className="flex items-baseline gap-2">
      <h3 className={`m-0 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
        {title}
      </h3>
      <span className="text-[13px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
        {n}
      </span>
      {note && (
        <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {note}
        </span>
      )}
    </div>
  );

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-4 px-4 py-4">
      <div className="relative z-[1] flex flex-col gap-4">
        <p className="m-0 text-[13.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
          Interest, Novelty, Challenge and Urgency are what get an ADHD brain moving. Rate a quest&apos;s spark; dull ones get a hook.
        </p>
        {error && (
          <p role="alert" className="m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        {low.length > 0 && (
          <section className="flex flex-col gap-2">
            {head("Needs a spark", low.length)}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">{low.map((r) => card(r, true))}</ul>
          </section>
        )}
        {lit.length > 0 && (
          <section className="flex flex-col gap-2">
            {head("Has a spark", lit.length)}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">{lit.map((r) => card(r, false))}</ul>
          </section>
        )}
        {unrated.length > 0 && (
          <section className="flex flex-col gap-2">
            {head("Not rated yet", unrated.length, "Tap Rate it — three quick taps each.")}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">{unrated.slice(0, 20).map((r) => card(r, false))}</ul>
          </section>
        )}
      </div>
    </Panel>
  );
}
