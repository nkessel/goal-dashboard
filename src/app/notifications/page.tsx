import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { listForProfile } from "@/lib/data/notifications";
import { NotificationList } from "@/components/notifications/NotificationList";

const ICONS: Record<string, string> = {
  friend_request: "🤝",
  friend_request_accepted: "🤝",
  reaction: "👍",
  comment: "💬",
  reschedule_reminder: "⏰",
  level_up: "🎉",
  daily_check_in: "☀️",
};

export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await listForProfile(session.user.id, 50);

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Notifications</h1>
        </div>
        <NotificationList
          notifications={notifications.map((n) => ({ ...n, icon: ICONS[n.kind] ?? "🔔" }))}
        />
      </div>
    </AppShell>
  );
}
