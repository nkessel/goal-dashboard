"use client";

import { useState, useTransition } from "react";
import { saveCleaningAction } from "@/app/actions";
import { MessStylePicker } from "@/components/habits/CleaningCheckIn";
import { useLocalDay } from "@/components/evening/evening-clock";
import { defaultCleaning, normalizeCleaning, type Cleaning } from "@/lib/cleaning";

/** Settings › Mess check-in: how messes are drawn under the cleaning habit. */
export function CleaningSettings({ initial }: { initial: unknown }) {
  const day = useLocalDay();
  const [saved, setSaved] = useState<Cleaning | null>(() => normalizeCleaning(initial));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const current = saved ?? (day ? defaultCleaning(day) : null);
  if (!current) return null;
  return (
    <div className="flex flex-col gap-2">
      <MessStylePicker
        value={current.style}
        onPick={(style) => {
          const before = saved;
          const next = { ...current, style };
          setSaved(next);
          setError(null);
          startTransition(async () => {
            try {
              await saveCleaningAction(next);
            } catch (e) {
              setSaved(before);
              setError(e instanceof Error ? e.message : "Couldn't save that.");
            }
          });
        }}
      />
      {error && (
        <p className="m-0 text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <p className="m-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Spaces, the laundry bin and the chore deck live under your cleaning habit in Daily Habits.
      </p>
    </div>
  );
}
