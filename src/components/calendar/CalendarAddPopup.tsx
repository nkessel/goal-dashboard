"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { createScheduledTaskAction, listSchedulableTasksAction, scheduleTaskAction } from "@/app/actions";
import { formatTimeRange } from "@/lib/calendar-dates";

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
  const isAdventure = theme === "adventure";
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [importance, setImportance] = useState(3);
  const [urgency, setUrgency] = useState(3);
  const [xpValue, setXpValue] = useState(0);
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

  function createNew() {
    if (!title.trim() || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("title", title);
        fd.set("description", description);
        fd.set("importance", String(importance));
        fd.set("urgency", String(urgency));
        fd.set("xpValue", String(xpValue));
        fd.set("startISO", start.toISOString());
        fd.set("endISO", end.toISOString());
        await createScheduledTaskAction(fd);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create that quest");
      }
    });
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
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

        <div
          className="flex rounded-full p-1 text-xs"
          style={{
            background: isAdventure ? "var(--t-nav-bg)" : "var(--t-accent-soft)",
            border: isAdventure ? "1px solid rgba(209,161,60,.35)" : undefined,
          }}
        >
          <button
            type="button"
            onClick={() => setMode("new")}
            className="flex-1 rounded-full py-1.5 text-center font-semibold"
            style={{
              background: mode === "new" ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
              color: mode === "new" ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
            }}
          >
            New {isAdventure ? "quest" : "task"}
          </button>
          <button
            type="button"
            onClick={switchToExisting}
            className="flex-1 rounded-full py-1.5 text-center font-semibold"
            style={{
              background: mode === "existing" ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
              color: mode === "existing" ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
            }}
          >
            Add existing instead
          </button>
        </div>

        {mode === "new" ? (
          <>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder={isAdventure ? "Quest title" : "Task title"}
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
                onClick={createNew}
                disabled={isPending || !title.trim()}
                className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
              >
                {isPending ? "Adding…" : "Add"}
              </button>
            </div>
          </>
        ) : (
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
    </div>
  );
}
