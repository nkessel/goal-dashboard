"use client";

import { useTransition } from "react";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/actions";
import type { AppNotification } from "@/lib/data/types";

type Item = AppNotification & { icon: string };

export function NotificationList({ notifications }: { notifications: Item[] }) {
  const [isPending, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.is_read);

  return (
    <div className="flex flex-col gap-3">
      {unread.length > 0 && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => markAllNotificationsReadAction())}
          className="self-start rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Mark all read ({unread.length})
        </button>
      )}

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`flex items-start justify-between gap-3 py-2.5 text-sm ${
              n.is_read ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              <span aria-hidden>{n.icon}</span>
              <div className="flex flex-col">
                <span className="text-zinc-800 dark:text-zinc-200">{n.body}</span>
                <time className="text-xs text-zinc-400">{new Date(n.created_at).toLocaleString()}</time>
              </div>
            </div>
            {!n.is_read && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => markNotificationReadAction(n.id))}
                className="shrink-0 rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Mark read
              </button>
            )}
          </li>
        ))}
        {notifications.length === 0 && (
          <p className="py-4 text-sm text-zinc-400">Nothing yet — reactions, comments, and reminders will show up here.</p>
        )}
      </ul>
    </div>
  );
}
