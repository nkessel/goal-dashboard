"use client";

/**
 * How something felt, on five faces (owner, Nov 13: "a 5-smiley face rating"): the Sleep quality faces,
 * shared by events, victories, fails, habit ticks and the Insights chart. Values run -2 (Bad) … 2 (Great); 0 is OK.
 * One ink colour (owner, Nov 14: faces use one ink), no words under them, and the top face happy-eyed with an
 * open smile (owner, Nov 19, picked option A).
 */
const INK = "#3b2a14";
const INK_LIGHT = "#efe6cc";
export const FACES = [
  { v: -2, label: "Bad", mouth: "M8 17.5c1.6-2 6.4-2 8 0", color: INK },
  { v: -1, label: "Poor", mouth: "M8.5 16.5c1.6-1 5.4-1 7 0", color: INK },
  { v: 0, label: "OK", mouth: "M8.5 16h7", color: INK },
  { v: 1, label: "Good", mouth: "M8.5 15c1.6 1.2 5.4 1.2 7 0", color: INK },
  { v: 2, label: "Great", mouth: "M7.5 14.2c2 2.8 7 2.8 9 0", color: INK },
] as const;
export type FaceValue = -2 | -1 | 0 | 1 | 2;
export const faceOf = (v: number | null | undefined) => FACES.find((f) => f.v === v) ?? null;
export const isFace = (v: unknown): v is FaceValue => v === -2 || v === -1 || v === 0 || v === 1 || v === 2;

/** One face as an SVG (also drawn inside the Insights chart: pass `inSvg` to get a <g>). */
export function FaceIcon({ v, size = 22, inSvg = false, ink = INK }: { v: number; size?: number; inSvg?: boolean; ink?: string }) {
  const f = faceOf(v);
  if (!f) return null;
  const top = f.v === 2;
  const body = (
    <>
      <circle cx="12" cy="12" r="9.5" fill={inSvg ? "#fbf3df" : "none"} stroke={ink} strokeWidth="1.6" />
      {top ? (
        <>
          <path d="M7.63 10.67Q8.96 8.2 10.29 10.67M13.71 10.67Q15.04 8.2 16.37 10.67" stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M8 13.7Q12 19.4 16 13.7Z" fill={ink} stroke={ink} strokeWidth="1.2" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="9" cy="10" r="1.15" fill={ink} />
          <circle cx="15" cy="10" r="1.15" fill={ink} />
          <path d={f.mouth} stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </>
      )}
    </>
  );
  if (inSvg)
    return (
      <g transform={`translate(${-size / 2} ${-size / 2}) scale(${size / 24})`}>
        {body}
      </g>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {body}
    </svg>
  );
}

/** A row of the five faces; tap one again to clear it. No words under them (owner, Nov 19); each still has its name for screen readers and on hover. */
export function FaceRating({ value, onChange, label = "How do you feel?", compact = false, light = false, size }: { value: number | null; onChange: (v: FaceValue | null) => void; label?: string; compact?: boolean; /** On a dark ground (the check-in, the celebration). */ light?: boolean; size?: number }) {
  const ink = light ? INK_LIGHT : INK;
  const px = size ?? (compact ? 24 : 30);
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center justify-center gap-1">
      {FACES.map((f) => {
        const on = value === f.v;
        return (
          <button
            key={f.v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={f.label}
            title={f.label}
            onClick={() => onChange(on ? null : f.v)}
            className="flex items-center justify-center rounded-full transition-[transform,opacity,background] duration-150 active:scale-95"
            style={{ width: px + 14, height: px + 14, background: on ? (light ? "rgba(217,180,95,.28)" : "rgba(217,180,95,.35)") : "transparent", boxShadow: on ? "inset 0 0 0 1.5px #b58a2c" : undefined, transform: on ? "scale(1.06)" : undefined, opacity: value != null && !on ? 0.55 : 1 }}
          >
            <FaceIcon v={f.v} size={px} ink={ink} />
          </button>
        );
      })}
    </div>
  );
}
