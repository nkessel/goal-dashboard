"use client";

import { useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { reopenTaskAction } from "@/app/actions";

export function CompletedTaskRow({ task }: { task: Task }) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-500">
      <span className="truncate">
        <span className="mr-2" aria-hidden>
          ✅
        </span>
        {task.title}
        {task.completed_at && (
          <span className="ml-2 text-xs text-zinc-400">
            {new Date(task.completed_at).toLocaleString()}
          </span>
        )}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => reopenTaskAction(task.id))}
        className="shrink-0 text-xs text-zinc-400 underline hover:text-zinc-600"
      >
        undo
      </button>
    </li>
  );
}
