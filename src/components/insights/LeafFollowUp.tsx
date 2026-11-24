"use client";

import { useState } from "react";
import { saveLeafFollowUpAction } from "@/app/actions";
import { FaceRating, faceOf } from "@/components/ui/FaceRating";
import { AFTER_NOTE_MAX, FEELINGS, OUTCOMES, clock, type LeafInfo, type Outcome } from "@/lib/leaf";

const INK = "#3b2a14";
const INK_SOFT = "#6b5631";

/** Gold when on, a thin outline when off: the same pills as the event log's When row. */
export const leafChip = (on: boolean) =>
  on
    ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }
    : { border: "1px solid rgba(139,112,64,.4)", color: INK };

/** The feeling words, tap any number (WB-1 B). */
export function FeelingChips({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {FEELINGS.map((f) => {
        const on = value.includes(f);
        return (
          <button key={f} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== f) : [...value, f])} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={leafChip(on)}>
            {f}
          </button>
        );
      })}
    </div>
  );
}

/** The quiet top line of the follow-up: time · the feelings before · why (only the parts that exist). */
export function leafSummary(item: LeafInfo): string {
  const before = item.beforeFeelings.length ? item.beforeFeelings.join(", ") : (faceOf(item.beforeTone)?.label.toLowerCase() ?? "");
  return [clock(new Date(item.at)), before, item.reason ? `why: “${item.reason}”` : ""].filter(Boolean).join(" · ");
}

/**
 * The "after" check-in (WR-3 B), the same form wherever it opens (under the leaf, in the event log, from the toucan):
 * did it give you what you wanted, how it actually felt (five faces and words), a line. Everything is optional.
 */
export function LeafFollowUp({ item, onSaved, onClose, extra }: { item: LeafInfo; onSaved: () => void; onClose?: () => void; extra?: React.ReactNode }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [tone, setTone] = useState<number | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await saveLeafFollowUpAction(item.id, { tone, afterFeelings: words, outcome, afterNote: line }).catch(() => ({ ok: false as const, error: "Couldn't save that. Try again?" }));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved();
  };
  return (
    <div className="flex flex-col gap-2.5 pt-0.5" data-leaf-followup>
      <p className="m-0 text-[12.5px]" style={{ color: INK_SOFT }}>
        {leafSummary(item)}
      </p>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold" style={{ color: INK }}>
          Did it give you what you wanted?
        </span>
        <div role="radiogroup" aria-label="Did it give you what you wanted?" className="flex gap-1.5">
          {OUTCOMES.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={outcome === o.v} onClick={() => setOutcome(outcome === o.v ? null : o.v)} className="h-8 rounded-full px-3.5 text-[13px] font-semibold" style={leafChip(outcome === o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-semibold" style={{ color: INK }}>
          How did it actually feel?
        </span>
        <FaceRating value={tone} onChange={setTone} label="How did it actually feel?" compact />
        <FeelingChips value={words} onChange={setWords} label="Feeling words, after" />
      </div>
      <input value={line} onChange={(e) => setLine(e.target.value)} maxLength={AFTER_NOTE_MAX} placeholder="A line (optional)" aria-label="A line about how it went" className="event-input h-9 rounded-xl px-2.5 text-[15px]" style={{ color: INK }} />
      {error && (
        <p role="alert" className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => void save()} disabled={busy} className="qe-save h-9 rounded-full px-4 text-[14px] font-semibold disabled:opacity-60">
          {busy ? "Saving…" : "Save"}
        </button>
        {onClose && (
          <button type="button" onClick={onClose} className="h-7 text-[13px] underline underline-offset-2" style={{ color: INK_SOFT }}>
            Close
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}
