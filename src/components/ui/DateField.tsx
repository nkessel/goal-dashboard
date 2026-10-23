"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * A date field in the app's own look (parchment and gold) instead of the
 * browser's picker: shows the date, and opens a small month calendar.
 * Takes and gives "YYYY-MM-DD", like <input type="date">.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a day",
  ariaLabel,
  className = "",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = value ? fromKey(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEscape(() => setOpen(false), open);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const W = 280;
    const H = 330;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const top = r.bottom + H + 8 > window.innerHeight ? Math.max(8, r.top - H - 6) : r.bottom + 6;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- placed from the button's measured position once it opens
    setPos({ left, top });
  }, [open]);

  const today = keyOf(new Date());
  const first = (month.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array.from({ length: first }, () => null), ...Array.from({ length: daysIn }, (_, i) => keyOf(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const shown = value ? fromKey(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: fromKey(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : placeholder;
  const allowed = (k: string) => (!min || k >= min) && (!max || k <= max);
  const step = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            const d = value ? fromKey(value) : new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }
          setOpen((o) => !o);
        }}
        className={`flex items-center gap-1.5 text-left ${className}`}
        style={{ ...style, color: value ? (style?.color ?? "var(--t-ink)") : "var(--t-ink-soft)" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: "#8a6116" }}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" stroke="currentColor" strokeWidth="2" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="min-w-0 truncate">{shown}</span>
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="dialog"
              aria-label={ariaLabel}
              className="card-pop-in parchment parchment-framed fixed z-[91] w-[280px] rounded-2xl p-3"
              style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, color: "var(--t-ink)", border: "1.5px solid #a88a3f", boxShadow: "0 14px 34px rgba(0,0,0,.4)" }}
            >
              <div className="relative z-[1] mb-2 flex items-center">
                <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className="font-display flex-1 text-center text-[16px]">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
                <button type="button" onClick={() => step(1)} aria-label="Next month" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/[.06]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="relative z-[1] grid grid-cols-7 gap-0.5 text-center">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="pb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
                    {w}
                  </span>
                ))}
                {cells.map((k, i) =>
                  k ? (
                    <button
                      key={k}
                      type="button"
                      disabled={!allowed(k)}
                      onClick={() => {
                        onChange(k);
                        setOpen(false);
                      }}
                      aria-pressed={k === value}
                      className="flex h-9 items-center justify-center rounded-full text-[14px] tabular-nums hover:bg-[rgba(217,180,95,.3)] disabled:opacity-30"
                      style={
                        k === value
                          ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10", fontWeight: 700 }
                          : k === today
                            ? { border: "1.5px solid #a88a3f", fontWeight: 700 }
                            : undefined
                      }
                    >
                      {Number(k.slice(8))}
                    </button>
                  ) : (
                    <span key={`b${i}`} />
                  )
                )}
              </div>
              <div className="relative z-[1] mt-2 flex items-center gap-3 text-[13px]">
                {allowed(today) && (
                  <button type="button" onClick={() => (onChange(today), setOpen(false))} className="font-semibold underline underline-offset-2">
                    Today
                  </button>
                )}
                {value && (
                  <button type="button" onClick={() => (onChange(""), setOpen(false))} className="ml-auto underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
