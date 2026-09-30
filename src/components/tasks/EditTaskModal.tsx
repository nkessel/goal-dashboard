"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { updateTaskAction, deleteTaskAction } from "@/app/actions";

export function EditTaskModal({
  task,
  theme = "calm",
  onClose,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  const isAdventure = theme === "adventure";
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [importance, setImportance] = useState(task.importance);
  const [urgency, setUrgency] = useState(task.urgency);
  const [xpValue, setXpValue] = useState(task.xp_value);
  const [estimateMinutes, setEstimateMinutes] = useState<string>(
    task.estimate_minutes != null ? String(task.estimate_minutes) : ""
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const panelStyle = {
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    color: "var(--t-ink)",
  };
  const fieldStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const trimmedEstimate = estimateMinutes.trim();
        await updateTaskAction(task.id, {
          title,
          description,
          importance,
          urgency,
          xpValue,
          estimateMinutes: trimmedEstimate ? Math.max(0, Number(trimmedEstimate)) : null,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save changes.");
      }
    });
  }

  function remove() {
    setError(null);
    startDeleting(async () => {
      try {
        await deleteTaskAction(task.id);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        // Prevent the click from bubbling to whatever's underneath in the
        // DOM (e.g. TaskRow's own card-wide "click to edit") — without
        // this, closing the modal by clicking its backdrop would
        // immediately reopen it via the card's onClick.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-t-2xl p-4 sm:rounded-2xl"
        style={panelStyle}
      >
        <div className="flex items-center justify-between">
          <h3 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>
            Edit {isAdventure ? "quest" : "task"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
            style={fieldStyle}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded border px-2 py-1.5 text-sm"
            style={fieldStyle}
          />
        </label>

        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          <label className="flex items-center gap-1.5">
            Importance
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-16 rounded border px-1.5 py-0.5"
              style={fieldStyle}
            />
          </label>
          <label className="flex items-center gap-1.5">
            Urgency
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              value={urgency}
              onChange={(e) => setUrgency(Number(e.target.value))}
              className="w-16 rounded border px-1.5 py-0.5"
              style={fieldStyle}
            />
          </label>
          <label className="flex items-center gap-1.5">
            XP
            <input
              type="number"
              min={0}
              value={xpValue}
              onChange={(e) => setXpValue(Number(e.target.value))}
              className="w-16 rounded border px-1.5 py-0.5"
              style={fieldStyle}
            />
          </label>
          <label className="flex items-center gap-1.5">
            Est. time (min)
            <input
              type="number"
              min={0}
              step={5}
              placeholder="—"
              value={estimateMinutes}
              onChange={(e) => setEstimateMinutes(e.target.value)}
              className="w-16 rounded border px-1.5 py-0.5"
              style={fieldStyle}
            />
          </label>
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          {!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-xs underline"
              style={{ color: "var(--t-warn)" }}
            >
              Delete {isAdventure ? "quest" : "task"}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "var(--t-warn)" }}>Delete for good?</span>
              <button
                type="button"
                onClick={remove}
                disabled={isDeleting}
                className="hover-glow rounded-full px-2.5 py-1 font-semibold disabled:opacity-50"
                style={{ background: "var(--t-warn)", color: "#fff" }}
              >
                {isDeleting ? "…" : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                Cancel
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm" style={{ color: "var(--t-ink-soft)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
