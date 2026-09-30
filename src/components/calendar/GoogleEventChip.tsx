"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { convertCalendarEventToTaskAction } from "@/app/actions";
import { formatTimeRange } from "@/lib/calendar-dates";

const HIDDEN_KEY = "hidden-gcal-events-v1";

function readHidden(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeHidden(ids: Set<string>) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // best-effort — ignore storage failures (private browsing, quota, etc.)
  }
}

/**
 * A real Google Calendar appointment plotted on the Calendar view (distinct
 * from an app quest/task, which uses CalendarTaskChip). Click opens a small
 * action sheet to hide the appointment from this view, or pull it in as a
 * quest — the app has no server-side table for "hidden events" per user, so
 * the hide-list lives in this browser's localStorage.
 */
export function GoogleEventChip({
  event,
  theme = "calm",
  compact = false,
}: {
  event: GoogleCalendarEvent;
  theme?: "calm" | "adventure";
  compact?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const router = useRouter();
  // Lazy initializer (not an effect) — reads localStorage once on mount.
  // Server-rendered markup always shows the chip (no window there); the
  // client's first paint may immediately swap to hidden if the viewer
  // hid this appointment earlier, which is an acceptable one-frame flash
  // for a purely client-side, per-browser preference like this.
  const [hidden, setHidden] = useState(() => (typeof window !== "undefined" ? readHidden().has(event.id) : false));
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState(false);

  if (hidden || converted) return null;

  function hideEvent() {
    const ids = readHidden();
    ids.add(event.id);
    writeHidden(ids);
    setHidden(true);
    setOpen(false);
  }

  function convertToQuest() {
    setError(null);
    startTransition(async () => {
      try {
        await convertCalendarEventToTaskAction({
          googleEventId: event.id,
          title: event.title,
          description: event.description ?? undefined,
          startISO: event.start,
          endISO: event.end,
        });
        // Hide the raw appointment chip now that it exists as a quest too —
        // the task chip (from the fresh server data) takes its place.
        const ids = readHidden();
        ids.add(event.id);
        writeHidden(ids);
        setConverted(true);
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that as a quest.");
      }
    });
  }

  const start = new Date(event.start);
  const end = new Date(event.end);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover-glow flex h-full w-full items-center overflow-hidden rounded-lg text-left"
        style={{
          background: isAdventure ? "rgba(78,95,150,.22)" : "#e7ecf9",
          border: `1px dashed ${isAdventure ? "rgba(150,170,230,.55)" : "#a9b8e6"}`,
          flexDirection: compact ? "column" : "row",
          justifyContent: compact ? "center" : "flex-start",
          gap: compact ? 2 : 8,
          padding: compact ? "4px 3px" : "6px 8px",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center rounded-full"
          style={{ width: compact ? 16 : 20, height: compact ? 16 : 20, background: isAdventure ? "rgba(150,170,230,.3)" : "#c9d4f5" }}
        >
          <svg width={compact ? 9 : 11} height={compact ? 9 : 11} viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="var(--t-ink)" strokeWidth="2" />
            <path d="M3 9h18M8 3v4M16 3v4" stroke="var(--t-ink)" strokeWidth="2" />
          </svg>
        </div>
        <div className={compact ? "min-w-0 text-center" : "min-w-0 flex-1"}>
          <p
            className="truncate leading-tight"
            style={{ color: "var(--t-ink)", fontSize: compact ? 9 : 12.5, fontWeight: 500 }}
          >
            {event.title}
          </p>
          {!compact && !event.isAllDay && (
            <p className="truncate leading-tight" style={{ color: "var(--t-ink-soft)", fontSize: 10.5 }}>
              {formatTimeRange(start, end)}
            </p>
          )}
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{ background: "var(--t-overlay)" }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-t-2xl p-4 sm:rounded-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className={isAdventure ? "font-display text-base" : "text-base font-bold"}>{event.title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-lg leading-none"
                style={{ color: "var(--t-ink-soft)" }}
              >
                ×
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
              Google Calendar appointment · {event.isAllDay ? "All day" : formatTimeRange(start, end)}
            </p>
            {event.description && (
              <p className="text-sm" style={{ color: "var(--t-ink)" }}>
                {event.description}
              </p>
            )}
            {error && (
              <p className="text-xs" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={hideEvent}
                className="hover-glow rounded-full px-3 py-1.5 text-sm"
                style={{ border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`, color: "var(--t-ink-soft)" }}
              >
                Hide from calendar
              </button>
              <button
                type="button"
                onClick={convertToQuest}
                disabled={isPending}
                className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
              >
                {isPending ? "Adding…" : isAdventure ? "Make it a quest" : "Add as task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
