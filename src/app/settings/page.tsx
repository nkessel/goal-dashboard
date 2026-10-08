import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SettingsContent } from "@/components/settings/SettingsContent";
import { getProfileById } from "@/lib/data/profiles";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const session = await requireSession();
  const [profile, { open }] = await Promise.all([getProfileById(session.user.id), searchParams]);
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-5">
        <PageHeader isAdventure={profile?.theme === "adventure"} title="Settings" />
        <SettingsContent userId={session.user.id} open={open} />
      </div>
    </AppShell>
  );
}
