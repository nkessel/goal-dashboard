import { statAbbr } from "@/lib/stats";

/**
 * Each stat's share of a quest's XP, under the quest editor's XP slider
 * (owner, Nov 19: "shown beneath the xp slider"; picked the ledger, then asked
 * for better spacing). Three spacings of the ledger for his pick; tapping
 * opens the stats tray.
 *   board   — evenly spread across the slider: mark on top, amount below; your level's share under the XP total
 *   strip   — rows split by thin gold rules (3 a row on phones, 5 on wider screens); your level's share under the XP total
 */
export type StatXpLook = "board" | "strip";

const MARK = "#8a6116";

export function StatXpLine({
  look,
  xp,
  split,
  isAdventure,
  onOpen,
}: {
  look: StatXpLook;
  xp: number;
  split: Record<string, number>;
  isAdventure: boolean;
  onOpen: () => void;
}) {
  const parts = Object.entries(split)
    .filter(([, p]) => p > 0)
    .map(([stat, p]) => ({ stat, amount: Math.round((xp * p) / 100) }));
  if (!parts.length) return null;
  const left = Math.max(0, xp - parts.reduce((a, s) => a + s.amount, 0));
  const xpInk = isAdventure ? "var(--t-xp)" : "var(--t-accent)";
  const cols = Math.min(parts.length, 5);
  const common = { type: "button" as const, onClick: onOpen, "aria-label": "Change the XP shared with stats", "data-stat-look": look };
  // The slider row: −5 (≈42px) · gap · track · gap · +5 (≈42px) · gap · the XP total (≈64px).
  const mark = "font-display text-[10px] font-bold uppercase tracking-[.12em]";

  if (look === "board") {
    return (
      <button {...common} className="due-in -mt-0.5 flex items-start text-center tabular-nums">
        <span className="ml-[50px] grid flex-1 gap-y-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {parts.map((s) => (
            <span key={s.stat} className="flex flex-col items-center leading-none" title={s.stat}>
              <span className={mark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
              <span className="mt-1 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>{s.amount}</span>
            </span>
          ))}
        </span>
        <span className="ml-[50px] flex w-[64px] shrink-0 flex-col items-center leading-none">
          <span className={mark} style={{ color: xpInk }}>Level</span>
          <span className="mt-1 text-[15px] font-semibold" style={{ color: xpInk }}>{left}</span>
        </span>
      </button>
    );
  }

  return (
    <button {...common} className="due-in -mt-0.5 flex items-center text-center tabular-nums">
      {/* Every cell has a rule on its left; the clip hides the first column's, whatever the column count. */}
      <span className="ml-[50px] flex-1 overflow-hidden">
        <span
          className="-ml-px grid gap-y-1 [grid-template-columns:repeat(var(--c),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--cw),minmax(0,1fr))]"
          style={{ ["--c" as string]: Math.min(parts.length, 3), ["--cw" as string]: Math.min(parts.length, 5) }}
        >
          {parts.map((s) => (
            <span key={s.stat} className="flex items-baseline justify-center gap-1.5 whitespace-nowrap text-[13.5px] leading-6" style={{ borderLeft: "1px solid rgba(168,138,63,.45)" }} title={s.stat}>
              <span className={mark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
              <span className="font-semibold" style={{ color: "var(--t-ink)" }}>{s.amount}</span>
            </span>
          ))}
        </span>
      </span>
      <span className="ml-[50px] flex w-[64px] shrink-0 items-baseline justify-center gap-1 self-start whitespace-nowrap text-[13.5px] leading-6">
        <span className={mark} style={{ color: xpInk }}>Lvl</span>
        <span className="font-semibold" style={{ color: xpInk }}>{left}</span>
      </span>
    </button>
  );
}
