"use client";

import { createPortal } from "react-dom";
import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { listSchedulableTasksAction, scheduleTaskAction } from "@/app/actions";
import { formatTimeRange } from "@/lib/calendar-dates";
import { useEscape } from "@/lib/use-escape";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";

/**
 * Opened by dragging (or tapping) a time range on the Day/Week calendar —
 * lets the user either create a brand-new quest already scheduled at that
 * time, or search their existing quests and drop one into the slot instead.
 * Mirrors EditTaskModal/TaskViewCard's overlay styling and stopPropagation
 * pattern (see those files for why the backdrop click needs it).
 */
export function CalendarAddPopup({
  start,
  end,
  theme = "calm",
  onClose,
}: {
  start: Date;
  end: Date;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  useEscape(() => onClose());
  const isAdventure = theme === "adventure";
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [existingTasks, setExistingTasks] = useState<Task[] | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [query, setQuery] = useState("");

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

  function switchToExisting() {
    setMode("existing");
    setError(null);
    if (existingTasks === null && !loadingExisting) {
      setLoadingExisting(true);
      listSchedulableTasksAction()
        .then((tasks) => setExistingTasks(tasks))
        .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your quests"))
        .finally(() => setLoadingExisting(false));
    }
  }

  function pickExisting(task: Task) {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        await scheduleTaskAction(task.id, start.toISOString(), end.toISOString());
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't schedule that quest");
      }
    });
  }

  const filtered = (existingTasks ?? []).filter((t) =>
    t.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  const dayLabel = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  // A new quest gets the full quest editor, already scheduled for this slot.
  if (mode === "new") {
    return (
      <QuestEditorDialog
        mode={{
          kind: "create",
          schedule: { startISO: start.toISOString(), endISO: end.toISOString() },
          prefill: { estimateMinutes: Math.round((end.getTime() - start.getTime()) / 60_000) },
        }}
        theme={theme}
        onClose={onClose}
        altAction={{ label: `Put an existing ${isAdventure ? "quest" : "task"} here instead`, onClick: switchToExisting }}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 parchment parchment-framed shadow-2xl"
        style={panelStyle}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>
              {isAdventure ? "New quest" : "New task"}
            </h3>
            <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
              {dayLabel} · {formatTimeRange(start, end)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        <button type="button" onClick={() => setMode("new")} className="self-start text-[13.5px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
          ← Create a new {isAdventure ? "quest" : "task"} instead
        </button>

        {(
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder={isAdventure ? "Search your quests…" : "Search your tasks…"}
              className="rounded border px-2 py-1.5 text-sm"
              style={fieldStyle}
            />

            {loadingExisting && (
              <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                Loading…
              </p>
            )}
            {existingTasks && filtered.length === 0 && (
              <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                {query.trim() ? "No matches." : "Nothing open to schedule — create a new one instead."}
              </p>
            )}

            <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
              {filtered.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => pickExisting(task)}
                    disabled={isPending}
                    className="hover-glow flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm disabled:opacity-50"
                    style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
                  >
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.is_on_calendar && (
                      <span className="shrink-0 text-xs" style={{ color: "var(--t-ink-soft)" }} title="Already scheduled — this will move it">
                        📅
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {error && (
              <p className="text-xs" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}

            <div className="mt-1 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm" style={{ color: "var(--t-ink-soft)" }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
