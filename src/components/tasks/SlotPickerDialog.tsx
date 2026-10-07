"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { suggestSlotsAction } from "@/app/actions";

type Slot = { start: string; end: string };

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSlot(slot: Slot) {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const day =
    start.toDateString() === new Date().toDateString()
      ? "Today"
      : start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(start)}–${t(end)}`;
}

/**
 * "Add to calendar" from the quest editor: three open slots from your Google
 * Calendar, or pick any time. Reports the chosen window; the editor saves it.
 */
export function SlotPickerDialog({
  durationMinutes,
  initial,
  isAdventure,
  onPick,
  onClose,
}: {
  durationMinutes: number;
  initial?: string;
  isAdventure: boolean;
  onPick: (slot: Slot) => void;
  onClose: () => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(() => {
    if (initial) return initial;
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalInput(d);
  });
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        setSlots(await suggestSlotsAction(durationMinutes));
      } catch (e) {
        setSlots([]);
        setError(e instanceof Error ? e.message : "Couldn't read your calendar.");
      }
    });
  }, [durationMinutes]);

  const border = isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)";

  return createPortal(
    <div
      className="overlay-fade-in fixed inset-0 z-[65] flex items-center justify-center p-4"
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Add to calendar"
        onClick={(e) => e.stopPropagation()}
        className="sheet-slide-up-in flex w-full max-w-sm flex-col gap-3 rounded-2xl p-4 parchment parchment-framed shadow-2xl"
        style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: `2px solid ${border}`, color: "var(--t-ink)" }}
      >
        <div className="flex items-center justify-between">
          <h4 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>Add to calendar</h4>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 text-xl" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Open {durationMinutes}-minute slots on your calendar:
        </p>
        {slots === null && <p className="text-sm" style={{ color: "var(--t-ink-soft)" }}>Finding open slots…</p>}
        {error && <p className="text-xs" style={{ color: "var(--t-warn)" }}>{error}</p>}
        {slots && slots.length === 0 && !error && (
          <p className="text-sm" style={{ color: "var(--t-ink-soft)" }}>No open slots in the next 14 days.</p>
        )}
        {slots && slots.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {slots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                onClick={() => onPick(slot)}
                className="hover-glow h-10 rounded-lg border px-3 text-left text-sm"
                style={{ borderColor: border }}
              >
                {formatSlot(slot)}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: border }}>
          <input
            type="datetime-local"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Pick a time"
            className="h-10 min-w-0 flex-1 rounded-lg border px-2 text-sm"
            style={{ borderColor: border, background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)", color: "var(--t-ink)" }}
          />
          <button
            type="button"
            disabled={!manual}
            onClick={() => {
              const start = new Date(manual);
              onPick({ start: start.toISOString(), end: new Date(start.getTime() + durationMinutes * 60000).toISOString() });
            }}
            className="hover-glow h-10 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-50"
            style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
          >
            Use this time
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
