import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { SettingsSubpage } from "@/components/settings/SettingsSubpage";
import { getProfileById } from "@/lib/data/profiles";

export default async function ThemeSettingsPage() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <SettingsSubpage
        title="Theme"
        blurb="Calm keeps things quiet and minimal. Adventure turns your day into a quest — forest and parchment, monster icons, and level-up fanfare."
      >
        <ThemeToggle theme={profile.theme} />
      </SettingsSubpage>
    </AppShell>
  );
}
