"use client";

import { createPortal } from "react-dom";
import { useState, useTransition } from "react";
import type { Board } from "@/lib/data/types";
import { updateBoardAction } from "@/app/actions";

const COLORS = [null, "#fde8d0", "#dcefe0", "#e0e7fb", "#fbe0e6", "#fff4c2"];

export function EditBoardModal({
  board,
  theme = "calm",
  onClose,
}: {
  board: Board;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  const isAdventure = theme === "adventure";
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description ?? "");
  const [color, setColor] = useState<string | null>(board.color);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fieldStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await updateBoardAction(board.id, { title, description, color });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save changes.");
      }
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--t-overlay)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 shadow-2xl"
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>
            Edit {isAdventure ? "campaign" : "board"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded border px-2 py-1.5 text-sm" style={fieldStyle} />
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

        <div>
          <p className="mb-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
            Color
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c ?? "none"}
                type="button"
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border"
                style={{
                  background: c ?? (isAdventure ? "var(--t-panel)" : "var(--t-card)"),
                  borderColor: color === c ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "var(--t-card-border)",
                  borderWidth: color === c ? 2 : 1,
                }}
                aria-label={c ?? "Default"}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
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
    </div>,
    document.body
  );
}
