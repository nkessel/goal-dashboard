"use client";

import { FoldGroup } from "./FoldGroup";
import { useEffect, useState, useRef } from "react";
import { CASTLE_DESIGNS, CastleArt, castleOf } from "@/components/xp/CastleArt";
import { CheckinIcon } from "@/components/xp/CheckinIcon";
import { CHECKIN_ICONS, CHECKIN_STYLES, FAB_STYLES, FEEDBACK_HOLDS, FEEDBACK_STYLES, FX_DEFAULTS, PACES, checkinIconOf, checkinStyleOf, loadFx, saveFx, subscribeFx, type FeedbackStyle, type FxSettings, EFFECTS_LEVELS } from "@/lib/celebration-fx";
import { SentBurst } from "@/components/feedback/FeedbackDock";
import { WelcomeCard } from "@/components/xp/WelcomeCard";
import { welcomeContextAction } from "@/app/actions";
import { lineForDay } from "@/lib/greetings";
import { WELCOME_ELS, backHours, backOwnOn, greetingFor, greetingPool, moveEl, ownGreetings, ownLines, ownLinesOn, toggleEl, welcomeOrder, welcomeShows } from "@/lib/welcome";
import { QuestComplete } from "@/components/celebration/QuestComplete";
import { PhraseList, WiseLines } from "./LineLists";

type NumKey = "dens" | "vel" | "reach" | "size" | "embers" | "fill";

