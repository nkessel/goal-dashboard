"use client";

import { useRef, useState } from "react";

/**
 * A number you edit right where it's written (owner, Nov 4): tap it and type over it, in the same
 * ink, size and place — no box, no lighter background. Enter or leaving keeps it; Esc puts it back.
 */
export function InlineNumber({ value, onChange, min = 0, max = 100, suffix = "%", label, className = "", style }: { value: number; onChange: (n: number) => void; min?: number; max?: number; suffix?: string; label: string; className?: string; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const commit = () => {
    const n = Math.round(Number(draft));
    setEditing(false);
    if (draft.trim() !== "" && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
  };
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(Math.round(value)));
          setEditing(true);
          requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.select();
          });
        }}
        aria-label={`${label}: ${Math.round(value)}${suffix} — tap to change`}
        title="Tap to change"
        className={`inline-number tabular-nums ${className}`}
        style={style}
      >
        {Math.round(value)}
        {suffix}
      </button>
    );
  return (
    <span className={`inline-number tabular-nums ${className}`} style={style}>
      <input
        ref={ref}
        value={draft}
        inputMode="numeric"
        aria-label={label}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className="bare-input inline-number-input tabular-nums"
        style={{ width: `${Math.max(1, draft.length) + 0.3}ch` }}
      />
      {suffix}
    </span>
  );
}
