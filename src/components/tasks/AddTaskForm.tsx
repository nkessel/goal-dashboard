"use client";

import { useRef, useState, useTransition } from "react";
import { createTaskAction } from "@/app/actions";

export function AddTaskForm({ goalId }: { goalId?: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-600"
      >
        + Add task
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          await createTaskAction(formData);
          formRef.current?.reset();
          setOpen(false);
        });
      }}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
    >
      {goalId && <input type="hidden" name="goalId" value={goalId} />}
      <input
        name="title"
        placeholder="Task title"
        required
        autoFocus
        className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
      />
      <textarea
        name="description"
        placeholder="Description (optional)"
        rows={2}
        className="rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700"
      />
      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
        <label className="flex items-center gap-1">
          Importance
          <select
            name="importance"
            defaultValue="3"
            className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Urgency
          <select
            name="urgency"
            defaultValue="3"
            className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          XP
          <input
            type="number"
            name="xpValue"
            min={0}
            defaultValue={0}
            className="w-16 rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full px-4 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
