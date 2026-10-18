"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CloseSettingsButton } from "@/components/settings/CloseSettingsButton";
import { markNotificationReadAction, recentNotificationsAction } from "@/app/actions";
import { useEscape } from "@/lib/use-escape";

const ICONS: Record<string, string> = {
  friend_request: "🤝",
  friend_request_accepted: "🤝",
  reaction: "👍",
  comment: "💬",
  reschedule_reminder: "⏰",
  level_up: "🎉",
  daily_check_in: "☀️",
  imports: "📜",
  feedback: "💬",
  support: "🔔",
  shared_board: "🗂️",
};

type Row = Awaited<ReturnType<typeof recentNotificationsAction>>[number];

/**
 * Bell in the top bar. A tap shows a small preview of the latest
 * notifications; "See all" (a second tap) opens the full screen. On the
 * Notifications screen it becomes the close (X).
 */
export function NotificationsButton({
  unreadCount,
  isAdventure,
  iconColor,
}: {
  unreadCount: number;
  isAdventure: boolean;
  iconColor: string;
}) {
  const pathname = usePathname();
  // Where the bell sits while the preview is open (null = closed).
  const [open, setOpen] = useState<DOMRect | null>(null);
  if (pathname.startsWith("/notifications")) {
    return <CloseSettingsButton isAdventure={isAdventure} size={40} label="Close notifications" />;
  }
  return (
    <>
      <button
        type="button"
        data-bell
        onClick={(e) => setOpen(open ? null : e.currentTarget.getBoundingClientRect())}
        aria-label="Notifications"
        aria-expanded={!!open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)",
          border: isAdventure ? "1px solid rgba(209,161,60,.35)" : "1px solid var(--t-card-border)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5.5 2 6.5H4c1-1 2-3 2-6.5z" stroke={iconColor} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 0 0 4 0" stroke={iconColor} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && <BellPreview anchor={open} isAdventure={isAdventure} onClose={() => setOpen(null)} />}
    </>
  );
}

function when(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BellPreview({ anchor: r, isAdventure, onClose }: { anchor: DOMRect; isAdventure: boolean; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [, startTransition] = useTransition();
  useEscape(onClose);
  useEffect(() => {
    recentNotificationsAction()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  // Prefetch the full screen so "See all" opens at once.
  useEffect(() => {
    router.prefetch("/notifications");
  }, [router]);

  const width = 320;
  const right = Math.max(8, window.innerWidth - r.right - 4);
  const top = r.bottom + 8;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55]" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Latest notifications"
        className={`card-pop-in fixed z-[56] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl shadow-2xl ${isAdventure ? "parchment" : ""}`}
        style={{ right, top, width: `min(${width}px, calc(100vw - 16px))`, background: isAdventure ? undefined : "var(--t-card)", border: isAdventure ? undefined : "1px solid var(--t-card-border)", color: "var(--t-ink)" }}
      >
        <div className="relative z-[1] flex items-center justify-between px-4 pb-1.5 pt-3">
          <span className={isAdventure ? "font-display text-[19px]" : "text-[15px] font-bold"}>Notifications</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        <ul className="relative z-[1] m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
          {rows === null && (
            <li className="px-4 py-3 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
              Loading…
            </li>
          )}
          {rows?.length === 0 && (
            <li className="px-4 py-3 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
              All quiet.
            </li>
          )}
          {rows?.map((n) => (
            <li key={n.id} className="flex items-start gap-2.5 border-t px-4 py-2.5 first:border-t-0" style={{ borderColor: "rgba(139,112,64,.3)" }}>
              <span aria-hidden className="pt-0.5 text-[17px] leading-none">
                {ICONS[n.kind] ?? "🔔"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-3 block text-[14.5px] leading-snug" style={{ fontWeight: n.read ? 400 : 600 }}>
                  {n.body}
                </span>
                <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  {when(n.at)}
                </span>
              </span>
              {!n.read && (
                <button
                  type="button"
                  onClick={() => {
                    setRows((rs) => rs?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? rs);
                    startTransition(() => markNotificationReadAction(n.id));
                  }}
                  title="Mark as read"
                  aria-label="Mark as read"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ border: "1px solid #b39a6a" }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
        <Link
          href="/notifications"
          onClick={onClose}
          className="relative z-[1] flex h-11 shrink-0 items-center justify-center border-t text-[14.5px] font-semibold"
          style={{ borderColor: "rgba(139,112,64,.35)", color: isAdventure ? "#6b4f16" : "var(--t-accent)" }}
        >
          See all notifications
        </Link>
      </div>
    </>,
    document.body
  );
}
