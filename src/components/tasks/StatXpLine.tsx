import { statAbbr } from "@/lib/stats";

/**
 * Each stat's share of a quest's XP, under the quest editor's XP slider
 * (owner, Nov 19: "shown beneath the xp slider"; leaned to the divided strip,
 * then asked for ideas from tabletop sheets). Three looks for his pick, each
 * with your level's share under the XP total; tapping opens the stats tray.
 *   block — a stat block's ability row: the strip framed by tapered gold rules above and below, "+6" like a modifier
 *   boxes — a character sheet's ability boxes: the "+6" large in a small framed box, the stat's mark on a tab at its top
 * `plus` writes the amounts like modifiers ("+6") or plain ("6").
 *   board — (C1, kept to compare) up to five across, mark above amount
 *   strip — (C3, kept to compare) rows split by thin gold rules
 * Rows: 3 (boxes 4) on phones, 5 on wider screens.
 */
export type StatXpLook = "board" | "strip" | "block" | "boxes";

const MARK = "#8a6116";
const RULE = "rgba(168,138,63,.45)";

/** A stat block's divider: thick in the middle, thinning to points at both ends. */
function TaperedRule() {
  return <span aria-hidden className="block h-[3px] w-full" style={{ background: "#a88a3f", clipPath: "polygon(0 50%, 50% 0, 100% 50%, 50% 100%)", opacity: 0.75 }} />;
}

export function StatXpLine({
  look,
  plus,
  xp,
  split,
  isAdventure,
  onOpen,
}: {
  look: StatXpLook;
  plus: boolean;
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
  const common = { type: "button" as const, onClick: onOpen, "aria-label": "Change the XP shared with stats", "data-stat-look": `${look}${plus ? "-plus" : ""}` };
  const sign = plus ? "+" : "";
  const mark = "font-display text-[10px] font-bold uppercase tracking-[.12em]";
  // In a row, marks sit beside their number, so they're spaced less.
  const rowMark = "font-display text-[9.5px] font-bold uppercase tracking-[.05em]";
  const grid = "grid [grid-template-columns:repeat(var(--c),minmax(0,1fr))] sm:[grid-template-columns:repeat(var(--cw),minmax(0,1fr))]";
  const cols = (phone: number) => ({ ["--c" as string]: Math.min(parts.length, phone), ["--cw" as string]: Math.min(parts.length, 5) });
  // The slider row: −5 (≈42px) · gap · track · gap · +5 (≈42px) · gap · the XP total (≈64px); the stats sit under the track, your level under the total.
  const levelCell = (
    <span className="ml-[50px] flex w-[64px] shrink-0 flex-col items-center self-start leading-none">
      <span className={mark} style={{ color: xpInk }}>Level</span>
      <span className="mt-1 text-[15px] font-semibold tabular-nums" style={{ color: xpInk }}>{sign}{left}</span>
    </span>
  );

  if (look === "board") {
    return (
      <button {...common} className="due-in -mt-0.5 flex items-start text-center tabular-nums">
        <span className="ml-[50px] grid flex-1 gap-y-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(parts.length, 5)}, minmax(0, 1fr))` }}>
          {parts.map((s) => (
            <span key={s.stat} className="flex flex-col items-center leading-none" title={s.stat}>
              <span className={mark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
              <span className="mt-1 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>{sign}{s.amount}</span>
            </span>
          ))}
        </span>
        <span className="ml-[50px] flex w-[64px] shrink-0 flex-col items-center leading-none">
          <span className={mark} style={{ color: xpInk }}>Level</span>
          <span className="mt-1 text-[15px] font-semibold" style={{ color: xpInk }}>{sign}{left}</span>
        </span>
      </button>
    );
  }

  if (look === "strip") {
    return (
      <button {...common} className="due-in -mt-0.5 flex items-center text-center tabular-nums">
        <span className="ml-[50px] flex-1 overflow-hidden">
          <span className={`-ml-px gap-y-1 ${grid}`} style={cols(3)}>
            {parts.map((s) => (
              <span key={s.stat} className="flex items-baseline justify-center gap-1.5 whitespace-nowrap text-[13.5px] leading-6" style={{ borderLeft: `1px solid ${RULE}` }} title={s.stat}>
                <span className={mark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
                <span className="font-semibold" style={{ color: "var(--t-ink)" }}>{sign}{s.amount}</span>
              </span>
            ))}
          </span>
        </span>
        <span className="ml-[50px] flex w-[64px] shrink-0 items-baseline justify-center gap-1 self-start whitespace-nowrap text-[13.5px] leading-6">
          <span className={mark} style={{ color: xpInk }}>Lvl</span>
          <span className="font-semibold" style={{ color: xpInk }}>{sign}{left}</span>
        </span>
      </button>
    );
  }

  if (look === "block") {
    return (
      <button {...common} className="due-in -mt-0.5 flex items-start text-center tabular-nums">
        <span className="ml-[50px] flex min-w-0 flex-1 flex-col gap-1">
          <TaperedRule />
          {/* Every cell has a rule on its left; the clip hides the first column's, whatever the column count. */}
          <span className="overflow-hidden">
            <span className={`-ml-px gap-y-1 ${grid}`} style={cols(3)}>
              {parts.map((s) => (
                <span key={s.stat} className="flex min-w-0 items-baseline justify-center gap-1 whitespace-nowrap px-1 text-[13px] leading-6" style={{ borderLeft: `1px solid ${RULE}` }} title={s.stat}>
                  <span className={rowMark} style={{ color: MARK }}>{statAbbr(s.stat)}</span>
                  <span className="font-semibold" style={{ color: "var(--t-ink)" }}>{sign}{s.amount}</span>
                </span>
              ))}
            </span>
          </span>
          <TaperedRule />
        </span>
        {levelCell}
      </button>
    );
  }

  if (look === "boxes") {
    return (
      <button {...common} className="due-in mt-1.5 flex items-start text-center tabular-nums">
        <span className={`ml-[50px] min-w-0 flex-1 gap-x-1.5 gap-y-3 ${grid}`} style={cols(4)}>
          {parts.map((s) => (
            <span key={s.stat} className="relative flex h-9 flex-col items-center justify-end rounded-md pb-1.5" style={{ border: `1px solid ${RULE}`, background: "rgba(255,250,238,.5)" }} title={s.stat}>
              <span className={`${mark} absolute -top-[7px] rounded-full px-1.5 leading-[13px]`} style={{ color: MARK, background: "#f6ecd2", border: `1px solid ${RULE}` }}>
                {statAbbr(s.stat)}
              </span>
              <span className="text-[15px] font-semibold leading-none" style={{ color: "var(--t-ink)" }}>{sign}{s.amount}</span>
            </span>
          ))}
        </span>
        {levelCell}
      </button>
    );
  }

  return null;
}
