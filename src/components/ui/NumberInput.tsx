"use client";

import { useState } from "react";

/**
 * A number field that can be cleared while typing. Plain controlled number
 * inputs snap an empty field back to "0", so typing afterwards gives "05";
 * this keeps the typed text and only falls back to `min` when the field is
 * left empty.
 */
export function NumberInput({
  value,
  onValueChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = true,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onValueChange: (n: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // Follow changes made elsewhere (a slider, a preset), but not our own echo.
  if (value !== seen) {
    setSeen(value);
    if (text === "" || Number(text) !== value) setText(String(value));
  }
  const clamp = (n: number) => Math.max(min, Math.min(max, integer ? Math.round(n) : n));

  return (
    <input
      {...rest}
      type="number"
      inputMode={rest.inputMode ?? "numeric"}
      min={min}
      max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
      value={text}
      onFocus={(e) => {
        e.currentTarget.select();
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/^0+(?=\d)/, "");
        setText(raw);
        if (raw === "" || Number.isNaN(Number(raw))) return;
        const n = clamp(Number(raw));
        setSeen(n);
        onValueChange(n);
      }}
      onBlur={(e) => {
        const n = text === "" || Number.isNaN(Number(text)) ? clamp(min) : clamp(Number(text));
        setText(String(n));
        setSeen(n);
        if (n !== value) onValueChange(n);
        rest.onBlur?.(e);
      }}
    />
  );
}
