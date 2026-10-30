"use client";

import { LOADING_LOOKS, setVisualFx, useVisualFx, VISUAL_FX_DEFAULTS, type VisualFx } from "@/lib/visual-fx";
import { LoadingArt } from "@/components/ui/NavLoader";
import { EveningButtonPreview } from "@/components/evening/BeginEveningButton";

const EVENING: { k: "eveningStarShimmer" | "eveningStarTwinkle" | "eveningBorderShimmer"; label: string }[] = [
  { k: "eveningStarShimmer", label: "Stars shimmer (a wave of light across them)" },
  { k: "eveningStarTwinkle", label: "Stars twinkle" },
  { k: "eveningBorderShimmer", label: "Border shimmers" },
];

/** Short words for what's set, shown on each folded group's title while it's closed. */
const listOf = (on: string[], none: string) => (on.length ? on.join(" · ") : none);
export function EveningButtonValue() {
  const fx = useVisualFx();
  return <>{listOf(EVENING.filter(({ k }) => fx[k]).map(({ label }) => label.split(" (")[0]), "No effects")}</>;
}
export function VictoriesValue() {
  const fx = useVisualFx();
  return <>{listOf(VICTORIES.filter(({ k }) => fx[k]).map(({ label }) => label), "Just its title")}</>;
}
export function LoadingValue() {
  const fx = useVisualFx();
  return <>{LOADING_LOOKS.find((l) => l.key === fx.loadingLook)?.label}</>;
}

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
        onClick={() => setVisualFx(Object.fromEntries(EVENING.map(({ k }) => [k, VISUAL_FX_DEFAULTS[k]])))}
        className="hover-glow h-10 w-fit rounded-lg px-4 text-sm font-medium"
        style={{ border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
      >
        Reset
      </button>
    </div>
  );
}

const VICTORIES: { k: keyof VisualFx; label: string }[] = [
  { k: "victoriesShowXp", label: "Today's XP" },
  { k: "victoriesShowCount", label: "How many victories" },
  { k: "victoriesShowCoins", label: "Coins earned today" },
  { k: "victoriesShowLatest", label: "The latest victory" },
];

/** What Victories Today shows in its header while it's closed. */
export function VictoriesHeaderSettings() {
  const fx = useVisualFx();
  return (
    <div className="flex flex-col gap-1.5" style={{ color: "var(--t-ink)" }}>
      {VICTORIES.map(({ k, label }) => (
        <label key={k} className="flex min-h-9 items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={!!fx[k]} onChange={() => setVisualFx({ [k]: !fx[k] })} />
          {label}
        </label>
      ))}
    </div>
  );
}

/** What shows while the next screen loads, each with a live preview; and quiet preloading. */
export function LoadingSettings() {
  const fx = useVisualFx();
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="While a screen loads" className="grid grid-cols-2 gap-2">
        {LOADING_LOOKS.map((l) => {
          const on = fx.loadingLook === l.key;
          return (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setVisualFx({ loadingLook: l.key })}
              title={l.hint}
              className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[13px] font-semibold"
              style={{ border: `1.5px solid ${on ? "var(--t-gold-deep, #8a6116)" : "var(--t-card-border)"}`, background: on ? "rgba(217,180,95,.18)" : "transparent" }}
            >
              <span className="flex h-16 w-full items-center justify-center overflow-hidden">
                {l.key === "bar" ? <span className="block h-[3px] w-3/4 rounded-full" style={{ background: "linear-gradient(90deg,#a88a3f,#d9b45f)" }} /> : <LoadingArt look={l.key} />}
              </span>
              {l.label}
            </button>
          );
        })}
      </div>
      <label className="flex min-h-9 items-center gap-2.5 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={fx.preload} onChange={() => setVisualFx({ preload: !fx.preload })} />
        Quietly load the screens I visit most while I&apos;m idle, so they open faster
      </label>
    </div>
  );
}
