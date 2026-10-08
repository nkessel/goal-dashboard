"use client";

import { useState } from "react";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";

import type { Task } from "@/lib/data/types";
import { TaskRow } from "@/components/tasks/TaskRow";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";

/** A quest board's quests: open ones as quest cards, finished ones below. */
export function BoardQuestList({ tasks, boardId, theme }: { tasks: Task[]; boardId?: string; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const open = tasks.filter((t) => t.status === "open" && !t.is_aspiration);
  const dreams = tasks.filter((t) => t.status === "open" && t.is_aspiration);
  const done = tasks.filter((t) => t.status === "completed");
  const [editing, setEditing] = useState<Task | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {open.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {open.map((t) => (
            <TaskRow key={t.id} task={t} theme={theme} />
          ))}
        </ul>
      ) : (
        <p
          className="rounded-2xl border-2 border-dashed px-5 py-5 text-center text-[15.5px]"
          style={{ borderColor: isAdventure ? "rgba(217,180,95,.4)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
        >
          No quests on this board yet.
        </p>
      )}
      <AddTaskForm boardId={boardId} theme={theme} />
      {dreams.length > 0 && (
        <section
          className="flex flex-col gap-1 rounded-2xl px-5 py-4"
          style={{ border: `1.5px dashed ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`, background: isAdventure ? "rgba(8,10,6,.25)" : undefined }}
        >
          <h2 className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-sm font-semibold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Aspirations
          </h2>
          <p className="m-0 text-[13.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.75 }}>
            Not actionable yet. Open one and untick &ldquo;Not actionable yet&rdquo; when it&apos;s ready to become a quest.
          </p>
          <ul className="mt-1 flex flex-col">
            {dreams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="hover-glow flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-[16px]"
                  style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
                >
                  <span aria-hidden style={{ color: "var(--t-gold)" }}>✧</span>
                  <span className="min-w-0 flex-1">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
      {done.length > 0 && (
        <section
          className={`flex flex-col gap-1 rounded-2xl px-5 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
          style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
        >
          <h2 className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[20px]" : "text-sm font-semibold"}`} style={{ color: "var(--t-ink)" }}>
            Completed
          </h2>
          <ul className="relative z-[1] flex flex-col">
            {done.map((t) => (
              <CompletedTaskRow key={t.id} task={t} theme={theme} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
