"use client";

import { useEffect, useState } from "react";
import { FX_DEFAULTS, loadFx, saveFx, type FxSettings } from "@/lib/celebration-fx";
import { QuestComplete } from "@/components/celebration/QuestComplete";

type NumKey = "dens" | "vel" | "reach" | "size" | "embers" | "fill";

const SLIDERS: { k: NumKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { k: "dens", label: "Dust density", min: 0.2, max: 2, step: 0.1, fmt: (v) => `${v.toFixed(1)}x` },
  { k: "vel", label: "Velocity", min: 0.3, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}x` },
  { k: "reach", label: "Reach", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { k: "size", label: "Particle size", min: 0.5, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}x` },
  { k: "embers", label: "Embers", min: 0, max: 160, step: 5, fmt: (v) => String(v) },
  { k: "fill", label: "XP fill time", min: 1, max: 6, step: 0.5, fmt: (v) => `${v.toFixed(1)}s` },
];

export function CelebrationSettings() {
  const [fx, setFx] = useState<FxSettings>(FX_DEFAULTS);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);

  // localStorage is only readable after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFx(loadFx()), []);

  // Every change is saved straight away, so Preview always plays the latest values.
  function update(patch: Partial<FxSettings>) {
    const next = { ...fx, ...patch };
    setFx(next);
    setNote(saveFx(next) ? "Saved automatically." : "Could not save in this browser.");
  }
  function nudge(k: NumKey, dir: 1 | -1, min: number, max: number, step: number) {
    const dp = (String(step).split(".")[1] ?? "").length;
    update({ [k]: Math.min(max, Math.max(min, +(fx[k] + dir * step).toFixed(dp))) });
  }

  const btn = "hover-glow h-11 w-11 shrink-0 rounded-lg text-xl leading-none";
  const btnStyle = { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" };

  return (
    <div className="flex flex-col gap-3" style={{ color: "var(--t-ink)" }}>
      <label className="flex min-h-9 items-center gap-2.5 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={fx.fxAvatar} onChange={() => update({ fxAvatar: !fx.fxAvatar })} />
        Dust from the avatars
      </label>
      <label className="flex min-h-9 items-center gap-2.5 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={fx.fxCard} onChange={() => update({ fxCard: !fx.fxCard })} />
        Dust from the quest card border
      </label>

      {SLIDERS.map(({ k, label, min, max, step, fmt }) => (
        <div key={k} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span>{label}</span>
            <span className="font-semibold tabular-nums" style={{ color: "var(--t-gold-deep)" }}>{fmt(fx[k])}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={btn} style={btnStyle} aria-label={`Decrease ${label}`} onClick={() => nudge(k, -1, min, max, step)}>−</button>
            <input
              type="range"
              className="min-w-0 flex-1 accent-[var(--t-gold-deep)]"
              min={min}
              max={max}
              step={step}
              value={fx[k]}
              aria-label={label}
              onChange={(e) => update({ [k]: parseFloat(e.target.value) })}
            />
            <button type="button" className={btn} style={btnStyle} aria-label={`Increase ${label}`} onClick={() => nudge(k, 1, min, max, step)}>+</button>
          </div>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => update({ ...FX_DEFAULTS })} className="hover-glow h-11 flex-1 rounded-lg text-sm font-medium" style={btnStyle}>
          Reset
        </button>
        <button type="button" onClick={() => setPreview(true)} className="hover-glow h-11 flex-[1.6] rounded-lg text-sm font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          Preview celebration
        </button>
      </div>
      <p className="min-h-4 text-center text-xs" style={{ color: "var(--t-ink-soft)" }} aria-live="polite">{note}</p>

      {preview && (
        <QuestComplete
          preview
          title="Train with the Dragon"
          description="Practice 20 minutes of sword drills."
          tag="Preview"
          iconSrc="/design/icon-dragon.jpg"
          questXp={150}
          level={4}
          xpIntoLevel={1950}
          xpForNextLevel={2500}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  );
}
