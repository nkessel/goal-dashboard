"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { deleteNotificationAction, markNotificationReadAction, markNotificationUnreadAction, markAllNotificationsReadAction, snoozeNotificationAction } from "@/app/actions";
import { SwipeActions } from "@/components/ui/SwipeActions";
import type { AppNotification } from "@/lib/data/types";
import { ImportReview } from "@/components/imports/ImportReview";

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

/**
 * Notifications as a parchment ledger: New on top, Earlier below. Each one's
 * ⋯ menu (or a right-click) can mark it read or unread, snooze it — even
 * once read — so it comes back later, or delete it. On a phone, swipe right
 * to snooze, left to delete.
 */
export function NotificationList({
  notifications,
  theme = "calm",
}: {
  notifications: Item[];
  theme?: "calm" | "adventure";
}) {
  const [isPending, startTransition] = useTransition();
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [readOverride, setReadOverride] = useState<Record<string, boolean>>({});
  const [deleted, setDeleted] = useState<{ id: string; body: string } | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRead = (n: Item) => readOverride[n.id] ?? n.is_read;

  // A tap outside closes the menu.
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-notif-menu]")) setMenuFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuFor]);

  function setRead(n: Item, value: boolean) {
    setMenuFor(null);
    setReadOverride((o) => ({ ...o, [n.id]: value }));
    startTransition(async () => {
      try {
        if (value) await markNotificationReadAction(n.id);
        else await markNotificationUnreadAction(n.id);
      } catch {
        setReadOverride((o) => ({ ...o, [n.id]: !value }));
      }
    });
  }

  /** Gone at once, with a few seconds to undo before it's deleted for good. */
  function remove(n: Item) {
    setMenuFor(null);
    setSnoozing(null);
    if (deleteTimer.current && deleted) {
      clearTimeout(deleteTimer.current);
      void deleteNotificationAction(deleted.id).catch(() => {});
    }
    setHidden((h) => new Set(h).add(n.id));
    setDeleted({ id: n.id, body: n.body });
    deleteTimer.current = setTimeout(() => {
      setDeleted((d) => (d?.id === n.id ? null : d));
      void deleteNotificationAction(n.id).catch(() => {
        setHidden((h) => {
          const x = new Set(h);
          x.delete(n.id);
          return x;
        });
      });
    }, 6000);
  }
  function undoDelete() {
    if (!deleted) return;
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    const id = deleted.id;
    setDeleted(null);
    setHidden((h) => {
      const x = new Set(h);
      x.delete(id);
      return x;
    });
  }
  // Times are shown in the viewer's own clock, so only once we're in the browser.
  const now = useSyncExternalStore(noop, () => Math.floor(Date.now() / 60_000) * 60_000, () => null);
  const asleep = (n: Item) => hidden.has(n.id) || (!!n.snoozed_until && now !== null && new Date(n.snoozed_until).getTime() > now);
  const unread = notifications.filter((n) => !isRead(n) && !asleep(n));
  const read = notifications.filter((n) => isRead(n) && !asleep(n));
  const snoozed = notifications.filter((n) => asleep(n) && !hidden.has(n.id));
  const isAdventure = theme === "adventure";

  const panelCls = isAdventure ? "parchment parchment-framed" : "";
  const panelStyle = isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  const divider = `1px solid ${isAdventure ? "rgba(139,112,64,.32)" : "var(--t-card-border)"}`;

  function renderRow(n: Item, first: boolean) {
    const read = isRead(n);
    return (
      <li key={n.id} className="relative flex flex-col py-2" style={{ ...(first ? null : { borderTop: divider }), zIndex: menuFor === n.id ? 20 : undefined }}>
        <SwipeActions
          left={{
            label: "Snooze",
            background: "linear-gradient(180deg,#56669c,#2f3a68)",
            color: "#f6ecd2",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="13" r="7.5" stroke="currentColor" strokeWidth="2" />
                <path d="M12 9.5V13l2.5 1.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ),
            onAction: () => setSnoozing(n.id),
          }}
          right={{
            label: "Delete",
            background: "linear-gradient(180deg,#c0503c,#8f2f22)",
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
            onAction: () => remove(n),
          }}
        >
        <div
          className="flex items-start gap-3 rounded-xl py-1"
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuFor(n.id);
          }}
        >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[19px]"
          style={{
            background: read ? "rgba(255,250,238,.55)" : "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)",
            border: `1.5px solid ${read ? "#b9a47c" : "#5a4520"}`,
            boxShadow: read ? undefined : "inset 0 1px 0 rgba(255,255,255,.45), 0 2px 4px rgba(0,0,0,.25)",
          }}
        >
          {n.icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <span className="text-[16.5px] leading-snug" style={{ color: "var(--t-ink)", fontWeight: read ? 400 : 600 }}>
            {n.body}
          </span>
          <time className="text-[13.5px]" style={{ color: "var(--t-ink-soft)" }} dateTime={n.created_at}>
            {now === null ? " " : when(n.created_at, now)}
          </time>
          {n.kind === "feedback" && (
            <Link href="/feedback-review" className="mt-1 w-fit text-[14px] font-semibold underline underline-offset-2" style={{ color: isAdventure ? "#6f4f12" : "var(--t-accent)" }}>
              Review it
            </Link>
          )}
        </div>
        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          {!read && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setRead(n, true)}
              aria-label="Mark as read"
              title="Mark as read"
              className="hover-glow flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-50"
              style={{ border: `1.5px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, background: isAdventure ? "rgba(255,250,238,.6)" : "transparent", color: "var(--t-ink)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Read
            </button>
          )}
          <span className="relative" data-notif-menu>
            <button
              type="button"
              onClick={() => setMenuFor(menuFor === n.id ? null : n.id)}
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menuFor === n.id}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
              style={{ color: "var(--t-ink-soft)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
            {menuFor === n.id && (
              <span role="menu" className="card-pop-in parchment absolute right-0 top-full z-30 mt-1 flex w-48 flex-col overflow-hidden rounded-xl shadow-xl" style={{ borderRadius: 12 }}>
                <button type="button" role="menuitem" onClick={() => setRead(n, !read)} className="relative z-[1] min-h-11 px-4 text-left text-[15px] hover:bg-black/5">
                  {read ? "Mark as unread" : "Mark as read"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuFor(null);
                    setSnoozing(n.id);
                  }}
                  className="relative z-[1] min-h-11 border-t px-4 text-left text-[15px] hover:bg-black/5"
                  style={{ borderColor: "rgba(139,112,64,.25)" }}
                >
                  Snooze…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => remove(n)}
                  className="relative z-[1] min-h-11 border-t px-4 text-left text-[15px] hover:bg-black/5"
                  style={{ borderColor: "rgba(139,112,64,.25)", color: "var(--t-warn)" }}
                >
                  Delete
                </button>
              </span>
            )}
          </span>
        </div>
        </div>
        </SwipeActions>
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
            <button type="button" onClick={() => setSnoozing(null)} className="h-9 px-2 text-[13.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
              cancel
            </button>
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

      {deleted && (
        <p role="status" className="m-0 text-center text-[14px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}>
          Deleted “{deleted.body.length > 40 ? `${deleted.body.slice(0, 40)}…` : deleted.body}” ·{" "}
          <button type="button" onClick={undoDelete} className="font-semibold underline" style={{ color: "var(--t-gold)" }}>
            Undo
          </button>
        </p>
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
      {sorting && <ImportReview theme={theme} onDone={() => setSorting(false)} />}
    </div>
  );
}
