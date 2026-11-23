"use client";

/** Quick set: one tap sets several attributes at once (importance, urgency, effort, energy, minutes and XP). */
export function EditorPresets({ labelCls, chipBorder, setImportance, setUrgency, setEffort, setEnergyGain, setEstimate, setXp }: {
  labelCls: string;
  chipBorder: string;
  setImportance: (n: number) => void;
  setUrgency: (n: number) => void;
  setEffort: (n: number) => void;
  setEnergyGain: (n: number) => void;
  setEstimate: (v: string) => void;
  setXp: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1" role="group" aria-label="Quest presets">
      <span className={`${labelCls} mr-0.5`}>Quick set</span>
      {(
        [
          { name: "Quick win", hint: "Small and satisfying", imp: 2, urg: 3, eff: 1, en: 3, min: 10, xp: 15 },
          { name: "Big rock", hint: "Important, takes real effort", imp: 5, urg: 3, eff: 4, en: 2, min: 90, xp: 80 },
          { name: "Deep work", hint: "Focused, meaningful time", imp: 4, urg: 2, eff: 3, en: 2, min: 60, xp: 50 },
          { name: "Recharge", hint: "Gives energy back", imp: 3, urg: 2, eff: 1, en: 5, min: 20, xp: 20 },
        ] as const
      ).map((p) => (
        <button
          key={p.name}
          type="button"
          title={`${p.hint} · ${p.min} min · ${p.xp} XP`}
          onClick={() => {
            setImportance(p.imp);
            setUrgency(p.urg);
            setEffort(p.eff);
            setEnergyGain(p.en);
            setEstimate(String(p.min));
            setXp(p.xp);
          }}
          className="hover-glow h-8 rounded-full px-3 text-[12.5px] font-semibold"
          style={{ border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: "rgba(255,250,235,.45)" }}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
