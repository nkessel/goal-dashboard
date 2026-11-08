"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { addTaskSessionAction, scheduleTaskAction, unscheduleTaskAction } from "@/app/actions";
import { sessionRef } from "@/lib/calendar-task-window";
import { WhenPicker } from "@/components/calendar/WhenPicker";
import { useEscape } from "@/lib/use-escape";
import { CloseIcon } from "@/components/ui/Icons";

type Slot = { start: string; end: string };

export function TaskScheduleControl({
  task,
  theme = "calm",
  startOpen = false,
  onDone,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  /** Open straight into slot suggestions (used by the quest card's menu). */
  startOpen?: boolean;
  /** Called after scheduling or cancelling, e.g. to close a surrounding dialog. */
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdventure = theme === "adventure";
  const autoOpened = useRef(false);
  // A quest already on the calendar can be moved, or get another session (owner, Nov 5: it ran long,
  // more of it tomorrow). Once its time has passed, another session is the likely wish.
  const placed = task.is_on_calendar && !!task.scheduled_start;
  const [more, setMore] = useState(() => placed && !!task.scheduled_end && new Date(task.scheduled_end).getTime() < new Date().getTime());
  useEffect(() => {
    if (startOpen && !autoOpened.current) {
      autoOpened.current = true;
      openAndFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  function finish() {
    setOpen(false);
    onDone?.();
  }
  // Esc closes it, like every other panel.
  useEscape(() => finish(), open);

  function openAndFetch() {
    setOpen(true);
    setError(null);
  }

  function pick(slot: Slot) {
    setError(null);
    startTransition(async () => {
      try {
        if (placed && more) await addTaskSessionAction(sessionRef(task), slot.start, slot.end);
        else await scheduleTaskAction(sessionRef(task), slot.start, slot.end);
        finish();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't schedule task");
      }
    });
  }

  function unschedule() {
    setError(null);
    startTransition(async () => {
      try {
        await unscheduleTaskAction(sessionRef(task));
        finish();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't take it off");
      }
    });
  }

  if (!open) {
    if (startOpen) return null;
    return (
      <button
        type="button"
        onClick={openAndFetch}
        className="hover-glow self-start rounded-full border px-3 py-1 text-xs font-medium"
        style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", color: "var(--t-ink-soft)" }}
      >
        {task.is_on_calendar ? "📅 Reschedule" : "📅 Pull to calendar"}
      </button>
    );
  }

  return (
    <div
      className="w-full rounded-2xl p-3 text-[13px]"
      style={{
        background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
        border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        color: "var(--t-ink)",
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <p className={`m-0 min-w-0 flex-1 truncate ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} title={task.title}>
          When for &ldquo;{task.title}&rdquo;?
        </p>
        <button type="button" onClick={finish} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[20px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
          <CloseIcon size={12} />
        </button>
      </div>
      {placed && (
        <div role="radiogroup" aria-label="Move it or add a session" className="mb-2 flex gap-1.5">
          {([
            [false, "Move it"],
            [true, "＋ Another session"],
          ] as const).map(([v, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={more === v}
              onClick={() => setMore(v)}
              className="h-8 rounded-full px-3 text-[13px] font-semibold"
              style={more === v ? { background: "rgba(217,180,95,.55)", border: "1px solid #8a6116", color: "var(--t-ink)" } : { border: "1px solid rgba(139,112,64,.35)", color: "var(--t-ink)" }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {/* The day, drawn: what's already there and where this quest would go (owner: "visual, in context"). */}
      <WhenPicker minutes={task.estimate_minutes ?? 30} title={task.title} isAdventure={isAdventure} initial={placed && !more ? task.scheduled_start : null} placing={isPending} onPick={pick} />
      {error && (
        <p className="mb-0 mt-2" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      {task.is_on_calendar && (
        <button type="button" onClick={unschedule} disabled={isPending} className="mt-2 text-[12.5px] underline underline-offset-2 disabled:opacity-50" style={{ color: "var(--t-ink-soft)" }}>
          {task.session_id ? "Take this session off" : "Take it off the calendar"}
        </button>
      )}
    </div>
  );
}
