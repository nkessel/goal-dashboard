import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { ComingSoon } from "@/components/layout/ComingSoon";

export default async function CalendarPage() {
  const session = await requireSession();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <ComingSoon title="Calendar" />
    </AppShell>
  );
}
