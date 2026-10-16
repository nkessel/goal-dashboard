"use client";

import { Panel, Portrait, type LabTask } from "./shared";

const BANDS = [
  { key: "early", label: "Early morning", from: 5, to: 9 },
  { key: "late", label: "Late morning", from: 9, to: 12 },
  { key: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { key: "evening", label: "Evening", from: 17, to: 21 },
  { key: "night", label: "Night", from: 21, to: 29 },
] as const;

const inBand = (hour: number, b: (typeof BANDS)[number]) => {
  const h = hour < 5 ? hour + 24 : hour;
  return h >= b.from && h < b.to;
};

function sky(avg: number) {
  if (avg >= 7) return "Bright";
  if (avg >= 5) return "Fair";
  return "Low";
}

/**
 * Your energy check-ins become a forecast for the day: when you usually
 * have the most in the tank. Quests settle into the time whose usual energy
 * fits their effort — heavy ones into your brightest hours.
 */
export function EnergyWeather<T extends LabTask>({ tasks, energy, now, isAdventure, onOpen }: { tasks: T[]; energy: { level: number; at: string }[]; now: number; isAdventure: boolean; onOpen: (t: T) => void }) {
  const stats = BANDS.map((b) => {
    const xs = energy.filter((e) => inBand(new Date(e.at).getHours(), b)).map((e) => e.level);
    return { ...b, n: xs.length, avg: xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null };
  });
  const known = stats.filter((s) => s.avg !== null);
  const hourNow = new Date(now).getHours();

  if (energy.length < 3 || known.length === 0) {
    return (
      <Panel isAdventure={isAdventure} className="px-4 py-5">
        <p className="relative z-[1] m-0 text-[15px] leading-snug" style={{ color: "var(--t-ink)" }}>
          Your forecast needs a few energy check-ins. Use the energy slider on Today a few times across the day, and within a week you&apos;ll see when you&apos;re usually brightest.
        </p>
        <p className="relative z-[1] m-0 mt-1.5 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
          {energy.length} check-in{energy.length === 1 ? "" : "s"} in the last 30 days.
        </p>
      </Panel>
    );
  }

  // Each quest goes to the time whose usual energy best fits its effort (effort 1–5 → energy 2–10).
  const placed = new Map<string, T[]>();
  for (const t of tasks) {
    const need = 2 * (t.effort && t.effort > 0 ? t.effort : 3);
    let best = known[0];
    let bestFit = Infinity;
    for (const s of known) {
      // A band below the need fits badly; above it is fine but wasteful.
      const gap = s.avg! - need;
      const fit = gap < 0 ? -gap * 2 : gap;
      if (fit < bestFit) {
        best = s;
        bestFit = fit;
      }
    }
    placed.set(best.key, [...(placed.get(best.key) ?? []), t]);
  }

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-1 px-4 py-4">
      <p className="relative z-[1] m-0 mb-2 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
        Your usual energy, from {energy.length} check-ins over the last 30 days. Quests sit where their effort fits.
      </p>
      <ul className="relative z-[1] m-0 flex list-none flex-col p-0">
        {stats.map((s, i) => {
          const here = placed.get(s.key) ?? [];
          const current = inBand(hourNow, s);
          return (
            <li key={s.key} className="flex flex-col gap-1.5 py-2.5" style={i ? { borderTop: "1px solid rgba(139,112,64,.2)" } : undefined}>
              <div className="flex items-center gap-3">
                <span className="w-[112px] shrink-0">
                  <span className="block text-[14.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                    {s.label}
                    {current && <span className="ml-1.5 text-[12px] font-normal" style={{ color: "#6f4f12" }}>now</span>}
                  </span>
                  <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                    {s.avg === null ? "no check-ins" : `${sky(s.avg)} · ${s.avg.toFixed(1)} · ${s.n}×`}
                  </span>
                </span>
                <span className="h-3 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.1)" }} aria-label={s.avg === null ? "No data" : `Average energy ${s.avg.toFixed(1)} of 10`}>
                  {s.avg !== null && <span className="block h-full rounded-full" style={{ width: `${(s.avg / 10) * 100}%`, background: "linear-gradient(90deg, #e9d7a6, #b07d1e)" }} />}
                </span>
              </div>
              {here.length > 0 && (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 pl-[124px] max-sm:pl-0">
                  {here.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => onOpen(t)} className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12.5px]" style={{ background: "rgba(255,250,238,.75)", border: "1px solid rgba(139,112,64,.35)", color: "var(--t-ink)" }}>
                        <Portrait t={t} size={20} />
                        <span className="max-w-[150px] truncate">{t.title}</span>
                      </button>
                    </li>
                  ))}
                  {here.length > 8 && <li className="self-center text-[12px]" style={{ color: "var(--t-ink-soft)" }}>+{here.length - 8} more</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
