"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { Hindrance } from "@/lib/wheel-of-time";

export type NightDraft = { bed: string; wake: string; effort: string[]; hindrances: Hindrance[] };
export const EMPTY_NIGHT: NightDraft = { bed: "", wake: "", effort: [], hindrances: [] };
export const nightIsEmpty = (n: NightDraft) => !n.bed && !n.wake && !n.effort.length && !n.hindrances.length;

const CREAM = "var(--t-cream)";
const timeBox = "night-time w-[136px] shrink-0";

/**
 * The Wheel of Time in the morning's first check-in: last night's sleep time
 * and this morning's wake time. The caret beside them opens yesterday's
 * Right Effort and Hindrances as checkboxes; a checked Hindrance can take a time.
 */
export function NightFields({ value, onChange, effort, hindrances }: { value: NightDraft; onChange: (n: NightDraft) => void; effort: string[]; hindrances: string[] }) {
  const [open, setOpen] = useState(false);
  const turningsId = useId();
  const [timing, setTiming] = useState<Set<string>>(new Set());
  const set = (patch: Partial<NightDraft>) => onChange({ ...value, ...patch });
  const toggleEffort = (name: string) => set({ effort: value.effort.includes(name) ? value.effort.filter((e) => e !== name) : [...value.effort, name] });
  const hasHindrance = (name: string) => value.hindrances.some((h) => h.name === name);
  const toggleHindrance = (name: string) => set({ hindrances: hasHindrance(name) ? value.hindrances.filter((h) => h.name !== name) : [...value.hindrances, { name, at: null }] });
  const hindranceAt = (name: string, at: string) => set({ hindrances: value.hindrances.map((h) => (h.name === name ? { ...h, at: at || null } : h)) });
  const checked = value.effort.length + value.hindrances.length;

  const box = (on: boolean, warn = false) => (
    <span
      aria-hidden
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[12px] font-black"
      style={on ? { background: warn ? "#e3a08b" : "var(--t-gold)", color: "#2a1c10", border: "1px solid transparent" } : { border: "1.5px solid rgba(217,180,95,.7)" }}
    >
      {on ? "✓" : ""}
    </span>
  );

  return (
    <div className="flex flex-col gap-1.5 pb-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <label className="flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: CREAM }}>
          Slept
          <input type="time" value={value.bed} onChange={(e) => set({ bed: e.target.value })} aria-label="Last night's sleep time" className={timeBox} />
        </label>
        <label className="flex items-center gap-1.5 text-[14px] font-semibold" style={{ color: CREAM }}>
          Woke
          <input type="time" value={value.wake} onChange={(e) => set({ wake: e.target.value })} aria-label="This morning's wake time" className={timeBox} />
        </label>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={turningsId}
          aria-label={open ? "Hide Right Effort and Hindrances" : "Right Effort and Hindrances"}
          title="Right Effort and Hindrances"
          className="flex h-8 items-center gap-1 rounded-full px-1.5 hover:bg-white/10"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : undefined }}>
            <path d="M9 5.5l6.5 6.5L9 18.5" stroke="var(--t-gold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {checked > 0 && !open && (
            <span className="text-[12px] font-bold tabular-nums" style={{ color: "var(--t-gold)" }}>
              {checked}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div id={turningsId} className="reveal ml-7 flex flex-col gap-2 rounded-xl p-2.5" style={{ background: "rgba(0,0,0,.22)", border: "1px solid rgba(217,180,95,.3)" }}>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 p-0 text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(242,210,126,.9)" }}>
              Right Effort · yesterday
            </legend>
            {effort.map((name) => (
              <button key={name} type="button" role="checkbox" aria-checked={value.effort.includes(name)} onClick={() => toggleEffort(name)} className="flex min-h-8 items-center gap-2 rounded-lg px-1 text-left text-[14px] leading-snug hover:bg-white/5" style={{ color: CREAM }}>
                {box(value.effort.includes(name))}
                {name}
              </button>
            ))}
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1 p-0 text-[11.5px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(243,179,159,.9)" }}>
              Hindrances
            </legend>
            {hindrances.map((name) => {
              const on = hasHindrance(name);
              const at = value.hindrances.find((h) => h.name === name)?.at ?? "";
              return (
                <div key={name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleHindrance(name)} className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-[14px] leading-snug hover:bg-white/5" style={{ color: CREAM }}>
                    {box(on, true)}
                    {name}
                  </button>
                  {on &&
                    (timing.has(name) || at ? (
                      <label className="flex items-center gap-1 text-[12.5px]" style={{ color: CREAM }}>
                        at
                        <input type="time" autoFocus={!at} value={at} onChange={(e) => hindranceAt(name, e.target.value)} aria-label={`What time: ${name}`} className="night-time !h-8 w-[128px]" />
                      </label>
                    ) : (
                      <button type="button" onClick={() => setTiming((s) => new Set(s).add(name))} className="h-7 rounded-full px-2 text-[12.5px] underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
                        + time
                      </button>
                    ))}
                </div>
              );
            })}
          </fieldset>
          <Link href="/insights#wheel-of-time" className="self-end text-[12px] underline underline-offset-2" style={{ color: "rgba(239,230,204,.7)" }}>
            Edit lists
          </Link>
        </div>
      )}
    </div>
  );
}
