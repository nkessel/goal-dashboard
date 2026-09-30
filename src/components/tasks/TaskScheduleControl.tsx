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

export function TaskScheduleControl({ task, theme = "calm" }: { task: Task; theme?: "calm" | "adventure" }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  const fieldStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

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
        className="hover-glow self-start rounded-full border px-3 py-1 text-xs font-medium"
        style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", color: "var(--t-ink-soft)" }}
      >
        {task.is_on_calendar ? "📅 Reschedule" : "📅 Pull to calendar"}
      </button>
    );
  }

  return (
    <div
      className="w-full rounded-lg p-3 text-xs"
      style={{
        background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
        border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        color: "var(--t-ink)",
      }}
    >
      <p className="mb-2 font-medium">
        {task.is_on_calendar ? "Reschedule" : "Pull"} &quot;{task.title}&quot; onto your calendar
      </p>

      {slots === null && !error && <p style={{ color: "var(--t-ink-soft)" }}>Finding open slots…</p>}
      {error && (
        <p className="mb-2" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {slots && slots.length === 0 && (
        <p className="mb-2" style={{ color: "var(--t-ink-soft)" }}>
          No open slots found in the next 14 days.
        </p>
      )}

      {slots && slots.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {slots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              disabled={isPending}
              onClick={() => pick(slot)}
              className="hover-glow rounded border px-2 py-1 text-left disabled:opacity-50"
              style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
            >
              {formatSlot(slot)}
            </button>
          ))}
        </div>
      )}

      <details className="mt-1">
        <summary className="cursor-pointer" style={{ color: "var(--t-ink-soft)" }}>
          Pick a different time
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <label className="flex items-center justify-between gap-2">
            Start
            <input
              type="datetime-local"
              value={manualStart}
              onChange={(e) => setManualStart(e.target.value)}
              className="rounded border px-1 py-0.5"
              style={fieldStyle}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            End
            <input
              type="datetime-local"
              value={manualEnd}
              onChange={(e) => setManualEnd(e.target.value)}
              className="rounded border px-1 py-0.5"
              style={fieldStyle}
            />
          </label>
          <button
            type="button"
            disabled={isPending || !manualStart || !manualEnd}
            onClick={pickManual}
            className="hover-glow mt-1 rounded px-2 py-1 disabled:opacity-50"
            style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
          >
            Use this time
          </button>
        </div>
      </details>

      <button type="button" onClick={() => setOpen(false)} className="mt-2 underline" style={{ color: "var(--t-ink-soft)" }}>
        cancel
      </button>
    </div>
  );
}
