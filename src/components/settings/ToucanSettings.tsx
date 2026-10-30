"use client";

import { FoldGroup } from "./FoldGroup";
import { useEffect, useState } from "react";
import { saveToucanPrefsAction } from "@/app/actions";
import { FLOURISHES, TALK_LOOKS, readFlourish, readTalkLook, saveFlourish, saveTalkLook, type Flourish, type TalkLook } from "@/lib/toucan-flourish";
import { flourishClass } from "@/lib/toucan-flourish";
import { LINE_GROUPS, setRetiredLines } from "@/lib/toucan-lines";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { openStyleQuiz, useToucanStyle } from "@/lib/toucan-style-store";
import { clockWord, voice } from "@/lib/toucan-style";

export type ToucanMode = "simple" | "lite" | "full";
export const TOUCAN_MODES: { key: ToucanMode; label: string; hint: string }[] = [
  { key: "simple", label: "Simple", hint: "Just the toucan and his wisdom when you tap him" },
  { key: "lite", label: "Light guide", hint: "He keeps watch, nudges you about slipping quests and helps plan them" },
  { key: "full", label: "Full guide", hint: "All of that, plus he remembers what you share, keeps your promises and offers next steps" },
];

/** What he'd say in each mode, so you can hear the difference before choosing. */
const MODE_EXAMPLES: Record<ToucanMode, string> = {
  simple: "Tap me any time for a little wisdom. I won't speak up on my own.",
  lite: "Good morning! Coming up: “AR class homework” due today. Shall we plan your day so nothing slips?",
  full: "Good evening! Is there anything you need to prepare for tomorrow? You asked for gym accountability, so I’ll check in before you go.",
};

/**
 * A little stage for previews: the toucan, a speech bubble, and (optionally)
 * the "Talk with me" look and a flourish that replays whenever `play` changes.
 */
