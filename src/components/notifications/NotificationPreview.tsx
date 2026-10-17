"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { newNotificationsAction } from "@/app/actions";

const SEEN_KEY = "notif-preview-seen";
const ICON: Record<string, string> = { reaction: "👏", comment: "💬", friend_request: "🤝", friend_request_accepted: "🤝", support: "🔔", shared_board: "🗂️", feedback: "💬", reschedule_reminder: "⏰", imports: "📜", level_up: "🎉" };

/**
 * A small preview that slides in under the bell when something new arrives
 * (checked every half minute while the app is open). Tap it to see it in
 * context; it tucks itself away after a few seconds.
 */
export function NotificationPreview() {
  const router = useRouter();
  const [item, setItem] = useState<{ id: string; kind: string; body: string; activityId: string | null; more: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const seen = () => {
      try {
        return window.localStorage.getItem(SEEN_KEY) ?? new Date().toISOString();
      } catch {
        return new Date().toISOString();
      }
    };
    // First visit: only things from now on.
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* storage unavailable */
    }
    const check = async () => {
      if (document.hidden) return;
      const list = await newNotificationsAction(seen()).catch(() => []);
      if (!alive || !list.length) return;
      try {
        window.localStorage.setItem(SEEN_KEY, list[0].at);
      } catch {
        /* storage unavailable */
      }
      setLeaving(false);
      setItem({ id: list[0].id, kind: list[0].kind, body: list[0].body, activityId: list[0].activityId, more: list.length - 1 });
      if (hide.current) clearTimeout(hide.current);
      hide.current = setTimeout(() => {
        setLeaving(true);
        setTimeout(() => setItem(null), 260);
      }, 6000);
    };
    const first = setTimeout(check, 4000);
    const id = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
      if (hide.current) clearTimeout(hide.current);
    };
  }, [router]);

  if (!item) return null;
  const href = (item.kind === "reaction" || item.kind === "comment") && item.activityId ? `/feed#activity-${item.activityId}` : "/notifications";
  return (
    <button
      type="button"
      onClick={() => {
        setItem(null);
        router.push(href);
      }}
      className={`${leaving ? "notif-out" : "notif-in"} fixed right-3 top-[64px] z-[62] flex w-[min(340px,calc(100vw-24px))] items-start gap-2.5 rounded-2xl px-3.5 py-3 text-left shadow-2xl`}
      style={{ background: "rgba(22,26,22,.96)", border: "1.5px solid rgba(217,180,95,.6)", color: "#f1ead2" }}
      aria-live="polite"
    >
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[18px]" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913" }}>
        {ICON[item.kind] ?? "🔔"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-3 block text-[14.5px] leading-snug">{item.body}</span>
        <span className="mt-0.5 block text-[12px]" style={{ color: "#d9b45f" }}>
          {item.more > 0 ? `+${item.more} more · ` : ""}Tap to see it
        </span>
      </span>
    </button>
  );
}
