"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { TaskRow } from "./TaskRow";
import { useEscape } from "@/lib/use-escape";

/**
 * A quest shown as its own card in a popup — the same card as on Today, so
 * it can be completed or opened for editing right here.
 */
export function QuestCardPopup({
  task,
  theme = "calm",
  categoryLabel,
  onClose,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  categoryLabel?: string | null;
  onClose: () => void;
}) {
  useEscape(() => requestClose());
  const [closing, setClosing] = useState(false);
  const isAdventure = theme === "adventure";

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-lg flex-col gap-2 ${closing ? "card-pop-out" : "card-pop-in"}`}
      >
        <div className="flex">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none"
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
          >
            ×
          </button>
        </div>
        <ul className="m-0 list-none p-0">
          <TaskRow task={task} theme={theme} categoryLabel={categoryLabel ?? undefined} onEditorClose={requestClose} />
        </ul>
      </div>
    </div>,
    document.body
  );
}
