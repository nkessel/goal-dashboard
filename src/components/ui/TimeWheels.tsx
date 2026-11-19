"use client";

import { useEffect, useRef, useState } from "react";

const ROW = 34;

/** One wheel: turn it up or down (swipe, scroll, or the arrow keys); the middle row is the choice. */
function Wheel({ items, index, onIndex, label, width, onType }: { items: string[]; index: number; onIndex: (i: number) => void; label: string; width: number; /** Tapping the chosen row: type the time instead. */ onType?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Put the wheel on its value when it opens or the value changes from outside.
  useEffect(() => {
    const el = ref.current;
    if (el && Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index]);
  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={items[index]}
      aria-valuenow={index}
      className="time-wheel relative overflow-y-auto overscroll-contain text-center outline-offset-2"
      style={{ height: ROW * 3, width, scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        clearTimeout(settle.current);
        settle.current = setTimeout(() => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(top / ROW)));
          if (i !== index) onIndex(i);
        }, 90);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") (e.preventDefault(), onIndex(Math.max(0, index - 1)));
        if (e.key === "ArrowDown") (e.preventDefault(), onIndex(Math.min(items.length - 1, index + 1)));
      }}
    >
      <div style={{ height: ROW }} />
      {items.map((t, i) => (
        <div
          key={t}
          onClick={() => (i === index && onType ? onType() : onIndex(i))}
          className="font-display flex cursor-pointer select-none items-center justify-center tabular-nums transition-[opacity,font-size] duration-150"
          style={{ height: ROW, scrollSnapAlign: "center", fontSize: i === index ? 21 : 16, opacity: i === index ? 1 : 0.4, color: "#2a1c10" }}
        >
          {t}
        </div>
      ))}
      <div style={{ height: ROW }} />
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const HALVES = ["AM", "PM"];

/** "7:45", "745", "7:45 pm", "19:45", "7pm" → minutes from midnight (null when it isn't a time). */
export function parseTyped(text: string, pmHint: boolean): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (min > 59 || h > 23) return null;
  if (m[3]) {
    if (h > 12 || h === 0) return null;
    h = (h % 12) + (m[3].startsWith("p") ? 12 : 0);
  } else if (h <= 12 && pmHint && h !== 12) h += 12;
  return h * 60 + min;
}

/**
 * Pick a time on three wheels you turn up and down: hour, minute, AM/PM (owner, Nov 12).
 * `value` is minutes from midnight.
 */
export function TimeWheels({ value, onChange }: { value: number; onChange: (minutes: number) => void }) {
  // Tap the chosen time to type it (owner, Nov 17: "type the time on any of these time pickers by clicking on it").
  const [typing, setTyping] = useState<string | null>(null);
  const h24 = Math.floor(value / 60) % 24;
  const m = value % 60;
  const set = (hour12Index: number, minute: number, half: number) => onChange(((hour12Index % 12) + half * 12) * 60 + minute);
  const hi = h24 % 12;
  const half = h24 >= 12 ? 1 : 0;
  return (
    <div className="relative inline-flex items-center gap-1 rounded-2xl px-2" style={{ background: "rgba(255,250,238,.7)", border: "1px solid rgba(139,112,64,.45)", boxShadow: "inset 0 2px 6px rgba(60,40,10,.12)" }} data-time-wheels>
      {/* The band the chosen row sits in. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-1.5 rounded-lg" style={{ top: ROW, height: ROW, background: "rgba(233,212,154,.5)", border: "1px solid rgba(168,138,63,.6)" }} />
      {typing !== null && (
        <input
          autoFocus
          value={typing}
          inputMode="text"
          aria-label="Type a time"
          onChange={(e) => setTyping(e.target.value.slice(0, 8))}
          onBlur={() => {
            const v = parseTyped(typing, half === 1);
            if (v !== null) onChange(v);
            setTyping(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setTyping(null);
          }}
          className="bare-input font-display absolute inset-x-1.5 z-[2] rounded-lg text-center text-[21px] tabular-nums"
          style={{ top: ROW, height: ROW, background: "rgba(251,243,220,.97)", border: "1px solid #a88a3f", color: "#2a1c10" }}
        />
      )}
      <Wheel items={HOURS} index={hi} onIndex={(i) => set(i, m, half)} label="Hour" width={44} onType={() => setTyping(`${HOURS[hi]}:${MINUTES[m]} ${HALVES[half].toLowerCase()}`)} />
      <span aria-hidden className="font-display relative text-[20px]" style={{ color: "#2a1c10" }}>
        :
      </span>
      <Wheel items={MINUTES} index={m} onIndex={(i) => set(hi, i, half)} label="Minute" width={44} onType={() => setTyping(`${HOURS[hi]}:${MINUTES[m]} ${HALVES[half].toLowerCase()}`)} />
      <Wheel items={HALVES} index={half} onIndex={(i) => set(hi, m, i)} label="AM or PM" width={48} />
    </div>
  );
}
