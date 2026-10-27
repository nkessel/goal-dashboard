"use client";

import { useEffect, useRef, useState } from "react";
import { WEATHER_EVENT, WEATHER_KEY } from "@/lib/use-weather";
import { WeatherLocation } from "@/components/ui/WeatherLocation";
import { fromFeedback } from "@/lib/from-feedback";

type Reading = { metric: string; level: number; at: string };
type WinLite = { kind: string; at: string; xp: number; title?: string };

/** Series colors, checked for contrast and color-blind separation on parchment. */
const SERIES = ["#c4620f", "#2a6fb5", "#24875a", "#8a3fa0", "#c23a48", "#a0880a"];
const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
const GRID = "rgba(110,85,40,.18)";
const DAY = 86_400_000;
const VIEW_KEY = "insights-view-2";
const SHOWN_KEY = "insights-shown";

type View = { range: 7 | 30 | 90; detail: "daily" | "every"; smooth: boolean; dots: boolean; marks?: "onLine" | "lines" | "lanes" };
const DEFAULT_VIEW: View = { range: 30, detail: "every", smooth: true, dots: true, marks: "onLine" };

const EVENTS: { key: string; label: string; kinds: string[]; glyph: string; color: string }[] = [
  { key: "quests", label: "Quests done", kinds: ["quest"], glyph: "◆", color: "#8a6116" },
  { key: "habits", label: "Habits & rites", kinds: ["habit", "rite"], glyph: "●", color: "#5d7a3a" },
  { key: "journal", label: "Journal notes", kinds: ["journal"], glyph: "✎", color: "#6b4a8a" },
  { key: "notes", label: "Events & #tags", kinds: ["note"], glyph: "🏷", color: "#7a4a1a" },
  { key: "rewards", label: "Rewards", kinds: ["reward"], glyph: "★", color: "#b5521f" },
];

