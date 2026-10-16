"use client";

import { useState, useSyncExternalStore } from "react";

type Reading = { metric: string; level: number; at: string };
type WinLite = { kind: string; at: string; xp: number };

const DAY = 86_400_000;
const noop = () => () => {};
/** Local midnight keys need the viewer's clock, so the charts draw after hydration. */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastDays(n: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => new Date(today.getTime() - (n - 1 - i) * DAY));
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
const GRID = "rgba(110,85,40,.18)";
const MARK = "#8a6116";
const BAR = "#c89a3c";

export function InsightsView({ theme, readings, metrics, wins }: { theme: "calm" | "adventure"; readings: Reading[]; metrics: string[]; wins: WinLite[] }) {
  const mounted = useMounted();
  const isAdventure = theme === "adventure";
  const card = `relative flex flex-col gap-3 rounded-2xl px-4 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`;
  const cardStyle = isAdventure ? { borderRadius: 16 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  const h2 = `relative z-[1] m-0 ${isAdventure ? "font-display text-[20px]" : "text-[16px] font-bold"}`;

  if (!mounted) return <div className={card} style={{ ...cardStyle, minHeight: 240 }} aria-busy />;

  const now = Date.now();
  const inRange = (at: string, from: number, to: number) => {
    const t = new Date(at).getTime();
    return t >= from && t < to;
  };
  const week = now - 7 * DAY;
  const prevWeek = now - 14 * DAY;
  const quests = wins.filter((w) => w.kind === "quest");
  const energy = readings.filter((r) => r.metric === "Energy");
  const tiles = [
    { label: "Quests done", now: quests.filter((w) => inRange(w.at, week, now + 1)).length, before: quests.filter((w) => inRange(w.at, prevWeek, week)).length, dec: false },
    {
      label: "XP earned",
      now: wins.filter((w) => inRange(w.at, week, now + 1)).reduce((a, w) => a + w.xp, 0),
      before: wins.filter((w) => inRange(w.at, prevWeek, week)).reduce((a, w) => a + w.xp, 0),
      dec: false,
    },
    { label: "Avg energy", now: avg(energy.filter((r) => inRange(r.at, week, now + 1)).map((r) => r.level)), before: avg(energy.filter((r) => inRange(r.at, prevWeek, week)).map((r) => r.level)), dec: true },
    { label: "Check-ins", now: new Set(readings.filter((r) => inRange(r.at, week, now + 1)).map((r) => dayKey(new Date(r.at)))).size, before: null, dec: false, suffix: " of 7 days" },
  ];

  const days30 = lastDays(30);
  const days14 = lastDays(14);
  const xpByDay = new Map<string, number>();
  const doneByDay = new Map<string, number>();
  for (const w of wins) {
    const k = dayKey(new Date(w.at));
    xpByDay.set(k, (xpByDay.get(k) ?? 0) + w.xp);
    if (w.kind === "quest") doneByDay.set(k, (doneByDay.get(k) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* This week */}
      <section className={card} style={cardStyle} aria-label="This week">
        <h2 className={h2} style={{ color: "var(--t-ink)" }}>
          This week
        </h2>
        <div className="relative z-[1] grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map((t) => {
            const shown = t.now === null ? "—" : t.dec ? fmt1(t.now as number) : String(t.now);
            const delta = t.now !== null && t.before !== null && t.before !== undefined ? (t.now as number) - (t.before as number) : null;
            return (
              <div key={t.label} className="flex flex-col rounded-xl px-3 py-2.5" style={{ background: "rgba(255,250,235,.55)", border: `1px solid ${GRID}` }}>
                <span className="text-[13px]" style={{ color: INK_SOFT }}>
                  {t.label}
                </span>
                <span className="font-display text-[26px] font-bold leading-tight tabular-nums" style={{ color: INK }}>
                  {shown}
                  {t.suffix && <span className="text-[13px] font-normal" style={{ color: INK_SOFT }}>{t.suffix}</span>}
                </span>
                {delta !== null && (
                  <span className="text-[12.5px] tabular-nums" style={{ color: INK_SOFT }}>
                    {delta === 0 ? "same as last week" : `${delta > 0 ? "▲" : "▼"} ${t.dec ? Math.abs(delta).toFixed(1) : Math.abs(delta)} vs last week`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Check-ins */}
      <section className={card} style={cardStyle} aria-label="Check-ins over 30 days">
        <h2 className={h2} style={{ color: "var(--t-ink)" }}>
          Check-ins · last 30 days
        </h2>
        <div className="relative z-[1] grid gap-3 sm:grid-cols-2">
          {metrics.map((m) => (
            <MetricChart key={m} metric={m} days={days30} readings={readings.filter((r) => r.metric === m)} />
          ))}
        </div>
      </section>

      {/* XP per day */}
      <section className={card} style={cardStyle} aria-label="XP per day, last 14 days">
        <h2 className={h2} style={{ color: "var(--t-ink)" }}>
          XP per day · last 14 days
        </h2>
        <XpBars days={days14} xpByDay={xpByDay} doneByDay={doneByDay} />
      </section>

      {/* Patterns */}
      <section className={card} style={cardStyle} aria-label="Patterns">
        <h2 className={h2} style={{ color: "var(--t-ink)" }}>
          Patterns
        </h2>
        <Patterns energy={energy} quests={quests} />
      </section>
    </div>
  );
}

/** One metric's daily average over the last 30 days, 1–10. */
function MetricChart({ metric, days, readings }: { metric: string; days: Date[]; readings: Reading[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 120;
  const L = 22;
  const R = 6;
  const T = 8;
  const B = 18;
  const byDay = new Map<string, number[]>();
  for (const r of readings) {
    const k = dayKey(new Date(r.at));
    byDay.set(k, [...(byDay.get(k) ?? []), r.level]);
  }
  const pts = days.map((d, i) => ({ i, d, v: avg(byDay.get(dayKey(d)) ?? []), n: (byDay.get(dayKey(d)) ?? []).length }));
  const x = (i: number) => L + (i * (W - L - R)) / (days.length - 1);
  const y = (v: number) => T + ((10 - v) * (H - T - B)) / 9;
  const have = pts.filter((p) => p.v !== null) as { i: number; d: Date; v: number; n: number }[];
  const path = have.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const latest = have[have.length - 1];
  const h = hover !== null ? pts[hover] : null;

  return (
    <figure className="m-0 flex flex-col gap-1 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,250,235,.55)", border: `1px solid ${GRID}` }}>
      <figcaption className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold" style={{ color: INK }}>
          {metric}
        </span>
        <span className="ml-auto text-[13px] tabular-nums" style={{ color: INK_SOFT }}>
          {h ? `${h.d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${h.v === null ? "no check-in" : fmt1(h.v)}` : latest ? `latest ${fmt1(latest.v)}` : "no check-ins yet"}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${metric}: ${have.length} days with check-ins${latest ? `, latest ${fmt1(latest.v)} of 10` : ""}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(days.length - 1, Math.round(((px - L) * (days.length - 1)) / (W - L - R)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {[1, 5, 10].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill={INK_SOFT}>
              {v}
            </text>
          </g>
        ))}
        {[0, 14, 29].map((i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === 29 ? "end" : "middle"} fontSize="10" fill={INK_SOFT}>
            {i === 29 ? "today" : days[i].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        ))}
        {h && <line x1={x(h.i)} x2={x(h.i)} y1={T} y2={H - B} stroke={INK_SOFT} strokeWidth="1" strokeDasharray="3 3" />}
        {have.length > 1 && <path d={path} fill="none" stroke={MARK} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {have.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={hover === p.i ? 5 : 4} fill={MARK} stroke="#fbf3df" strokeWidth="2" />
        ))}
      </svg>
      {have.length < 3 && (
        <p className="m-0 text-[12.5px]" style={{ color: INK_SOFT }}>
          A few more check-ins and a trend will show here.
        </p>
      )}
    </figure>
  );
}

function XpBars({ days, xpByDay, doneByDay }: { days: Date[]; xpByDay: Map<string, number>; doneByDay: Map<string, number> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 150;
  const L = 30;
  const T = 10;
  const B = 20;
  const vals = days.map((d) => xpByDay.get(dayKey(d)) ?? 0);
  const max = Math.max(10, ...vals);
  const nice = Math.ceil(max / 10) * 10;
  const slot = (W - L) / days.length;
  const bw = Math.min(28, slot - 6);
  const y = (v: number) => T + ((nice - v) * (H - T - B)) / nice;
  const total = vals.reduce((a, b) => a + b, 0);
  const h = hover !== null ? { d: days[hover], v: vals[hover], n: doneByDay.get(dayKey(days[hover])) ?? 0 } : null;
  return (
    <div className="relative z-[1] flex flex-col gap-1">
      <p className="m-0 text-[13.5px] tabular-nums" style={{ color: INK_SOFT }}>
        {h
          ? `${h.d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}: ${h.v} XP · ${h.n} ${h.n === 1 ? "quest" : "quests"}`
          : `${total} XP over two weeks · ${Math.round(total / days.length)} a day on average`}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`XP per day for the last 14 days, ${total} in all`} onPointerLeave={() => setHover(null)}>
        {[0, nice / 2, nice].map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={L - 5} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill={INK_SOFT}>
              {v}
            </text>
          </g>
        ))}
        {vals.map((v, i) => {
          const cx = L + slot * i + slot / 2;
          const top = y(v);
          const hgt = H - B - top;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T} fill="transparent" />
              {v > 0 && (
                <path
                  d={`M${cx - bw / 2},${H - B}V${top + Math.min(4, hgt)}q0,-4 4,-4h${bw - 8}q4,0 4,4V${H - B}z`}
                  fill={BAR}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {(i % 2 === 1 || i === days.length - 1) && (
                <text x={cx} y={H - 5} textAnchor="middle" fontSize="10" fill={INK_SOFT}>
                  {i === days.length - 1 ? "today" : days[i].toLocaleDateString(undefined, { weekday: "narrow" }) + days[i].getDate()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Plain-language patterns, once there's enough to say something honest. */
function Patterns({ energy, quests }: { energy: Reading[]; quests: WinLite[] }) {
  const lines: string[] = [];
  const parts: [string, (h: number) => boolean][] = [
    ["mornings", (h) => h >= 5 && h < 12],
    ["afternoons", (h) => h >= 12 && h < 17],
    ["evenings", (h) => h >= 17 || h < 5],
  ];
  if (energy.length >= 6) {
    const byPart = parts
      .map(([name, test]) => ({ name, v: avg(energy.filter((r) => test(new Date(r.at).getHours())).map((r) => r.level)), n: energy.filter((r) => test(new Date(r.at).getHours())).length }))
      .filter((p) => p.n >= 2 && p.v !== null) as { name: string; v: number; n: number }[];
    if (byPart.length >= 2) {
      byPart.sort((a, b) => b.v - a.v);
      lines.push(`Your energy runs highest in the ${byPart[0].name} (${fmt1(byPart[0].v)} on average) and lowest in the ${byPart[byPart.length - 1].name} (${fmt1(byPart[byPart.length - 1].v)}).`);
    }
  }
  if (quests.length >= 8) {
    const names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    const counts = names.map((_, d) => quests.filter((q) => new Date(q.at).getDay() === d).length);
    const best = counts.indexOf(Math.max(...counts));
    lines.push(`You finish the most quests on ${names[best]} (${counts[best]} in the last month).`);
    const hours = quests.map((q) => new Date(q.at).getHours());
    const am = hours.filter((h) => h < 12).length;
    lines.push(am > hours.length / 2 ? `Most of your quests get done before noon (${am} of ${hours.length}).` : `Most of your quests get done after noon (${hours.length - am} of ${hours.length}).`);
  }
  if (lines.length === 0) {
    return (
      <p className="relative z-[1] m-0 text-[14.5px]" style={{ color: INK_SOFT }}>
        Patterns appear after about a week of check-ins and finished quests. Check in a couple of times a day — morning and evening — to see when your energy peaks.
      </p>
    );
  }
  return (
    <ul className="relative z-[1] m-0 flex flex-col gap-1.5 pl-5 text-[15px]" style={{ color: INK }}>
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
