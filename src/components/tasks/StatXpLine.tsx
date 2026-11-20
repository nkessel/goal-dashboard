import { statAbbr } from "@/lib/stats";

/**
 * Each stat's share of a quest's XP, under the quest editor's XP slider
 * (owner, Nov 19: "shown beneath the xp slider"; his pick: "c3 divided, no +").
 * Rows of stats split by thin gold rules (3 per row on phones, 5 on wider
 * screens), with your level's share under the XP total. Tapping opens the stats tray.
 */
const MARK = "#8a6116";
const RULE = "rgba(168,138,63,.45)";

export function StatXpLine({
  xp,
  split,
  isAdventure,
  onOpen,
}: {
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
  const mark = "font-display text-[10px] font-bold uppercase tracking-[.12em]";
  const cols = { ["--c" as string]: Math.min(parts.length, 3), ["--cw" as string]: Math.min(parts.length, 5) };

  // The slider row: −5 (≈42px) · gap · track · gap · +5 (≈42px) · gap · the XP total (≈64px); the stats sit under the track, your level under the total.
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Change the XP shared with stats"
      data-stat-xp-line
      className="due-in -mt-0.5 flex items-center text-center tabular-nums"
    >
      {/* Every cell has a rule on its left; the clip hides the first column's, whatever the column count. */}
      <span className="ml-[50px] flex-1 overflow-hidden">
        <span
          className="-ml-px grid gap-y-1 [grid-template-columns:repeat(var(--c),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--cw),minmax(0,1fr))]"
          style={cols}
        >
          {parts.map((s) => (
            <span key={s.stat} className="flex items-baseline justify-center gap-1.5 whitespace-nowrap text-[13.5px] leading-6" style={{ borderLeft: `1px solid ${RULE}` }} title={s.stat}>
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
