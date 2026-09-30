"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import {
  completeTaskAction,
  toggleManualPriorityAction,
} from "@/app/actions";

export function TaskActions({ task, theme = "calm" }: { task: Task; theme?: "calm" | "adventure" }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [completedAt, setCompletedAt] = useState(() => toLocalDatetimeValue(new Date()));
  const isAdventure = theme === "adventure";

  function togglePin() {
    setError(null);
    startTransition(async () => {
      try {
        await toggleManualPriorityAction(task.id, !task.is_manual_priority);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function confirmComplete() {
    setError(null);
    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("completedAt", completedAt);
    startTransition(async () => {
      try {
        await completeTaskAction(formData);
        setShowConfirm(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const pinBtnStyle = task.is_manual_priority
    ? {
        borderColor: isAdventure ? "var(--t-gold)" : "var(--t-accent)",
        background: isAdventure ? "rgba(209,161,60,.18)" : "var(--t-accent-soft)",
        color: isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)",
      }
    : {
        borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
        color: "var(--t-ink-soft)",
      };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePin}
          disabled={isPending}
          className="hover-glow rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50"
          style={pinBtnStyle}
        >
          {task.is_manual_priority
            ? isAdventure
              ? "⚔️ In today's battle"
              : "★ In Top 3"
            : isAdventure
              ? "☆ Add to Today's Battle"
              : "☆ Pin to Top 3"}
        </button>

        <button
          type="button"
          onClick={() => setShowConfirm((v) => !v)}
          className="hover-glow rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: isAdventure ? "var(--t-warn)" : "var(--t-good)",
            color: "#fff",
          }}
        >
          {isAdventure ? "⚔️ Defeat" : "Complete"}
        </button>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {showConfirm && (
        <div
          className="flex w-56 flex-col gap-2 rounded-lg p-2.5 text-xs"
          style={{
            background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
            border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
            color: "var(--t-ink)",
          }}
        >
          <p className="font-medium">
            {isAdventure ? `Defeat "${task.title}"?` : `Mark "${task.title}" complete?`}
          </p>
          <label className="flex items-center justify-between gap-2" style={{ color: "var(--t-ink-soft)" }}>
            {isAdventure ? "Defeated at" : "Completed at"}
            <input
              type="datetime-local"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              className="rounded border px-1 py-0.5"
              style={{
                borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
                background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
                color: "var(--t-ink)",
              }}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={isPending}
              className="rounded-full px-3 py-1 font-medium"
              style={{ color: "var(--t-ink-soft)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmComplete}
              disabled={isPending}
              className="hover-glow rounded-full px-3 py-1 font-medium disabled:opacity-50"
              style={{
                background: isAdventure ? "var(--t-warn)" : "var(--t-good)",
                color: "#fff",
              }}
            >
              {isPending ? "…" : isAdventure ? "Confirm defeat" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toLocalDatetimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
