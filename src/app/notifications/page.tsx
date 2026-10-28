import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { listForProfile } from "@/lib/data/notifications";
import { getProfileById } from "@/lib/data/profiles";
import { NotificationList } from "@/components/notifications/NotificationList";
import { SectionTitle } from "@/components/ui/Ornaments";
import { SettingsGear } from "@/components/ui/SettingsGear";

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

export default async function NotificationsPage() {
  const session = await requireSession();
  const [notifications, profile] = await Promise.all([
    listForProfile(session.user.id, 50),
    getProfileById(session.user.id),
  ]);
  const theme = profile?.theme ?? "adventure";
  const isAdventure = theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-4">
        {isAdventure ? (
          <SectionTitle as="h1" aside={<SettingsGear to="notifications" label="Notification settings" size={30} />}>
            Notifications
          </SectionTitle>
        ) : (
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-extrabold" style={{ color: "var(--t-ink)" }}>
              Notifications
            </h1>
            <SettingsGear to="notifications" label="Notification settings" tone="calm" size={30} />
          </div>
        )}
        <NotificationList
          notifications={notifications.map((n) => ({ ...n, icon: ICONS[n.kind] ?? "🔔" }))}
          theme={theme}
        />
      </div>
    </AppShell>
  );
}
