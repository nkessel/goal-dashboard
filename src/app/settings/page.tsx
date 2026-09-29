import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { CelebrationSettings } from "@/components/settings/CelebrationSettings";
import { AvatarBuilder } from "@/components/settings/AvatarBuilder";
import { getProfileById } from "@/lib/data/profiles";
import { notFound } from "next/navigation";

export default async function SettingsPage() {
  const session = await requireSession();
  const profile = await getProfileById(session.user.id);
  if (!profile) notFound();

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-500">Theme</h2>
          <p className="text-xs text-zinc-400">
            Calm keeps things quiet and minimal. Adventure turns your day into a battle — bouncier
            animations, monster icons, and level-up fanfare.
          </p>
          <ThemeToggle theme={profile.theme} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-500">Celebration effects</h2>
          <p className="text-xs text-zinc-400">The dust and sparks that fly when you complete a quest.</p>
          <CelebrationSettings />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Avatar</h2>
          <AvatarBuilder
            initialBase={profile.avatar_base}
            initialColor={profile.avatar_color}
            initialAccessory={profile.avatar_accessory}
          />
        </section>
      </div>
    </AppShell>
  );
}
