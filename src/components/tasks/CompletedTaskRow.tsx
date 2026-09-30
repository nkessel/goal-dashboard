"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { reopenTaskAction } from "@/app/actions";

export function CompletedTaskRow({ task, theme = "calm" }: { task: Task; theme?: "calm" | "adventure" }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const isAdventure = theme === "adventure";

  function restore() {
    startTransition(async () => {
      await reopenTaskAction(task.id);
      setOpen(false);
    });
  }

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hover-glow flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm"
          style={{ color: "var(--t-ink)" }}
        >
          <span className="min-w-0 truncate">
            {task.title}
            {task.completed_at && (
              <span className="ml-2 text-xs" style={{ color: "var(--t-ink-soft)" }}>
                {new Date(task.completed_at).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </span>
          <span style={{ color: "var(--t-good)", fontWeight: 700 }}>&#10003;</span>
        </button>
      </li>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{ background: "var(--t-overlay)" }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col gap-3 rounded-t-2xl p-4 sm:rounded-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>{task.title}</h3>
                {task.description && (
                  <p className="mt-1 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                    {task.description}
                  </p>
                )}
              </div>
              <span style={{ color: "var(--t-good)", fontWeight: 700, fontSize: 18 }}>&#10003;</span>
            </div>

            {task.completed_at && (
              <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                {isAdventure ? "Defeated" : "Completed"} {new Date(task.completed_at).toLocaleString()}
                {task.xp_value > 0 && ` · ${task.xp_value} ${isAdventure ? "XP" : "pts"} earned`}
              </p>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-full px-3 py-1.5 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                Close
              </button>
              <button
                type="button"
                onClick={restore}
                disabled={isPending}
                className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{
                  background: isAdventure ? "var(--t-gold)" : "var(--t-accent)",
                  color: isAdventure ? "#2a1c10" : "#fff",
                }}
              >
                {isPending ? "…" : "Mark not complete — restore to Today"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
