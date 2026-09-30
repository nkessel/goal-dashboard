import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { AppShell } from "@/components/layout/AppShell";
import { AvatarBuilder } from "@/components/settings/AvatarBuilder";
import { NameEditor } from "@/components/settings/NameEditor";
import { ViewTransitionLink } from "@/components/ui/ViewTransitionLink";
import { getProfileById } from "@/lib/data/profiles";
import { listAvatarLibrary } from "@/lib/data/avatar-library";

/**
 * Dedicated avatar editor — reached by tapping the avatar anywhere in the
 * app (header, settings profile card) rather than burying it inside the
 * general Settings page's "Appearance" row.
 */
export default async function AvatarSettingsPage() {
  const session = await requireSession();
  const [profile, library] = await Promise.all([
    getProfileById(session.user.id),
    listAvatarLibrary(),
  ]);
  if (!profile) notFound();
  const isAdventure = profile.theme === "adventure";

  return (
    <AppShell userLabel={session.user.email ?? ""} profileId={session.user.id}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <ViewTransitionLink
            href="/settings"
            ariaLabel="Back to settings"
            className="hover-glow flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 5l-7 7 7 7"
                stroke={isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)"}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ViewTransitionLink>
          <h1 className="font-display text-xl" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Edit Avatar
          </h1>
        </div>

        <section
          className="flex flex-col gap-4 rounded-2xl p-5"
          style={{
            background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
            border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          }}
        >
          <NameEditor initialName={profile.name} theme={profile.theme} />
          <div
            style={{
              height: 1,
              background: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
              opacity: isAdventure ? 0.5 : 1,
            }}
          />
          <AvatarBuilder
            initialColor={profile.avatar_color}
            initialImageUrl={profile.avatar_image_url}
            library={library}
            theme={profile.theme}
          />
        </section>
      </div>
    </AppShell>
  );
}
