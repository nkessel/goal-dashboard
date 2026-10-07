import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { listForProfile } from "@/lib/data/notifications";
import { getProfileById } from "@/lib/data/profiles";
import { NotificationList } from "@/components/notifications/NotificationList";
import { SectionTitle } from "@/components/ui/Ornaments";

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
  const [notifications, profile] = await Promise.all([
    listForProfile(session.user.id, 50),
    getProfileById(session.user.id),
  ]);
  const theme = profile?.theme ?? "calm";
  const isAdventure = theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        {isAdventure ? (
          <SectionTitle as="h1">Notifications</SectionTitle>
        ) : (
          <h1 className="text-lg font-extrabold" style={{ color: "var(--t-ink)" }}>
            Notifications
          </h1>
        )}
        <NotificationList
          notifications={notifications.map((n) => ({ ...n, icon: ICONS[n.kind] ?? "🔔" }))}
          theme={theme}
        />
      </div>
    </AppShell>
  );
}