/** Small drawn marks for each kind of event, the same in the toggles and the chart. */
function EventMark({ k, color, size = 12 }: { k: string; color: string; size?: number }) {
  const h = size / 2;
  const shape =
    k === "quests" ? (
      <path d={`M0 ${-h}L${h} 0 0 ${h} ${-h} 0z`} fill={color} />
    ) : k === "habits" ? (
      <circle r={h * 0.8} fill={color} />
    ) : k === "journal" ? (
      <path d={`M${-h * 0.9} ${h}L${-h * 0.5} ${h * 0.1}L${h * 0.55} ${-h * 0.95}L${h} ${-h * 0.5}L${-h * 0.05} ${h * 0.55}Z`} fill={color} />
    ) : k === "notes" ? (
      <path d={`M${-h} ${-h * 0.55}H${h * 0.25}L${h} 0L${h * 0.25} ${h * 0.55}H${-h}Z`} fill={color} />
    ) : (
      <path
        d={Array.from({ length: 10 }, (_, i) => {
          const r = i % 2 ? h * 0.45 : h;
          const a = (Math.PI / 5) * i - Math.PI / 2;
          return `${i ? "L" : "M"}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
        }).join("") + "Z"}
        fill={color}
      />
    );
  return shape;
}

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
  const f = (n: number) => n.toFixed(1);
  if (!smooth || pts.length < 2) return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join("");
  // Monotone cubic (Fritsch–Carlson): curvy, never overshooting a reading;
  // the ends ease in and out so even two readings make a soft curve.
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const sl = pts.slice(1).map((p, i) => (dx[i] ? (p[1] - pts[i][1]) / dx[i] : 0));
  const m = pts.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    if (sl[i - 1] * sl[i] <= 0) return 0;
    return (2 * sl[i - 1] * sl[i]) / (sl[i - 1] + sl[i]);
  });
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${f(pts[i][0] + h)},${f(pts[i][1] + m[i] * h)} ${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - m[i + 1] * h)} ${f(pts[i + 1][0])},${f(pts[i + 1][1])}`;
  }
  return d;
}

/**
 * Every tracked metric on one 1–10 chart, each toggled with a checkbox, with
 * optional strips for the weather and for things you did (quests, habits,
 * journal notes, rewards). The gear in the corner switches how it's drawn.
 */
export function TrackingChart({ metrics, readings, wins, onAdd }: { metrics: string[]; readings: Reading[]; wins: WinLite[]; onAdd?: () => void }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const tapType = useRef("mouse");
  const gearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- saved choices are only readable after hydration */
    setView(readJSON(VIEW_KEY, DEFAULT_VIEW));
    setShown(readJSON<Record<string, boolean>>(SHOWN_KEY, {}));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!settings) return;
    const down = (e: PointerEvent) => !fromFeedback(e) && gearRef.current && !gearRef.current.contains(e.target as Node) && setSettings(false);
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && setSettings(false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [settings]);

  useEffect(() => {
    if (!more) return;
    const down = (e: PointerEvent) => !fromFeedback(e) && moreRef.current && !moreRef.current.contains(e.target as Node) && setMore(false);
    const key = (e: KeyboardEvent) => !fromFeedback(e) && e.key === "Escape" && setMore(false);
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key);
    };
  }, [more]);

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
  const extrasOn = activeEvents.length + (showWeather ? 1 : 0);
  const W = 440;
  const L = 28;
  const R = 12;
  const weatherH = showWeather ? 34 : 0;
  const T = 10 + weatherH;
  const plotH = 190;
  // Events sit with the lines (on them, or as a marker line) unless kept in their own rows.
  const marks = view.marks ?? "onLine";
  const eventsH = activeEvents.length && marks === "lanes" ? 14 + activeEvents.length * 16 : 0;
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
      {/* Toggles, kept small so the chart leads: each metric as a pill (its swatch is its line), the rest under "More". */}
      <div className="flex items-center gap-1.5">
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5" role="group" aria-label="Lines to show" style={{ scrollbarWidth: "none" }}>
          {series.map((s) => {
            const on = isOn(s.metric);
            return (
              <button
                key={s.metric}
                type="button"
                aria-pressed={on}
                onClick={() => flip(s.metric)}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold"
                style={on ? { background: "rgba(255,250,235,.85)", border: `1.5px solid ${s.color}`, color: INK } : { border: `1px dashed ${GRID}`, color: INK_SOFT, opacity: 0.75 }}
              >
                <span aria-hidden className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: on ? s.color : INK_SOFT }} />
                {s.metric}
              </button>
            );
          })}
        </div>
        <div ref={moreRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMore((o) => !o)}
            aria-expanded={more}
            className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold"
            style={{ border: `1px solid ${extrasOn ? "#8a6116" : GRID}`, background: extrasOn ? "rgba(217,180,95,.3)" : undefined, color: INK }}
          >
            More{extrasOn ? ` · ${extrasOn}` : ""}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {more && (
            <div role="dialog" aria-label="Weather and events" className="pop parchment absolute right-0 top-full z-[6] mt-1.5 flex w-[220px] flex-col py-1.5" style={{ borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 28px rgba(0,0,0,.3)" }}>
              <label className="relative z-[1] flex min-h-9 items-center gap-2 px-3 text-[14px]" style={{ color: INK }}>
                <input type="checkbox" checked={showWeather} onChange={() => flip("weather")} />
                <svg aria-hidden width="16" height="16" viewBox="0 0 24 24">
                  <circle cx="9" cy="9" r="4" fill="#e7b43c" />
                  <path d="M8 19h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.5A2.8 2.8 0 0 0 8 19z" fill="#f6f1e4" stroke="#7d8aa0" strokeWidth="1.4" />
                </svg>
                Weather
              </label>
              {EVENTS.map((e) => (
                <label key={e.key} className="relative z-[1] flex min-h-9 items-center gap-2 px-3 text-[14px]" style={{ color: INK }}>
                  <input type="checkbox" checked={isOn(e.key)} onChange={() => flip(e.key)} />
                  <svg aria-hidden width="14" height="14" viewBox="-7 -7 14 14">
                    <EventMark k={e.key} color={e.color} size={12} />
                  </svg>
                  {e.label}
                </label>
              ))}
            </div>
          )}
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add an entry to the chart"
            title="Add an entry"
            className="hover-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {showWeather && weather === undefined && (
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13.5px]" style={{ color: INK_SOFT }}>
          Weather needs a place: <WeatherLocation label="choose a place" />
        </p>
      )}

      <figure className="relative m-0 rounded-xl px-2 pb-1 pt-2" style={{ background: "rgba(255,250,235,.55)", border: `1px solid ${GRID}` }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          // A finger dragging up or down scrolls the page; a tap shows that day's numbers.
          className="w-full touch-pan-y select-none"
          role="img"
          aria-label={`${visible.map((s) => s.metric).join(", ") || "No metrics"} over the last ${n} days, on a 1 to 10 scale`}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.floor(((px - L) / (W - L - R)) * n);
            setHover(i >= 0 && i < n ? i : null);
          }}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          onPointerDown={(e) => (tapType.current = e.pointerType)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.floor(((px - L) / (W - L - R)) * n);
            if (i < 0 || i >= n) return setHover(null);
            // On a touch screen the first tap shows the day; tapping it again logs an event on it.
            if (tapType.current !== "mouse" && hover !== i) return setHover(i);
            window.dispatchEvent(new CustomEvent("insights-add-event", { detail: { date: dayKey(days[i]) } }));
          }}
          style={{ cursor: 'url("/design/cursor-hand.svg") 11 3, copy' }}
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
                    {w.rain > 0.02 && (() => {
                      // A light-blue drop, filled with dark blue as far as the day was wet (an inch fills it).
                      const metric = !/^en-US/.test(typeof navigator === "undefined" ? "" : navigator.language);
                      const full = Math.max(0.15, Math.min(1, w.rain / (metric ? 25 : 1)));
                      const drop = "M0 -6C2.6 -2.6 4 -0.6 4 1.6A4 4 0 0 1 -4 1.6C-4 -0.6 -2.6 -2.6 0 -6Z";
                      const cx = xDay(i);
                      const cy = 10 + weatherH - 7;
                      return (
                        <g transform={`translate(${cx.toFixed(1)} ${cy})`}>
                          <clipPath id={`rain-${i}`}>
                            <rect x="-5" y={(5.6 - 11.6 * full).toFixed(2)} width="10" height="12" />
                          </clipPath>
                          <path d={drop} fill="#cfe3f7" stroke="#2f5f9e" strokeWidth="0.9" />
                          <path d={drop} fill="#2f5f9e" clipPath={`url(#rain-${i})`} />
                        </g>
                      );
                    })()}
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
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" opacity={v % 3 === 1 ? 1 : 0.45} />
              {v % 3 === 1 && (
                <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="12" fill={INK_SOFT}>
                  {v}
                </text>
              )}
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
                {pts.length > 1 && <path d={pathFor(pts, view.smooth)} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
                {/* Where it stands now: the latest reading carried on to today. */}
                {pts.length > 0 && pts[pts.length - 1][0] < x(Date.now()) - 4 && (
                  <path
                    d={`M${pts[pts.length - 1][0].toFixed(1)},${pts[pts.length - 1][1].toFixed(1)}H${x(Date.now()).toFixed(1)}`}
                    stroke={s.color}
                    strokeWidth="2"
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                    opacity=".6"
                  />
                )}
                {(view.dots || pts.length === 1) && pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="4" fill={s.color} stroke="#fbf3df" strokeWidth="2" />)}
              </g>
            );
          })}

          {/* Events by the lines: a marker line at the moment, or the icon sitting on the day's average. */}
          {marks !== "lanes" &&
            activeEvents.flatMap((ev, li) =>
              wins
                .filter((w) => ev.kinds.includes(w.kind))
                .map((w, wi) => {
                  const t = new Date(w.at).getTime();
                  if (t < start || t >= end) return null;
                  const px = x(t);
                  const di = Math.floor((t - start) / DAY);
                  if (marks === "lines")
                    return (
                      <g key={`${ev.key}-${wi}`}>
                        <line x1={px} x2={px} y1={T} y2={T + plotH} stroke={ev.color} strokeWidth="1.3" strokeDasharray="3 3" opacity=".75" />
                        <g transform={`translate(${px.toFixed(1)} ${T + 6 + li * 12})`}>
                          <EventMark k={ev.key} color={ev.color} size={9} />
                        </g>
                      </g>
                    );
                  // On the average of the lines shown, at that moment (the middle when there's nothing to sit on).
                  const near = visible
                    .map((s) => {
                      const inDay = s.pts.filter((p) => p.t >= start + di * DAY && p.t < start + (di + 1) * DAY);
                      return inDay.length ? inDay.reduce((a, p) => a + p.v, 0) / inDay.length : null;
                    })
                    .filter((v): v is number => v !== null);
                  const avgV = near.length ? near.reduce((a, b) => a + b, 0) / near.length : 5.5;
                  return (
                    <g key={`${ev.key}-${wi}`} transform={`translate(${px.toFixed(1)} ${(y(avgV) - 1 - (wi % 3) * 3).toFixed(1)})`}>
                      <circle r="7.5" fill="#fbf3df" stroke={ev.color} strokeWidth="1.2" opacity=".95" />
                      <EventMark k={ev.key} color={ev.color} size={9} />
                    </g>
                  );
                })
            )}

          {/* Event lanes */}
          {marks === "lanes" && activeEvents.map((ev, li) => {
            const ly = T + plotH + 32 + li * 16;
            return (
              <g key={ev.key}>
                <line x1={L} x2={W - R} y1={ly} y2={ly} stroke={GRID} strokeWidth="1" strokeDasharray="1 4" />
                <g transform={`translate(${L - 10} ${ly})`}>
                  <EventMark k={ev.key} color={ev.color} size={9} />
                </g>
                {days.map((d, i) => {
                  const c = (eventsByDay.get(dayKey(d)) ?? []).filter((w) => ev.kinds.includes(w.kind)).length;
                  if (!c) return null;
                  return (
                    <g key={i} transform={`translate(${xDay(i).toFixed(1)} ${ly})`}>
                      <EventMark k={ev.key} color={ev.color} size={n > 30 ? 8 : 10} />
                      {c > 1 && n <= 30 && (
                        <text x="7" y="3.5" fontSize="9" fontWeight="700" fill={ev.color}>
                          {c}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover readout */}
        {hd && (
          <div
            className="fade-in pointer-events-none absolute top-2 z-[3] flex max-w-[230px] flex-col gap-0.5 rounded-lg px-2.5 py-2 text-[13px] shadow-lg"
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
                {EVENTS.find((e) => e.kinds.includes(w.kind))?.label.replace(/s?( &.*)?$/, "")}: {w.title ?? w.kind}
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
              {Array.from({ length: 8 }, (_, i) => (
                <rect key={i} x="10.4" y="1.6" width="3.2" height="4.6" rx="1" fill="currentColor" transform={`rotate(${i * 45} 12 12)`} />
              ))}
              <circle cx="12" cy="12" r="6.9" fill="currentColor" />
              <circle cx="12" cy="12" r="2.7" fill="#e3c06e" />
            </svg>
          </button>
          {settings && (
            <div role="dialog" aria-label="Chart view settings" className="pop parchment absolute bottom-full right-0 mb-2 flex w-[250px] flex-col gap-2.5 p-3" style={{ borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 28px rgba(0,0,0,.3)" }}>
              <Seg label="Time span" value={String(view.range)} options={[["7", "Week"], ["30", "Month"], ["90", "3 months"]]} onPick={(v) => setV({ range: Number(v) as View["range"] })} />
              <Seg label="Points" value={view.detail} options={[["daily", "Daily average"], ["every", "Every check-in"]]} onPick={(v) => setV({ detail: v as View["detail"] })} />
              <Seg label="Lines" value={view.smooth ? "smooth" : "straight"} options={[["smooth", "Smooth"], ["straight", "Straight"]]} onPick={(v) => setV({ smooth: v === "smooth" })} />
              <Seg label="Events" value={view.marks ?? "onLine"} options={[["onLine", "On the line"], ["lines", "Marker lines"], ["lanes", "Own rows"]]} onPick={(v) => setV({ marks: v as View["marks"] })} />
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
          A few more check-ins and the trends will show. Tap a name to show or hide its line, or + to add an entry.
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
