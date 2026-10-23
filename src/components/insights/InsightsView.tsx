"use client";

import { useState, useSyncExternalStore } from "react";

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

      {/* XP per day */}
      <section className={card} style={cardStyle} aria-label="XP per day, last 14 days">
        <h2 className={h2} style={{ color: "var(--t-ink)" }}>
          XP per day · last 14 days
        </h2>
        <XpBars days={days14} wins={wins} />
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

const XP_VIEW_KEY = "insights-xp-view-2";

/** Quest kinds counted in the daily tallies, in display order. */
const TALLIES: { kind: string; one: string; many: string }[] = [
  { kind: "quest", one: "quest", many: "quests" },
  { kind: "habit", one: "habit", many: "habits" },
  { kind: "rite", one: "rite", many: "rites" },
  { kind: "journal", one: "journal", many: "journals" },
  { kind: "feedback", one: "feedback", many: "feedback" },
  { kind: "reward", one: "reward", many: "rewards" },
];

/**
 * XP per day as gilded columns, each labelled with its weekday and date.
 * Optionally shows the portraits of what was finished that day, and a
 * written tally (XP, quests, journals, feedback…) under each day.
 */
function XpBars({ days, wins }: { days: Date[]; wins: WinLite[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // A tapped portrait: what it was, when, and what it earned.
  const [picked, setPicked] = useState<WinLite | null>(null);
  const [opts, setOpts] = useState<{ icons: boolean; tallies: boolean }>(() => {
    try {
      return { icons: true, tallies: true, ...(JSON.parse(window.localStorage.getItem(XP_VIEW_KEY) ?? "{}") as object) };
    } catch {
      return { icons: true, tallies: true };
    }
  });
  function set(patch: Partial<typeof opts>) {
    const next = { ...opts, ...patch };
    setOpts(next);
    try {
      window.localStorage.setItem(XP_VIEW_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  const byDay = days.map((d) => {
    const k = dayKey(d);
    const ws = wins.filter((w) => dayKey(new Date(w.at)) === k);
    return { d, ws, xp: ws.reduce((a, w) => a + w.xp, 0) };
  });
  const max = Math.max(10, ...byDay.map((b) => b.xp));
  const nice = Math.ceil(max / 10) * 10;
  const total = byDay.reduce((a, b) => a + b.xp, 0);
  const BAR_H = 110;
  const wide = opts.icons || opts.tallies;
  const h = hover !== null ? byDay[hover] : null;
  const todayKey = dayKey(new Date());

  return (
    <div className="relative z-[1] flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {picked ? (
          <p className="fade-in m-0 flex min-w-0 flex-1 items-center gap-2 text-[13.5px]" style={{ color: INK }}>
            {picked.icon && (
              // eslint-disable-next-line @next/next/no-img-element -- quest portrait
              <img src={picked.icon} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" style={{ border: "1.5px solid #a58c66" }} />
            )}
            <span className="min-w-0 flex-1">
              <b className="block truncate">{picked.title}</b>
              <span style={{ color: INK_SOFT }}>
                {picked.kind === "reward" ? "Reward" : "Quest"} · {new Date(picked.at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {picked.xp ? ` · +${picked.xp} XP` : ""}
              </span>
            </span>
            <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="h-8 w-8 shrink-0 rounded-full text-[18px] leading-none hover:bg-black/[.06]" style={{ color: INK_SOFT }}>
              ×
            </button>
          </p>
        ) : (
          <p className="m-0 min-w-0 flex-1 text-[13.5px] tabular-nums" style={{ color: INK_SOFT }}>
            {h
              ? `${h.d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${h.xp} XP`
              : `${total} XP over two weeks · ${Math.round(total / days.length)} a day on average`}
          </p>
        )}
        <label className="flex min-h-8 items-center gap-1.5 text-[13.5px]" style={{ color: INK }}>
          <input type="checkbox" checked={opts.icons} onChange={() => set({ icons: !opts.icons })} />
          Portraits
        </label>
        <label className="flex min-h-8 items-center gap-1.5 text-[13.5px]" style={{ color: INK }}>
          <input type="checkbox" checked={opts.tallies} onChange={() => set({ tallies: !opts.tallies })} />
          Daily tallies
        </label>
      </div>

      <div className={wide ? "-mx-1 overflow-x-auto px-1 pb-1" : ""}>
        <div className="relative flex pt-2.5" style={{ minWidth: wide ? days.length * 52 : undefined }} onPointerLeave={() => setHover(null)}>
          {/* Scale (with room above so its top number isn't cut off) */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2.5" style={{ height: BAR_H }}>
            {[nice, nice / 2, 0].map((v, i) => (
              <div key={v} className="absolute inset-x-0 flex items-center" style={{ top: (i * BAR_H) / 2 - 1 }}>
                <span className="w-7 shrink-0 pr-1 text-right text-[11px] tabular-nums" style={{ color: INK_SOFT, transform: "translateY(-50%)" }}>
                  {v}
                </span>
                <span className="flex-1" style={{ borderTop: `1px solid ${GRID}` }} />
              </div>
            ))}
          </div>
          <span aria-hidden className="w-7 shrink-0" />
          {byDay.map((b, i) => {
            const isToday = dayKey(b.d) === todayKey;
            const icons = b.ws.filter((w) => (w.kind === "quest" || w.kind === "reward") && w.icon);
            return (
              <div
                key={i}
                className="flex min-w-0 flex-1 flex-col items-center"
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                style={{ background: hover === i ? "rgba(217,180,95,.12)" : undefined, borderRadius: 8 }}
              >
                <div className="relative flex w-full items-end justify-center" style={{ height: BAR_H }}>
                  {b.xp > 0 && (
                    <div
                      className="w-[62%] max-w-[26px] rounded-t-[5px]"
                      style={{ height: Math.max(3, (b.xp / nice) * BAR_H), background: `linear-gradient(180deg, #e8c46a, ${BAR})`, boxShadow: "inset 0 0 0 1px rgba(90,60,20,.25)" }}
                      title={`${b.xp} XP`}
                    />
                  )}
                </div>
                <div className="flex flex-col items-center pt-1 leading-none" style={{ color: isToday ? INK : INK_SOFT }}>
                  <span className="text-[10.5px] uppercase tracking-wide">{isToday ? "Today" : b.d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className={`text-[13px] tabular-nums ${isToday ? "font-bold" : ""}`}>{b.d.getDate()}</span>
                </div>
                {opts.icons && icons.length > 0 && (
                  <div className="mt-1 flex flex-col items-center gap-0.5">
                    {icons.slice(0, 3).map((w, k) => (
                      <button key={k} type="button" onClick={() => setPicked(w)} aria-label={w.title} title={w.title} className="rounded-full transition-transform hover:scale-110">
                        {/* eslint-disable-next-line @next/next/no-img-element -- quest portrait */}
                        <img src={w.icon!} alt="" className="h-6 w-6 rounded-full object-cover" style={{ border: `1.5px solid ${w.kind === "reward" ? "#b5521f" : "#a58c66"}` }} />
                      </button>
                    ))}
                    {icons.length > 3 && (
                      <span className="text-[10.5px] font-semibold" style={{ color: INK_SOFT }}>
                        +{icons.length - 3}
                      </span>
                    )}
                  </div>
                )}
                {opts.tallies && (
                  <div className="mt-1 flex flex-col items-center gap-px text-center text-[10.5px] leading-tight" style={{ color: INK_SOFT }}>
                    {b.xp > 0 && <b style={{ color: INK }}>{b.xp} XP</b>}
                    {TALLIES.map((t) => {
                      const c = b.ws.filter((w) => w.kind === t.kind).length;
                      return c ? (
                        <span key={t.kind}>
                          {c} {c === 1 ? t.one : t.many}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
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
