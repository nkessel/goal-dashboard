"use client";

import { useState } from "react";
import type { Task } from "@/lib/data/types";
import { EditTaskModal } from "./EditTaskModal";

/** A finished quest in a list; click to edit its details or XP, or restore it. */
export function CompletedTaskRow({ task, theme = "calm" }: { task: Task; theme?: "calm" | "adventure" }) {
  const [open, setOpen] = useState(false);
  const isAdventure = theme === "adventure";

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Edit this victory"
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-1.5 py-1.5 text-left text-[15.5px] hover:bg-black/[.04]"
          style={{ color: "var(--t-ink)" }}
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: isAdventure ? "radial-gradient(circle at 35% 30%, #6f8f58, #3f5c33 60%, #2c4224)" : "var(--t-good)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#f3e7cb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 break-words leading-snug">{task.title}</span>
          {task.completed_at && (
            <span className="shrink-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              {new Date(task.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          <span className="w-14 shrink-0 text-right text-[14.5px]">+{task.xp_value} XP</span>
        </button>
      </li>
      {open && <EditTaskModal task={task} theme={theme} onClose={() => setOpen(false)} />}
    </>
  );
}
