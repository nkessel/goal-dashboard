"use client";

import { useState, useTransition } from "react";
import { fightMessAction } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { MESS_XP_DAY_CAP, battleXp, battleXpToday, styleOf, tenWords, type Cleaning, type Space } from "@/lib/cleaning";

const MINUTES = [10, 20, 30, 60];

/**
 * Fighting back the mess in one space: two sliders on the same scale (how it
 * was, how it is now), the ground won lit between them, and, if you like, how
 * long it took and the energy it took and gave. Cleaner than before pays XP.
 */
export function MessBattle({ c, space, day, startBefore, onLogged, onClose }: { c: Cleaning; space: Space; day: string; startBefore: number; onLogged: (next: Cleaning) => void; onClose: () => void }) {
  const style = styleOf(c.style);
  const [before, setBefore] = useState(startBefore);
  const [after, setAfter] = useState(Math.max(0, startBefore - 3));
  const [minutes, setMinutes] = useState<number | null>(null);
  const [typing, setTyping] = useState("");
  const [took, setTook] = useState<number | null>(null);
  const [gave, setGave] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const won = before - after;
  const xp = battleXpToday(c, day, battleXp(before, after, minutes));
  const capped = won > 0 && xp < battleXp(before, after, minutes);

  function log() {
    setError(null);
    startSaving(async () => {
      try {
        const r = await fightMessAction({ day, spaceId: space.id, before, after, minutes, took, gave });
        onLogged(r.cleaning);
        if (r.xp > 0)
          celebrateProgress({
            title: `${space.icon} ${space.name}`,
            heading: "Mess pushed back!",
            xp: r.xp,
            coinsEarned: r.coinsEarned,
            fromPct: (10 - before) * 10,
            toPct: (10 - after) * 10,
          });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const row = "flex items-center gap-1.5";
  const name = "w-[50px] shrink-0 text-[13px] font-semibold";
  return (
    <div className="reveal flex flex-col gap-1.5" onKeyDown={(e) => (e.key === "Enter" && (e.metaKey || e.ctrlKey) ? (e.preventDefault(), log()) : undefined)}>
      <div className="flex items-center gap-1.5">
        <span className="font-display text-[15.5px] leading-tight" style={{ color: "var(--t-ink)" }}>
          ⚔ Fight back the mess · {space.icon} {space.name}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-[17px]" style={{ color: "var(--t-ink-soft)" }}>
          ×
        </button>
      </div>

      {/* The comparison: both on one scale, clean on the left, the ground won lit on the After track. */}
      <div className={row}>
        <span className={name} style={{ color: "#8a6116" }}>
          Before
        </span>
        <BattleSlider value={before} onChange={(v) => (setBefore(v), after > v && setAfter(v))} lo={0} hi={before} won={false} label={`How messy was ${space.name} before?`} words={tenWords(c.style, before)} ends={style.glyphs} />
      </div>
      <div className={row}>
        <span className={name} style={{ color: "#4f7a30" }}>
          After
        </span>
        <BattleSlider value={after} onChange={setAfter} lo={after} hi={before} won label={`How messy is ${space.name} now?`} words={tenWords(c.style, after)} ends={style.glyphs} />
      </div>
      <p className="m-0 text-center text-[13.5px] font-semibold" style={{ color: won > 0 ? "#3d5a1e" : "var(--t-ink-soft)" }} aria-live="polite">
        {won > 0 ? (
          <>
            {won} step{won === 1 ? "" : "s"} cleaner ✨ {xp > 0 ? `+${xp} XP` : ""}
            {capped && <span className="font-normal" style={{ color: "var(--t-ink-soft)" }}>{xp > 0 ? " (today's cap)" : ` (today's ${MESS_XP_DAY_CAP} XP are earned)`}</span>}
          </>
        ) : won === 0 ? (
          "Slide After to how it looks now"
        ) : null}
      </p>

      {/* Optional extras, one line each. */}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="How long it took">
        <span className={name} style={{ color: "var(--t-ink-soft)" }}>
          Time
        </span>
        {MINUTES.map((m) => (
          <button key={m} type="button" aria-pressed={minutes === m} onClick={() => (setMinutes(minutes === m ? null : m), setTyping(""))} className="h-8 rounded-full px-2 text-[13px] tabular-nums" style={chip(minutes === m)}>
            {m === 60 ? "1 hr" : `${m}m`}
          </button>
        ))}
        <input
          value={typing}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 3);
            setTyping(v);
            setMinutes(v ? Number(v) : null);
          }}
          inputMode="numeric"
          placeholder="min"
          aria-label="Minutes"
          className="h-8 w-[52px] rounded-full px-2 text-center text-[13px] tabular-nums"
          style={{ ...chip(!!typing), outline: "none" }}
        />
      </div>
      <div className="flex items-start gap-1">
        <span className={`${name} pt-1.5`} style={{ color: "var(--t-ink-soft)" }}>
          Energy
        </span>
        <span className="flex flex-col">
          <Dots label="Energy it took" word="It took" glyph="⚡" value={took} onChange={setTook} />
          <Dots label="Energy it gave back" word="It gave" glyph="✨" value={gave} onChange={setGave} />
        </span>
      </div>

      {error && (
        <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" disabled={saving} onClick={log} className="font-display flex h-9 items-center gap-1.5 rounded-full px-4 text-[14.5px] disabled:opacity-60" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          {saving ? "Saving…" : won > 0 ? "⚔ Claim the victory" : "Log it"}
        </button>
      </div>
    </div>
  );
}

const chip = (on: boolean): React.CSSProperties => ({
  background: on ? "rgba(217,180,95,.5)" : "rgba(255,250,238,.6)",
  boxShadow: on ? "inset 0 0 0 1.5px #a88a3f" : "inset 0 0 0 1px rgba(139,112,64,.35)",
  color: "var(--t-ink)",
});

/** 0 spotless … 10 a disaster. The track shows the mess in rust; on After, the ground won since Before glows green. */
function BattleSlider({ value, onChange, lo, hi, won, label, words, ends }: { value: number; onChange: (v: number) => void; lo: number; hi: number; won: boolean; label: string; words: string; ends: [string, string, string] }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1" title={words}>
      <span aria-hidden className="shrink-0 text-[13px] leading-none" style={{ letterSpacing: "-0.12em" }}>
        {ends[0]}
      </span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={`${value} of 10, ${words}`}
        className="battle-range min-w-0 flex-1"
        style={{ ["--lo" as string]: `${lo * 10}%`, ["--hi" as string]: `${hi * 10}%`, ["--win" as string]: won ? "#7fb24e" : "#c0563a" }}
      />
      <span aria-hidden className="shrink-0 text-[13px] leading-none" style={{ letterSpacing: "-0.12em" }}>
        {ends[2]}
      </span>
      <span className="w-5 shrink-0 text-right text-[13px] font-bold tabular-nums" style={{ color: "var(--t-ink)" }}>
        {value}
      </span>
    </span>
  );
}

/** Up to five marks; tap one to set it, tap the same again to clear. */
function Dots({ value, onChange, glyph, word, label }: { value: number | null; onChange: (v: number | null) => void; glyph: string; word: string; label: string }) {
  return (
    <span className="flex items-center gap-0.5" role="radiogroup" aria-label={label}>
      <span className="mr-1 w-[46px] text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        {word}
      </span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${label}: ${n} of 5`}
          onClick={() => onChange(value === n ? null : n)}
          className="flex h-7 w-7 items-center justify-center text-[14px] leading-none transition-[opacity,filter]"
          style={{ opacity: value !== null && n <= value ? 1 : 0.3, filter: value !== null && n <= value ? undefined : "grayscale(1)" }}
        >
          {glyph}
        </button>
      ))}
    </span>
  );
}
