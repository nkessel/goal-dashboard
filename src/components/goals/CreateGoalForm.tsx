"use client";

import { useRef, useState, useTransition } from "react";
import { createGoalAction } from "@/app/actions";

export function CreateGoalForm({ boardId }: { boardId: string }) {
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
        + Add goal
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          await createGoalAction(formData);
          formRef.current?.reset();
          setOpen(false);
        });
      }}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
    >
      <input type="hidden" name="boardId" value={boardId} />
      <input
        name="title"
        placeholder="Goal title"
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
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Creating…" : "Create"}
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
