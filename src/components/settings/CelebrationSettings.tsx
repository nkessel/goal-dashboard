"use client";

import { useEffect, useState, useRef } from "react";
import { FAB_STYLES, FEEDBACK_HOLDS, FEEDBACK_STYLES, FX_DEFAULTS, PACES, loadFx, saveFx, type FeedbackStyle, type FxSettings } from "@/lib/celebration-fx";
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
    const hold = fx.feedbackHold ?? 2.2;
    if (style === "quiet" && hold === 0) return; // stays until closed
    setTimeout(() => setSentPreview((p) => (p && p.key === key ? null : p)), style === "quiet" ? hold * 1000 + 50 : 2700 * (fx.pace ?? 1));
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

  const pick = (on: boolean) => (on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" });
  const playBtn = "hover-glow flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold";
  const playStyle = { background: "linear-gradient(180deg,#3a2a14,#24190b)", color: "#f6dc8e", border: "1.5px solid #8a6c2c", boxShadow: "0 2px 5px rgba(0,0,0,.3)" };
  return (
    <div className="flex flex-col gap-2" style={{ color: "var(--t-ink)" }}>
      <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        How the app celebrates: finishing a quest, sending feedback, your progress, and how quickly it all plays. Each part opens on its own.
      </p>

      <Fold title="Finishing a quest" hint={fx.rewardStyle === "ceremony" ? "Ceremony" : "Classic"}>
        <div role="radiogroup" aria-label="Reward animation" className="flex flex-wrap gap-1.5">
          {(
            [
              ["classic", "Classic", "A short “Well done!” note"],
              ["ceremony", "Ceremony", "Golden rays, a coin burst and your level bar filling"],
            ] as const
          ).map(([v, label, hint]) => (
            <button key={v} type="button" role="radio" aria-checked={fx.rewardStyle === v} title={hint} onClick={() => update({ rewardStyle: v })} className="flex min-h-11 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick(fx.rewardStyle === v)}>
              <span className="text-[14px] font-bold">{label}</span>
              <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                {hint}
              </span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setPreview(true)} className={`${playBtn} self-start`} style={playStyle}>
          <Play /> Preview it
        </button>
        <Fold title="Magic dust (advanced)" hint="Sparkles around the card and portraits">
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
                <input type="range" className="min-w-0 flex-1 accent-[var(--t-gold-deep)]" min={min} max={max} step={step} value={fx[k]} aria-label={label} onChange={(e) => update({ [k]: parseFloat(e.target.value) })} />
                <button type="button" className={btn} style={btnStyle} aria-label={`Increase ${label}`} onClick={() => nudge(k, 1, min, max, step)}>+</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => update({ ...FX_DEFAULTS, feedbackStyle: fx.feedbackStyle, cardStyle: fx.cardStyle, pace: fx.pace, fabStyle: fx.fabStyle })} className="hover-glow h-10 self-start rounded-full px-4 text-sm font-medium" style={btnStyle}>
            Reset the dust
          </button>
        </Fold>
      </Fold>

      <Fold title="Sending feedback" hint={FEEDBACK_STYLES.find((f) => f.key === (fx.feedbackStyle ?? "quiet"))?.label ?? ""}>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {FEEDBACK_STYLES.map((o) => {
            const on = (fx.feedbackStyle ?? "quiet") === o.key;
            return (
              <li key={o.key} className="flex items-center gap-2">
                <button type="button" role="radio" aria-checked={on} onClick={() => update({ feedbackStyle: o.key })} className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick(on)}>
                  <span className="text-[14px] font-bold">{o.label}</span>
                  <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                    {o.hint}
                  </span>
                </button>
                <button type="button" onClick={() => playSent(o.key)} className={playBtn} style={playStyle} aria-label={`Preview ${o.label}`}>
                  <Play /> Preview
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex flex-col gap-1">
          <span className="text-[13px] font-semibold">How long “Feedback submitted” stays</span>
          <div role="radiogroup" aria-label="How long the Feedback submitted card stays" className="flex flex-wrap gap-1.5">
            {FEEDBACK_HOLDS.map((h) => {
              const on = (fx.feedbackHold ?? 2.2) === h.v;
              return (
                <button key={h.v} type="button" role="radio" aria-checked={on} onClick={() => update({ feedbackHold: h.v })} className="min-h-9 rounded-xl px-3 text-[13.5px] font-semibold" style={pick(on)}>
                  {h.label}
                  {h.v ? <span className="ml-1 text-[11.5px] font-normal opacity-75">{h.v}s</span> : null}
                </button>
              );
            })}
          </div>
          <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
            Tap its × to close it sooner.
          </span>
        </div>
      </Fold>

      <Fold title="Progress and the daily welcome" hint={(fx.cardStyle ?? "card") === "card" ? "Card" : "Banner"}>
        <div role="radiogroup" aria-label="Progress style" className="flex flex-wrap gap-1.5">
          {(
            [
              ["card", "Card", "A card in the middle, with confetti"],
              ["banner", "Banner", "A slim banner slides down from the top"],
            ] as const
          ).map(([v, label, hint]) => (
            <button key={v} type="button" role="radio" aria-checked={(fx.cardStyle ?? "card") === v} title={hint} onClick={() => update({ cardStyle: v })} className="flex min-h-11 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick((fx.cardStyle ?? "card") === v)}>
              <span className="text-[14px] font-bold">{label}</span>
              <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                {hint}
              </span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setCardPreview((n) => n + 1)} className={`${playBtn} self-start`} style={playStyle}>
          <Play /> Preview it
        </button>
      </Fold>

      <Fold title="Speed of the effects" hint={PACES.find((p) => p.v === (fx.pace ?? 1))?.label ?? "As designed"}>
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          How quickly the feedback animations and the XP bar play.
        </p>
        <div role="radiogroup" aria-label="Speed of the effects" className="flex flex-wrap gap-1.5">
          {PACES.map((p) => (
            <button key={p.v} type="button" role="radio" aria-checked={(fx.pace ?? 1) === p.v} onClick={() => update({ pace: p.v })} className="h-10 flex-1 rounded-full px-3 text-[13.5px] font-bold" style={pick((fx.pace ?? 1) === p.v)}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => playSent(fx.feedbackStyle ?? "quiet")} className={`${playBtn} self-start`} style={playStyle}>
          <Play /> Try it
        </button>
      </Fold>

      <Fold title="The + button" hint={FAB_STYLES.find((f) => f.key === (fx.fabStyle ?? "seal"))?.label ?? ""}>
        <div role="radiogroup" aria-label="The + button" className="flex flex-wrap gap-1.5">
          {FAB_STYLES.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={(fx.fabStyle ?? "seal") === f.key} title={f.hint} onClick={() => update({ fabStyle: f.key })} className="flex min-h-11 flex-1 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick((fx.fabStyle ?? "seal") === f.key)}>
              <span className="text-[14px] font-bold">{f.label}</span>
              <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
                {f.hint}
              </span>
            </button>
          ))}
        </div>
      </Fold>

      <p className="m-0 min-h-4 text-center text-xs" style={{ color: "var(--t-ink-soft)" }} aria-live="polite">{note}</p>

      {sentPreview && (
        <SentBurst key={sentPreview.key} kind="feedback" xp={2} x={typeof window === "undefined" ? 200 : window.innerWidth / 2} y={typeof window === "undefined" ? 300 : window.innerHeight / 2} isAdventure style={sentPreview.style} onClose={() => setSentPreview(null)} />
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

/** One part of the effects settings: folded away until opened. */
function Fold({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col rounded-xl" style={{ border: "1px solid var(--t-card-border, rgba(139,112,64,.35))" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 items-center gap-2 px-3 text-left">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 text-[14px] font-semibold">{title}</span>
        <span className="truncate text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {hint}
        </span>
      </button>
      {open && <div className="reveal flex flex-col gap-2 px-3 pb-3">{children}</div>}
    </div>
  );
}

function Play() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <path d="M2 1l7 4-7 4z" fill="currentColor" />
    </svg>
  );
}
