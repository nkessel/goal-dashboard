"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Hindrance } from "@/lib/wheel-of-time";

export type NightDraft = { bed: string; wake: string; effort: string[]; hindrances: Hindrance[] };
export const EMPTY_NIGHT: NightDraft = { bed: "", wake: "", effort: [], hindrances: [] };
export const nightIsEmpty = (n: NightDraft) => !n.bed && !n.wake && !n.effort.length && !n.hindrances.length;

const INK = "var(--t-cream)";
const SOFT = "var(--ec-soft, rgba(239,230,204,.75))";

/** "23:30" → "11:30 pm". */
export function clock12(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
/** Hours and minutes slept between two clock times. */
function slept(bed: string, wake: string) {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins > 0 && mins < 20 * 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} m` : ""}` : null;
}

const BED_TIMES = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00"];
const WAKE_TIMES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];

/**
 * A time, shown in the display face (or a quiet "—" until set). Tapping it
 * opens a small parchment dial: the usual times as chips, and the hour and
 * minutes to fine-tune, in 5-minute steps.
 */
export function TimeToken({ value, onChange, label, icon, kind, compact = false }: { value: string; onChange: (v: string) => void; label: string; icon?: React.ReactNode; kind: "bed" | "wake" | "any"; compact?: boolean }) {
  const [openAt, setOpenAt] = useState<HTMLElement | null>(null);
  const open = !!openAt;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const el = e.currentTarget;
          setOpenAt((v) => (v ? null : el));
        }}
        aria-label={`${label}: ${value ? clock12(value) : "not set"}. Change`}
        aria-expanded={open}
        className={`time-token flex items-center gap-1.5 rounded-full ${compact ? "h-8 px-2.5" : "h-10 px-3.5"}`}
      >
        {icon}
        <span className={`font-display tabular-nums ${compact ? "text-[14px]" : "text-[17px]"}`} style={{ opacity: value ? 1 : 0.55 }}>
          {value ? clock12(value) : "— : —"}
        </span>
      </button>
      {open && <TimeDial anchor={openAt} value={value} kind={kind} label={label} onPick={onChange} onClose={() => setOpenAt(null)} />}
    </>
  );
}

