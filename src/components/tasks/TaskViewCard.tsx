"use client";

import { useState } from "react";
import type { Task } from "@/lib/data/types";
import { EditTaskModal } from "./EditTaskModal";

/**
 * A quick, read-only view of a task/quest — opened by clicking its dot on
 * the Priority Matrix — with an edit button in the top-right corner that
 * opens the full EditTaskModal on top of it. Pop-in/pop-out is a simple,
 * low-intensity fade + scale (see .card-pop-in/.card-pop-out and
 * .overlay-fade-in/.overlay-fade-out in globals.css); closing plays the
 * out-animation before actually unmounting.
 */
export function TaskViewCard({
  task,
  theme = "calm",
  onClose,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  const isAdventure = theme === "adventure";
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  const panelStyle = {
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    color: "var(--t-ink)",
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 ${
        closing ? "overlay-fade-out" : "overlay-fade-in"
      }`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation(); // defensive: don't bubble into an ancestor's own click handler
        requestClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex w-full max-w-md flex-col gap-3 rounded-t-2xl p-4 sm:rounded-2xl ${
          closing ? "card-pop-out" : "card-pop-in"
        }`}
        style={panelStyle}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="absolute left-3 top-3 text-lg leading-none"
          style={{ color: "var(--t-ink-soft)" }}
        >
          ×
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={isAdventure ? "Edit quest" : "Edit task"}
          aria-label="Edit"
          className="hover-glow absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-sm"
          style={{
            background: isAdventure ? "rgba(0,0,0,.28)" : "var(--t-card)",
            border: `1px solid ${isAdventure ? "rgba(209,161,60,.4)" : "var(--t-card-border)"}`,
          }}
        >
          ✎
        </button>

        <div className="mt-7 flex flex-col gap-1 pr-2">
          <p className={isAdventure ? "font-display text-lg" : "text-base font-bold"}>{task.title}</p>
          {task.description && (
            <p className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
              {task.description}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--t-ink-soft)" }}>
          <span>Importance {task.importance.toFixed(1)}</span>
          <span>Urgency {task.urgency.toFixed(1)}</span>
          {task.xp_value > 0 && (
            <span>
              {task.xp_value} {isAdventure ? "XP" : "pts"}
            </span>
          )}
          {task.reschedule_count > 0 && <span>&#8635; rescheduled {task.reschedule_count}×</span>}
        </div>

        {task.is_on_calendar && task.scheduled_start && (
          <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
            📅{" "}
            {new Date(task.scheduled_start).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}

        {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
      </div>
    </div>
  );
}
