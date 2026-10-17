/** "Lvl 7" beside someone's name — gilded from level 10 — and a crown for the Champion of Quests. */
export function LevelPill({ level, champion = false }: { level: number; champion?: boolean }) {
  const gilded = level >= 10;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 align-middle">
      <span
        className="rounded-full px-2 py-px text-[11.5px] font-bold tabular-nums leading-[18px]"
        style={
          gilded
            ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1px solid #4a3913", color: "#2a1c10", boxShadow: "0 0 8px rgba(242,210,126,.55)" }
            : { background: "rgba(42,28,16,.82)", color: "#f2d27e" }
        }
      >
        Lvl {level}
      </span>
      {champion && (
        // eslint-disable-next-line @next/next/no-img-element -- crown glyph
        <img src="/design/ui-crown.svg" alt="Champion of Quests" title="Champion of Quests — the most XP of anyone" width={18} height={18} className="h-[18px] w-[18px]" />
      )}
    </span>
  );
}