function TimeDial({ anchor, value, kind, label, onPick, onClose }: { anchor: HTMLElement | null; value: string; kind: "bed" | "wake" | "any"; label: string; onPick: (v: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const fallback = kind === "bed" ? "23:00" : kind === "wake" ? "07:00" : "12:00";
  const [h, m] = (value || fallback).split(":").map(Number);
  const set = (hh: number, mm: number) => onPick(`${String(((hh % 24) + 24) % 24).padStart(2, "0")}:${String(((mm % 60) + 60) % 60).padStart(2, "0")}`);
  useEffect(() => {
    const place = () => {
      const r = anchor?.getBoundingClientRect();
      if (!r) return;
      const w = 264;
      const hgt = box.current?.offsetHeight ?? 230;
      const below = r.bottom + 6 + hgt < window.innerHeight - 8;
      setPos({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)), top: below ? r.bottom + 6 : Math.max(8, r.top - hgt - 6) });
    };
    place();
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);
  const chips = kind === "bed" ? BED_TIMES : kind === "wake" ? WAKE_TIMES : [];
  const step = (dh: number, dm: number) => set(h + dh + Math.floor((m + dm) / 60), (m + dm + 60) % 60);
  const arrow = (dir: 1 | -1, onClick: () => void, aria: string) => (
    <button type="button" onClick={onClick} aria-label={aria} className="time-dial-step flex h-7 w-9 items-center justify-center rounded-full">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: dir < 0 ? "rotate(180deg)" : undefined }}>
        <path d="M5.5 15l6.5-6.5 6.5 6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="time-dial card-pop-in fixed z-[100] flex w-[264px] flex-col gap-2.5 rounded-2xl p-3"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <span className="text-center text-[11.5px] font-bold uppercase tracking-[.16em]" style={{ color: "#8a6116" }}>
        {label}
      </span>
      {/* Hour : minutes, each nudged up or down. */}
      <div className="flex items-center justify-center gap-1">
        <div className="flex flex-col items-center">
          {arrow(1, () => step(1, 0), "One hour later")}
          <span className="font-display w-11 text-center text-[30px] leading-tight tabular-nums" style={{ color: "#2a1c10" }}>
            {((h + 11) % 12) + 1}
          </span>
          {arrow(-1, () => step(-1, 0), "One hour earlier")}
        </div>
        <span className="font-display pb-0.5 text-[28px]" style={{ color: "#8a6116" }}>
          :
        </span>
        <div className="flex flex-col items-center">
          {arrow(1, () => step(0, 5), "Five minutes later")}
          <span className="font-display w-11 text-center text-[30px] leading-tight tabular-nums" style={{ color: "#2a1c10" }}>
            {String(m).padStart(2, "0")}
          </span>
          {arrow(-1, () => step(0, -5), "Five minutes earlier")}
        </div>
        <div className="ml-2 flex flex-col gap-1">
          {(["am", "pm"] as const).map((p) => {
            const on = (p === "am") === h < 12;
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => !on && set(h + (p === "pm" ? 12 : -12), m)} className="h-8 w-11 rounded-full text-[13px] font-bold uppercase" style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "#6b5631" }}>
                {p}
              </button>
            );
          })}
        </div>
      </div>
      {chips.length > 0 && (
        <div className="grid grid-cols-5 gap-1">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => onPick(c)} className="h-7 rounded-full text-[12px] font-semibold tabular-nums" style={c === value ? { background: "rgba(217,180,95,.55)", border: "1px solid #8a6116", color: "#2a1c10" } : { border: "1px solid rgba(139,112,64,.4)", color: "#3d2f18" }}>
              {clock12(c).replace(/ (am|pm)$/, "")}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        {value ? (
          <button type="button" onClick={() => (onPick(""), onClose())} className="text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
            Clear
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => (!value && set(h, m), onClose())} className="h-8 rounded-full px-4 text-[13px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}

export const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="#c9d3f0" stroke="#7d86b8" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);
export const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="4.5" fill="#f6d06a" stroke="#b5862a" strokeWidth="1.3" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#c9952e" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const WheelIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path d="M12 3.5v6.3M12 14.2v6.3M3.5 12h6.3M14.2 12h6.3M6 6l4.4 4.4M13.6 13.6L18 18M18 6l-4.4 4.4M10.4 13.6L6 18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

/**
 * Last night in the morning's first check-in: when you slept and woke (each a
 * tap on its time), how long that was, and the Wheel of Time, which opens the
 * Factors of sleep: yesterday's Right Effort and Hindrances, as chips.
 */
export function NightFields({ value, onChange, effort, hindrances }: { value: NightDraft; onChange: (n: NightDraft) => void; effort: string[]; hindrances: string[] }) {
  const [open, setOpen] = useState(false);
  const factorsId = useId();
  const set = (patch: Partial<NightDraft>) => onChange({ ...value, ...patch });
  const toggleEffort = (name: string) => set({ effort: value.effort.includes(name) ? value.effort.filter((e) => e !== name) : [...value.effort, name] });
  const hasHindrance = (name: string) => value.hindrances.some((h) => h.name === name);
  const toggleHindrance = (name: string) => set({ hindrances: hasHindrance(name) ? value.hindrances.filter((h) => h.name !== name) : [...value.hindrances, { name, at: null }] });
  const hindranceAt = (name: string, at: string) => set({ hindrances: value.hindrances.map((h) => (h.name === name ? { ...h, at: at || null } : h)) });
  const checked = value.effort.length + value.hindrances.length;
  const hours = slept(value.bed, value.wake);

  return (
    <div className="night-card flex flex-col gap-2 rounded-2xl px-3 pb-2.5 pt-2">
      <span className="text-center text-[11.5px] font-bold uppercase tracking-[.18em]" style={{ color: "var(--ec-gold, #f2d27e)" }}>
        Last night
      </span>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span className="flex flex-col items-center gap-0.5">
          <span className="text-[12px] font-semibold" style={{ color: SOFT }}>
            Slept
          </span>
          <TimeToken value={value.bed} onChange={(v) => set({ bed: v })} label="Last night's sleep time" icon={<MoonIcon />} kind="bed" />
        </span>
        <span aria-hidden className="mt-4 flex flex-col items-center text-[12px] tabular-nums" style={{ color: SOFT }}>
          <svg width="40" height="10" viewBox="0 0 40 10" fill="none">
            <path d="M1 5h36M33 1.5L37.5 5 33 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
          </svg>
          {hours ?? ""}
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <span className="text-[12px] font-semibold" style={{ color: SOFT }}>
            Woke
          </span>
          <TimeToken value={value.wake} onChange={(v) => set({ wake: v })} label="This morning's wake time" icon={<SunIcon />} kind="wake" />
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={factorsId}
        className="wheel-btn mx-auto flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold"
      >
        <WheelIcon />
        Wheel of Time
        {checked > 0 && !open && <span className="tabular-nums opacity-80">· {checked}</span>}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <path d="M9 5.5l6.5 6.5L9 18.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={factorsId} className="reveal flex flex-col gap-2.5 pt-0.5">
          <span className="font-display text-center text-[16px]" style={{ color: INK }}>
            Factors of sleep
          </span>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--ec-gold, #f2d27e)" }}>
              Right effort · yesterday
            </span>
            <div className="flex flex-wrap gap-1.5">
              {effort.map((name) => {
                const on = value.effort.includes(name);
                return (
                  <button key={name} type="button" role="checkbox" aria-checked={on} onClick={() => toggleEffort(name)} className={`factor-chip ${on ? "factor-on" : ""}`}>
                    {on && <span aria-hidden>✓</span>}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: "#d58f78" }}>
              Hindrances
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {hindrances.map((name) => {
                const on = hasHindrance(name);
                const at = value.hindrances.find((h) => h.name === name)?.at ?? "";
                return (
                  <span key={name} className="flex items-center gap-1">
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleHindrance(name)} className={`factor-chip factor-warn ${on ? "factor-on" : ""}`}>
                      {on && <span aria-hidden>✓</span>}
                      {name}
                    </button>
                    {on && <TimeToken value={at} onChange={(v) => hindranceAt(name, v)} label={`What time: ${name}`} kind="any" compact />}
                  </span>
                );
              })}
            </div>
          </div>
          <Link href="/insights#wheel-of-time" className="self-end text-[12px] underline underline-offset-2" style={{ color: SOFT }}>
            Edit the lists
          </Link>
        </div>
      )}
    </div>
  );
}
