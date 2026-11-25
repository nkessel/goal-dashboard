"use client";

import { useState } from "react";
import { Fold } from "@/components/ui/Fold";

/** How well you slept, 1–5: kept as the "Sleep quality" check-in metric (2…10 on its 1–10 scale). */
export const SLEEP_FACES = [
  { v: 1, label: "Bad", mouth: "M8 17.5c1.6-2 6.4-2 8 0" },
  { v: 2, label: "Poor", mouth: "M8.5 16.5c1.6-1 5.4-1 7 0" },
  { v: 3, label: "OK", mouth: "M8.5 16h7" },
  { v: 4, label: "Good", mouth: "M8.5 15c1.6 1.2 5.4 1.2 7 0" },
  { v: 5, label: "Great", mouth: "M7.5 14.2c2 2.8 7 2.8 9 0" },
] as const;
export const SLEEP_FACE_COLOR = ["#a33c2a", "#c0703a", "#a8893f", "#6f9a3a", "#3f7a2e"];

export function SleepFace({ mouth, color, size = 26 }: { mouth: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill={color} fillOpacity=".16" stroke={color} strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.1" fill={color} />
      <circle cx="15" cy="10" r="1.1" fill={color} />
      <path d={mouth} stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** A face's tone for the sleep note event: good nights +1, bad ones −1. */
export const sleepTone = (q: number | null) => (q ? (q >= 4 ? 1 : q <= 2 ? -1 : 0) : null);

/**
 * "How was your sleep?": five faces, one tap (owner, Nov 21, Nov 24 and Nov 25), and under them a small
 * "+ Sleep notes" button that opens a short answer. Colours follow the card it sits in (--t-cream, --ec-gold).
 */
export function SleepFeel({ quality, onQuality, note, onNote }: { quality: number | null; onQuality: (q: number | null) => void; note: string; onNote: (t: string) => void }) {
  const [noting, setNoting] = useState(note.trim() !== "");
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[13.5px] font-semibold" style={{ color: "var(--t-cream)" }}>
        How was your sleep?
      </span>
      <div role="radiogroup" aria-label="How was your sleep?" className="flex justify-center gap-1">
        {SLEEP_FACES.map((f, i) => {
          const on = quality === f.v;
          const c = SLEEP_FACE_COLOR[i];
          return (
            <button key={f.v} type="button" role="radio" aria-checked={on} onClick={() => onQuality(on ? null : f.v)} className="flex w-[54px] flex-col items-center gap-0.5 rounded-xl py-1.5 transition-transform duration-150 active:scale-95" style={{ background: on ? `${c}33` : "rgba(255,250,238,.55)", boxShadow: on ? `inset 0 0 0 1.5px ${c}` : "inset 0 0 0 1px rgba(139,112,64,.3)", transform: on ? "scale(1.06)" : undefined, opacity: quality === null || on ? 1 : 0.6 }}>
              <SleepFace mouth={f.mouth} color={c} />
              <span className="text-[11.5px] font-semibold" style={{ color: c }}>
                {f.label}
              </span>
            </button>
          );
        })}
      </div>
      <Fold open={!noting}>
        <button type="button" onClick={() => setNoting(true)} className="wheel-btn flex h-8 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold">
          <span aria-hidden>+</span> Sleep notes
        </button>
      </Fold>
      <Fold open={noting}>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          maxLength={400}
          aria-label="Sleep notes"
          placeholder="Dreams, wake-ups, what helped…"
          className="min-h-[54px] w-[min(100%,320px)] resize-none rounded-xl px-3 py-2 text-[16px] leading-snug"
          style={{ background: "rgba(255,250,238,.85)", border: "1px solid rgba(139,112,64,.45)", color: "#2a1c10", fieldSizing: "content" } as React.CSSProperties}
        />
      </Fold>
    </div>
  );
}
