"use client";

import { useEffect, useState } from "react";
import { nextActionOf } from "@/lib/next-action";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";

import type { Task } from "@/lib/data/types";
import { TaskRow } from "@/components/tasks/TaskRow";
import { CompletedTaskRow } from "@/components/tasks/CompletedTaskRow";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";

/** A quest board's quests: open ones as quest cards, finished ones below. */
export function BoardQuestList({
  tasks,
  boardId,
  nextTaskId = null,
  theme,
}: {
  tasks: Task[];
  boardId?: string;
  /** The step chosen as this board's next action, if any. */
  nextTaskId?: string | null;
  theme: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const open = tasks.filter((t) => t.status === "open" && !t.is_aspiration);
  const dreams = tasks.filter((t) => t.status === "open" && t.is_aspiration);
  const done = tasks.filter((t) => t.status === "completed");
  const [editing, setEditing] = useState<Task | null>(null);
  // Fog of war: a board leads with its next step; the rest waits in the mist
  // until you ask to see it (remembered per board on this device).
  const fogKey = `board-fog:${boardId ?? "loose"}`;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      setRevealed(window.localStorage.getItem(fogKey) === "open");
    } catch {
      /* storage unavailable */
    }
  }, [fogKey]);
  function reveal(v: boolean) {
    setRevealed(v);
    try {
      window.localStorage.setItem(fogKey, v ? "open" : "fog");
    } catch {
      /* storage unavailable */
    }
  }
  const next = boardId ? (nextActionOf({ id: boardId, next_task_id: nextTaskId }, open) ?? open[0]) : open[0];
  const foggy = open.length > 2 && !!next;
  const rest = foggy ? open.filter((t) => t.id !== next!.id) : open;
  const xpAhead = rest.reduce((n, t) => n + (t.xp_value ?? 0), 0);
  return (
    <div className="flex flex-col gap-3">
      {foggy && (
        <section aria-label="Next step" className="flex flex-col gap-1.5">
          <h2 className={`m-0 flex items-center gap-2 ${isAdventure ? "font-display text-[17px]" : "text-[13.5px] font-bold uppercase tracking-wide"}`} style={{ color: isAdventure ? "#f2d27e" : "var(--t-accent)" }}>
            <span aria-hidden className="summit-next inline-block h-2.5 w-2.5 rounded-full" style={{ background: isAdventure ? "#f2d27e" : "var(--t-accent)" }} />
            Next step
          </h2>
          <ul className="flex flex-col gap-3">
            <TaskRow task={next!} theme={theme} />
          </ul>
        </section>
      )}
      {foggy && (
        <button
          type="button"
          onClick={() => reveal(!revealed)}
          aria-expanded={revealed}
          className="board-fog hover-glow relative flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-left"
          style={{ border: `1.5px dashed ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
        >
          <span aria-hidden className="relative z-[1] text-[22px]">{revealed ? "☀️" : "🌫"}</span>
          <span className="relative z-[1] flex min-w-0 flex-1 flex-col">
            <span className={isAdventure ? "font-display text-[17px]" : "text-[15px] font-semibold"}>
              {revealed ? "Back into the mist" : `${rest.length} more quests in the mist`}
            </span>
            <span className="text-[13px]" style={{ opacity: 0.75 }}>
              {revealed ? "Just the next step, for focus" : `${xpAhead} XP ahead · one step at a time — tap to see the road`}
            </span>
          </span>
          <span aria-hidden className="relative z-[1] text-[18px] transition-transform duration-200" style={{ transform: revealed ? "rotate(90deg)" : undefined }}>
            ›
          </span>
        </button>
      )}
      {open.length > 0 ? (
        (!foggy || revealed) && (
          <ul className={`flex flex-col gap-3 ${foggy ? "fade-in" : ""}`}>
            {rest.map((t) => (
              <TaskRow key={t.id} task={t} theme={theme} />
            ))}
          </ul>
        )
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
