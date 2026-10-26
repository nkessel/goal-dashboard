"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getStatsAction, setStatsAction } from "@/app/actions";
import { DEFAULT_STATS, cleanStatName, statAbbr } from "@/lib/stats";
import { useEscape } from "@/lib/use-escape";

/**
 * Settings' half-width "Stats" tile: your character stats in order. Move
 * them up and down, take one off the list (its XP is kept), or add one.
 * The order is yours everywhere stats show.
 */
export function StatsTile({ isAdventure }: { isAdventure: boolean }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    getStatsAction()
      .then((r) => setStats(r.stats))
      .catch(() => setStats([...DEFAULT_STATS]));
  }, []);
  useEscape(() => setOpen(false), open);

  function save(next: string[]) {
    setStats(next);
    void setStatsAction(next).catch(() => {});
  }
  function move(i: number, dir: -1 | 1) {
    if (!stats) return;
    const next = [...stats];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }
  function add() {
    const n = cleanStatName(name);
    setName("");
    if (!n || !stats || stats.some((s) => s.toLowerCase() === n.toLowerCase())) return;
    save([...stats, n]);
  }

  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/5 disabled:opacity-25";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`hover-glow flex items-center gap-2.5 px-3.5 py-3 text-left ${isAdventure ? "parchment" : ""}`}
        style={isAdventure ? { borderRadius: 14 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 14 }}
      >
        <span aria-hidden className="font-display flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #4a3913" }}>
          ✦
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
            Character stats
          </span>
          <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
            {stats ? `${stats.length} · order and names` : "Order and names"}
          </span>
        </span>
      </button>
      {open &&
        createPortal(
          <div className="overlay-fade-in fixed inset-0 z-[72] flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }} onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Your character stats"
              onClick={(e) => e.stopPropagation()}
              className="card-pop-in parchment parchment-framed relative flex max-h-[86vh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-2xl p-5"
              style={{ color: "var(--t-ink)", background: isAdventure ? undefined : "var(--t-card)" }}
            >
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 z-[2] flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                ×
              </button>
              <div className="relative z-[1] pr-8">
                <p className={`m-0 text-[19px] ${isAdventure ? "font-display" : "font-bold"}`}>Character stats</p>
                <p className="m-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                  The order they show in, everywhere. Taking one off the list keeps the XP it has.
                </p>
              </div>
              <ol className="relative z-[1] m-0 flex list-none flex-col gap-1 p-0">
                {(stats ?? []).map((s, i) => (
                  <li key={s} className="flex min-h-10 items-center gap-1.5 rounded-lg pl-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
                    <span className="font-display w-8 shrink-0 text-center text-[11px] font-bold tracking-wide" style={{ color: "#6b5124" }}>
                      {statAbbr(s)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px]">{s}</span>
                    <button type="button" aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => move(i, -1)} className={btn}>
                      ↑
                    </button>
                    <button type="button" aria-label={`Move ${s} down`} disabled={i === (stats?.length ?? 0) - 1} onClick={() => move(i, 1)} className={btn}>
                      ↓
                    </button>
                    <button type="button" aria-label={`Take ${s} off the list`} title="Take it off the list (its XP is kept)" onClick={() => save((stats ?? []).filter((x) => x !== s))} className={btn} style={{ color: "var(--t-warn)" }}>
                      ×
                    </button>
                  </li>
                ))}
              </ol>
              <form
                className="relative z-[1] flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  add();
                }}
              >
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="A new stat, e.g. Creativity" aria-label="A new stat" className="h-9 min-w-0 flex-1 rounded-full border px-3.5 text-[15px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.5)", color: "var(--t-ink)" }} />
                <button type="submit" disabled={!name.trim()} className="h-9 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
                  Add
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
