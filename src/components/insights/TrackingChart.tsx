"use client";

import { minutesLabel, prettyTime, sleptMinutes } from "@/lib/wheel-of-time";
import { FaceIcon, faceOf } from "@/components/ui/FaceRating";

import { useEffect, useRef, useState } from "react";
import { WEATHER_EVENT, WEATHER_KEY } from "@/lib/use-weather";
import { WeatherLocation } from "@/components/ui/WeatherLocation";
import { fromFeedback } from "@/lib/from-feedback";

type Reading = { metric: string; level: number; at: string };
/** A thing you did or logged; `tone` is how it felt (-2 … 2), from an event's face or a quest's or habit's "How do you feel?". */
type WinLite = { kind: string; at: string; xp: number; title?: string; icon?: string | null; details?: string | null; tone?: number | null };

/** Series colors, checked for contrast and color-blind separation on parchment. */
const SERIES = ["#c4620f", "#2a6fb5", "#24875a", "#8a3fa0", "#c23a48", "#a0880a"];
const INK = "#3b2a14";
const INK_SOFT = "#6b5631";
const GRID = "rgba(110,85,40,.18)";
const XP_FILL = "#d9b45f";
const XP_EDGE = "#8a6116";

/** Kinds counted in a day's tally, in display order. */
const TALLIES: { kind: string; one: string; many: string }[] = [
  { kind: "quest", one: "quest", many: "quests" },
  { kind: "habit", one: "habit", many: "habits" },
  { kind: "rite", one: "rite", many: "rites" },
  { kind: "journal", one: "journal", many: "journals" },
  { kind: "feedback", one: "feedback", many: "feedback" },
  { kind: "reward", one: "reward", many: "rewards" },
];
const DAY = 86_400_000;
/** Each day shows its waking hours, 7am to 11:30pm; the nights fold away between days (owner, Nov 19). */
const H0 = 7;
const H1 = 23.5;
/** Where something you gave a face to sits on the 1–10 scale: Rough low … Wonderful high (owner, Nov 19). */
const FACE_V: Record<number, number> = { [-2]: 1.6, [-1]: 3.5, 0: 5.5, 1: 7.5, 2: 9.4 };
/** The check-in metric that rates the whole day. */
const DAY_METRIC = "My day";
const VIEW_KEY = "insights-view-2";
const SHOWN_KEY = "insights-shown";

type View = {
  range: 7 | 30 | 90;
  detail: "daily" | "every";
  smooth: boolean;
  dots: boolean;
  marks?: "onLine" | "lines" | "lanes";
  /** Merged (things on the chart, by how they felt) or split (a time-of-day panel under it), owner Nov 19. */
  layout?: "merged" | "split";
  /** Each panel's height, dragged at its bottom edge. */
  chartH?: number;
  timeH?: number;
};
const DEFAULT_VIEW: View = { range: 30, detail: "every", smooth: true, dots: true, marks: "onLine" };

