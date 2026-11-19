import { statAbbr } from "@/lib/stats";

/**
 * Each stat's share of a quest's XP, under the quest editor's XP slider
 * (owner, Nov 19: "shown beneath the xp slider"; picked the ledger, then asked
 * for better spacing). Three spacings of the ledger for his pick; tapping
 * opens the stats tray.
 *   board   — evenly spread across the slider: mark on top, amount below; your level's share under the XP total
 *   leaders — two even columns, mark · dotted leader · amount; your level's share closes the list
 *   strip   — one row split by thin gold rules, evenly spread; your level's share under the XP total
 */
export type StatXpLook = "board" | "leaders" | "strip";

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
  // Three to a row: "STR 10" needs more room than a phone gives five side by side.
  const stripCols = Math.min(parts.length, 3);
  const common = { type: "button" as const, onClick: onOpen, "aria-label": "Change the XP shared with stats", "data-stat-look": look };
  // The slider row: −5 (≈42px) · gap · track · gap · +5 (≈42px) · gap · the XP total (≈64px).
  const mark = "font-display text-[10px] font-bold uppercase tracking-[.12em]";

  if (look === "board") {
    return (
      <button {...common} className="due-in -mt-0.5 flex items-start text-center tabular-nums">
        <span className="ml-[50px] grid flex-1 gap-y-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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

  if (look === "leaders") {
    const row = "flex items-baseline gap-1.5 leading-tight";
    const dots = <span aria-hidden className="mb-[3px] min-w-3 flex-1 border-b border-dotted" style={{ borderColor: "rgba(139,112,64,.45)" }} />;
    return (
      <button {...common} className="due-in ml-[50px] mr-[50px] -mt-0.5 grid grid-cols-2 gap-x-6 gap-y-1 text-left text-[13.5px] tabular-nums">
        {parts.map((s) => (
          <span key={s.stat} className={row} title={s.stat}>
            <span className={mark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
            {dots}
            <span className="font-semibold" style={{ color: "var(--t-ink)" }}>{s.amount}</span>
          </span>
        ))}
        <span className={`${row} ${parts.length % 2 ? "" : "col-span-2"}`}>
          <span className={mark} style={{ color: xpInk }}>Level</span>
          {dots}
          <span className="font-semibold" style={{ color: xpInk }}>{left}</span>
        </span>
      </button>
    );
  }

  return (
    <button {...common} className="due-in -mt-0.5 flex items-center text-center tabular-nums">
      <span className="ml-[50px] grid flex-1 gap-y-1" style={{ gridTemplateColumns: `repeat(${stripCols}, minmax(0, 1fr))` }}>
        {parts.map((s, i) => (
          <span key={s.stat} className="flex items-baseline justify-center gap-1.5 whitespace-nowrap text-[13.5px] leading-6" style={{ borderLeft: i % stripCols ? "1px solid rgba(168,138,63,.45)" : undefined }} title={s.stat}>
            <span className={mark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
            <span className="font-semibold" style={{ color: "var(--t-ink)" }}>{s.amount}</span>
          </span>
        ))}
      </span>
      <span className="ml-[50px] flex w-[64px] shrink-0 items-baseline justify-center gap-1 self-start whitespace-nowrap text-[13.5px] leading-6">
        <span className={mark} style={{ color: xpInk }}>Lvl</span>
        <span className="font-semibold" style={{ color: xpInk }}>{left}</span>
      </span>
    </button>
  );
}
