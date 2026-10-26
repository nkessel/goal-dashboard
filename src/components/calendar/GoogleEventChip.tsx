"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { formatTimeRange } from "@/lib/calendar-dates";
import { rsvpGoogleEventAction, updateGoogleEventAction } from "@/app/actions";
import { cleanEventDescription } from "@/lib/event-text";
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
  // Where the popup has been dragged to (back to the middle each time it opens).
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on each open
    if (open) setPos({ x: 0, y: 0 });
  }, [open]);
  const [converted, setConverted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editTitle, setEditTitle] = useState(event.title);
  const [editStart, setEditStart] = useState(() => toLocalInput(event.start));
  const [editEnd, setEditEnd] = useState(() => toLocalInput(event.end));
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const canEdit = event.editable !== false && !event.isAllDay;
  const [answer, setAnswer] = useState(event.response ?? null);
  const [answering, startAnswer] = useTransition();
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const unanswered = answer === "needsAction";
  const description = cleanEventDescription(event.description);

  // The calendar's right-click menu asks for this event's popup or its quest.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; action: "edit" | "quest" }>).detail;
      if (d?.id !== event.id) return;
      if (d.action === "quest") setCreating(true);
      else setOpen(true);
    };
    window.addEventListener("gcal-item", on);
    return () => window.removeEventListener("gcal-item", on);
  }, [event.id]);

  function rsvp(a: "accepted" | "tentative" | "declined") {
    setRsvpError(null);
    const before = answer;
    if (a !== "declined") setAnswer(a);
    startAnswer(async () => {
      try {
        await rsvpGoogleEventAction(event.id, event.calendarId ?? "primary", a);
        if (a === "declined") setOpen(false);
        router.refresh();
      } catch (e) {
        setAnswer(before);
        setRsvpError(e instanceof Error ? e.message : "Couldn't send that.");
      }
    });
  }

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
        title={unanswered ? "Not answered yet" : answer === "tentative" ? "Maybe" : undefined}
        style={{
          // Solid (not see-through) so events fanned over each other stay readable.
          // Tinted with its calendar's own colour. An unanswered invitation is
          // only outlined (dotted, no fill), like Google's tentative look.
          background: unanswered
            ? isAdventure
              ? "rgba(239,226,196,.35)"
              : "rgba(255,255,255,.35)"
            : `color-mix(in srgb, ${event.color ?? (isAdventure ? "#46688a" : "#7f95d6")} ${isAdventure ? (answer === "tentative" ? 10 : 18) : answer === "tentative" ? 12 : 22}%, ${isAdventure ? "#efe2c4" : "#ffffff"})`,
          border: unanswered ? `1.5px dotted ${event.color ?? "#46688a"}` : compact ? "none" : `1px ${answer === "tentative" ? "dashed" : "solid"} color-mix(in srgb, ${event.color ?? "#46688a"} 45%, transparent)`,
          borderLeft: unanswered ? `1.5px dotted ${event.color ?? "#46688a"}` : `3px solid ${event.color ?? (isAdventure ? "#46688a" : "#7f95d6")}`,
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
            role="dialog"
            aria-label={event.title}
            onClick={(e) => e.stopPropagation()}
            // Drag it by its title bar; resize it from the bottom-right corner.
            className="relative flex flex-col gap-3 overflow-auto rounded-2xl p-4 parchment parchment-framed shadow-2xl"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              color: "var(--t-ink)",
              transform: `translate(${pos.x}px, ${pos.y}px)`,
              resize: "both",
              width: "min(28rem, calc(100vw - 32px))",
              minWidth: 280,
              minHeight: 180,
              maxWidth: "calc(100vw - 32px)",
              maxHeight: "calc(100dvh - 32px)",
            }}
          >
            <div
              className="-mx-1 -mt-1 flex cursor-move touch-none select-none items-center justify-between rounded-lg px-1 pt-1"
              title="Drag to move"
              onPointerDown={(e) => {
                if ((e.target as Element).closest("button")) return;
                const from = { x: e.clientX - pos.x, y: e.clientY - pos.y };
                const el = e.currentTarget;
                el.setPointerCapture(e.pointerId);
                const move = (m: PointerEvent) => setPos({ x: m.clientX - from.x, y: m.clientY - from.y });
                const up = () => {
                  el.removeEventListener("pointermove", move);
                  el.removeEventListener("pointerup", up);
                  el.removeEventListener("pointercancel", up);
                };
                el.addEventListener("pointermove", move);
                el.addEventListener("pointerup", up);
                el.addEventListener("pointercancel", up);
              }}
            >
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
              {event.isAllDay ? "All day" : formatTimeRange(start, end)} · {start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              {event.recurring ? " · repeats" : ""}
            </p>
            {/* Where it's from and who's coming. */}
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13.5px]">
              <dt style={{ color: "var(--t-ink-soft)" }}>Calendar</dt>
              <dd className="m-0 flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: event.color ?? "#4f6d3c" }} />
                <span className="truncate">{event.calendarName || (event.calendarId && event.calendarId !== "primary" ? event.calendarId : "My calendar")}</span>
              </dd>
              {event.location && (
                <>
                  <dt style={{ color: "var(--t-ink-soft)" }}>Where</dt>
                  <dd className="m-0 min-w-0 break-words">
                    {/^https?:\/\//.test(event.location) ? (
                      <a href={event.location} target="_blank" rel="noreferrer" className="underline underline-offset-2">{event.location}</a>
                    ) : (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">{event.location}</a>
                    )}
                  </dd>
                </>
              )}
              {event.meetLink && (
                <>
                  <dt style={{ color: "var(--t-ink-soft)" }}>Video</dt>
                  <dd className="m-0 min-w-0 truncate">
                    <a href={event.meetLink} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">Join the call</a>
                  </dd>
                </>
              )}
              {event.organizer && (
                <>
                  <dt style={{ color: "var(--t-ink-soft)" }}>Organizer</dt>
                  <dd className="m-0 min-w-0 truncate">{event.organizer}</dd>
                </>
              )}
              {!!event.guests?.length && (
                <>
                  <dt style={{ color: "var(--t-ink-soft)" }}>Guests</dt>
                  <dd className="m-0 min-w-0">
                    <details>
                      <summary className="cursor-pointer">
                        {event.guests.length} · {event.guests.filter((g) => g.response === "accepted").length} yes
                        {event.guests.some((g) => g.response === "needsAction") ? `, ${event.guests.filter((g) => g.response === "needsAction").length} waiting` : ""}
                      </summary>
                      <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0">
                        {event.guests.map((g, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span aria-hidden className="w-4 text-center">{g.response === "accepted" ? "✓" : g.response === "declined" ? "✕" : g.response === "tentative" ? "?" : "·"}</span>
                            <span className="truncate">{g.name}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </dd>
                </>
              )}
            </dl>
            {/* An invitation: answer it here. */}
            {answer && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[13.5px] font-semibold">Going?</span>
                {(
                  [
                    ["accepted", "Yes"],
                    ["tentative", "Maybe"],
                    ["declined", "No"],
                  ] as const
                ).map(([a, label]) => (
                  <button
                    key={a}
                    type="button"
                    disabled={answering}
                    aria-pressed={answer === a}
                    onClick={() => rsvp(a)}
                    className="h-8 rounded-full px-3.5 text-[13.5px] font-semibold disabled:opacity-60"
                    style={answer === a ? { background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", border: "1.5px solid #8a6116", color: isAdventure ? "#2a1c10" : "#fff" } : { border: "1.5px solid #b39a6a", color: "var(--t-ink)" }}
                  >
                    {label}
                  </button>
                ))}
                {unanswered && (
                  <span className="text-[12px] italic" style={{ color: "var(--t-ink-soft)" }}>
                    not answered yet
                  </span>
                )}
                {rsvpError && (
                  <span className="w-full text-[12.5px]" style={{ color: "var(--t-warn)" }}>
                    {rsvpError}
                  </span>
                )}
              </div>
            )}
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
            {description && (
              <p className="max-h-48 overflow-y-auto whitespace-pre-line break-words text-sm leading-snug" style={{ color: "var(--t-ink)" }}>
                {description}
              </p>
            )}
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {event.htmlLink && (
                <a href={event.htmlLink} target="_blank" rel="noreferrer" className="mr-auto text-[13px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                  Open in Google Calendar
                </a>
              )}
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
              description: description || undefined,
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
