import { statAbbr, statLevel } from "@/lib/stats";

/** Under the level bar: each stat with XP, as a small seal with its level and progress. */
export function CharacterStats({ order, xp }: { order: string[]; xp: Record<string, number> }) {
  const names = [...order.filter((s) => (xp[s] ?? 0) > 0), ...Object.keys(xp).filter((s) => !order.includes(s) && xp[s] > 0)];
  if (!names.length) return null;
  return (
    <ul aria-label="Character stats" className="m-0 flex list-none flex-wrap justify-center gap-1 p-0">
      {names.map((s) => {
        const l = statLevel(xp[s]);
        return (
          <li
            key={s}
            title={`${s}: level ${l.level} · ${l.into}/${l.need} XP to the next`}
            className="flex min-w-[46px] flex-col items-center rounded-md px-1.5 pb-1 pt-0.5"
            style={{ background: "rgba(20,26,19,.72)", border: "1px solid rgba(217,180,95,.45)" }}
          >
            <span className="font-display flex items-baseline gap-1 text-[11px] font-bold leading-tight tracking-wide" style={{ color: "#f2d27e" }}>
              {statAbbr(s)}
              <span className="text-[12.5px] tabular-nums" style={{ color: "#f6ecd2" }}>
                {l.level}
              </span>
            </span>
            <span className="mt-0.5 block h-[3px] w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.12)" }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.round((l.into / l.need) * 100)}%`, background: "#d9b45f" }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