const SLIDERS: { k: NumKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { k: "dens", label: "Dust density", min: 0.2, max: 2, step: 0.1, fmt: (v) => `${v.toFixed(1)}x` },
  { k: "vel", label: "Velocity", min: 0.3, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}x` },
  { k: "reach", label: "Reach", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { k: "size", label: "Particle size", min: 0.5, max: 2.5, step: 0.1, fmt: (v) => `${v.toFixed(1)}x` },
  { k: "embers", label: "Embers", min: 0, max: 160, step: 5, fmt: (v) => String(v) },
  { k: "fill", label: "XP fill time", min: 1, max: 6, step: 0.5, fmt: (v) => `${v.toFixed(1)}s` },
];

/** Settings › Welcome Screen: when it opens, its greetings and lines, and what's on it. */
export function WelcomeSettings() {
  return <CelebrationSettings welcomeOnly />;
}

export function CelebrationSettings({ welcomeOnly = false }: { welcomeOnly?: boolean }) {
  const [fx, setFx] = useState<FxSettings>(FX_DEFAULTS);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [sentPreview, setSentPreview] = useState<{ key: number; style: FeedbackStyle } | null>(null);
  const [welcomePreview, setWelcomePreview] = useState<{ mode: "day" | "back"; key: string; ctx: { metrics: string[]; tasks: { id: string; title: string; due_at: string | null }[]; suggestions: { id: string; title: string; due_at: string | null }[]; priority: { text: string; others?: string[]; day: string } | null } } | null>(null);
  function openWelcome(mode: "day" | "back") {
    void welcomeContextAction()
      .catch(() => ({ metrics: [] as string[], tasks: [] as { id: string; title: string; due_at: string | null }[], suggestions: [] as { id: string; title: string; due_at: string | null }[], priority: null }))
      .then((ctx) => setWelcomePreview({ mode, key: String(Date.now()), ctx }));
  }
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
  // Kept in step with the other places these settings show (the welcome screen's gear, the Settings page).
  useEffect(() => subscribeFx(() => setFx(loadFx())), []);
  function update(patch: Partial<FxSettings>) {
    // On top of what's saved now, so a change made elsewhere is never undone from here.
    const next = { ...loadFx(), ...patch };
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
  // The welcome screen's settings have their own row in Settings.
  if (welcomeOnly)
    return (
      <div className="flex flex-col gap-2" style={{ color: "var(--t-ink)" }}>
        <FoldGroup title="When it opens" value={backHours(fx) ? `Every ${backHours(fx)} ${backHours(fx) === 1 ? "hour" : "hours"}` : "Once a day"}>
          <div className="flex flex-col gap-2">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          On the day&rsquo;s first visit, with last night&rsquo;s sleep times. After that, a check-in (without sleep) once this long has passed since your last one:
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} style={btnStyle} aria-label="Fewer hours" onClick={() => update({ welcomeBackHours: Math.max(1, backHours(fx) - 1) })} disabled={!backHours(fx)}>
            −
          </button>
          <span className="min-w-[96px] text-center text-[15px] font-bold tabular-nums">{backHours(fx) ? `Every ${backHours(fx)} ${backHours(fx) === 1 ? "hour" : "hours"}` : "Once a day"}</span>
          <button type="button" className={btn} style={btnStyle} aria-label="More hours" onClick={() => update({ welcomeBackHours: Math.min(12, (backHours(fx) || 0) + 1) })}>
            +
          </button>
          <label className="ml-1 flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={backHours(fx) === 0} onChange={(e) => update({ welcomeBackHours: e.target.checked ? 0 : 5 })} />
            Only the first visit
          </label>
        </div>

          </div>
        </FoldGroup>
        <FoldGroup title="Greetings">
          <div className="flex flex-col gap-2">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          One list for the day&rsquo;s first visit and welcome back. Each time the screen opens it picks one of the greetings you leave switched on (a morning cheer only in the morning, and so on). You can also add one from the welcome screen with its ✎ button.
        </p>
        <label className="flex min-h-9 items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={backOwnOn(fx)} onChange={() => update({ welcomeBackOwn: !backOwnOn(fx) })} />
          Use my own words too
        </label>
        {backOwnOn(fx) && (
          <textarea
            value={ownGreetings(fx).join("\n")}
            onChange={(e) => update({ welcomeBackText: e.target.value.slice(0, 1200), welcomeText: "" })}
            rows={3}
            placeholder={"One per line; they take turns with the others.\ne.g. The hearth is warm, come in"}
            aria-label="Your own greetings"
            className="reveal rounded-lg border px-3 py-2 text-[16px]"
            style={{ borderColor: "var(--t-card-border)", background: "rgba(255,250,238,.9)", color: "#2a1c10" }}
          />
        )}
        <PhraseList
          title="Choose which greetings show"
          lines={greetingPool(fx)}
          isOn={(l) => !(fx.welcomeBackOff ?? []).includes(l)}
          onToggle={(l, on) => update({ welcomeBackOff: on ? (fx.welcomeBackOff ?? []).filter((x) => x !== l) : [...(fx.welcomeBackOff ?? []), l] })}
        />

          </div>
        </FoldGroup>
        <FoldGroup title="The castle" value={CASTLE_DESIGNS.find((d) => d.key === castleOf(fx.welcomeCastle))!.label}>
          <div role="radiogroup" aria-label="The castle on the far hill" className="grid grid-cols-2 gap-1.5">
            {CASTLE_DESIGNS.map((d) => (
              <button key={d.key} type="button" role="radio" aria-checked={castleOf(fx.welcomeCastle) === d.key} onClick={() => update({ welcomeCastle: d.key })} className="flex flex-col items-center gap-1 rounded-xl px-2 py-2" style={{ border: castleOf(fx.welcomeCastle) === d.key ? "2px solid var(--t-gold-deep)" : "1px solid var(--t-card-border)" }}>
                <svg aria-hidden viewBox="-80 -160 160 166" className="h-16 w-20 rounded-lg" style={{ background: "linear-gradient(180deg, #a9cbe6, #eef2ec)" }}>
                  <path d="M-80,6 Q-30,-8 0,-2 T80,-4 V6 Z" fill="#7aa1a6" />
                  <CastleArt design={d.key} colors={{ wall: "#f5f7f9", shade: "#c5d1dc", roof: "#4f7fb3", gold: "#e8c25c" }} />
                </svg>
                <span className="text-[13px] font-semibold">{d.label}</span>
                <span className="text-center text-[11.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                  {d.hint}
                </span>
              </button>
            ))}
          </div>
        </FoldGroup>
        <FoldGroup title="What’s on it, and in what order">
          <div className="flex flex-col gap-2">

        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {welcomeOrder(fx).map((el, i, all) => {
            const meta = WELCOME_ELS.find((e) => e.key === el)!;
            const on = welcomeShows(fx, el);
            return (
              <li key={el} className="flex min-h-11 items-center gap-2 rounded-xl px-2" style={{ border: "1px solid var(--t-card-border)", opacity: on ? 1 : 0.7 }}>
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--t-gold-deep)]" checked={on} onChange={() => update(toggleEl(fx, el))} aria-label={`Show ${meta.label}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{meta.label}</span>
                  <span className="block text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                    {meta.hint}
                  </span>
                </span>
                <button type="button" onClick={() => update(moveEl(fx, el, -1))} disabled={i === 0} aria-label={`Move ${meta.label} up`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[15px] disabled:opacity-30" style={btnStyle}>
                  ↑
                </button>
                <button type="button" onClick={() => update(moveEl(fx, el, 1))} disabled={i === all.length - 1} aria-label={`Move ${meta.label} down`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[15px] disabled:opacity-30" style={btnStyle}>
                  ↓
                </button>
              </li>
            );
          })}
        </ul>
        <label className="mt-1 flex min-h-9 items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={fx.welcomeConfetti !== false} onChange={() => update({ welcomeConfetti: fx.welcomeConfetti === false })} />
          Confetti on the day&rsquo;s first visit
        </label>
          </div>
        </FoldGroup>
        {welcomeShows(fx, "checkin") && (
          <FoldGroup title="Check-in">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">The Check in button</span>
            <div role="radiogroup" aria-label="The Check in button's look" className="grid grid-cols-2 gap-1.5">
              {CHECKIN_STYLES.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={checkinStyleOf(fx).key === c.key} onClick={() => update({ checkinStyle: c.key })} className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5" style={{ border: checkinStyleOf(fx).key === c.key ? "2px solid var(--t-gold-deep)" : "1px solid var(--t-card-border)" }}>
                  <span aria-hidden className="font-display flex h-9 items-center gap-1 rounded-full px-4 text-[15px]" style={c.style}>
                    <CheckinIcon icon={checkinIconOf(fx)} /> Check in
                  </span>
                  <span className="text-[13px] font-semibold">{c.label}</span>
                  <span className="text-center text-[11.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                    {c.hint}
                  </span>
                </button>
              ))}
            </div>
            <span className="mt-1 text-[13px] font-semibold">Its icon</span>
            <div role="radiogroup" aria-label="The Check in button's icon" className="flex flex-wrap gap-1.5">
              {CHECKIN_ICONS.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={checkinIconOf(fx) === c.key} aria-label={c.label} title={c.label} onClick={() => update({ checkinIcon: c.key })} className="flex h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-[12.5px] font-semibold" style={checkinIconOf(fx) === c.key ? checkinStyleOf(fx).style : { border: "1px solid var(--t-card-border)", color: "var(--t-ink)" }}>
                  {c.key === "none" ? "None" : <CheckinIcon icon={c.key} size={20} />}
                </button>
              ))}
            </div>
            <span className="mt-1 text-[13px] font-semibold">In the check-in</span>
            {(
              [
                ["welcomeSleep", "Last night's sleep times, on the day's first visit (until you've logged them)"],
                ["welcomeMetrics", "Mood and everything else you track, open"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-h-9 items-center gap-2.5 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={fx[k] !== false} onChange={() => update({ [k]: fx[k] === false })} />
                {label}
              </label>
            ))}
          </div>
        </FoldGroup>
        )}
        {welcomeShows(fx, "line") && (
          <FoldGroup title="The day’s wise line">
          <div className="flex flex-col gap-2">

            <label className="flex min-h-9 items-center gap-2.5 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--t-gold-deep)]" checked={ownLinesOn(fx)} onChange={() => update({ welcomeOwnOn: !ownLinesOn(fx) })} />
              Add my own wise lines
            </label>
            {ownLinesOn(fx) && (
              <textarea
                value={fx.welcomeOwnLines ?? ""}
                onChange={(e) => update({ welcomeOwnLines: e.target.value.slice(0, 2400) })}
                rows={3}
                placeholder={"One per line; mixed in with the built-in lines.\ne.g. Breathe. Then the next small thing."}
                aria-label="Your own wise lines"
                className="reveal rounded-lg border px-3 py-2 text-[16px]"
                style={{ borderColor: "var(--t-card-border)", background: "rgba(255,250,238,.9)", color: "#2a1c10" }}
              />
            )}
            <WiseLines own={ownLines(fx)} />
          </div>
        </FoldGroup>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openWelcome("day")} className={playBtn} style={playStyle}>
            <Play /> Preview: first visit
          </button>
          <button type="button" onClick={() => openWelcome("back")} className={playBtn} style={playStyle}>
            <Play /> Preview: welcome back
          </button>
        </div>
      {welcomePreview && (
        <WelcomeCard
          mode={welcomePreview.mode}
          heading={greetingFor(fx, welcomePreview.key)}
          award={welcomePreview.mode === "day" ? { xp: 10, streak: 8, coins: 2, fromPct: 40, toPct: 55, caption: "Level 4 · 1,960 / 2,500 XP to level 5" } : null}
          line={lineForDay(new Date().toDateString(), ownLines(fx))}
          metrics={welcomePreview.ctx.metrics}
          lastCheckInAt={null}
          due={welcomePreview.ctx.tasks}
          priority={welcomePreview.ctx.priority}
          fx={fx}
          preview
          onClose={() => setWelcomePreview(null)}
        />
      )}
      </div>
    );
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
          <button type="button" onClick={() => update({ ...FX_DEFAULTS, feedbackStyle: fx.feedbackStyle, cardStyle: fx.cardStyle, pace: fx.pace, fabStyle: fx.fabStyle, welcomeHeading: fx.welcomeHeading, welcomeText: fx.welcomeText, welcomeLine: fx.welcomeLine, welcomeStreak: fx.welcomeStreak, welcomeBar: fx.welcomeBar })} className="hover-glow h-10 self-start rounded-full px-4 text-sm font-medium" style={btnStyle}>
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

      <Fold title="Progress" hint={(fx.cardStyle ?? "card") === "card" ? "Card" : "Banner"}>
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
      </Fold>

      <Fold title="Quest complete" hint={EFFECTS_LEVELS.find((l) => l.key === (fx.effects ?? "balanced"))?.label ?? "Balanced"}>
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
          How much plays when you complete a quest.
        </p>
        <div role="radiogroup" aria-label="Quest complete effects" className="flex flex-col gap-1.5">
          {EFFECTS_LEVELS.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={(fx.effects ?? "balanced") === l.key} onClick={() => update({ effects: l.key })} className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick((fx.effects ?? "balanced") === l.key)}>
              <span className="text-[13.5px] font-bold">{l.label}</span>
              <span className="text-[12px] font-normal opacity-80">{l.hint}</span>
            </button>
          ))}
        </div>
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

      <p className="m-0 min-h-4 text-center text-xs" style={{ color: "var(--t-ink-soft)" }} aria-live="polite">{note}</p>

      {sentPreview && (
        <SentBurst key={sentPreview.key} kind="feedback" xp={2} x={typeof window === "undefined" ? 200 : window.innerWidth / 2} y={typeof window === "undefined" ? 300 : window.innerHeight / 2} isAdventure style={sentPreview.style} onClose={() => setSentPreview(null)} />
      )}
      {welcomePreview && (
        <WelcomeCard
          mode={welcomePreview.mode}
          heading={greetingFor(fx, welcomePreview.key)}
          award={welcomePreview.mode === "day" ? { xp: 10, streak: 8, coins: 2, fromPct: 40, toPct: 55, caption: "Level 4 · 1,960 / 2,500 XP to level 5" } : null}
          line={lineForDay(new Date().toDateString(), ownLines(fx))}
          metrics={welcomePreview.ctx.metrics}
          lastCheckInAt={null}
          due={welcomePreview.ctx.tasks}
          priority={welcomePreview.ctx.priority}
          fx={fx}
          preview
          onClose={() => setWelcomePreview(null)}
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

/** The + button's look, by name (for its folded group's title). */
export function FabValue() {
  const [fx, setFx] = useState<FxSettings>(FX_DEFAULTS);
  useEffect(() => {
    const read = () => setFx(loadFx());
    read();
    window.addEventListener("fx-change", read);
    return () => window.removeEventListener("fx-change", read);
  }, []);
  return <>{(FAB_STYLES.find((f) => f.key === fx.fabStyle) ?? FAB_STYLES[0]).label}</>;
}

/** The + button's look, in its own part of Visual Effects (not a celebration). */
export function FabSettings() {
  const [fx, setFx] = useState<FxSettings>(FX_DEFAULTS);
  // localStorage is only readable after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setFx(loadFx()), []);
  const current = fx.fabStyle && FAB_STYLES.some((f) => f.key === fx.fabStyle) ? fx.fabStyle : "seal";
  const pick = (on: boolean) => (on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border)", color: "var(--t-ink)" });
  return (
    <div role="radiogroup" aria-label="The + button" className="grid grid-cols-2 gap-1.5" style={{ color: "var(--t-ink)" }}>
      {FAB_STYLES.map((f) => (
        <button
          key={f.key}
          type="button"
          role="radio"
          aria-checked={current === f.key}
          title={f.hint}
          onClick={() => {
            const next = { ...fx, fabStyle: f.key };
            setFx(next);
            saveFx(next);
          }}
          className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
          style={pick(current === f.key)}
        >
          <span className="text-[14px] font-bold">{f.label}</span>
          <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
            {f.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Every phrase that can come up, each with a checkbox: uncheck one and it
 * stops showing. Opens from a button. Wise lines keep their "don't show this
 * line again" list on this device (the same one the welcome screen sets).
 */
