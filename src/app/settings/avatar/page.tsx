import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { AvatarBuilder } from "@/components/settings/AvatarBuilder";
import { SettingsSubpage } from "@/components/settings/SettingsSubpage";
import { getProfileById } from "@/lib/data/profiles";

export default async function AvatarSettingsPage() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();
  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <SettingsSubpage title="Avatar">
        <AvatarBuilder
          initialBase={profile.avatar_base}
          initialColor={profile.avatar_color}
          initialAccessory={profile.avatar_accessory}
        />
      </SettingsSubpage>
    </AppShell>
  );
}
