"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { scheduleTaskAction, suggestSlotsAction } from "@/app/actions";

type Slot = { start: string; end: string };

function formatSlot(slot: Slot) {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const sameDay = start.toDateString() === new Date().toDateString();
  const dayLabel = sameDay
    ? "Today"
    : start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeLabel = `${start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}–${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return `${dayLabel} · ${timeLabel}`;
}

export function TaskScheduleControl({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openAndFetch() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      try {
        const suggested = await suggestSlotsAction(30);
        setSlots(suggested);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load calendar slots");
      }
    });
  }

  function pick(slot: Slot) {
    setError(null);
    startTransition(async () => {
      try {
        await scheduleTaskAction(task.id, slot.start, slot.end);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't schedule task");
      }
    });
  }

  function pickManual() {
    if (!manualStart || !manualEnd) return;
    setError(null);
    startTransition(async () => {
      try {
        await scheduleTaskAction(
          task.id,
          new Date(manualStart).toISOString(),
          new Date(manualEnd).toISOString()
        );
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't schedule task");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openAndFetch}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {task.is_on_calendar ? "📅 Reschedule" : "📅 Pull to calendar"}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
        {task.is_on_calendar ? "Reschedule" : "Pull"} &quot;{task.title}&quot; onto your calendar
      </p>

      {slots === null && !error && <p className="text-zinc-500">Finding open slots…</p>}
      {error && <p className="mb-2 text-red-600">{error}</p>}

      {slots && slots.length === 0 && (
        <p className="mb-2 text-zinc-500">No open slots found in the next 14 days.</p>
      )}

      {slots && slots.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              disabled={isPending}
              onClick={() => pick(slot)}
              className="rounded border border-zinc-300 px-2 py-1 text-left hover:bg-emerald-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-emerald-950"
            >
              {formatSlot(slot)}
            </button>
          ))}
        </div>
      )}

      <details className="mt-1">
        <summary className="cursor-pointer text-zinc-500">Pick a different time</summary>
        <div className="mt-2 flex flex-col gap-1">
          <label className="flex items-center justify-between gap-2">
            Start
            <input
              type="datetime-local"
              value={manualStart}
              onChange={(e) => setManualStart(e.target.value)}
              className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            End
            <input
              type="datetime-local"
              value={manualEnd}
              onChange={(e) => setManualEnd(e.target.value)}
              className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
            />
          </label>
          <button
            type="button"
            disabled={isPending || !manualStart || !manualEnd}
            onClick={pickManual}
            className="mt-1 rounded bg-zinc-900 px-2 py-1 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Use this time
          </button>
        </div>
      </details>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 text-zinc-400 underline"
      >
        cancel
      </button>
    </div>
  );
}
