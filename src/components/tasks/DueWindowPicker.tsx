"use client";

import { useEffect, useRef, useState } from "react";
import { DUE_WINDOWS, MAX_DUE_DAYS, dueWindowLabel } from "@/lib/due-soon";
import { useEscape } from "@/lib/use-escape";

/** Due soon's reach: the ready-made ones, or a custom number of days. */
export function DueWindowPicker({ hours, onPick, onClose, ink, isAdventure, paper = false }: { hours: number; onPick: (h: number) => void; onClose: () => void; ink: string; isAdventure: boolean; /** On parchment (the welcome screen). */ paper?: boolean }) {
  const [custom, setCustom] = useState(DUE_WINDOWS.includes(hours) ? "" : String(Math.max(1, Math.round(hours / 24))));
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const days = Math.round(Number(custom));
  const ok = Number.isFinite(days) && days >= 1 && days <= MAX_DUE_DAYS;
  const border = paper ? "rgba(139,112,64,.55)" : isAdventure ? "rgba(240,150,90,.55)" : "var(--t-card-border)";
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="How far ahead Due soon looks"
      className="fade-in absolute right-0 top-full z-30 mt-1.5 flex w-56 flex-col gap-1.5 rounded-2xl p-2.5"
      style={paper ? { background: "linear-gradient(180deg, #fbf3dc, #efdfb4)", border: `1.5px solid ${border}`, boxShadow: "0 10px 28px rgba(0,0,0,.3)" } : isAdventure ? { background: "#2b170c", border: `1.5px solid ${border}`, boxShadow: "0 10px 28px rgba(0,0,0,.45)" } : { background: "var(--t-bg)", border: `1px solid ${border}`, boxShadow: "0 10px 28px rgba(0,0,0,.18)" }}
    >
      <p className="m-0 px-1 text-[12.5px]" style={{ color: ink, opacity: 0.85 }}>
        Show what&apos;s due within…
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {DUE_WINDOWS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onPick(h)}
            aria-pressed={h === hours}
            className="h-9 rounded-full text-[13.5px] font-semibold"
            style={{ border: `1px solid ${border}`, color: ink, background: h === hours ? (paper ? "rgba(217,180,95,.55)" : isAdventure ? "rgba(240,150,90,.35)" : "var(--t-warn-bg)") : "transparent" }}
          >
            {dueWindowLabel(h)}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onPick(days * 24);
        }}
      >
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_DUE_DAYS}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom"
          aria-label="Custom number of days"
          className="h-9 w-0 min-w-0 flex-1 rounded-full bg-transparent px-3 text-[13.5px]"
          style={{ border: `1px solid ${border}`, color: ink }}
        />
        <span className="text-[13px]" style={{ color: ink }}>
          days
        </span>
        <button type="submit" disabled={!ok} className="h-9 rounded-full px-3 text-[13px] font-semibold disabled:opacity-50" style={{ border: `1px solid ${border}`, color: ink }}>
          Set
        </button>
      </form>
    </div>
  );
}
