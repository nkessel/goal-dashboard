"use client";

import { setVisualFx, useVisualFx, VISUAL_FX_DEFAULTS, type VisualFx } from "@/lib/visual-fx";
import { EveningButtonPreview } from "@/components/evening/BeginEveningButton";

const EVENING: { k: keyof VisualFx; label: string }[] = [
  { k: "eveningStarShimmer", label: "Stars shimmer (a wave of light across them)" },
  { k: "eveningStarTwinkle", label: "Stars twinkle" },
  { k: "eveningBorderShimmer", label: "Border shimmers" },
];

/** Evening Routine button effects, with a live preview. Saved on this device. */
export function EveningButtonFxSettings() {
  const fx = useVisualFx();
  return (
    <div className="flex flex-col gap-2.5" style={{ color: "var(--t-ink)" }}>
      <EveningButtonPreview fx={fx} />
      {EVENING.map(({ k, label }) => (
        <label key={k} className="flex min-h-9 items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={fx[k]} onChange={() => setVisualFx({ [k]: !fx[k] })} />
          {label}
        </label>
      ))}
      <button
        type="button"
        onClick={() => setVisualFx({ ...VISUAL_FX_DEFAULTS })}
        className="hover-glow h-10 w-fit rounded-lg px-4 text-sm font-medium"
        style={{ border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
      >
        Reset
      </button>
    </div>
  );
}
