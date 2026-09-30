"use client";

import { useRef, useState, useTransition } from "react";
import { createTaskAction } from "@/app/actions";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";

export function AddTaskForm({
  goalId,
  theme = "calm",
}: {
  goalId?: string;
  theme?: "calm" | "adventure";
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isAdventure = theme === "adventure";
  const dimText = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  const borderColor = isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)";
  const inputStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    color: "var(--t-ink)",
  };

  if (!open) {
    // Nested, per-goal "add task" (inside a goal card on Board Detail) stays
    // an inline row — a page can only sensibly have one floating "+" for its
    // primary action, which here is "add goal", not "add task to this goal".
    if (goalId) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hover-glow w-full rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
          style={{ borderColor, color: dimText, opacity: isAdventure ? 0.85 : 1 }}
        >
          + Add {isAdventure ? "quest" : "task"}
        </button>
      );
    }
    return (
      <FloatingActionButton
        onClick={() => setOpen(true)}
        label={`Add ${isAdventure ? "quest" : "task"}`}
        theme={theme}
      />
    );
  }

  /**
   * Shared field set for both the nested (per-goal, inline) and top-level
   * (FAB, bottom sheet) cases — `dismiss` is what "close without saving"
   * and "close after a successful save" both call: for the nested inline
   * form that's just `setOpen(false)`, for the sheet it's the BottomSheet's
   * `requestClose` so it plays the minimize-out animation first.
   */
  function fields(dismiss: () => void) {
    return (
      <>
        {goalId && <input type="hidden" name="goalId" value={goalId} />}
        <input
          name="title"
          placeholder={isAdventure ? "Quest title" : "Task title"}
          required
          autoFocus
          className="rounded border px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <textarea
          name="description"
          placeholder="Description (optional)"
          rows={2}
          className="rounded border px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: dimText }}>
          <label className="flex items-center gap-1">
            Importance
            <select name="importance" defaultValue="3" className="rounded border px-1 py-0.5" style={inputStyle}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Urgency
            <select name="urgency" defaultValue="3" className="rounded border px-1 py-0.5" style={inputStyle}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            XP
            <input
              type="number"
              name="xpValue"
              min={0}
              defaultValue={0}
              className="w-16 rounded border px-1 py-0.5"
              style={inputStyle}
            />
          </label>
          <label className="flex items-center gap-1">
            Est. time (min)
            <input
              type="number"
              name="estimateMinutes"
              min={0}
              step={5}
              placeholder="—"
              className="w-16 rounded border px-1 py-0.5"
              style={inputStyle}
            />
          </label>
        </div>
        {error && (
          <p className="text-xs" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#3b2a10" : "#fff" }}
          >
            {isPending ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="hover-glow rounded-full px-4 py-1.5 text-sm"
            style={{ color: dimText }}
          >
            Cancel
          </button>
        </div>
      </>
    );
  }

  function submit(dismiss: () => void, formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createTaskAction(formData);
        formRef.current?.reset();
        dismiss();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (goalId) {
    return (
      <form
        ref={formRef}
        action={(formData) => submit(() => setOpen(false), formData)}
        className="flex flex-col gap-2 rounded-xl p-3"
        style={{ border: `1px solid ${borderColor}`, background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)" }}
      >
        {fields(() => setOpen(false))}
      </form>
    );
  }

  // Top-level "New quest": a bottom sheet that slides up over a darkening
  // backdrop, closing with a minimize-toward-center shrink rather than the
  // inline expand/collapse the nested case above still uses.
  return (
    <BottomSheet onClose={() => setOpen(false)} theme={theme}>
      {(requestClose) => (
        <form
          ref={formRef}
          action={(formData) => submit(requestClose, formData)}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <h3 className={isAdventure ? "font-display text-base" : "text-base font-bold"} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
              New {isAdventure ? "quest" : "task"}
            </h3>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="text-lg leading-none"
              style={{ color: dimText }}
            >
              ×
            </button>
          </div>
          {fields(requestClose)}
        </form>
      )}
    </BottomSheet>
  );
}
