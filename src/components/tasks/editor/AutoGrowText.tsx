"use client";

import { useEffect, useRef } from "react";

/** A textarea that grows with its text, so nothing is cut off after one line. */
export function AutoGrowText({
  value,
  onChange,
  minRows = 1,
  placeholder,
  ariaLabel,
  className,
  style,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  minRows?: number;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      style={style}
    />
  );
}
