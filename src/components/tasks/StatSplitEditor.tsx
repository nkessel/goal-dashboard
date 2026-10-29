"use client";

import { useEffect, useRef, useState } from "react";
import { getStatsAction, setStatsAction } from "@/app/actions";
import { DEFAULT_STATS, cleanStatName, setShare, statAbbr, type StatSplit } from "@/lib/stats";

/**
 * "Stats" under a quest's XP reward: slide a share of the XP to each
 * character stat (all 0% by default). XP sent to stats doesn't fill the main
 * level meter. Past 100%, the stat chosen last gives up the difference (then
 * the one before it); lowering a stat again gives back what it took. Their order (and removing
 * one) lives in Settings → Stats.
 */
export function StatSplitEditor({
  xp,
  split,
  onChange,
  isAdventure,
  open: openProp,
  onOpenChange,
}: {
  /** Opened from outside (the "Add to stats" button under the XP reward's title); the tray's own link is then left out. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  xp: number;
  split: StatSplit;
  onChange: (next: StatSplit) => void;
  isAdventure: boolean;
}) {
  // Folded away by default: sharing XP with stats is an option, not a step.
  const [openOwn, setOpenOwn] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openOwn;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    if (controlled) onOpenChange?.(next);
    else setOpenOwn(next);
  };
  const [stats, setStats] = useState<string[]>([...DEFAULT_STATS]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  // What each stat took from the others on its way up, to give back on its way down.
  const borrowed = useRef<Record<string, Record<string, number>>>({});
  // The order stats were chosen in (the last one gives way first).
  const picked = useRef<string[]>(Object.keys(split));

  useEffect(() => {
    let live = true;
    getStatsAction()
      .then((r) => live && setStats(r.stats))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Stats named in this quest's split but no longer in the list still show.
  const shown = [...stats, ...Object.keys(split).filter((k) => !stats.includes(k))];
  const total = Object.values(split).reduce((a, b) => a + b, 0);
  const toStats = Math.round((xp * total) / 100);

  function changeShare(stat: string, pct: number) {
    const prev = split;
    if (!(prev[stat] > 0) && pct > 0) picked.current = [...picked.current.filter((k) => k !== stat), stat];
    const next = setShare(prev, stat, pct, picked.current);
    const d = (next[stat] ?? 0) - (prev[stat] ?? 0);
    const lent = { ...(borrowed.current[stat] ?? {}) };
    if (d > 0) {
      for (const k of Object.keys(prev)) {
        const took = (prev[k] ?? 0) - (next[k] ?? 0);
        if (k !== stat && took > 0) lent[k] = (lent[k] ?? 0) + took;
      }
    } else if (d < 0) {
      let back = -d;
      for (const k of Object.keys(lent)) {
        const give = Math.min(lent[k], back);
        if (give <= 0) continue;
        next[k] = (next[k] ?? 0) + give;
        lent[k] -= give;
        back -= give;
        if (!lent[k]) delete lent[k];
      }
    }
    borrowed.current[stat] = lent;
    onChange(next);
  }

  function add() {
    const n = cleanStatName(name);
    setName("");
    setAdding(false);
    if (!n || stats.some((s) => s.toLowerCase() === n.toLowerCase())) return;
    const next = [...stats, n];
    setStats(next);
    void setStatsAction(next).catch(() => {});
  }

  const soft = "var(--t-ink-soft)";
  return (
    <div className={`${controlled ? "" : "-mt-1 "}flex flex-col gap-1.5`}>
      {/* A quiet link under the XP: share some of it with your character stats. */}
      {!controlled && (
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 self-start text-[12px] underline-offset-2 hover:underline" style={{ color: soft }}>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {total === 0 ? "Share XP with your stats" : `${toStats} XP to stats · ${xp - toStats} to your level`}
      </button>
      )}

      {open && (
        <div
          className="reveal flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
          // One dark, even panel; the text inside turns light to match.
          style={{ background: "#2b2214", border: "1.5px solid #8a6c2c", ["--t-ink" as string]: "#f3e7cb", ["--t-ink-soft" as string]: "rgba(243,231,203,.7)", color: "#f3e7cb" }}
        >
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {shown.map((stat) => (
              <StatRow key={stat} stat={stat} pct={split[stat] ?? 0} xp={Math.round((xp * (split[stat] ?? 0)) / 100)} isAdventure={isAdventure} onPct={(p) => changeShare(stat, p)} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {adding ? (
              <span className="reveal flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setAdding(false);
                    }
                  }}
                  maxLength={24}
                  placeholder="Name it, e.g. Creativity"
                  className="h-9 min-w-0 flex-1 rounded-full border px-3.5 text-[15px] placeholder:italic placeholder:text-[rgba(243,231,203,.45)]"
                  style={{ borderColor: "#8a6c2c", background: "rgba(0,0,0,.25)", color: "#f3e7cb", boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
                />
                <button type="button" onClick={add} disabled={!name.trim()} className="h-9 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
                  Add
                </button>
                <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="flex h-9 w-7 items-center justify-center text-[17px]" style={{ color: soft }}>
                  ×
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="hover-glow flex h-8 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-semibold"
                style={{ background: "linear-gradient(180deg, rgba(242,213,138,.16), rgba(242,213,138,.06))", border: "1px solid rgba(217,180,95,.55)", color: "#f3e7cb" }}
              >
                <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] font-bold leading-none" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #4a3913" }}>
                  +
                </span>
                A new stat
              </button>
            )}
            {total > 0 && !adding && (
              <button type="button" onClick={() => ((borrowed.current = {}), onChange({}))} className="ml-auto text-[13px] underline underline-offset-2" style={{ color: soft }}>
                Reset to 0%
              </button>
            )}
          </div>
          {/* A caret at the bottom folds the tray back up. */}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the stats tray" title="Close" className="-mb-1 flex h-7 w-full items-center justify-center rounded-full hover:bg-white/[.06]" style={{ color: "#d9b45f" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function StatRow({ stat, pct, xp, isAdventure, onPct }: { stat: string; pct: number; xp: number; isAdventure: boolean; onPct: (p: number) => void }) {
  const step = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] font-bold leading-none disabled:opacity-30";
  const stepStyle = { border: "1px solid rgba(217,180,95,.5)", color: "#f2d58a", background: "rgba(0,0,0,.2)" };
  return (
    <li className="flex items-center gap-1.5">
      <span className="font-display w-8 shrink-0 text-center text-[11px] font-bold tracking-wide" style={{ color: "#d9b45f" }} title={stat}>
        {statAbbr(stat)}
      </span>
      <span className="w-[76px] shrink-0 truncate text-[14px]" style={{ color: "var(--t-ink)" }}>
        {stat}
      </span>
      <button type="button" onClick={() => onPct(pct - 5)} disabled={pct <= 0} aria-label={`Less XP to ${stat}`} className={step} style={stepStyle}>
        −
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => onPct(Number(e.target.value))}
        aria-label={`Share of XP to ${stat}`}
        className={isAdventure ? "gilded-range h-8 min-w-0 flex-1" : "h-8 min-w-0 flex-1"}
        style={isAdventure ? { ["--p" as string]: `${pct}%` } : { accentColor: "var(--t-accent)" }}
      />
      <button type="button" onClick={() => onPct(pct + 5)} disabled={pct >= 100} aria-label={`More XP to ${stat}`} className={step} style={stepStyle}>
        +
      </button>
      <span className="w-[44px] shrink-0 text-right text-[13px] tabular-nums" style={{ color: pct ? "var(--t-ink)" : "var(--t-ink-soft)", fontWeight: pct ? 700 : 400 }}>
        {pct}%{pct > 0 && <span className="block text-[11px] font-normal" style={{ color: "var(--t-ink-soft)" }}>{xp} XP</span>}
      </span>
    </li>
  );
}
