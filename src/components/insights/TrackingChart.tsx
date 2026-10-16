"use client";

import { useEffect, useRef, useState } from "react";
import { WEATHER_EVENT, WEATHER_KEY } from "@/lib/use-weather";
import { WeatherLocation } from "@/components/ui/WeatherLocation";

type Reading = { metric: string; level: number; at: string };
type WinLite = { kind: string; at: string; xp: number; title?: string };

/** Series colors, checked for contrast and color-blind separation on parchment. */
const SERIES = ["#c4620f", "#2a6fb5", "#24875a", "#8a3fa0", "#c23a48", "#a0880a"];
const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
const GRID = "rgba(110,85,40,.18)";
const DAY = 86_400_000;
const VIEW_KEY = "insights-view";
const SHOWN_KEY = "insights-shown";

type View = { range: 7 | 30 | 90; detail: "daily" | "every"; smooth: boolean; dots: boolean };
const DEFAULT_VIEW: View = { range: 30, detail: "daily", smooth: true, dots: true };

const EVENTS: { key: string; label: string; kinds: string[]; glyph: string; color: string }[] = [
  { key: "quests", label: "Quests done", kinds: ["quest"], glyph: "◆", color: "#8a6116" },
  { key: "habits", label: "Habits & rites", kinds: ["habit", "rite"], glyph: "●", color: "#5d7a3a" },
  { key: "journal", label: "Journal notes", kinds: ["journal"], glyph: "✎", color: "#6b4a8a" },
  { key: "rewards", label: "Rewards", kinds: ["reward"], glyph: "★", color: "#b5521f" },
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** Daily high/low and rain for the last N days, once a place is shared. */
function useWeatherHistory(days: number): Record<string, { hi: number; lo: number; rain: number }> | null | undefined {
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null | undefined>(undefined);
  const [data, setData] = useState<{ key: string; days: Record<string, { hi: number; lo: number; rain: number }> } | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(WEATHER_KEY);
        setCoords(raw ? (JSON.parse(raw) as { lat: number; lon: number }) : undefined);
      } catch {
        setCoords(undefined);
      }
    };
    read();
    window.addEventListener(WEATHER_EVENT, read);
    return () => window.removeEventListener(WEATHER_EVENT, read);
  }, []);
  const key = coords ? `${coords.lat},${coords.lon},${days}` : null;
  useEffect(() => {
    if (!coords || !key) return;
    const f = /^en-US/.test(navigator.language) || /^America\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&past_days=${Math.min(92, days)}&forecast_days=1${f ? "&temperature_unit=fahrenheit&precipitation_unit=inch" : ""}`;
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((j: { daily?: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[] } }) => {
        if (!alive || !j.daily) return;
        const out: Record<string, { hi: number; lo: number; rain: number }> = {};
        j.daily.time.forEach((t, i) => {
          const hi = j.daily!.temperature_2m_max[i];
          const lo = j.daily!.temperature_2m_min[i];
          if (hi === null || lo === null) return;
          out[t] = { hi: Math.round(hi), lo: Math.round(lo), rain: j.daily!.precipitation_sum[i] ?? 0 };
        });
        setData({ key, days: out });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [coords, key, days]);
  if (coords === undefined) return undefined;
  return data && data.key === key ? data.days : null;
}

/** Smooth a polyline (Catmull-Rom → cubic Bézier), never overshooting the 1–10 band much. */
function pathFor(pts: [number, number][], smooth: boolean) {
  if (pts.length === 0) return "";
  if (!smooth || pts.length < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d += `C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Every tracked metric on one 1–10 chart, each toggled with a checkbox, with
 * optional strips for the weather and for things you did (quests, habits,
 * journal notes, rewards). The gear in the corner switches how it's drawn.
 */
export function TrackingChart({ metrics, readings, wins }: { metrics: string[]; readings: Reading[]; wins: WinLite[] }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- saved choices are only readable after hydration */
    setView(readJSON(VIEW_KEY, DEFAULT_VIEW));
    setShown(readJSON<Record<string, boolean>>(SHOWN_KEY, {}));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!settings) return;
    const down = (e: PointerEvent) => gearRef.current && !gearRef.current.contains(e.target as Node) && setSettings(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setSettings(false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [settings]);

  function setV(patch: Partial<View>) {
    const next = { ...view, ...patch };
    setView(next);
    writeJSON(VIEW_KEY, next);
  }
  // Metrics are on by default; weather and events off until ticked.
  const isOn = (k: string) => shown[k] ?? !(k === "weather" || EVENTS.some((e) => e.key === k));
  function flip(k: string) {
    const next = { ...shown, [k]: !isOn(k) };
    setShown(next);
    writeJSON(SHOWN_KEY, next);
  }

  const weather = useWeatherHistory(view.range);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = view.range;
  const start = today.getTime() - (n - 1) * DAY;
  const end = today.getTime() + DAY;
  const days = Array.from({ length: n }, (_, i) => new Date(start + i * DAY));

  const showWeather = isOn("weather");
  const activeEvents = EVENTS.filter((e) => isOn(e.key));
  const W = 440;
  const L = 28;
  const R = 12;
  const weatherH = showWeather ? 34 : 0;
  const T = 10 + weatherH;
  const plotH = 190;
  const eventsH = activeEvents.length ? 14 + activeEvents.length * 16 : 0;
  const B = 22 + eventsH;
  const H = T + plotH + B;
  const x = (t: number) => L + ((t - start) / (end - start)) * (W - L - R);
  const xDay = (i: number) => x(start + i * DAY + DAY / 2);
  const y = (v: number) => T + ((10 - v) * plotH) / 9;

  const series = metrics.map((m, i) => {
    const rs = readings.filter((r) => r.metric === m && new Date(r.at).getTime() >= start);
    let pts: { t: number; v: number }[];
    if (view.detail === "every") pts = rs.map((r) => ({ t: new Date(r.at).getTime(), v: r.level }));
    else {
      const by = new Map<number, number[]>();
      for (const r of rs) {
        const d = new Date(r.at);
        d.setHours(0, 0, 0, 0);
        by.set(d.getTime(), [...(by.get(d.getTime()) ?? []), r.level]);
      }
      pts = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([t, vs]) => ({ t: t + DAY / 2, v: vs.reduce((a, b) => a + b, 0) / vs.length }));
    }
    return { metric: m, color: SERIES[i % SERIES.length], pts };
  });
  const visible = series.filter((s) => isOn(s.metric));

  const eventsByDay = new Map<string, WinLite[]>();
  for (const w of wins) {
    const t = new Date(w.at).getTime();
    if (t < start || t >= end) continue;
    const k = dayKey(new Date(w.at));
    eventsByDay.set(k, [...(eventsByDay.get(k) ?? []), w]);
  }

  const tickEvery = n <= 7 ? 1 : n <= 30 ? 7 : 14;
  const hd = hover !== null ? days[hover] : null;
  const hk = hd ? dayKey(hd) : null;
  const hoverVals = hd
    ? visible.map((s) => {
        const inDay = s.pts.filter((p) => p.t >= hd.getTime() && p.t < hd.getTime() + DAY);
        return { s, v: inDay.length ? inDay.reduce((a, p) => a + p.v, 0) / inDay.length : null };
      })
    : [];
  const hoverEvents = hk ? (eventsByDay.get(hk) ?? []).filter((w) => activeEvents.some((e) => e.kinds.includes(w.kind))) : [];
  const hoverWeather = hk && weather ? weather[hk] : null;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

  return (
    <div className="relative z-[1] flex flex-col gap-2">
      {/* Toggles: each metric (its swatch is its line), then weather and events. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5" role="group" aria-label="What to show">
        {series.map((s) => (
          <label key={s.metric} className="flex min-h-9 items-center gap-1.5 text-[14.5px]" style={{ color: INK }}>
            <input type="checkbox" checked={isOn(s.metric)} onChange={() => flip(s.metric)} />
            <span aria-hidden className="inline-block h-[3px] w-4 rounded-full" style={{ background: s.color }} />
            {s.metric}
          </label>
        ))}
        <span aria-hidden className="mx-0.5 self-center" style={{ width: 1, height: 20, background: GRID }} />
        <label className="flex min-h-9 items-center gap-1.5 text-[14.5px]" style={{ color: INK }}>
          <input type="checkbox" checked={showWeather} onChange={() => flip("weather")} />
          <span aria-hidden>⛅</span>Weather
        </label>
        {EVENTS.map((e) => (
          <label key={e.key} className="flex min-h-9 items-center gap-1.5 text-[14.5px]" style={{ color: INK }}>
            <input type="checkbox" checked={isOn(e.key)} onChange={() => flip(e.key)} />
            <span aria-hidden style={{ color: e.color }}>
              {e.glyph}
            </span>
            {e.label}
          </label>
        ))}
      </div>
      {showWeather && weather === undefined && (
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13.5px]" style={{ color: INK_SOFT }}>
          Weather needs a place: <WeatherLocation label="choose a place" />
        </p>
      )}

      <figure className="relative m-0 rounded-xl px-2 pb-1 pt-2" style={{ background: "rgba(255,250,235,.55)", border: `1px solid ${GRID}` }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label={`${visible.map((s) => s.metric).join(", ") || "No metrics"} over the last ${n} days, on a 1 to 10 scale`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.floor(((px - L) / (W - L - R)) * n);
            setHover(i >= 0 && i < n ? i : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {/* Weather strip */}
          {showWeather && weather && (
            <g>
              {days.map((d, i) => {
                const w = weather[dayKey(d)];
                if (!w) return null;
                const label = n <= 30 || i % 3 === 0;
                return (
                  <g key={i}>
                    {w.rain > 0.02 && <rect x={xDay(i) - 3} y={10 + weatherH - 8} width="6" height={Math.min(8, 2 + w.rain * 12)} rx="1.5" fill="#3f6fa8" opacity=".75" transform={`translate(0 ${-Math.min(8, 2 + w.rain * 12) + 8})`} />}
                    {label && (
                      <text x={xDay(i)} y={20} textAnchor="middle" fontSize={n <= 7 ? 12 : 9.5} fill={INK_SOFT}>
                        {w.hi}°
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* Grid */}
          {[1, 4, 7, 10].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill={INK_SOFT}>
                {v}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            (n - 1 - i) % tickEvery === 0 ? (
              <text key={i} x={xDay(i)} y={T + plotH + 16} textAnchor="middle" fontSize="12" fill={INK_SOFT}>
                {i === n - 1 ? "today" : d.toLocaleDateString(undefined, n <= 7 ? { weekday: "short" } : { month: "short", day: "numeric" })}
              </text>
            ) : null
          )}
          {hover !== null && <line x1={xDay(hover)} x2={xDay(hover)} y1={T} y2={T + plotH + eventsH + 20} stroke={INK_SOFT} strokeWidth="1" strokeDasharray="3 3" />}

          {/* Lines */}
          {visible.map((s) => {
            const pts = s.pts.map((p): [number, number] => [x(p.t), y(p.v)]);
            return (
              <g key={s.metric}>
                {pts.length > 1 && <path d={pathFor(pts, view.smooth)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                {(view.dots || pts.length === 1) && pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="4" fill={s.color} stroke="#fbf3df" strokeWidth="2" />)}
              </g>
            );
          })}

          {/* Event lanes */}
          {activeEvents.map((ev, li) => {
            const ly = T + plotH + 30 + li * 16;
            return (
              <g key={ev.key}>
                {days.map((d, i) => {
                  const c = (eventsByDay.get(dayKey(d)) ?? []).filter((w) => ev.kinds.includes(w.kind)).length;
                  if (!c) return null;
                  return (
                    <text key={i} x={xDay(i)} y={ly} textAnchor="middle" fontSize={c > 1 ? 12 : 10.5} fontWeight={c > 2 ? 700 : 400} fill={ev.color}>
                      {ev.glyph}
                    </text>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover readout */}
        {hd && (
          <div
            className="pointer-events-none absolute top-2 z-[3] flex max-w-[230px] flex-col gap-0.5 rounded-lg px-2.5 py-2 text-[13px] shadow-lg"
            style={{ [hover! > n / 2 ? "left" : "right"]: 12, background: "#fbf3df", border: "1px solid #b39a6a", color: INK }}
          >
            <b className="text-[13.5px]">{hd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</b>
            {hoverVals.map(({ s, v }) => (
              <span key={s.metric} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.metric} <b className="ml-auto tabular-nums">{v === null ? "—" : fmt(v)}</b>
              </span>
            ))}
            {showWeather && hoverWeather && (
              <span>
                ⛅ {hoverWeather.hi}° / {hoverWeather.lo}°{hoverWeather.rain > 0.02 ? ` · 💧 ${hoverWeather.rain.toFixed(2)}` : ""}
              </span>
            )}
            {hoverEvents.slice(0, 4).map((w, i) => (
              <span key={i} className="truncate" style={{ color: INK_SOFT }}>
                {EVENTS.find((e) => e.kinds.includes(w.kind))?.glyph} {w.title ?? w.kind}
              </span>
            ))}
            {hoverEvents.length > 4 && <span style={{ color: INK_SOFT }}>+{hoverEvents.length - 4} more</span>}
          </div>
        )}

        {/* Settings, lower right */}
        <div ref={gearRef} className="absolute bottom-1.5 right-1.5 z-[4]">
          <button
            type="button"
            onClick={() => setSettings((o) => !o)}
            aria-expanded={settings}
            aria-label="Chart view settings"
            title="View settings"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "0 2px 6px rgba(60,40,10,.3)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" stroke="currentColor" strokeWidth="2" />
              <path d="M19.4 13.4l1.7 1.3-1.8 3.1-2-.8a7.6 7.6 0 0 1-2 1.2l-.3 2.1h-3.6l-.3-2.1a7.6 7.6 0 0 1-2-1.2l-2 .8-1.8-3.1 1.7-1.3a7.7 7.7 0 0 1 0-2.8L3.3 9.3l1.8-3.1 2 .8a7.6 7.6 0 0 1 2-1.2l.3-2.1h3.6l.3 2.1a7.6 7.6 0 0 1 2 1.2l2-.8 1.8 3.1-1.7 1.3a7.7 7.7 0 0 1 0 2.8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </button>
          {settings && (
            <div role="dialog" aria-label="Chart view settings" className="parchment absolute bottom-full right-0 mb-2 flex w-[250px] flex-col gap-2.5 p-3" style={{ borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 28px rgba(0,0,0,.3)" }}>
              <Seg label="Time span" value={String(view.range)} options={[["7", "Week"], ["30", "Month"], ["90", "3 months"]]} onPick={(v) => setV({ range: Number(v) as View["range"] })} />
              <Seg label="Points" value={view.detail} options={[["daily", "Daily average"], ["every", "Every check-in"]]} onPick={(v) => setV({ detail: v as View["detail"] })} />
              <Seg label="Lines" value={view.smooth ? "smooth" : "straight"} options={[["smooth", "Smooth"], ["straight", "Straight"]]} onPick={(v) => setV({ smooth: v === "smooth" })} />
              <label className="relative z-[1] flex min-h-8 items-center gap-2 text-[14px]" style={{ color: INK }}>
                <input type="checkbox" checked={view.dots} onChange={() => setV({ dots: !view.dots })} />
                Show each point
              </label>
            </div>
          )}
        </div>
      </figure>
      {visible.every((s) => s.pts.length < 3) && (
        <p className="m-0 text-[13px]" style={{ color: INK_SOFT }}>
          A few more check-ins and the trends will show. Tap the metric names to show or hide each line.
        </p>
      )}
    </div>
  );
}

function Seg({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="relative z-[1] flex flex-col gap-1">
      <span className="text-[12.5px] font-semibold" style={{ color: INK_SOFT }}>
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="flex rounded-full p-0.5" style={{ background: "rgba(110,85,40,.14)" }}>
        {options.map(([v, l]) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(v)}
              className="h-8 flex-1 rounded-full px-1.5 text-[12.5px] font-semibold"
              style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", boxShadow: "0 1px 2px rgba(60,40,10,.3)" } : { color: INK }}
            >
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
