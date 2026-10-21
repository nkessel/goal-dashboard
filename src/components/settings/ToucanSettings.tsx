"use client";

import { useState } from "react";
import { saveToucanPrefsAction } from "@/app/actions";
import { LINE_GROUPS, setRetiredLines } from "@/lib/toucan-lines";

export type ToucanMode = "simple" | "lite" | "full";
export const TOUCAN_MODES: { key: ToucanMode; label: string; hint: string }[] = [
  { key: "simple", label: "Simple", hint: "Just the toucan and his wisdom when you tap him" },
  { key: "lite", label: "Light guide", hint: "He keeps watch, nudges you about slipping quests and helps plan them" },
  { key: "full", label: "Full guide", hint: "All of that, plus he remembers what you share, keeps your promises and offers next steps" },
];

/**
 * How much the Great Toucan Spirit does, and which of his lines he says:
 * untick any line you'd rather not hear again.
 */
export function ToucanSettings({ initialMode, initialRetired }: { initialMode: ToucanMode; initialRetired: string[] }) {
  const [mode, setMode] = useState<ToucanMode>(initialMode);
  const [off, setOff] = useState<Set<string>>(() => new Set(initialRetired));
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  function chooseMode(m: ToucanMode) {
    setMode(m);
    try {
      window.localStorage.setItem("toucan-mode", m);
    } catch {}
    window.dispatchEvent(new Event("toucan-mode"));
    void saveToucanPrefsAction({ mode: m }).catch(() => {});
  }
  function toggle(line: string) {
    const next = new Set(off);
    if (next.has(line)) next.delete(line);
    else next.add(line);
    setOff(next);
    setRetiredLines([...next]);
    void saveToucanPrefsAction({ retired: [...next] }).catch(() => {});
  }
  const pick = (on: boolean) => (on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border, rgba(139,112,64,.35))", color: "var(--t-ink)" });

  return (
    <div className="flex flex-col gap-2.5" style={{ color: "var(--t-ink)" }}>
      <span className="text-sm font-semibold">How much he does</span>
      <div role="radiogroup" aria-label="How much the toucan does" className="flex flex-col gap-1.5">
        {TOUCAN_MODES.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => chooseMode(m.key)} className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick(mode === m.key)}>
            <span className="text-[14px] font-bold">{m.label}</span>
            <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
              {m.hint}
            </span>
          </button>
        ))}
      </div>

      <span className="mt-1 text-sm font-semibold">What he says</span>
      <p className="m-0 -mt-1.5 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        Untick any line you&rsquo;d rather not hear again.
      </p>
      {LINE_GROUPS.map((g) => {
        const on = g.lines.filter((l) => !off.has(l)).length;
        const isOpen = openGroup === g.key;
        return (
          <div key={g.key} className="flex flex-col rounded-xl" style={{ border: "1px solid var(--t-card-border, rgba(139,112,64,.35))" }}>
            <button type="button" onClick={() => setOpenGroup(isOpen ? null : g.key)} aria-expanded={isOpen} className="flex min-h-11 items-center gap-2 px-3 text-left">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{g.title}</span>
                <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  {g.hint}
                </span>
              </span>
              <span className="text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                {on}/{g.lines.length} on
              </span>
            </button>
            {isOpen && (
              <ul className="reveal m-0 flex list-none flex-col gap-0.5 px-2 pb-2">
                {g.lines.map((l) => (
                  <li key={l}>
                    <label className="flex min-h-10 items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-[14px] leading-snug hover:bg-black/[.04]">
                      <input type="checkbox" checked={!off.has(l)} onChange={() => toggle(l)} className="mt-0.5" />
                      <span style={off.has(l) ? { color: "var(--t-ink-soft)", textDecoration: "line-through" } : undefined}>{l.replaceAll("{name}", "you")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