export function ToucanPreview({ text, talk, flourish, play = 0 }: { text: string; talk?: TalkLook; flourish?: Flourish; play?: number }) {
  return (
    <div className="flex items-end gap-2.5 rounded-2xl p-3" style={{ background: "linear-gradient(180deg, #17302c, #0d1f1d)", border: "1px solid rgba(140,240,220,.3)" }} aria-live="polite">
      <div key={play} className={`shrink-0 ${play && flourish ? (flourishClass(flourish) ?? "") : ""}`}>
        <ToucanArt size={46} />
      </div>
      <div
        key={text}
        className="owl-say relative mb-3 rounded-2xl rounded-bl-sm px-3 py-1.5 text-[13.5px] font-medium italic leading-snug"
        style={{ background: "linear-gradient(180deg, rgba(14,38,40,.94), rgba(8,22,26,.96))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 0 14px rgba(120,230,210,.25)" }}
      >
        {text}
        {talk === "words" && (
          <span className="mt-1.5 flex">
            <span className="h-7 rounded-full px-2.5 text-[12px] font-bold not-italic leading-7" style={{ background: "rgba(140,240,220,.18)", border: "1px solid rgba(140,240,220,.6)" }}>
              Talk with me
            </span>
          </span>
        )}
        {(talk === "glow" || talk === "glint") && (
          <span aria-hidden className={`absolute -bottom-2 -right-2 flex items-center justify-center rounded-full ${talk === "glint" ? "owl-secret h-6 w-6" : "owl-talk h-8 w-8"}`}>
            <svg width={talk === "glint" ? 12 : 16} height={talk === "glint" ? 12 : 16} viewBox="0 0 24 24">
              <path d="M12 1.5l2.2 7.3 7.3 2.2-7.3 2.2L12 20.5l-2.2-7.3L2.5 11l7.3-2.2z" fill="currentColor" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** How you like to be checked in: what the quiz found, a sample, and a way to take it (again). */
function styleBits(st: ReturnType<typeof useToucanStyle>) {
  return st.done
    ? [
        st.tone === "gentle" ? "Gentle" : st.tone === "direct" ? "Straight to the point" : "Playful",
        st.often === "rare" ? "once a day at most" : st.often === "some" ? "a few times a day" : "whenever it helps",
        st.times.length === 3 ? "any time of day" : st.times.join(" and ") || "no set times",
        ...(st.gym.days.length ? [`gym ${st.gym.days.map((d) => DAY_NAMES[d]).join(", ")}${st.gym.time ? ` at ${clockWord(st.gym.time)}` : ""}`] : []),
      ]
    : [];
}
function CheckInStyle() {
  const st = useToucanStyle();
  const bits = styleBits(st);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        {st.done ? bits.join(" · ") : "A few taps teach him your way: tone, timing, what helps and what doesn't, and the gym."}
      </p>
      {st.done && <ToucanPreview text={voice.eveningPrep(st)} />}
      <button type="button" onClick={openStyleQuiz} className="flex min-h-11 items-center justify-center rounded-xl px-3 text-[14px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
        {st.done ? "Retake the check-in quiz" : "Take the check-in quiz"}
      </button>
    </div>
  );
}

/**
 * How much the Great Toucan Spirit does, and which of his lines he says:
 * untick any line you'd rather not hear again.
 */
export function ToucanSettings({ initialMode, initialRetired }: { initialMode: ToucanMode; initialRetired: string[] }) {
  const [mode, setMode] = useState<ToucanMode>(initialMode);
  const [off, setOff] = useState<Set<string>>(() => new Set(initialRetired));
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [hover, setHover] = useState<ToucanMode | null>(null);
  const st = useToucanStyle();

  function chooseMode(m: ToucanMode) {
    setMode(m);
    try {
      window.localStorage.setItem("toucan-mode", m);
    } catch {}
    window.dispatchEvent(new Event("toucan-mode"));
    void saveToucanPrefsAction({ mode: m }).catch(() => {});
  }
  function toggle(line: string) {
    const next = new Set(off);
    if (next.has(line)) next.delete(line);
    else next.add(line);
    setOff(next);
    setRetiredLines([...next]);
    void saveToucanPrefsAction({ retired: [...next] }).catch(() => {});
  }
  const pick = (on: boolean) => (on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border, rgba(139,112,64,.35))", color: "var(--t-ink)" });

  return (
    <div className="flex flex-col gap-2.5" style={{ color: "var(--t-ink)" }}>
      <FoldGroup title="How much he does" value={TOUCAN_MODES.find((m) => m.key === mode)?.label}>
      <div className="flex flex-col gap-1.5">
      <div role="radiogroup" aria-label="How much the toucan does" className="flex flex-col gap-1.5">
        {TOUCAN_MODES.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => chooseMode(m.key)} onPointerEnter={() => setHover(m.key)} onPointerLeave={() => setHover(null)} className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left" style={pick(mode === m.key)}>
            <span className="text-[14px] font-bold">{m.label}</span>
            <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
              {m.hint}
            </span>
          </button>
        ))}
      </div>
      <ToucanPreview text={MODE_EXAMPLES[hover ?? mode]} />
      </div>
      </FoldGroup>

      {mode !== "simple" && (
        <FoldGroup title="How he checks in with you" value={styleBits(st).join(" · ") || "Not set up yet"}>
          <CheckInStyle />
        </FoldGroup>
      )}

      <FoldGroup title="What he says" hint="Untick any line you’d rather not hear again.">
      <div className="flex flex-col gap-1.5">
      {LINE_GROUPS.map((g) => {
        const on = g.lines.filter((l) => !off.has(l)).length;
        const isOpen = openGroup === g.key;
        return (
          <div key={g.key} className="flex flex-col rounded-xl" style={{ border: "1px solid var(--t-card-border, rgba(139,112,64,.35))" }}>
            <button type="button" onClick={() => setOpenGroup(isOpen ? null : g.key)} aria-expanded={isOpen} className="flex min-h-11 items-center gap-2 px-3 text-left">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{g.title}</span>
                <span className="block text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  {g.hint}
                </span>
              </span>
              <span className="text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                {on}/{g.lines.length} on
              </span>
            </button>
            {isOpen && (
              <ul className="reveal m-0 flex list-none flex-col gap-0.5 px-2 pb-2">
                {g.lines.map((l) => (
                  <li key={l}>
                    <label className="flex min-h-10 items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-[14px] leading-snug hover:bg-black/[.04]">
                      <input type="checkbox" checked={!off.has(l)} onChange={() => toggle(l)} className="mt-0.5" />
                      <span style={off.has(l) ? { color: "var(--t-ink-soft)", textDecoration: "line-through" } : undefined}>{l.replaceAll("{name}", "you")}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      </div>
      </FoldGroup>
    </div>
  );
}

/** His look, beyond his add-ons: how he moves when sharing wisdom, and how "Talk with me" shows. */
export function ToucanLookSettings() {
  const [flourish, setFlourish] = useState<Flourish>("glow");
  const [talk, setTalk] = useState<TalkLook>("glow");
  const [play, setPlay] = useState(0);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- browser storage is only readable after hydration */
    setFlourish(readFlourish());
    setTalk(readTalkLook());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const pick = (on: boolean) => (on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { border: "1.5px solid var(--t-card-border, rgba(139,112,64,.35))", color: "var(--t-ink)" });
  return (
    <div className="flex flex-col gap-2.5" style={{ color: "var(--t-ink)" }}>
      <ToucanPreview text="Rivers carve canyons not by force, but by returning." talk={talk} flourish={flourish} play={play} />
      <span className="text-sm font-semibold">“Talk with me” on his speech bubble</span>
      <div role="radiogroup" aria-label="How Talk with me shows" className="flex flex-col gap-1.5">
        {TALK_LOOKS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={talk === t.key}
            onClick={() => {
              setTalk(t.key);
              saveTalkLook(t.key);
            }}
            className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
            style={pick(talk === t.key)}
          >
            <span className="text-[14px] font-bold">{t.label}</span>
            <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
              {t.hint}
            </span>
          </button>
        ))}
      </div>
      <span className="text-sm font-semibold">When he shares wisdom, he…</span>
      <div role="radiogroup" aria-label="How the toucan moves" className="grid grid-cols-2 gap-1.5">
        {FLOURISHES.map((f) => (
          <button
            key={f.key}
            type="button"
            role="radio"
            aria-checked={flourish === f.key}
            onClick={() => {
              setFlourish(f.key);
              saveFlourish(f.key);
              setPlay((n) => n + 1);
            }}
            className="flex min-h-11 flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
            style={pick(flourish === f.key)}
          >
            <span className="text-[14px] font-bold">{f.label}</span>
            <span className="text-[12px] leading-snug" style={{ opacity: 0.8 }}>
              {f.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
