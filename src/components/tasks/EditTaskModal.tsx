"use client";

import type { Task } from "@/lib/data/types";
import { QuestEditorDialog } from "./QuestEditorDialog";

/** Edit an existing quest — the shared quest editor in edit mode. */
export function EditTaskModal({
  task,
  theme = "calm",
  onClose,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  return <QuestEditorDialog mode={{ kind: "edit", task }} theme={theme} onClose={onClose} />;
}
