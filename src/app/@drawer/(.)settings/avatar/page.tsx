import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getProfileById } from "@/lib/data/profiles";
import { listAvatarLibrary } from "@/lib/data/avatar-library";
import { RouteModal } from "@/components/layout/RouteModal";
import { AvatarBuilder } from "@/components/settings/AvatarBuilder";
import { NameEditor } from "@/components/settings/NameEditor";

/** Editing your avatar from inside the app: a popup over the screen you were on. */
export default async function AvatarModal() {
  const session = await requireSession();
  const [profile, library] = await Promise.all([getProfileById(session.user.id), listAvatarLibrary(session.user.id)]);
  if (!profile) notFound();
  const theme = profile.theme === "adventure" ? "adventure" : "calm";
  return (
    <RouteModal theme={theme} title="Edit avatar">
      <NameEditor initialName={profile.name} theme={profile.theme} />
      <div style={{ height: 1, background: "var(--t-panel-border)", opacity: 0.5 }} />
      <AvatarBuilder initialColor={profile.avatar_color} initialImageUrl={profile.avatar_image_url} library={library} theme={profile.theme} />
    </RouteModal>
  );
}
