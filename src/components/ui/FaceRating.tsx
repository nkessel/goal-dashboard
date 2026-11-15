"use client";

/**
 * How something felt, on five faces (owner, Nov 13: "a 5-smiley face rating"): the Sleep quality faces,
 * shared by events and the Insights chart. Values run -2 (Bad) … 2 (Great); 0 is OK.
 */
export const FACES = [
  { v: -2, label: "Bad", mouth: "M8 17.5c1.6-2 6.4-2 8 0", color: "#a33c2a" },
  { v: -1, label: "Poor", mouth: "M8.5 16.5c1.6-1 5.4-1 7 0", color: "#c0703a" },
  { v: 0, label: "OK", mouth: "M8.5 16h7", color: "#a8893f" },
  { v: 1, label: "Good", mouth: "M8.5 15c1.6 1.2 5.4 1.2 7 0", color: "#6f9a3a" },
  { v: 2, label: "Great", mouth: "M7.5 14.2c2 2.8 7 2.8 9 0", color: "#3f7a2e" },
] as const;
export type FaceValue = -2 | -1 | 0 | 1 | 2;
export const faceOf = (v: number | null | undefined) => FACES.find((f) => f.v === v) ?? null;
export const isFace = (v: unknown): v is FaceValue => v === -2 || v === -1 || v === 0 || v === 1 || v === 2;

/** One face as an SVG (also drawn inside the Insights chart: pass `inSvg` to get a <g>). */
export function FaceIcon({ v, size = 22, inSvg = false }: { v: number; size?: number; inSvg?: boolean }) {
  const f = faceOf(v);
  if (!f) return null;
  const body = (
    <>
      <circle cx="12" cy="12" r="9.5" fill={inSvg ? "#fbf3df" : f.color} fillOpacity={inSvg ? 1 : 0.16} stroke={f.color} strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.2" fill={f.color} />
      <circle cx="15" cy="10" r="1.2" fill={f.color} />
      <path d={f.mouth} stroke={f.color} strokeWidth="1.8" strokeLinecap="round" fill="none" />
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

/** A row of the five faces; tap one again to clear it. */
export function FaceRating({ value, onChange, label = "How it felt", compact = false, light = false }: { value: number | null; onChange: (v: FaceValue | null) => void; label?: string; compact?: boolean; /** On a dark ground (the check-in). */ light?: boolean }) {
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
            className={`flex flex-col items-center rounded-xl transition-transform duration-150 active:scale-95 ${compact ? "w-10 py-1" : "w-12 gap-0.5 py-1.5"}`}
            style={{ background: on ? `${f.color}22` : "transparent", boxShadow: on ? `inset 0 0 0 1.5px ${f.color}` : undefined, transform: on ? "scale(1.06)" : undefined, opacity: value != null && !on ? 0.6 : 1 }}
          >
            <FaceIcon v={f.v} size={compact ? 24 : 26} />
            {!compact && (
              <span className="text-[11px] font-semibold" style={{ color: on ? f.color : light ? "rgba(239,230,204,.8)" : "#6b5631" }}>
                {f.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
