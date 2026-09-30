"use client";

import { useTransition } from "react";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/actions";
import type { AppNotification } from "@/lib/data/types";

type Item = AppNotification & { icon: string };

export function NotificationList({
  notifications,
  theme = "calm",
}: {
  notifications: Item[];
  theme?: "calm" | "adventure";
}) {
  const [isPending, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.is_read);
  const isAdventure = theme === "adventure";

  return (
    <div className="flex flex-col gap-3">
      {unread.length > 0 && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => markAllNotificationsReadAction())}
          className="hover-glow self-start rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-50"
          style={{
            borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
            color: "var(--t-ink)",
          }}
        >
          Mark all read ({unread.length})
        </button>
      )}

      <ul className="flex flex-col gap-2">
        {notifications.map((n) => (
          <li
            key={n.id}
            className="hover-glow flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm"
            style={{
              background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              opacity: n.is_read ? 0.6 : 1,
            }}
          >
            <div className="flex items-start gap-2.5">
              <span aria-hidden>{n.icon}</span>
              <div className="flex flex-col">
                <span style={{ color: "var(--t-ink)" }}>{n.body}</span>
                <time className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                  {new Date(n.created_at).toLocaleString()}
                </time>
              </div>
            </div>
            {!n.is_read && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => markNotificationReadAction(n.id))}
                className="hover-glow shrink-0 rounded-full border px-2 py-0.5 text-xs disabled:opacity-50"
                style={{
                  borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
                  color: "var(--t-ink-soft)",
                }}
              >
                Mark read
              </button>
            )}
          </li>
        ))}
        {notifications.length === 0 && (
          <p className="py-4 text-sm" style={{ color: "var(--t-ink-soft)" }}>
            Nothing yet — reactions, comments, and reminders will show up here.
          </p>
        )}
      </ul>
    </div>
  );
}
