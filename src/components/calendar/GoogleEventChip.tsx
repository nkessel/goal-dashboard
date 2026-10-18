"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { formatTimeRange } from "@/lib/calendar-dates";
import { updateGoogleEventAction } from "@/app/actions";
import { useEscape } from "@/lib/use-escape";

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
  timeLabel,
  oneLine = false,
}: {
  event: GoogleCalendarEvent;
  theme?: "calm" | "adventure";
  compact?: boolean;
  /** Shown under the title in the grid (Google-style "9 – 10am"). */
  timeLabel?: string;
  /** Too short for two lines: "Title, 9am" on one line. */
  oneLine?: boolean;
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
  useEscape(() => setOpen(false), open);
  const [converted, setConverted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editStart, setEditStart] = useState(() => toLocalInput(event.start));
  const [editEnd, setEditEnd] = useState(() => toLocalInput(event.end));
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const canEdit = event.editable !== false && !event.isAllDay;

  async function saveEdits() {
    setEditError(null);
    setSaving(true);
    try {
      await updateGoogleEventAction(event.id, event.calendarId ?? "primary", {
        title: editTitle,
        startISO: new Date(editStart).toISOString(),
        endISO: new Date(editEnd).toISOString(),
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (hidden || (converted && !creating)) return null;

  function hideEvent() {
    const ids = readHidden();
    ids.add(event.id);
    writeHidden(ids);
    setHidden(true);
    setOpen(false);
  }

  function convertToQuest() {
    setOpen(false);
    setCreating(true);
  }

  function onQuestCreated() {
    const ids = readHidden();
    ids.add(event.id);
    writeHidden(ids);
    setConverted(true);
    router.refresh();
  }

  const durationMin = Math.max(0, Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000));

  const start = new Date(event.start);
  const end = new Date(event.end);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`cal-chip flex h-full w-full overflow-hidden rounded-md text-left ${compact ? "items-start" : "items-center"}`}
        style={{
          // Solid (not see-through) so events fanned over each other stay readable.
          // Tinted with its calendar's own colour.
          background: `color-mix(in srgb, ${event.color ?? (isAdventure ? "#46688a" : "#7f95d6")} ${isAdventure ? 18 : 22}%, ${isAdventure ? "#efe2c4" : "#ffffff"})`,
          border: compact ? "none" : `1px solid color-mix(in srgb, ${event.color ?? "#46688a"} 45%, transparent)`,
          borderLeft: `3px solid ${event.color ?? (isAdventure ? "#46688a" : "#7f95d6")}`,
          flexDirection: "row",
          gap: compact ? 0 : 8,
          padding: compact ? "3px 4px 3px 5px" : "6px 8px",
        }}
      >
        <div
          className={`${compact ? "hidden" : "flex"} shrink-0 items-center justify-center rounded-full`}
          style={{ width: compact ? 16 : 20, height: compact ? 16 : 20, background: isAdventure ? "rgba(150,170,230,.3)" : "#c9d4f5" }}
        >
          <svg width={compact ? 9 : 11} height={compact ? 9 : 11} viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="var(--t-ink)" strokeWidth="2" />
            <path d="M3 9h18M8 3v4M16 3v4" stroke="var(--t-ink)" strokeWidth="2" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={oneLine ? "truncate leading-tight" : compact ? "line-clamp-2 leading-[1.15] [overflow-wrap:normal] [word-break:normal]" : "truncate leading-tight"}
            style={{ color: isAdventure ? "#22374a" : "var(--t-ink)", fontSize: compact ? 11.5 : 13.5, fontWeight: 500 }}
          >
            {oneLine && timeLabel ? (
              <>
                {event.title}
                <span style={{ fontWeight: 400, opacity: 0.75 }}>, {timeLabel}</span>
              </>
            ) : (
              event.title
            )}
          </p>
          {timeLabel && !oneLine && (
            <p className="truncate leading-tight" style={{ color: isAdventure ? "#22374a" : "var(--t-ink-soft)", fontSize: 10.5, opacity: 0.8 }}>
              {timeLabel}
            </p>
          )}
          {!compact && !event.isAllDay && (
            <p className="truncate leading-tight" style={{ color: "var(--t-ink-soft)", fontSize: 10.5 }}>
              {formatTimeRange(start, end)}
            </p>
          )}
        </div>
      </button>

      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--t-overlay)" }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 parchment parchment-framed shadow-2xl"
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
            {canEdit && (
              <div className="flex flex-col gap-2 rounded-xl p-2.5" style={{ background: "rgba(120,90,40,.08)" }}>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  aria-label="Event title"
                  className="h-10 rounded-lg border px-2.5 text-[16px] font-semibold"
                  style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
                />
                <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                  <label className="flex flex-col gap-0.5">
                    Starts
                    <input type="datetime-local" step={900} value={editStart} onChange={(e) => setEditStart(e.target.value)} className="h-10 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }} />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    Ends
                    <input type="datetime-local" step={900} value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="h-10 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }} />
                  </label>
                </div>
                {editError && (
                  <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
                    {editError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={saveEdits}
                  disabled={saving || !editTitle.trim()}
                  className="h-9 self-end rounded-full px-4 text-[14px] font-semibold disabled:opacity-50"
                  style={{ border: `1.5px solid ${isAdventure ? "#a88a3f" : "var(--t-accent)"}`, color: "var(--t-ink)" }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
            {event.description && (
              <p className="text-sm" style={{ color: "var(--t-ink)" }}>
                {event.description}
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
                className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
              >
                {isAdventure ? "Make it a quest" : "Add as task"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {creating && (
        <QuestEditorDialog
          mode={{
            kind: "create",
            prefill: {
              title: event.title,
              description: event.description ?? undefined,
              estimateMinutes: event.isAllDay ? null : durationMin,
            },
            schedule: { startISO: event.start, endISO: event.end, googleEventId: event.id },
          }}
          theme={theme}
          onCreated={onQuestCreated}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

/** "2026-10-18T09:30" in the viewer's own time zone, for a datetime-local field. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
