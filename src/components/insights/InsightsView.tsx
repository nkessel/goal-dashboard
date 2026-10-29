"use client";

import { useSyncExternalStore } from "react";

type Reading = { metric: string; level: number; at: string };
type WinLite = { kind: string; at: string; xp: number; title?: string; icon?: string | null };

const DAY = 86_400_000;
const noop = () => () => {};
/** Local midnight keys need the viewer's clock, so the charts draw after hydration. */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
const GRID = "rgba(110,85,40,.18)";

export function InsightsView({ theme, readings, wins }: { theme: "calm" | "adventure"; readings: Reading[]; wins: WinLite[] }) {
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
