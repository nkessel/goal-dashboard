import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { CelebrationSettings } from "@/components/settings/CelebrationSettings";
import { SettingsSubpage } from "@/components/settings/SettingsSubpage";

export default async function CelebrationSettingsPage() {
  const session = await requireSession();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <SettingsSubpage title="Celebration effects" blurb="The dust and sparks that fly when you complete a quest. Saved on this device.">
        <CelebrationSettings />
      </SettingsSubpage>
    </AppShell>
  );
}
