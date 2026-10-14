"use client";

import { useState } from "react";
import { CreateFab } from "@/components/create/CreateFab";
import type { CreateKind } from "@/components/create/CreateSheet";
import { QuestEditorDialog } from "./QuestEditorDialog";

/**
 * "Add quest": the floating + button (top level, opening the create sheet)
 * or a dashed "+ Add quest" row inside a quest board.
 */
export function AddTaskForm({
  boardId,
  theme = "calm",
  todayFull = false,
  initial,
}: {
  /** Inside a quest board: a dashed "+ Add quest" row that files it there. */
  boardId?: string;
  theme?: "calm" | "adventure";
  /** Today's Quests already holds 3. */
  todayFull?: boolean;
  /** Which kind the + sheet opens on (e.g. "rite" in the evening). */
  initial?: CreateKind;
}) {
  const [open, setOpen] = useState(false);
  const isAdventure = theme === "adventure";

  if (!boardId) {
    return <CreateFab kinds={["quest", "now", "reward", "rite", "journal"]} initial={initial} todayFull={todayFull} theme={theme} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover-glow w-full rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
        style={{ borderColor: isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.85 : 1 }}
      >
        + Add {isAdventure ? "quest" : "task"}
      </button>
      {open && <QuestEditorDialog mode={{ kind: "create", boardId }} theme={theme} onClose={() => setOpen(false)} />}
    </>
  );
}
