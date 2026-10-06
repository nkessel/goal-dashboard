"use client";

import { useState } from "react";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { QuestEditorDialog } from "./QuestEditorDialog";
import { SmartImportDialog } from "./SmartImportDialog";

type Mode = "closed" | "menu" | "quest" | "import";

/**
 * "Add quest": the floating + button (top level) or a dashed "+ Add quest"
 * row inside a goal card. The goal-card row opens the quest editor
 * directly; the top-level FAB is a small speed-dial (same pattern as
 * BoardFabMenu) offering a single new quest or Smart import — a photo or
 * pasted list turned into several quests at once.
 */
export function AddTaskForm({
  goalId,
  theme = "calm",
}: {
  goalId?: string;
  theme?: "calm" | "adventure";
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const isAdventure = theme === "adventure";
  const noun = isAdventure ? "quest" : "task";
  const dimText = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  const borderColor = isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)";
  const menuButtonStyle = {
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    border: `1px solid ${borderColor}`,
    color: "var(--t-ink)",
    boxShadow: "0 4px 14px rgba(0,0,0,.22)",
  };

  return (
    <>
      {goalId ? (
        <button
          type="button"
          onClick={() => setMode("quest")}
          className="hover-glow w-full rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
          style={{ borderColor, color: dimText, opacity: isAdventure ? 0.85 : 1 }}
        >
          + Add {noun}
        </button>
      ) : (
        (mode === "closed" || mode === "menu") && (
          <>
            {mode === "menu" && (
              <div
                className="pointer-events-none fixed inset-x-0 z-40 mx-auto flex w-full max-w-md justify-center sm:max-w-lg"
                style={{ bottom: 150 }}
              >
                <div className="pointer-events-auto flex flex-col items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("import")}
                    className="hover-glow rounded-full px-4 py-2 text-right text-sm font-medium"
                    style={menuButtonStyle}
                  >
                    📷 Smart import
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("quest")}
                    className="hover-glow rounded-full px-4 py-2 text-right text-sm font-medium"
                    style={menuButtonStyle}
                  >
                    + New {noun}
                  </button>
                </div>
              </div>
            )}
            <FloatingActionButton
              onClick={() => setMode(mode === "menu" ? "closed" : "menu")}
              label={mode === "menu" ? "Close" : `Add ${noun}`}
              theme={theme}
              expanded={mode === "menu"}
            />
          </>
        )
      )}
      {mode === "quest" && (
        <QuestEditorDialog
          mode={{ kind: "create", goalId }}
          theme={theme}
          origin={goalId ? "center" : "fab"}
          onClose={() => setMode("closed")}
        />
      )}
      {mode === "import" && <SmartImportDialog theme={theme} onClose={() => setMode("closed")} />}
    </>
  );
}
