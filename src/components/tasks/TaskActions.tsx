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
  const [showDatePicker, setShowDatePicker] = useState(false);
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

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={togglePin}
          disabled={isPending}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            task.is_manual_priority
              ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          }`}
        >
          {task.is_manual_priority
            ? isAdventure
              ? "⚔️ In today's battle"
              : "★ In Top 3"
            : isAdventure
              ? "☆ Join today's battle"
              : "☆ Pin to Top 3"}
        </button>

        <button
          type="button"
          onClick={() => setShowDatePicker((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-medium text-white ${
            isAdventure ? "bg-rose-600 hover:bg-rose-700 active:scale-95" : "bg-emerald-600 hover:bg-emerald-700"
          } transition-transform`}
        >
          {isAdventure ? "⚔️ Defeat" : "Complete"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {showDatePicker && (
        <form
          action={completeTaskAction}
          className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <input type="hidden" name="taskId" value={task.id} />
          <label className="text-zinc-500">
            Completed at
            <input
              type="datetime-local"
              name="completedAt"
              defaultValue={toLocalDatetimeValue(new Date())}
              className="ml-2 rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-2 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Confirm
          </button>
        </form>
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
