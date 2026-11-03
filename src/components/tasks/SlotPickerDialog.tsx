"use client";

import { createPortal } from "react-dom";
import { useEscape } from "@/lib/use-escape";
import { useClosing } from "@/components/ui/Fold";
import { WhenPicker } from "@/components/calendar/WhenPicker";

type Slot = { start: string; end: string };

/**
 * "Add to calendar" from the quest editor: the day drawn with what's already on it (WhenPicker);
 * tap a time or a free spot. Reports the chosen window; the editor saves it.
 */
export function SlotPickerDialog({
  durationMinutes,
  initial,
  isAdventure,
  onPick,
  onClose: closeNow,
}: {
  durationMinutes: number;
  initial?: string;
  isAdventure: boolean;
  onPick: (slot: Slot) => void;
  onClose: () => void;
}) {
  const { closing, close: onClose } = useClosing(closeNow);
  useEscape(() => onClose());

  const border = isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)";

  return createPortal(
    <div
      className={`${closing ? "overlay-fade-out pointer-events-none" : "overlay-fade-in"} fixed inset-0 z-[65] flex items-center justify-center p-4`}
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
        className="sheet-slide-up-in flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 parchment parchment-framed shadow-2xl"
        style={{ background: isAdventure ? "var(--t-panel)" : "var(--t-card)", border: `2px solid ${border}`, color: "var(--t-ink)" }}
      >
        <div className="flex items-center justify-between">
          <h4 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>Add to calendar</h4>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 text-xl" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        <WhenPicker minutes={durationMinutes} title="This quest" isAdventure={isAdventure} initial={initial ? new Date(initial).toISOString() : null} onPick={onPick} />
      </div>
    </div>,
    document.body
  );
}
