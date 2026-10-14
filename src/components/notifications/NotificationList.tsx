"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { markNotificationReadAction, markAllNotificationsReadAction, snoozeNotificationAction } from "@/app/actions";
import type { AppNotification } from "@/lib/data/types";

type Item = AppNotification & { icon: string };

const noop = () => () => {};

const SNOOZE_OPTIONS: { label: string; minutes: number }[] = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "8 hours", minutes: 480 },
  { label: "1 day", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
];

function when(iso: string, now: number): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Notifications as a parchment ledger: New on top, Earlier below. */
export function NotificationList({
  notifications,
  theme = "calm",
}: {
  notifications: Item[];
  theme?: "calm" | "adventure";
}) {
  const [isPending, startTransition] = useTransition();
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Times are shown in the viewer's own clock, so only once we're in the browser.
  const now = useSyncExternalStore(noop, () => Math.floor(Date.now() / 60_000) * 60_000, () => null);
  const asleep = (n: Item) => hidden.has(n.id) || (!!n.snoozed_until && now !== null && new Date(n.snoozed_until).getTime() > now);
  const unread = notifications.filter((n) => !n.is_read && !asleep(n));
  const read = notifications.filter((n) => n.is_read && !asleep(n));
  const snoozed = notifications.filter((n) => asleep(n) && !hidden.has(n.id));
  const isAdventure = theme === "adventure";

  const panelCls = isAdventure ? "parchment parchment-framed" : "";
  const panelStyle = isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  const divider = `1px solid ${isAdventure ? "rgba(139,112,64,.32)" : "var(--t-card-border)"}`;

  function renderRow(n: Item, first: boolean) {
    return (
      <li key={n.id} className="flex flex-col py-3" style={first ? undefined : { borderTop: divider }}>
        <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[19px]"
          style={{
            background: n.is_read
              ? "rgba(255,250,238,.55)"
              : "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)",
            border: `1.5px solid ${n.is_read ? "#b9a47c" : "#5a4520"}`,
            boxShadow: n.is_read ? undefined : "inset 0 1px 0 rgba(255,255,255,.45), 0 2px 4px rgba(0,0,0,.25)",
          }}
        >
          {n.icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <span className="text-[16.5px] leading-snug" style={{ color: "var(--t-ink)", fontWeight: n.is_read ? 400 : 600 }}>
            {n.body}
          </span>
          <time className="text-[13.5px]" style={{ color: "var(--t-ink-soft)" }} dateTime={n.created_at}>
            {now === null ? " " : when(n.created_at, now)}
          </time>
        </div>
        {!n.is_read && (
          <div className="mt-1 flex shrink-0 flex-col items-stretch gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => markNotificationReadAction(n.id))}
              aria-label="Mark as read"
              title="Mark as read"
              className="hover-glow flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-50"
              style={{
                border: `1.5px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`,
                background: isAdventure ? "rgba(255,250,238,.6)" : "transparent",
                color: "var(--t-ink)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Read
            </button>
            <button
              type="button"
              onClick={() => setSnoozing(snoozing === n.id ? null : n.id)}
              aria-expanded={snoozing === n.id}
              className="hover-glow flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] disabled:opacity-50"
              style={{ color: "var(--t-ink-soft)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="13" r="7.5" stroke="currentColor" strokeWidth="2" />
                <path d="M12 9.5V13l2.5 1.6M5 4.5L3 6.5M19 4.5l2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Snooze
            </button>
          </div>
        )}
        </div>
        {snoozing === n.id && (
          <div role="group" aria-label="Snooze for" className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
            {SNOOZE_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                type="button"
                onClick={() => {
                  setSnoozing(null);
                  setHidden((h) => new Set(h).add(n.id));
                  startTransition(async () => {
                    try {
                      await snoozeNotificationAction(n.id, o.minutes);
                    } catch {
                      setHidden((h) => {
                        const x = new Set(h);
                        x.delete(n.id);
                        return x;
                      });
                    }
                  });
                }}
                className="hover-glow h-9 rounded-full px-3 text-[13.5px]"
                style={{ border: `1px solid ${isAdventure ? "#b39a6a" : "var(--t-card-border)"}`, color: "var(--t-ink)", background: isAdventure ? "rgba(255,250,238,.55)" : "transparent" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </li>
    );
  }

  function renderGroup(label: string, items: Item[]) {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col">
        <p className="font-display m-0 pt-1 text-[15px]" style={{ color: isAdventure ? "#7a5f2a" : "var(--t-ink-soft)" }}>
          {label}
        </p>
        <ul className="flex flex-col">
          {items.map((n, i) => renderRow(n, i === 0))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {unread.length > 0 && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => markAllNotificationsReadAction())}
          className="hover-glow self-center rounded-full px-5 py-2 text-[15px] disabled:opacity-50"
          style={{ background: "var(--t-gold)", color: "#2a1c10" }}
        >
          Mark all as read ({unread.length})
        </button>
      )}

      <section className={`flex flex-col gap-3 rounded-2xl px-5 py-4 ${panelCls}`} style={panelStyle}>
        {notifications.length === 0 ? (
          <p className="py-6 text-center text-[16px] italic" style={{ color: "var(--t-ink-soft)" }}>
            All quiet. Reactions, comments and reminders will appear here.
          </p>
        ) : (
          <>
            {renderGroup("New", unread)}
            {renderGroup("Earlier", read)}
            {snoozed.length > 0 && (
              <p className="m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
                {snoozed.length} snoozed — {snoozed.length === 1 ? "it comes" : "they come"} back on{" "}
                {new Date(snoozed[0].snoozed_until!).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                {snoozed.length > 1 ? " and later" : ""}.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