const EVENTS: { key: string; label: string; kinds: string[]; glyph: string; color: string }[] = [
  { key: "quests", label: "Quests done", kinds: ["quest"], glyph: "◆", color: "#8a6116" },
  { key: "fails", label: "Quests not done", kinds: ["fail"], glyph: "✕", color: "#8a2a1c" },
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

/** A cloud that fills with the day's rain (owner, Nov 18: "the weather should show as a raincloud that is partially filled in"). */
const CLOUD = "M-7 3a3.5 3.5 0 0 1 1-6.8a5 5 0 0 1 9.5-1a3.6 3.6 0 0 1 3.5 4.4a3 3 0 0 1-.5 3.4z";
/** How full the cloud is: an inch (or 25 mm) fills it. */
function rainShare(rain: number) {
  const metric = !/^en-US/.test(typeof navigator === "undefined" ? "" : navigator.language);
  return Math.max(0.15, Math.min(1, rain / (metric ? 25 : 1)));
}

type Placed = { key: string; x: number; y: number; u: number; hour: number; li: number; ev: (typeof EVENTS)[number]; w: WinLite; felt: number | null; label: string };

/** One thing on the chart: a quest's portrait (or a gold check), a fail's ✕, or its kind's mark; in the split panel, with its face. */
function ItemMark({ p, r, badge = false }: { p: Placed; r: number; badge?: boolean }) {
  const { w, ev } = p;
  const id = `im-${p.key}`;
  return (
    <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
      <title>{p.label}</title>
      {w.kind === "quest" ? (
        w.icon ? (
          <>
            <clipPath id={id}>
              <circle r={r - 1} />
            </clipPath>
            <circle r={r} fill="#efe2c2" stroke="#8a6c2c" strokeWidth="1.2" />
            <image href={w.icon} x={-(r - 1)} y={-(r - 1)} width={(r - 1) * 2} height={(r - 1) * 2} clipPath={`url(#${id})`} preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <>
            <circle r={r} fill="#efe2c2" stroke="#8a6c2c" strokeWidth="1.2" />
            <path d={`M${-r * 0.42} 0l${r * 0.28} ${r * 0.3} ${r * 0.56} ${-r * 0.6}`} stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )
      ) : w.kind === "fail" ? (
        <>
          <circle r={r} fill="#efe2c2" stroke="#8a6c2c" strokeWidth="1.2" />
          <path d={`M${-r * 0.36} ${-r * 0.36}l${r * 0.72} ${r * 0.72}M${r * 0.36} ${-r * 0.36}l${-r * 0.72} ${r * 0.72}`} stroke="#8a2a1c" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle r={r} fill="#fbf3df" stroke={ev.color} strokeWidth="1.1" />
          <EventMark k={ev.key} color={ev.color} size={r * 1.15} />
        </>
      )}
      {badge && p.felt != null && (
        <g transform={`translate(${(r * 0.85).toFixed(1)} ${(r * 0.85).toFixed(1)})`}>
          <FaceIcon v={p.felt} size={r * 1.3} inSvg />
        </g>
      )}
    </g>
  );
}

/** A panel's bottom edge, dragged up or down to resize it; it lights gold when hovered or held. */
function ResizeEdge({ y, x1, x2, label, svgRef, W, value, min, max, onChange }: { y: number; x1: number; x2: number; label: string; svgRef: React.RefObject<SVGSVGElement | null>; W: number; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [hot, setHot] = useState(false);
  const drag = useRef<{ y: number; v: number } | null>(null);
  return (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke="#d9b45f" strokeWidth="3" strokeLinecap="round" opacity={hot ? 0.95 : 0} style={{ transition: "opacity 150ms" }} />
      <rect
        x={x1}
        y={y - 6}
        width={x2 - x1}
        height={12}
        fill="transparent"
        role="separator"
        aria-orientation="horizontal"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        style={{ cursor: "ns-resize", touchAction: "none" }}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => !drag.current && setHot(false)}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: value };
          setHot(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const r = svgRef.current?.getBoundingClientRect();
          const scale = r ? W / r.width : 1;
          onChange(Math.round(Math.max(min, Math.min(max, d.v + (e.clientY - d.y) * scale))));
        }}
        onPointerUp={() => {
          drag.current = null;
          setHot(false);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </g>
  );
}

/**
 * Every tracked metric on one 1–10 chart, each toggled with a checkbox, with
 * optional strips for the weather and for things you did (quests, habits,
 * journal notes, rewards). The gear in the corner switches how it's drawn.
 */
export function TrackingChart({ metrics, readings, wins, onAdd, nights }: { metrics: string[]; readings: Reading[]; wins: WinLite[]; onAdd?: () => void; /** Sleep by the morning it ended (Wheel of Time), shown on the day's card (owner, Nov 9). */ nights?: Record<string, { bed: string | null; wake: string | null }> }) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const tapType = useRef("mouse");
  const gearRef = useRef<HTMLDivElement>(null);
  // A zoomed-in window of time [from, to] in ms, set by pinching; null shows the whole span.
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const fingers = useRef(new Map<number, number>());
  const gesture = useRef<{ dist: number; mid: number; win: [number, number]; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // How many screen pixels one chart unit takes, so labels can be shown by how much room they really have.
  const [scale, setScale] = useState(0.75);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.getBoundingClientRect().width / 440 || 0.75));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    if (patch.range && patch.range !== view.range) setZoom(null);
    setView(next);
    writeJSON(VIEW_KEY, next);
  }
  // Metrics and XP are on by default; weather and events off until ticked.
  // Metrics, XP, quests, fails, habits and events are on by default (owner, Nov 19: they sit on the chart); weather, journal and rewards off until ticked.
  const isOn = (k: string) => shown[k] ?? !(k === "weather" || k === "journal" || k === "rewards");
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
  // Events sit on the chart by how they felt, as marker lines, or in their own rows.
  const marks = view.marks ?? "onLine";
  const split = view.layout === "split";
  // The visible window, in days (0 … n), each day its waking hours; pinching zooms it.
  const [v0, v1] = zoom && zoom[0] >= 0 && zoom[1] <= n ? zoom : [0, n];
  const visDays = Math.max(1, Math.round(v1 - v0));
  // Zoomed in to a few days: the times show along the bottom and the days are divided by dotted lines.
  const close = visDays <= 3;
  // Above the chart: each day's rating and rain. Its date and "+n XP" sit underneath it (owner, Nov 19).
  // Split (owner, Nov 19): the date sits with its weekday above the chart, and the XP at the very bottom, under the time panel.
  const headH = split ? 36 : 22;
  const T = headH + 4;
  const plotH = Math.max(90, Math.min(360, view.chartH ?? 190));
  const eventsH = activeEvents.length && marks === "lanes" ? 14 + activeEvents.length * 16 : 0;
  const timesH = close ? 16 : 0;
  const footY = T + plotH + timesH + eventsH;
  const footH = split ? 0 : 30;
  const plotEnd = footY + footH;
  const tP = plotEnd + (split ? 6 : 12);
  const timeH = split ? Math.max(90, Math.min(400, view.timeH ?? 200)) : 0;
  const xpY = tP + timeH + 22;
  const sleepY = (split ? xpY + 4 : plotEnd) + 16;
  const H = sleepY + (nights ? 8 : -6);
  const uOf = (t: number) => {
    const d = new Date(t);
    const m = new Date(t);
    m.setHours(0, 0, 0, 0);
    const i = Math.round((m.getTime() - start) / DAY);
    const h = d.getHours() + d.getMinutes() / 60;
    // Before 7 AM or after 11:30 PM: just inside the day's edge, never on the line between days (owner, Nov 19).
    return i + Math.max(0.06, Math.min(0.94, (h - H0) / (H1 - H0)));
  };
  const xu = (u: number) => L + ((u - v0) / (v1 - v0)) * (W - L - R);
  const x = (t: number) => xu(uOf(t));
  const xDay = (i: number) => xu(i + 0.5);
  /** Where a pointer sits, in chart units (0…W). */
  const svgX = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? ((clientX - r.left) / r.width) * W : 0;
  };
  const uAt = (px: number) => v0 + ((px - L) / (W - L - R)) * (v1 - v0);
  const dayAt = (px: number) => Math.floor(uAt(px));
  const inView = (i: number) => i + 1 > v0 && i < v1;
  /** Keep a zoom window inside the span, at least a day wide. */
  function clampWin(a: number, b: number): [number, number] | null {
    const span = Math.min(n, Math.max(1, b - a));
    if (span >= n - 0.25) return null;
    const lo = Math.max(0, Math.min(a, n - span));
    return [lo, lo + span];
  }
  const y = (v: number) => T + ((10 - v) * plotH) / 9;
  /** The time-of-day panel (split): morning at the top, night at the bottom. */
  const tY = (h: number) => tP + 8 + ((Math.max(H0, Math.min(H1, h)) - H0) / (H1 - H0)) * (timeH - 16);
  const hourOf = (t: number) => {
    const d = new Date(t);
    return d.getHours() + d.getMinutes() / 60;
  };

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

  // How the day was: the day's "My day" check-ins, averaged (shown above the chart).
  const dayRate = days.map((d) => {
    const vs = readings.filter((r) => r.metric === DAY_METRIC && dayKey(new Date(r.at)) === dayKey(d)).map((r) => r.level);
    return vs.length ? Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
  });
  // The line things without a face rest on: the first line shown, read at that moment.
  const restLine = visible[0] ? visible[0].pts.map((p) => [x(p.t), y(p.v)] as [number, number]).sort((a, b) => a[0] - b[0]) : [];
  const lineAt = (px: number) => {
    if (!restLine.length) return y(5.5);
    if (px <= restLine[0][0]) return restLine[0][1];
    for (let i = 1; i < restLine.length; i++) {
      const [ax, ay] = restLine[i - 1];
      const [bx, by] = restLine[i];
      if (px <= bx) return bx === ax ? by : ay + ((by - ay) * (px - ax)) / (bx - ax);
    }
    return restLine[restLine.length - 1][1];
  };
  // Everything shown on the chart, placed so none hides another (owner, Nov 19: "making sure that items … aren't overlapping too much").
  const itemR = close ? 9 : 7.5;
  const placed: Placed[] = (() => {
    const out: Placed[] = [];
    const taken: [number, number][] = restLine.filter(([px]) => px >= L && px <= W - R);
    const all = activeEvents
      .flatMap((ev, li) => wins.filter((w) => ev.kinds.includes(w.kind)).map((w, wi) => ({ ev, li, w, wi, t: new Date(w.at).getTime() })))
      .filter((o) => o.t >= start && o.t < end)
      .sort((a, b) => a.t - b.t);
    for (const o of all) {
      const u = uOf(o.t);
      if (u < v0 - 0.2 || u > v1 + 0.2) continue;
      const px = xu(u);
      const felt = typeof o.w.tone === "number" && FACE_V[o.w.tone] !== undefined ? o.w.tone : null;
      const want = felt != null ? y(FACE_V[felt]) : lineAt(px) - itemR - 4;
      const step = itemR * 2 + 2;
      let py = want;
      for (const k of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
        const c = Math.max(T + itemR + 1, Math.min(T + plotH - itemR - 1, want + k * step));
        if (taken.every(([tx, ty]) => Math.hypot(tx - px, ty - c) >= step - 1)) {
          py = c;
          break;
        }
      }
      taken.push([px, py]);
      const when = new Date(o.w.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      out.push({ key: `${o.ev.key}-${o.wi}`, x: px, y: py, u, hour: hourOf(o.t), li: o.li, ev: o.ev, w: o.w, felt, label: [`${o.w.title ?? o.ev.label} · ${when}`, felt != null ? faceOf(felt)?.label : null, o.w.details].filter(Boolean).join(" — ") });
    }
    return out;
  })();
  // In the split panel: each day's things on the right of its column, at their time, nudged down so none hides another.
  const splitPlaced: Placed[] = (() => {
    if (!split) return [];
    const taken: [number, number][] = [];
    return placed.map((p) => {
      const px = xu(Math.floor(p.u) + 0.68);
      let py = tY(p.hour);
      while (taken.some(([tx, ty]) => Math.abs(tx - px) < itemR * 2 && Math.abs(ty - py) < itemR * 2 + 1)) py += itemR * 2 + 1;
      taken.push([px, py]);
      return { ...p, x: px, y: py };
    });
  })();

  // XP always shows, as "+n XP" under each day (owner, Nov 19); no toggle.
  const showXp = true;
  const shownCount = series.filter((m) => isOn(m.metric)).length + (showWeather ? 1 : 0) + activeEvents.length;
  const xpByDay = days.map((d) => (eventsByDay.get(dayKey(d)) ?? []).reduce((a, w) => a + (w.xp || 0), 0));
  const xpTotal = xpByDay.reduce((a, b) => a + b, 0);
  const xpMaxShown = Math.max(1, ...xpByDay);
  const dayW = (W - L - R) / (v1 - v0);
  // A day's width on screen: 18px or more and every day gets its own date (owner, Nov 19).
  const everyDay = dayW >= 14 || dayW * scale >= 18;

  const tickEvery = visDays <= 7 ? 1 : visDays <= 30 ? 7 : 14;
  const hd = hover !== null ? days[hover] : null;
  const hk = hd ? dayKey(hd) : null;
  const hoverVals = hd
    ? visible.map((s) => {
        const inDay = s.pts.filter((p) => p.t >= hd.getTime() && p.t < hd.getTime() + DAY);
        return { s, v: inDay.length ? inDay.reduce((a, p) => a + p.v, 0) / inDay.length : null };
      })
    : [];
  const hoverEvents = hk ? (eventsByDay.get(hk) ?? []).filter((w) => activeEvents.some((e) => e.kinds.includes(w.kind))) : [];
  const hoverWins = hk ? (eventsByDay.get(hk) ?? []) : [];
  const hoverTally = TALLIES.map((t) => ({ t, c: hoverWins.filter((w) => w.kind === t.kind).length }))
    .filter(({ c }) => c)
    .map(({ t, c }) => `${c} ${c === 1 ? t.one : t.many}`)
    .join(" · ");
  const hoverIcons = hoverWins.filter((w) => w.icon).slice(0, 6);
  const hoverWeather = hk && weather ? weather[hk] : null;
  // The night that ended that morning: bed and wake times, and how long (owner, Nov 9: "show sleep/wake times… on the chart").
  const hoverNight = hk && nights ? nights[hk] : null;
  const nightWords = hoverNight && (hoverNight.bed || hoverNight.wake)
    ? [hoverNight.bed ? prettyTime(hoverNight.bed) : "?", hoverNight.wake ? prettyTime(hoverNight.wake) : "?"].join(" → ") + (() => {
        const m = sleptMinutes({ bed: hoverNight.bed, wake: hoverNight.wake, effort: [], hindrances: [], at: "" });
        return m ? ` · ${minutesLabel(m)}` : "";
      })()
    : null;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

  return (
    <div className="relative z-[1] flex flex-col gap-2">
      {/* Toggles, kept small so the chart leads: XP and each metric as a pill (its swatch is its mark), the rest under "Weather & events". */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* One button for what's on the chart (owner, Nov 19); on a wider screen the lines also show as pills. */}
        <div className="hidden flex-wrap items-center gap-1.5 sm:flex" role="group" aria-label="Lines to show">
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
        <div ref={moreRef} className="relative ml-auto shrink-0">
          <button
            type="button"
            onClick={() => setMore((o) => !o)}
            aria-expanded={more}
            className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold"
            style={{ border: `1px solid ${extrasOn ? "#8a6116" : GRID}`, background: extrasOn ? "rgba(217,180,95,.3)" : undefined, color: INK }}
          >
            Show{shownCount ? ` (${shownCount})` : ""}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {more && (
            <div role="dialog" aria-label="What the chart shows" className="pop parchment absolute bottom-full right-0 z-[6] mb-1.5 flex max-h-[min(46vh,340px)] w-[230px] flex-col overflow-y-auto py-1" style={{ borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 28px rgba(0,0,0,.3)" }}>
              {series.map((m) => (
                <label key={m.metric} className="relative z-[1] flex min-h-8 items-center gap-2 px-3 text-[14px]" style={{ color: INK }}>
                  <input type="checkbox" checked={isOn(m.metric)} onChange={() => flip(m.metric)} />
                  <span aria-hidden className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: m.color }} />
                  {m.metric}
                </label>
              ))}
              {series.length > 0 && <span aria-hidden className="mx-3 my-1 block h-px" style={{ background: GRID }} />}
              <label className="relative z-[1] flex min-h-8 items-center gap-2 px-3 text-[14px]" style={{ color: INK }}>
                <input type="checkbox" checked={showWeather} onChange={() => flip("weather")} />
                <svg aria-hidden width="16" height="14" viewBox="-9 -7 20 12">
                  <path d={CLOUD} fill="none" stroke={INK_SOFT} strokeWidth="1.2" />
                </svg>
                Weather
              </label>
              {EVENTS.map((e) => (
                <label key={e.key} className="relative z-[1] flex min-h-8 items-center gap-2 px-3 text-[14px]" style={{ color: INK }}>
                  <input type="checkbox" checked={isOn(e.key)} onChange={() => flip(e.key)} />
                  <svg aria-hidden width="14" height="14" viewBox="-7 -7 14 14">
                    {/* One ink for the list's marks (owner, Nov 14: flat, single-colour icons). */}
                    <EventMark k={e.key} color={INK_SOFT} size={12} />
                  </svg>
                  {e.label}
                </label>
              ))}
            </div>
          )}
        </div>
        {/* The chart's gear, in the row above it, so changing the layout never moves it (owner, Nov 19). */}
        <div ref={gearRef} className="relative z-[6] shrink-0">
          <button
            type="button"
            onClick={() => setSettings((o) => !o)}
            aria-expanded={settings}
            aria-label="Chart view settings"
            title="View settings"
            className="flex h-8 w-8 items-center justify-center rounded-full"
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
            <div role="dialog" aria-label="Chart view settings" className="pop parchment absolute right-0 top-full mt-2 flex w-[250px] flex-col gap-2.5 p-3" style={{ borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 12px 28px rgba(0,0,0,.3)" }}>
              <Seg label="Time span" value={String(view.range)} options={[["7", "Week"], ["30", "Month"], ["90", "3 months"]]} onPick={(v) => setV({ range: Number(v) as View["range"] })} />
              <Seg label="Points" value={view.detail} options={[["daily", "Daily average"], ["every", "Every check-in"]]} onPick={(v) => setV({ detail: v as View["detail"] })} />
              <Seg label="Lines" value={view.smooth ? "smooth" : "straight"} options={[["smooth", "Smooth"], ["straight", "Straight"]]} onPick={(v) => setV({ smooth: v === "smooth" })} />
              <Seg label="Layout" value={view.layout ?? "merged"} options={[["merged", "Merged"], ["split", "Split"]]} onPick={(v) => setV({ layout: v as View["layout"] })} />
              {!split && <Seg label="Things you did" value={view.marks ?? "onLine"} options={[["onLine", "On the chart"], ["lines", "Marker lines"], ["lanes", "Own rows"]]} onPick={(v) => setV({ marks: v as View["marks"] })} />}
              <label className="relative z-[1] flex min-h-8 items-center gap-2 text-[14px]" style={{ color: INK }}>
                <input type="checkbox" checked={view.dots} onChange={() => setV({ dots: !view.dots })} />
                Show each point
              </label>
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
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          // A finger dragging up or down scrolls the page; two fingers pinch to zoom, one drags a zoomed chart sideways; a tap shows that day's numbers.
          className="w-full touch-pan-y select-none"
          role="img"
          aria-label={`${[showXp ? "XP per day" : "", ...visible.map((s) => s.metric)].filter(Boolean).join(", ") || "No metrics"} over the last ${n} days, on a 1 to 10 scale`}
          onPointerMove={(e) => {
            const f = fingers.current;
            if (f.has(e.pointerId)) {
              f.set(e.pointerId, e.clientX);
              const g = gesture.current;
              if (g && f.size >= 2) {
                const [a, b] = [...f.values()].map(svgX);
                const dist = Math.max(8, Math.abs(a - b));
                const span = ((g.win[1] - g.win[0]) * g.dist) / dist;
                // Keep the moment first under the fingers' midpoint under it as they move.
                const tMid = g.win[0] + ((g.mid - L) / (W - L - R)) * (g.win[1] - g.win[0]);
                const lo = tMid - (((a + b) / 2 - L) / (W - L - R)) * span;
                g.moved = true;
                setZoom(clampWin(lo, lo + span));
                return;
              }
              if (g && f.size === 1 && zoom) {
                const dx = svgX(e.clientX) - g.mid;
                if (Math.abs(dx) > 6 || g.moved) {
                  g.moved = true;
                  const shift = (dx / (W - L - R)) * (g.win[1] - g.win[0]);
                  setZoom(clampWin(g.win[0] - shift, g.win[1] - shift));
                }
                return;
              }
            }
            if (e.pointerType !== "mouse") return;
            const i = dayAt(svgX(e.clientX));
            setHover(i >= 0 && i < n && inView(i) ? i : null);
          }}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          onPointerDown={(e) => {
            tapType.current = e.pointerType;
            if (e.pointerType === "mouse") return;
            const f = fingers.current;
            f.set(e.pointerId, e.clientX);
            const xs = [...f.values()].map(svgX);
            gesture.current = {
              dist: xs.length >= 2 ? Math.max(8, Math.abs(xs[0] - xs[1])) : 0,
              mid: xs.length >= 2 ? (xs[0] + xs[1]) / 2 : xs[0],
              win: [v0, v1],
              moved: xs.length >= 2 ? true : false,
            };
          }}
          onPointerUp={(e) => {
            fingers.current.delete(e.pointerId);
            const left = [...fingers.current.values()];
            // One finger lifted mid-pinch: carry on as a drag from where the other is.
            if (left.length === 1 && gesture.current) gesture.current = { ...gesture.current, dist: 0, mid: svgX(left[0]), win: [v0, v1] };
          }}
          onPointerCancel={(e) => fingers.current.delete(e.pointerId)}
          onClick={(e) => {
            // A pinch or drag just ended: not a tap.
            const g = gesture.current;
            gesture.current = null;
            if (g?.moved) return;
            const i = dayAt(svgX(e.clientX));
            if (i < 0 || i >= n || !inView(i)) return setHover(null);
            // On a touch screen the first tap shows the day; tapping it again logs an event on it.
            if (tapType.current !== "mouse" && hover !== i) return setHover(i);
            window.dispatchEvent(new CustomEvent("insights-add-event", { detail: { date: dayKey(days[i]) } }));
          }}
          style={{ cursor: 'url("/design/cursor-hand.svg") 11 3, copy' }}
        >
          <defs>
            <clipPath id="plot-clip">
              <rect x={L} y={0} width={W - L - R} height={H} />
            </clipPath>
            <clipPath id="head-clip">
              <rect x={L} y={0} width={W - L - R + R} height={H} />
            </clipPath>
            <clipPath id="time-clip">
              <rect x={L} y={tP} width={W - L - R} height={timeH} />
            </clipPath>
          </defs>
          {/* Above the chart, what belongs to a whole day (owner, Nov 19): its date, how the day was (the "My day"
              check-in), and the rain, as a cloud that fills with how wet it was. */}
          <g clipPath="url(#head-clip)">
            {days.map((d, i) => {
              if (!inView(i)) return null;
              if (!everyDay && (n - 1 - i) % tickEvery !== 0) return null;
              const x0 = xu(i) + 3;
              const rate = dayRate[i];
              const w = showWeather && weather ? weather[dayKey(d)] : null;
              const wide = dayW >= 58;
              const wd = i === n - 1 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
              const rx = x0 + 44;
              const cx = rate != null && wide ? x0 + 64 : x0 + 44;
              return (
                <g key={i}>
                  <text x={wide ? x0 + 1 : xDay(i)} y={15} textAnchor={wide ? "start" : "middle"} fontSize="11.5" fontWeight={i === n - 1 ? 700 : 400} fill={hover === i || i === n - 1 ? INK : INK_SOFT} fontFamily="var(--font-display, Georgia), serif">
                    {everyDay ? (wide ? wd : wd.slice(0, i === n - 1 ? (dayW >= 30 ? 5 : 1) : dayW >= 22 ? 2 : 1)) : ""}
                  </text>
                  {rate != null && wide && (
                    <g transform={`translate(${rx.toFixed(1)} 11)`}>
                      <title>{`How the day was: ${rate} of 10`}</title>
                      <circle r="8" fill="#fffaf0" stroke="#a88a3f" strokeWidth="1" />
                      <text y="3.6" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>
                        {rate}
                      </text>
                    </g>
                  )}
                  {w && wide && (
                    <g transform={`translate(${cx.toFixed(1)} 14)`}>
                      <title>{`${w.hi}° / ${w.lo}°${w.rain > 0.02 ? `, rain ${w.rain.toFixed(2)}` : ""}`}</title>
                      <clipPath id={`cloud-${i}`}>
                        <path d={CLOUD} />
                      </clipPath>
                      {w.rain > 0.02 && <rect x="-8" y={(3 - 9 * rainShare(w.rain)).toFixed(2)} width="16" height="10" fill="#7d93a8" opacity=".6" clipPath={`url(#cloud-${i})`} />}
                      <path d={CLOUD} fill="none" stroke={INK} strokeWidth="1" />
                      {wide && (
                        <text x="11" y="3" fontSize="9.5" fill={INK_SOFT}>
                          {w.hi}°
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>

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
          {/* Days divided by a thin line, faint when zoomed out and dotted when zoomed in; the hours, dotted and fainter, with their times, once a day is wide enough (owner, Nov 19). */}
          <g clipPath="url(#plot-clip)">
            {/* Squished (a month or more): every day gets a light dashed line (owner, Nov 19), and the labelled stretches a solid one. */}
            {days.map((_, i) => {
              if (i === 0 || !inView(i)) return null;
              const stretch = everyDay || (n - 1 - i) % tickEvery === tickEvery - 1;
              const dash = close ? "2 3" : stretch ? undefined : "2 3";
              const op = close ? 1 : stretch ? 0.7 : 0.4;
              const w = stretch ? 1.1 : 0.8;
              return (
                <g key={i}>
                  <line x1={xu(i)} x2={xu(i)} y1={T} y2={T + plotH} stroke="rgba(110,85,40,.42)" strokeWidth={w} strokeDasharray={dash} opacity={op} />
                  {split && <line x1={xu(i)} x2={xu(i)} y1={tP} y2={tP + timeH} stroke="rgba(110,85,40,.42)" strokeWidth={w} strokeDasharray={dash} opacity={op} />}
                </g>
              );
            })}
            {close &&
              days.flatMap((_, i) =>
                inView(i)
                  ? [9, 12, 15, 18, 21].map((h) => {
                      const hx = xu(i + (h - H0) / (H1 - H0));
                      return (
                        <g key={`${i}-${h}`}>
                          <line x1={hx} x2={hx} y1={T} y2={T + plotH} stroke={GRID} strokeWidth="1" strokeDasharray="1 4" />
                          <text x={hx} y={T + plotH + 12} textAnchor="middle" fontSize="9.5" fill={INK_SOFT}>
                            {h === 12 ? "noon" : `${h % 12}${h < 12 ? "a" : "p"}`}
                          </text>
                        </g>
                      );
                    })
                  : []
              )}
          </g>
          {/* Under each day: its date, and the XP earned that day (owner, Nov 19). */}
          <g clipPath="url(#head-clip)">
            {days.map((d, i) => {
              if (!inView(i)) return null;
              // Every day keeps its own date once a day is 14px wide (owner, Nov 19): the day's number alone, with the
              // month on the first day shown and on the 1st; narrower than that, a date per labelled stretch.
              if (!everyDay && (n - 1 - i) % tickEvery !== 0) return null;
              const wide = dayW >= 58;
                            const label =
                dayW >= 30
                  ? d.toLocaleDateString(undefined, wide ? { month: "short", day: "numeric" } : { month: "numeric", day: "numeric" })
                  : everyDay
                    ? // Too narrow for "11/1": the 1st shows its month's name ("Nov") instead, every other day its number.
                      d.getDate() === 1
                      ? d.toLocaleDateString(undefined, { month: "short" })
                      : String(d.getDate())
                    : `${d.getMonth() + 1}/${d.getDate()}`;
              return (
                <g key={i}>
                  <text x={xDay(i)} y={split ? 31 : footY + 12} textAnchor="middle" fontSize={dayW >= 30 ? 11 : 9} fill={hover === i ? INK : INK_SOFT} fontWeight={i === n - 1 ? 700 : 400} fontFamily="var(--font-display, Georgia), serif">
                    {/* The date at the bottom (owner, Nov 19), the weekday above the chart. */}
                    {label}
                  </text>
                  {/* XP under each date; squished (a month or more), the XP of the days up to this date. */}
                  {(() => {
                    const span = everyDay ? 1 : tickEvery;
                    const sum = xpByDay.slice(Math.max(0, i - span + 1), i + 1).reduce((a, b) => a + (b ?? 0), 0);
                    if (!sum) return null;
                    const tip = span > 1 ? `${sum} XP over these ${span} days` : `${sum} XP that day`;
                    const words = `+${sum} XP`;
                    const fs = dayW >= 22 ? 10 : 9;
                    const base = split ? xpY : footY + 25;
                    // Always "+n XP" (owner, Nov 19); where it won't fit, a small gold bar as tall as the day's XP, its number on hover or tap.
                    if (words.length * fs * 0.56 <= (span > 1 ? dayW * span : dayW) * 0.94)
                      return (
                        <text x={xDay(i)} y={base} textAnchor="middle" fontSize={fs} fontWeight="700" fill={XP_EDGE}>
                          <title>{tip}</title>
                          {words}
                        </text>
                      );
                    const bh = Math.max(2, 13 * (sum / xpMaxShown));
                    const bw = Math.min(6, dayW * 0.45);
                    return (
                      <rect x={xDay(i) - bw / 2} y={base + 2 - bh} width={bw} height={bh} rx={Math.min(2, bw / 2)} fill={XP_FILL} stroke={XP_EDGE} strokeWidth=".8" data-xp-bar>
                        <title>{tip}</title>
                      </rect>
                    );
                  })()}
                </g>
              );
            })}
          </g>
          {hover !== null && <line x1={xDay(hover)} x2={xDay(hover)} y1={T} y2={sleepY - 10} stroke={INK_SOFT} strokeWidth="1" strokeDasharray="3 3" />}

          {/* Lines */}
          <g clipPath="url(#plot-clip)">
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

          </g>

          {/* Marker lines: a dashed line at the moment, its mark at the top. */}
          <g clipPath="url(#plot-clip)">
          {marks === "lines" &&
            placed.map((p) => (
              <g key={p.key}>
                <title>{p.label}</title>
                <line x1={p.x} x2={p.x} y1={T} y2={T + plotH} stroke={p.ev.color} strokeWidth="1.3" strokeDasharray="3 3" opacity=".75" />
                <g transform={`translate(${p.x.toFixed(1)} ${T + 6 + p.li * 12})`}>
                  <EventMark k={p.ev.key} color={p.ev.color} size={9} />
                </g>
              </g>
            ))}
          {/* Merged (owner, Nov 19): each thing at its time, at the height of the face you gave it; without a face,
              just above the line at that moment. Nudged up or down so none hides another; the time stays put. */}
          {marks === "onLine" && !split && placed.map((p) => <ItemMark key={p.key} p={p} r={close ? 9 : 7.5} />)}
          </g>

          {/* Split: the time-of-day panel under the chart, check-ins on the left of each day, things on the right. */}
          {split && (
            <g>
              <rect x={L} y={tP} width={W - L - R} height={timeH} rx="6" fill="rgba(255,250,235,.45)" />
              {[9, 12, 15, 18, 21].map((h) => (
                <g key={h}>
                  <line x1={L} x2={W - R} y1={tY(h)} y2={tY(h)} stroke={GRID} strokeWidth="1" strokeDasharray="1 4" />
                  <text x={L - 4} y={tY(h) + 3} textAnchor="end" fontSize="9.5" fill={INK_SOFT}>
                    {h === 12 ? "noon" : `${h % 12}${h < 12 ? "a" : "p"}`}
                  </text>
                </g>
              ))}
              <g clipPath="url(#time-clip)">
                {readings
                  .filter((r) => isOn(r.metric) && r.metric === (visible[0]?.metric ?? ""))
                  .map((r, i) => {
                    const t = new Date(r.at).getTime();
                    if (t < start || t >= end) return null;
                    const di = Math.floor(uOf(t));
                    if (!inView(di)) return null;
                    const cx = xu(di + 0.3);
                    const cy = tY(hourOf(t));
                    return (
                      <path key={i} d={`M${cx.toFixed(1)} ${(cy - 6).toFixed(1)}L${(cx + 5).toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${(cy + 6).toFixed(1)}L${(cx - 5).toFixed(1)} ${cy.toFixed(1)}Z`} fill="#d9b45f" stroke="#6b4a14" strokeWidth="1">
                        <title>{`Check-in, ${new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</title>
                      </path>
                    );
                  })}
                {splitPlaced.map((p) => (
                  <ItemMark key={p.key} p={p} r={itemR} badge />
                ))}
              </g>
            </g>
          )}

          {/* Last night's sleep, under each day. */}
          {nights && (
            <g clipPath="url(#head-clip)">
              {days.map((d, i) => {
                const night = nights[dayKey(d)];
                const m = night ? sleptMinutes({ bed: night.bed, wake: night.wake, effort: [], hindrances: [], at: "" }) : null;
                if (!m || !inView(i) || dayW < 46) return null;
                const x0 = xu(i) + 4;
                return (
                  <g key={i} transform={`translate(${x0.toFixed(1)} ${sleepY})`}>
                    <title>{`Slept ${night?.bed ? prettyTime(night.bed) : "?"} → ${night?.wake ? prettyTime(night.wake) : "?"}`}</title>
                    <path d="M5.5 -4.6A4 4 0 1 0 9 1.2A3.2 3.2 0 0 1 5.5 -4.6Z" fill="none" stroke={INK_SOFT} strokeWidth="1" />
                    <text x="12" y="1" fontSize="9.5" fill={INK_SOFT}>
                      {dayW >= 80 ? `slept ${minutesLabel(m)}` : minutesLabel(m)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Each panel's bottom edge drags to give it more or less room (owner, Nov 19); no grip, the edge itself moves. */}
          <ResizeEdge y={T + plotH} x1={L} x2={W - R} label="Resize the chart" svgRef={svgRef} W={W} value={plotH} min={90} max={360} onChange={(v) => setV({ chartH: v })} />
          {split && <ResizeEdge y={tP + timeH} x1={L} x2={W - R} label="Resize the time-of-day panel" svgRef={svgRef} W={W} value={timeH} min={90} max={400} onChange={(v) => setV({ timeH: v })} />}

          {/* Event lanes */}
          {marks === "lanes" && activeEvents.map((ev, li) => {
            const ly = T + plotH + timesH + 14 + li * 16;
            return (
              <g key={ev.key}>
                <line x1={L} x2={W - R} y1={ly} y2={ly} stroke={GRID} strokeWidth="1" strokeDasharray="1 4" />
                <g transform={`translate(${L - 10} ${ly})`}>
                  <EventMark k={ev.key} color={ev.color} size={9} />
                </g>
                {days.map((d, i) => {
                  const c = (eventsByDay.get(dayKey(d)) ?? []).filter((w) => ev.kinds.includes(w.kind)).length;
                  if (!c || !inView(i)) return null;
                  return (
                    <g key={i} transform={`translate(${xDay(i).toFixed(1)} ${ly})`}>
                      <EventMark k={ev.key} color={ev.color} size={visDays > 30 ? 8 : 10} />
                      {c > 1 && visDays <= 30 && (
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

      </figure>
        {/* The day you tapped, under the chart instead of over it (owner, Nov 19: "the selector should not cover the chart"). */}
        {hd && (
          <div
            className="reveal grid grid-cols-1 gap-x-5 gap-y-0.5 rounded-lg px-3 py-2 text-[13px] sm:grid-cols-2"
            style={{ background: "rgba(251,243,223,.7)", border: `1px solid ${GRID}`, color: INK }}
            data-day-readout
          >
            <b className="text-[13.5px] sm:col-span-2">{hd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</b>
            {hoverVals.map(({ s, v }) => (
              <span key={s.metric} className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.metric} <b className="ml-auto tabular-nums">{v === null ? "—" : fmt(v)}</b>
              </span>
            ))}
            {showXp && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: XP_FILL, border: `1px solid ${XP_EDGE}` }} />
                XP earned <b className="ml-auto tabular-nums">{xpByDay[hover!]}</b>
              </span>
            )}
            {showXp && hoverTally && <span style={{ color: INK_SOFT }}>{hoverTally}</span>}
            {showXp && hoverIcons.length > 0 && (
              <span className="flex flex-wrap gap-1 pt-0.5">
                {hoverIcons.map((w, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                  <img key={i} src={w.icon!} alt="" className="h-6 w-6 rounded-full object-cover" style={{ border: "1px solid #a58c66" }} />
                ))}
              </span>
            )}
            {nightWords && (
              <span className="flex items-center gap-1.5">
                <svg aria-hidden width="11" height="11" viewBox="0 0 24 24">
                  <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" fill="none" stroke={INK_SOFT} strokeWidth="2.2" strokeLinejoin="round" />
                </svg>
                Slept <b className="ml-auto tabular-nums">{nightWords}</b>
              </span>
            )}
            {showWeather && hoverWeather && (
              <span>
                ⛅ {hoverWeather.hi}° / {hoverWeather.lo}°{hoverWeather.rain > 0.02 ? ` · 💧 ${hoverWeather.rain.toFixed(2)}` : ""}
              </span>
            )}
            {hoverEvents.slice(0, 4).map((w, i) => (
              <span key={i} className="truncate" style={{ color: INK_SOFT }}>
                {w.kind === "note" && faceOf(w.tone) && (
                  <span className="mr-1 inline-flex align-[-3px]">
                    <FaceIcon v={w.tone!} size={15} />
                  </span>
                )}
                {EVENTS.find((e) => e.kinds.includes(w.kind))?.label.replace(/s?( &.*)?$/, "")}: {w.title ?? w.kind}
                {w.details && <span className="block whitespace-normal text-[11.5px] opacity-80">{w.details}</span>}
              </span>
            ))}
            {hoverEvents.length > 4 && <span style={{ color: INK_SOFT }}>+{hoverEvents.length - 4} more</span>}
          </div>
        )}

      {(zoom || showXp) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: INK_SOFT }}>
          {showXp && (
            <span className="tabular-nums">
              {xpTotal} XP over {n === 7 ? "the week" : `${n} days`} · {Math.round(xpTotal / n)} a day on average
            </span>
          )}
          {zoom && (
            <button type="button" onClick={() => setZoom(null)} className="ml-auto h-7 rounded-full px-2.5 text-[13px] font-semibold" style={{ border: `1px solid ${GRID}`, color: INK }}>
              Zoom out
            </button>
          )}
        </div>
      )}
      {visible.every((s) => s.pts.length < 3) && (
        <p className="m-0 text-[13px]" style={{ color: INK_SOFT }}>
          A few more check-ins and the trends will show. Use Show to choose what the chart shows, or + to add an entry.
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
