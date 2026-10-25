"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { saveToucanStyleAction } from "@/app/actions";
import { QUESTIONS, type Question, type ToucanStyle } from "@/lib/toucan-style";
import { readStyle, storeStyle } from "@/lib/toucan-style-store";
import { useEscape } from "@/lib/use-escape";
import { ToucanArt } from "./ToucanArt";

const SPIRIT = { background: "linear-gradient(180deg, rgba(14,38,40,.98), rgba(8,22,26,.99))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8" };
const CHIP_ON = { background: "rgba(140,240,220,.24)", border: "1.5px solid rgba(140,240,220,.85)", color: "#e8fff8" };
const CHIP_OFF = { background: "rgba(255,255,255,.04)", border: "1.5px solid rgba(140,240,220,.25)", color: "rgba(232,255,248,.85)" };

/** What's chosen for a question, as the choice values. */
function chosen(q: Question, s: ToucanStyle): string[] {
  switch (q.key) {
    case "tone":
    case "often":
    case "amount":
    case "form":
      return [s[q.key]];
    case "returnCheckIn":
      return [s.returnCheckIn ? "yes" : "no"];
    case "times":
    case "stuck":
    case "avoid":
      return s[q.key];
    case "gym":
      return s.gym.days.map(String);
    case "gymHelp":
      return s.gym.help;
    default:
      return [];
  }
}

function pick(q: Question, s: ToucanStyle, value: string): ToucanStyle {
  const flip = <T extends string>(list: T[]) => (list.includes(value as T) ? list.filter((x) => x !== value) : [...list, value as T]);
  switch (q.key) {
    case "tone":
    case "often":
    case "amount":
    case "form":
      return { ...s, [q.key]: value };
    case "returnCheckIn":
      return { ...s, returnCheckIn: value === "yes" };
    case "times":
    case "stuck":
    case "avoid":
      return { ...s, [q.key]: flip(s[q.key] as string[]) };
    case "gym": {
      const d = Number(value);
      const days = s.gym.days.includes(d) ? s.gym.days.filter((x) => x !== d) : [...s.gym.days, d].sort();
      return { ...s, gym: { ...s.gym, days } };
    }
    case "gymHelp":
      return { ...s, gym: { ...s.gym, help: flip(s.gym.help) } };
    default:
      return s;
  }
}

/**
 * The check-in quiz: a few taps, one question at a time, to learn how you
 * like to be checked in. Every choice shows what the toucan would say, so you
 * can hear it before you pick. Skippable, and you can take it again any time.
 */
export function ToucanQuiz({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<ToucanStyle>(() => readStyle());
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);
  // No gym days? Then there's nothing to ask about how to help with it.
  const questions = QUESTIONS.filter((q) => q.key !== "gymHelp" || draft.gym.days.length > 0);
  const q = questions[Math.min(step, questions.length - 1)];
  const last = step >= questions.length - 1;
  const picked = chosen(q, draft);
  const sample = preview ?? q.choices.find((c) => picked.includes(c.value) && c.example)?.example ?? null;

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveToucanStyleAction({ ...draft, done: true });
      storeStyle(saved);
      onClose();
    } catch {
      setError("Couldn't save that. Try again in a moment.");
      setSaving(false);
    }
  }
  const next = () => {
    setPreview(null);
    if (last) void finish();
    else setStep((n) => n + 1);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-3 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="How you like to be checked in" onClick={(e) => e.stopPropagation()} className="card-pop-in flex max-h-[88vh] w-full max-w-[440px] flex-col gap-3 overflow-y-auto rounded-3xl p-4" style={{ ...SPIRIT, boxShadow: "0 0 24px rgba(120,230,210,.25), 0 14px 36px rgba(0,0,0,.55)" }}>
        <div className="flex items-center justify-between text-[12.5px]" style={{ color: "rgba(232,255,248,.7)" }}>
          <span>
            {step + 1} of {questions.length}
          </span>
          <button type="button" onClick={onClose} className="h-8 rounded-full px-3" aria-label="Close">
            Close
          </button>
        </div>
        <div className="flex items-start gap-3">
          <span className="shrink-0">
            <ToucanArt size={52} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="m-0 text-[17px] font-semibold leading-snug">{q.ask}</p>
            {"hint" in q && q.hint && (
              <p className="m-0 text-[13px]" style={{ color: "rgba(232,255,248,.7)" }}>
                {q.hint}
              </p>
            )}
          </div>
        </div>

        {q.key === "notes" ? (
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value.slice(0, 600) })}
            rows={4}
            placeholder="e.g. Check in with a question, not a reminder. Mornings are hard; go easy before 10."
            className="w-full rounded-2xl p-3 text-[15px]"
            style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(140,240,220,.35)", color: "#e8fff8" }}
          />
        ) : (
          <div className={q.key === "gym" ? "grid grid-cols-7 gap-1.5" : "flex flex-col gap-1.5"} role={q.multi ? "group" : "radiogroup"} aria-label={q.ask}>
            {q.choices.map((c) => {
              const on = picked.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  role={q.multi ? "checkbox" : "radio"}
                  aria-checked={on}
                  onClick={() => {
                    setDraft(pick(q, draft, c.value));
                    setPreview(c.example || null);
                  }}
                  onPointerEnter={() => c.example && setPreview(c.example)}
                  onPointerLeave={() => setPreview(null)}
                  className={`min-h-11 rounded-2xl text-[14.5px] ${q.key === "gym" ? "px-0 text-center font-semibold" : "px-3.5 text-left"}`}
                  style={on ? CHIP_ON : CHIP_OFF}
                >
                  {q.multi && q.key !== "gym" && <span aria-hidden className="mr-2">{on ? "✓" : "○"}</span>}
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {q.key === "gym" && draft.gym.days.length > 0 && (
          <label className="flex items-center gap-2 text-[14px]">
            Usual time
            <input
              type="time"
              value={draft.gym.time ?? ""}
              onChange={(e) => setDraft({ ...draft, gym: { ...draft.gym, time: e.target.value || null } })}
              className="h-10 rounded-xl px-2"
              style={{ background: "rgba(0,0,0,.25)", border: "1px solid rgba(140,240,220,.35)", color: "#e8fff8", colorScheme: "dark" }}
            />
          </label>
        )}

        {/* What he'd say with that choice. */}
        {sample && (
          <div className="flex items-end gap-2" aria-live="polite">
            <span className="shrink-0">
              <ToucanArt size={34} />
            </span>
            <p key={sample} className="owl-say m-0 rounded-2xl rounded-bl-sm px-3 py-2 text-[14px] italic leading-snug" style={{ background: "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.4)" }}>
              {sample}
            </p>
          </div>
        )}

        {error && (
          <p className="m-0 text-[13px]" style={{ color: "#ffb4a8" }}>
            {error}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={() => (setPreview(null), setStep((n) => n - 1))} className="h-11 rounded-full px-4 text-[14px]" style={{ color: "rgba(232,255,248,.8)" }}>
              Back
            </button>
          )}
          <span className="flex-1" />
          {!last && (
            <button type="button" onClick={next} className="h-11 rounded-full px-4 text-[14px]" style={{ color: "rgba(232,255,248,.8)" }}>
              Skip
            </button>
          )}
          <button type="button" onClick={next} disabled={saving} className="h-11 rounded-full px-5 text-[14.5px] font-bold disabled:opacity-60" style={{ background: "linear-gradient(180deg, #8cf0dc, #4fbfa9)", color: "#0a2a26" }}>
            {last ? (saving ? "Saving…" : "Done") : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
