"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Hindrance } from "@/lib/wheel-of-time";
import { Fold, useLingerValue } from "@/components/ui/Fold";
import { TimeRuler } from "./TimeRuler";

/** `today`: the factors picked are today's (for tonight's sleep), not yesterday's (owner, Nov 3: a one-tap switch). */
export type NightDraft = { bed: string; wake: string; effort: string[]; hindrances: Hindrance[]; today?: boolean };

/** The day after a YYYY-MM-DD key (where today's factors are kept: they belong to tonight's sleep). */
export function nextDayKey(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const x = new Date(y, m - 1, d + 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export const EMPTY_NIGHT: NightDraft = { bed: "", wake: "", effort: [], hindrances: [] };
export const nightIsEmpty = (n: NightDraft) => !n.bed && !n.wake && !n.effort.length && !n.hindrances.length;

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
  return mins > 0 && mins < 20 * 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}` : null;
}

const BED_TIMES = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00"];
const WAKE_TIMES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];

/**
 * A time, shown in the display face (or a quiet "—" until set). Tapping it
 * opens a small parchment dial: the usual times as chips, and the hour and
 * minutes to fine-tune, in 5-minute steps or typed in.
 */
/** The app's time picker: a parchment token showing the time ("— : —" when unset) that opens the time dial. "spirit" suits the toucan's dark panels. */
export function TimeToken({ value, onChange, label, icon, kind, compact = false, variant = "parchment", placeholder = "add time", active, onToggle }: { value: string; onChange: (v: string) => void; label: string; icon?: React.ReactNode; kind: "bed" | "wake" | "any"; compact?: boolean; variant?: "parchment" | "spirit"; /** Shown (softly, in words) while no time is set. */ placeholder?: string; /** Inline mode: the token only toggles a ruler its owner shows in place (no popup dial). */ active?: boolean; onToggle?: () => void }) {
  const [openAt, setOpenAt] = useState<HTMLElement | null>(null);
  const inline = !!onToggle;
  const open = inline ? !!active : !!openAt;
  const shown = value ? clock12(value) : "";
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          if (inline) return onToggle!();
          const el = e.currentTarget;
          setOpenAt((v) => (v ? null : el));
        }}
        aria-label={`${label}: ${shown || "not set"}. Change`}
        aria-expanded={open}
        className={`${variant === "spirit" ? "time-token time-token-spirit" : "time-token"} flex shrink-0 items-center gap-1.5 rounded-full ${inline ? "h-9 min-w-[100px] justify-center px-2.5" : compact ? "h-9 px-3" : "h-10 px-3.5"}`}
      >
        {icon}
        <span className={`font-display whitespace-nowrap tabular-nums ${compact || inline ? "text-[15px]" : "text-[17px]"}`} style={{ opacity: value ? 1 : 0.55 }}>
          {value ? (
            <>
              {shown.replace(/ (am|pm)$/, "")}
              <span className="ml-[3px] text-[11px]">{shown.slice(-2)}</span>
            </>
          ) : (
            <span className="text-[0.86em] italic">{placeholder}</span>
          )}
        </span>
      </button>
      {!inline && open && <TimeDial anchor={openAt} value={value} kind={kind} label={label} onPick={onChange} onClose={() => setOpenAt(null)} />}
    </>
  );
}

function TimeDial({ anchor, value, kind, label, onPick, onClose }: { anchor: HTMLElement | null; value: string; kind: "bed" | "wake" | "any"; label: string; onPick: (v: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const fallback = kind === "bed" ? "23:00" : kind === "wake" ? "07:00" : "12:00";
  const [h, m] = (value || fallback).split(":").map(Number);
  const set = (hh: number, mm: number) => onPick(`${String(((hh % 24) + 24) % 24).padStart(2, "0")}:${String(((mm % 60) + 60) % 60).padStart(2, "0")}`);
  // What's being typed in the hour or minutes (null: show the time itself).
  const [hText, setHText] = useState<string | null>(null);
  const [mText, setMText] = useState<string | null>(null);
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
    // Placed once; again only for a new width. The keyboard shrinks Chrome's height on iPhone, and
    // re-placing then threw the dial to the top of the screen and back (Nov 2 recording).
    let lastW = window.innerWidth;
    const resized = () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      place();
    };
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("resize", resized);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("resize", resized);
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);
  const chips = kind === "bed" ? BED_TIMES : kind === "wake" ? WAKE_TIMES : [];
  // Minutes wrap on their own (below 0 goes to 55) and never move the hour.
  const step = (dh: number, dm: number) => set(h + dh, (m + dm + 60) % 60);
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
          {/* Tap the number to type it. */}
          {/* Controlled (not re-keyed per value): re-keying rebuilt the field mid-typing, which dropped the keyboard. */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={hText ?? String(((h + 11) % 12) + 1)}
            onFocus={(e) => (setHText(e.currentTarget.value), e.currentTarget.select())}
            onChange={(e) => {
              setHText(e.target.value);
              const v = parseInt(e.target.value, 10);
              if (v >= 1 && v <= 12 && (e.target.value.length === 2 || v > 1)) set((v % 12) + (h >= 12 ? 12 : 0), m);
            }}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 1 && v <= 12) set((v % 12) + (h >= 12 ? 12 : 0), m);
              setHText(null);
            }}
            aria-label="Hour"
            className="time-dial-num font-display w-12 rounded-lg bg-transparent text-center text-[30px] leading-tight tabular-nums focus:bg-white/60 focus:outline-none"
            style={{ color: "#2a1c10" }}
          />
          {arrow(-1, () => step(-1, 0), "One hour earlier")}
        </div>
        <span className="font-display pb-0.5 text-[28px]" style={{ color: "#8a6116" }}>
          :
        </span>
        <div className="flex flex-col items-center">
          {arrow(1, () => step(0, 5), "Five minutes later")}
          <input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={mText ?? String(m).padStart(2, "0")}
            onFocus={(e) => (setMText(e.currentTarget.value), e.currentTarget.select())}
            onChange={(e) => {
              setMText(e.target.value);
              const v = parseInt(e.target.value, 10);
              if (e.target.value.length === 2 && v >= 0 && v <= 59) set(h, v);
            }}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 0 && v <= 59) set(h, v);
              setMText(null);
            }}
            aria-label="Minutes"
            className="time-dial-num font-display w-12 rounded-lg bg-transparent text-center text-[30px] leading-tight tabular-nums focus:bg-white/60 focus:outline-none"
            style={{ color: "#2a1c10" }}
          />
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
export function NightFields({ value, onChange, effort, hindrances, onLists, day, heading = true }: { value: NightDraft; onChange: (n: NightDraft) => void; effort: string[]; hindrances: string[]; /** Edit the two lists right here (saved to the Wheel of Time). */ onLists?: (lists: { effort: string[]; hindrances: string[] }) => void; /** This morning's app day (YYYY-MM-DD), to name the day each list is for. */ day?: string; /** The "Last night" title (the welcome screen's Sleep button already says it). */ heading?: boolean }) {
  const [open, setOpen] = useState(false);
  // Which time's ruler is open under the line (kept a moment while it slides shut).
  const [editing, setEditing] = useState<"bed" | "wake" | null>(null);
  const ruler = useLingerValue(editing, 340);
  const cardRef = useRef<HTMLDivElement>(null);
  // A tap anywhere outside this card folds the ruler away.
  useEffect(() => {
    if (!editing) return;
    const down = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) setEditing(null);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [editing]);
  const [editingLists, setEditingLists] = useState(false);
  const [newEffort, setNewEffort] = useState("");
  const [newHindrance, setNewHindrance] = useState("");
  // The day before this morning: what Right Effort and the hindrances are logged for.
  const yesterday = (() => {
    if (!day) return "";
    const [y, m, d] = day.split("-").map(Number);
    return new Date(y, m - 1, d - 1).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  })();
  const factorsId = useId();
  const set = (patch: Partial<NightDraft>) => onChange({ ...value, ...patch });
  const toggleEffort = (name: string) => set({ effort: value.effort.includes(name) ? value.effort.filter((e) => e !== name) : [...value.effort, name] });
  const hasHindrance = (name: string) => value.hindrances.some((h) => h.name === name);
  const toggleHindrance = (name: string) => set({ hindrances: hasHindrance(name) ? value.hindrances.filter((h) => h.name !== name) : [...value.hindrances, { name, at: null }] });
  const hindranceAt = (name: string, at: string) => set({ hindrances: value.hindrances.map((h) => (h.name === name ? { ...h, at: at || null } : h)) });
  const checked = value.effort.length + value.hindrances.length;
  const hours = slept(value.bed, value.wake);

  return (
    <div ref={cardRef} className={`night-card flex flex-col gap-2 rounded-2xl px-3 pb-2.5 ${heading ? "pt-2" : "pt-2.5"}`}>
      {heading && (
        <span className="text-center text-[11.5px] font-bold uppercase tracking-[.18em]" style={{ color: "var(--ec-gold, #f2d27e)" }}>
          Last night
        </span>
      )}
      {/* One line: bedtime → how long → wake time. Tapping a time opens its ruler right under the line. */}
      <div className="flex items-center gap-1.5">
        <TimeToken value={value.bed} onChange={(v) => set({ bed: v })} label="Last night's sleep time" icon={<MoonIcon />} kind="bed" placeholder="bedtime" active={editing === "bed"} onToggle={() => setEditing((e) => (e === "bed" ? null : "bed"))} />
        <span aria-hidden className="night-span flex min-w-[48px] flex-1 flex-col items-center">
          <span className="h-[15px] text-[11.5px] font-semibold leading-[15px] tabular-nums">{hours ?? ""}</span>
          <svg width="100%" height="8" viewBox="0 0 100 8" preserveAspectRatio="none" fill="none" className="opacity-70">
            <path d="M1 4h97" stroke="currentColor" strokeWidth="1.3" vectorEffect="non-scaling-stroke" strokeDasharray={value.bed && value.wake ? undefined : "3 3"} />
          </svg>
        </span>
        <svg aria-hidden width="7" height="10" viewBox="0 0 7 10" fill="none" className="night-span -ml-1.5 mt-[15px] shrink-0 opacity-70">
          <path d="M1 1l4.5 4L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <TimeToken value={value.wake} onChange={(v) => set({ wake: v })} label="This morning's wake time" icon={<SunIcon />} kind="wake" placeholder="wake time" active={editing === "wake"} onToggle={() => setEditing((e) => (e === "wake" ? null : "wake"))} />
      </div>
      <Fold open={!!editing}>
        {ruler.value && (
          <div key={ruler.value} className="fade-in">
            <TimeRuler
              kind={ruler.value}
              value={ruler.value === "bed" ? value.bed : value.wake}
              onChange={(v) => set(ruler.value === "bed" ? { bed: v } : { wake: v })}
              onDone={() => setEditing(null)}
              label={ruler.value === "bed" ? "Last night's sleep time" : "This morning's wake time"}
            />
          </div>
        )}
      </Fold>
      <span className="mx-auto flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={factorsId}
        className="wheel-btn flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold"
      >
        <WheelIcon />
        <span>Factors of sleep</span>
        {checked > 0 && !open && <span className="tabular-nums opacity-80">· {checked}</span>}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <path d="M9 5.5l6.5 6.5L9 18.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Yesterday's factors (for last night) or today's (for tonight): one tap switches (owner, Nov 3). */}
      <button
        type="button"
        onClick={() => set({ today: !value.today })}
        aria-pressed={!!value.today}
        title={value.today ? "Logging today's factors (for tonight). Tap for yesterday's" : `Logging yesterday's factors${yesterday ? ` (${yesterday})` : ""}. Tap for today's`}
        className="wheel-btn flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold"
      >
        <span aria-hidden className="text-[11px] opacity-70">⇄</span>
        {value.today ? "today" : "yesterday"}
      </button>
      </span>

      {/* Folded: what you picked shows under the button (owner, Nov 2). */}
      <Fold open={!open && checked > 0}>
        <p className="m-0 -mt-1 text-center text-[12px] leading-snug" style={{ color: SOFT }}>
          {[...value.effort, ...value.hindrances.map((h) => h.name)].join(" · ")}
        </p>
      </Fold>
      <div className="drawer-body" data-open={open ? "true" : "false"}>
        <div id={factorsId} className="drawer-inner relative flex flex-col gap-2.5 pt-0.5" inert={!open}>
          {/* Editing the lists: a gear at the section's upper right (owner, Nov 2), not a link at its foot. */}
          {onLists && (
            <button type="button" onClick={() => setEditingLists((v) => !v)} aria-pressed={editingLists} aria-label={editingLists ? "Done editing the lists" : "Edit the lists"} title={editingLists ? "Done editing" : "Edit the lists"} className="absolute right-0 top-0 z-[1] flex h-7 w-7 items-center justify-center rounded-full" style={{ color: SOFT, background: editingLists ? "rgba(217,180,95,.3)" : undefined }}>
              {editingLists ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              )}
            </button>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: "var(--ec-gold, #f2d27e)" }}>
                Right effort
              </span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {effort.map((name) => {
                const on = value.effort.includes(name);
                return editingLists ? (
                  <span key={name} className="factor-chip reveal">
                    {name}
                    <button type="button" onClick={() => onLists?.({ effort: effort.filter((x) => x !== name), hindrances })} aria-label={`Remove ${name}`} className="ml-0.5 text-[14px] leading-none opacity-70 hover:opacity-100">
                      ×
                    </button>
                  </span>
                ) : (
                  <button key={name} type="button" role="checkbox" aria-checked={on} onClick={() => toggleEffort(name)} className={`factor-chip ${on ? "factor-on" : ""}`}>
                    {on && <span aria-hidden>✓</span>}
                    {name}
                  </button>
                );
              })}
              <Fold open={!!editingLists}>
                <form
                  className="reveal flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = newEffort.trim().slice(0, 40);
                    if (t && !effort.includes(t)) onLists?.({ effort: [...effort, t], hindrances });
                    setNewEffort("");
                  }}
                >
                  <input value={newEffort} onChange={(e) => setNewEffort(e.target.value)} placeholder="+ add one" aria-label="Add a right effort" className="factor-chip w-[120px] bg-transparent text-[16px] outline-none" />
                </form>
              </Fold>
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
                return editingLists ? (
                  <span key={name} className="factor-chip factor-warn reveal">
                    {name}
                    <button type="button" onClick={() => onLists?.({ effort, hindrances: hindrances.filter((x) => x !== name) })} aria-label={`Remove ${name}`} className="ml-0.5 text-[14px] leading-none opacity-70 hover:opacity-100">
                      ×
                    </button>
                  </span>
                ) : (
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
          <Fold open={!!editingLists}>
            <form
              className="reveal flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const t = newHindrance.trim().slice(0, 40);
                if (t && !hindrances.includes(t)) onLists?.({ effort, hindrances: [...hindrances, t] });
                setNewHindrance("");
              }}
            >
              <input value={newHindrance} onChange={(e) => setNewHindrance(e.target.value)} placeholder="+ add a hindrance" aria-label="Add a hindrance" className="factor-chip factor-warn w-[150px] bg-transparent text-[16px] outline-none" />
            </form>
          </Fold>
          {/* The lists are edited right here (no trip to another page). */}
          {onLists ? null : (
            <Link href="/insights#wheel-of-time" className="self-end text-[12px] underline underline-offset-2" style={{ color: SOFT }}>
              Edit the lists
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
