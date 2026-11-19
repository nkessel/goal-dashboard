import { statAbbr } from "@/lib/stats";

/**
 * Each stat's share of a quest's XP, under the quest editor's XP slider
 * (owner, Nov 19: "shown beneath the xp slider"). Three simple looks for his
 * pick; tapping opens the stats tray.
 *   line   — the stats' full names and XP in one quiet line of text
 *   ruler  — a thin bar split like the XP, with each stat's mark under its part
 *   ledger — a small, even table: mark and XP, and what's left for your level
 */
export type StatXpLook = "line" | "ruler" | "ledger";

const GOLD = ["#c9a24a", "#a88a3f", "#dcbc6a", "#8a6c2c", "#e8cf8a", "#b8913f"];

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
  const common = { type: "button" as const, onClick: onOpen, "aria-label": "Change the XP shared with stats", "data-stat-look": look };
  // Lines up with the slider's track (the −5 button is about 42px wide, then the 8px gap).
  const align = "ml-[50px] mr-[86px] -mt-1";

  if (look === "line") {
    return (
      <button {...common} className={`due-in ${align} block text-left text-[12.5px] leading-snug`} style={{ color: "var(--t-ink-soft)" }}>
        {parts.map((s, i) => (
          <span key={s.stat}>
            {i > 0 && " · "}
            <span className="whitespace-nowrap">
              {s.stat} <span className="tabular-nums" style={{ color: "var(--t-ink)" }}>{s.amount}</span>
            </span>
          </span>
        ))}
        {" · "}
        <span className="whitespace-nowrap">
          <span className="tabular-nums" style={{ color: xpInk }}>{left}</span> to your level
        </span>
      </button>
    );
  }

  if (look === "ruler") {
    const total = Math.max(1, xp);
    return (
      <button {...common} className={`due-in ${align} flex flex-col gap-0.5 text-left`}>
        <span className="flex h-[5px] w-full overflow-hidden rounded-full" style={{ background: "rgba(139,112,64,.18)" }}>
          {parts.map((s, i) => (
            <span key={s.stat} className="h-full" style={{ width: `${(s.amount / total) * 100}%`, background: GOLD[i % GOLD.length], borderRight: "1px solid #f6ecd2" }} />
          ))}
          <span className="h-full flex-1" style={{ background: xpInk, opacity: 0.55 }} />
        </span>
        <span className="flex flex-wrap gap-x-2 text-[11.5px] tabular-nums leading-tight" style={{ color: "var(--t-ink-soft)" }}>
          {parts.map((s) => (
            <span key={s.stat} className="whitespace-nowrap" title={s.stat}>
              <span className="font-display text-[10px] font-bold tracking-wide" style={{ color: "#8a6116" }}>{statAbbr(s.stat)}</span> {s.amount}
            </span>
          ))}
          <span className="whitespace-nowrap">
            <span className="tabular-nums" style={{ color: xpInk }}>{left}</span> to your level
          </span>
        </span>
      </button>
    );
  }

  return (
    <button {...common} className={`due-in ${align} grid grid-cols-[repeat(3,minmax(0,62px))] gap-x-4 gap-y-0 text-left text-[12.5px] tabular-nums leading-snug`} style={{ color: "var(--t-ink-soft)" }}>
      {parts.map((s) => (
        <span key={s.stat} className="flex items-baseline gap-1.5 whitespace-nowrap" title={s.stat}>
          <span className="font-display text-[10.5px] font-bold tracking-wide" style={{ color: "#8a6116" }}>{statAbbr(s.stat)}</span>
          <span style={{ color: "var(--t-ink)" }}>{s.amount}</span>
        </span>
      ))}
      <span className="col-span-3 whitespace-nowrap text-[12px]">
        <span className="tabular-nums" style={{ color: xpInk }}>{left} XP</span> to your level
      </span>
    </button>
  );
}
