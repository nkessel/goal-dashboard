"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { TaskRow } from "./TaskRow";
import { EditTaskModal } from "./EditTaskModal";

/**
 * A quest shown as its own card in a popup — the same card as on Today, so
 * it can be completed right here — with an edit button in the upper right.
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
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const isAdventure = theme === "adventure";

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  if (editing) return <EditTaskModal task={task} theme={theme} onClose={onClose} />;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
      onKeyDown={(e) => e.key === "Escape" && requestClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-lg flex-col gap-2 ${closing ? "card-pop-out" : "card-pop-in"}`}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none"
            style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
          >
            ×
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="hover-glow flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold"
            style={{
              background: isAdventure ? "rgba(255,248,230,.92)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "#b39a6a" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
              boxShadow: "0 2px 6px rgba(0,0,0,.3)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              <path d="M13.5 7l3 3" stroke="currentColor" strokeWidth="1.9" />
            </svg>
            Edit
          </button>
        </div>
        <ul className="m-0 list-none p-0">
          <TaskRow task={task} theme={theme} categoryLabel={categoryLabel ?? undefined} />
        </ul>
      </div>
    </div>,
    document.body
  );
}
