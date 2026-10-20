"use client";

import { useEffect, useState, useRef } from "react";
import { FEEDBACK_STYLES, FX_DEFAULTS, loadFx, saveFx, type FeedbackStyle, type FxSettings } from "@/lib/celebration-fx";
import { SentBurst } from "@/components/feedback/FeedbackDock";
import { ProgressCelebration } from "@/components/celebration/ProgressCelebration";
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
  const [sentPreview, setSentPreview] = useState<{ key: number; style: FeedbackStyle } | null>(null);
  const [cardPreview, setCardPreview] = useState(0);
  const plays = useRef(0);
  function playSent(style: FeedbackStyle) {
    const key = ++plays.current;
    setSentPreview({ key, style });
    setTimeout(() => setSentPreview((p) => (p && p.key === key ? null : p)), 2700);
  }

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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">When a reward pays out</span>
        <div role="radiogroup" aria-label="Reward animation" className="flex flex-wrap gap-1.5">
          {(
            [
              ["classic", "Classic", "A short “Well done!” note"],
              ["ceremony", "Ceremony", "Golden rays, a coin burst and your level bar filling"],
            ] as const
          ).map(([v, label, hint]) => {
            const on = fx.rewardStyle === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                title={hint}
                onClick={() => update({ rewardStyle: v })}
                className="flex min-h-11 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
                style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
              >
                <span className="text-[14px] font-bold">{label}</span>
                <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* When feedback is sent */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">When you send feedback</span>
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {FEEDBACK_STYLES.map((o) => {
            const on = (fx.feedbackStyle ?? "seal") === o.key;
            return (
              <li key={o.key} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    update({ feedbackStyle: o.key });
                    playSent(o.key);
                  }}
                  className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
                  style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
                >
                  <span className="text-[14px] font-bold">{o.label}</span>
                  <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                    {o.hint}
                  </span>
                </button>
                <button type="button" onClick={() => playSent(o.key)} className="h-9 shrink-0 rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid var(--t-card-border)", color: "var(--t-ink)" }} aria-label={`Preview ${o.label}`}>
                  ▶ Preview
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Progress and the daily welcome */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Progress and the daily welcome</span>
        <div role="radiogroup" aria-label="Progress style" className="flex flex-wrap gap-1.5">
          {(
            [
              ["card", "Card", "A card in the middle, with confetti"],
              ["banner", "Banner", "A slim banner slides down from the top"],
            ] as const
          ).map(([v, label, hint]) => {
            const on = (fx.cardStyle ?? "card") === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                title={hint}
                onClick={() => {
                  update({ cardStyle: v });
                  setCardPreview((n) => n + 1);
                }}
                className="flex min-h-11 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
                style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" }}
              >
                <span className="text-[14px] font-bold">{label}</span>
                <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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

      {sentPreview && (
        <SentBurst key={sentPreview.key} kind="feedback" xp={2} x={typeof window === "undefined" ? 200 : window.innerWidth / 2} y={typeof window === "undefined" ? 300 : window.innerHeight / 2} isAdventure style={sentPreview.style} />
      )}
      {cardPreview > 0 && (
        <ProgressCelebration
          key={cardPreview}
          heading="A new day dawns, adventurer"
          title="🔥 8-day streak — keep it going"
          xp={10}
          fromPct={40}
          toPct={55}
          barCaption="Level 4 · 1,960 / 2,500 XP to level 5"
          onClose={() => setCardPreview(0)}
        />
      )}
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
