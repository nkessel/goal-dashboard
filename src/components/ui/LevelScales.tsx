"use client";

import { useRef, useSyncExternalStore } from "react";

/*
 * Importance, urgency, difficulty and the like (0–5): as rows of little
 * icons, or as vertical bars side by side with the icon at each bar's foot.
 * Bars by default; the choice is kept in this browser and changed from the
 * small toggle beside any group of them. Quest cards follow the same choice.
 */

export type ScaleStyle = "icons" | "bars";
const KEY = "scale-style";
const EVENT = "scale-style-change";

export function readScaleStyle(): ScaleStyle {
  try {
    // Bars unless you've chosen rows of icons.
    return localStorage.getItem(KEY) === "icons" ? "icons" : "bars";
  } catch {
    return "bars";
  }
}
export function setScaleStyle(v: ScaleStyle) {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
export function useScaleStyle(): ScaleStyle {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    readScaleStyle,
    () => "bars"
  );
}

/** The colours of the scale bars (Settings › Visual Effects › Scale colours), kept in this browser. */
export const SCALE_KEYS = [
  ["importance", "Importance"],
  ["urgency", "Urgency"],
  ["difficulty", "Difficulty"],
  ["energy", "Energy boost"],
] as const;
export type ScaleKey = (typeof SCALE_KEYS)[number][0];
const COLOR_KEY = "scale-colors";
const COLOR_EVENT = "scale-colors-change";
let colorCache: { raw: string | null; v: Partial<Record<ScaleKey, string>> } = { raw: null, v: {} };
function readScaleColors(): Partial<Record<ScaleKey, string>> {
  try {
    const raw = localStorage.getItem(COLOR_KEY);
    if (raw !== colorCache.raw) colorCache = { raw, v: raw ? JSON.parse(raw) : {} };
    return colorCache.v;
  } catch {
    return colorCache.v;
  }
}
const NO_COLORS = {};
export function useScaleColors(): Partial<Record<ScaleKey, string>> {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(COLOR_EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(COLOR_EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    readScaleColors,
    () => NO_COLORS
  );
}
export function setScaleColor(k: ScaleKey, c: string | null) {
  const next = { ...readScaleColors() };
  if (c) next[k] = c;
  else delete next[k];
  try {
    localStorage.setItem(COLOR_KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(COLOR_EVENT));
}
/** A bar's fill in a chosen colour (shaded like the gold one), or undefined for the gold. */
export function fillFor(c: string | undefined): React.CSSProperties | undefined {
  if (!c) return undefined;
  return { background: `linear-gradient(0deg, color-mix(in srgb, ${c} 70%, #000), ${c} 60%, color-mix(in srgb, ${c} 50%, #fff))`, boxShadow: `0 0 6px color-mix(in srgb, ${c} 50%, transparent), inset 0 1px 0 rgba(255,255,255,.5)` };
}

/** Settings › Visual Effects › Scale colours: one swatch row per scale. */
export function ScaleColorSettings() {
  const colors = useScaleColors();
  const swatches = ["#d9b45f", "#c0533f", "#d98a2e", "#5c8f3a", "#3f7fb8", "#7a5ab0", "#8a8a8a"];
  return (
    <div className="flex flex-col gap-2">
      {SCALE_KEYS.map(([k, label]) => (
        <div key={k} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 text-[13.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
            {label}
          </span>
          {swatches.map((c, i) => {
            const on = (colors[k] ?? "#d9b45f") === c;
            return (
              <button key={c} type="button" onClick={() => setScaleColor(k, i === 0 ? null : c)} aria-label={`${label}: ${i === 0 ? "gold" : c}`} aria-pressed={on} className="h-7 w-7 rounded-full" style={{ background: c, boxShadow: on ? "0 0 0 2px #fff, 0 0 0 4px #4a3913" : "inset 0 0 0 1px rgba(0,0,0,.25)" }} />
            );
          })}
          <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full" title="Any colour" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)", boxShadow: colors[k] && !swatches.includes(colors[k]!) ? "0 0 0 2px #fff, 0 0 0 4px #4a3913" : undefined }}>
            <input type="color" value={colors[k] ?? "#d9b45f"} onChange={(e) => setScaleColor(k, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label}: any colour`} />
          </label>
        </div>
      ))}
    </div>
  );
}

export type ScaleItem = { key: string; label: string; icon: string; hint?: string; value: number; onChange: (v: number) => void };

/** One or more 0–5 scales, drawn in the chosen style, with the toggle between styles. */
export function LevelScales({ items, renderRow }: { items: ScaleItem[]; renderRow: (item: ScaleItem) => React.ReactNode }) {
  const style = useScaleStyle();
  return (
    <div className="relative flex flex-col gap-1.5">
      <StyleToggle style={style} />
      {style === "bars" ? (
        <div className="flex items-end justify-around gap-2 pt-1">
          {items.map((it) => (
            <LevelBar key={it.key} item={it} />
          ))}
        </div>
      ) : (
        items.map((it) => <div key={it.key}>{renderRow(it)}</div>)
      )}
    </div>
  );
}

function StyleToggle({ style }: { style: ScaleStyle }) {
  const next: ScaleStyle = style === "bars" ? "icons" : "bars";
  return (
    <button
      type="button"
      onClick={() => setScaleStyle(next)}
      aria-label={next === "bars" ? "Show these as bars" : "Show these as rows of icons"}
      title={next === "bars" ? "Show as bars" : "Show as rows of icons"}
      className="absolute -top-1 right-0 z-[1] flex h-7 w-7 items-center justify-center rounded-full opacity-55 transition-opacity hover:bg-black/[.05] hover:opacity-100"
      style={{ color: "var(--t-ink-soft)" }}
    >
      {next === "bars" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 20V11M10 20V5M15 20v-7M20 20V8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="2.5 3" />
        </svg>
      )}
    </button>
  );
}

/**
 * A vertical bar of five steps, filled from the bottom to the level, with its
 * icon at the foot and its name below. Tap a step (tap the top filled one
 * again for 0), or drag up and down; arrow keys work too.
 */
function LevelBar({ item }: { item: ScaleItem }) {
  const colors = useScaleColors();
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; moved: boolean; start: number } | null>(null);
  const valueAt = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(5, Math.ceil(((r.bottom - clientY) / r.height) * 5)));
  };
  const { value, onChange } = item;
  return (
    <div className="flex w-[58px] flex-col items-center gap-1" title={item.hint}>
      <span className="font-display text-[15px] leading-none tabular-nums" style={{ color: value ? "var(--t-ink)" : "var(--t-ink-soft)" }}>
        {value}
      </span>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={item.hint ? `${item.label}: ${item.hint}` : item.label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-orientation="vertical"
        className="level-track relative block h-[96px] w-5 cursor-pointer touch-none select-none rounded-full outline-offset-2"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, moved: false, start: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (Math.abs(e.clientY - drag.current.y) > 4) drag.current.moved = true;
          if (drag.current.moved) onChange(valueAt(e.clientY));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const v = valueAt(e.clientY);
          onChange(v === d.start ? 0 : v);
        }}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") {
            e.preventDefault();
            onChange(Math.min(5, value + 1));
          }
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
            e.preventDefault();
            onChange(Math.max(0, value - 1));
          }
        }}
      >
        {/* One smooth bar filled to the level (no segments). */}
        <span aria-hidden className="level-fill pointer-events-none absolute inset-x-[3px] bottom-[3px] block rounded-full transition-[height] duration-200" style={{ height: `calc(${value * 20}% - ${(value * 6) / 5}px)`, ...fillFor(colors[item.key as ScaleKey]) }} />
      </div>
      {/* The icon at the bar's foot. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- scale glyph */}
      <img src={item.icon} alt="" width={20} height={20} draggable={false} className="pointer-events-none h-5 w-5" style={{ opacity: value ? 1 : 0.4, filter: value ? undefined : "grayscale(1)" }} />
      <span className="text-center text-[11.5px] font-semibold leading-tight" style={{ color: "var(--t-ink-soft)" }}>
        {item.label}
      </span>
    </div>
  );
}
