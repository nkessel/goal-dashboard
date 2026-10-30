"use client";

import { useRef, useSyncExternalStore } from "react";

/*
 * Importance, urgency, difficulty and the like (0–5): as rows of little
 * icons, or as vertical bars side by side with the icon at each bar's foot.
 * The choice is kept in this browser and changed from the small toggle
 * beside any group of them.
 */

export type ScaleStyle = "icons" | "bars";
const KEY = "scale-style";
const EVENT = "scale-style-change";

export function readScaleStyle(): ScaleStyle {
  try {
    return localStorage.getItem(KEY) === "bars" ? "bars" : "icons";
  } catch {
    return "icons";
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
    () => "icons"
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
        className="level-bar flex h-[96px] w-7 cursor-pointer touch-none select-none flex-col-reverse gap-[3px] rounded-full p-[3px] outline-offset-2"
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
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`level-step block flex-1 rounded-full ${n <= value ? "level-on" : ""}`} style={{ ["--lv" as string]: n }} />
        ))}
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
