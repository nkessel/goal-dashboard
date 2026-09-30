"use client";

import { useState } from "react";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { QuestEditorDialog } from "./QuestEditorDialog";

/**
 * "Add quest": the floating + button (top level) or a dashed "+ Add quest"
 * row inside a goal card. Both open the shared quest editor in create mode.
 */
export function AddTaskForm({
  goalId,
  theme = "calm",
}: {
  goalId?: string;
  theme?: "calm" | "adventure";
}) {
  const [open, setOpen] = useState(false);
  const isAdventure = theme === "adventure";
  const dimText = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  const borderColor = isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)";

  return (
    <>
      {goalId ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hover-glow w-full rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
          style={{ borderColor, color: dimText, opacity: isAdventure ? 0.85 : 1 }}
        >
          + Add {isAdventure ? "quest" : "task"}
        </button>
      ) : (
        !open && (
          <FloatingActionButton onClick={() => setOpen(true)} label={`Add ${isAdventure ? "quest" : "task"}`} theme={theme} />
        )
      )}
      {open && <QuestEditorDialog mode={{ kind: "create", goalId }} theme={theme} onClose={() => setOpen(false)} />}
    </>
  );
}
