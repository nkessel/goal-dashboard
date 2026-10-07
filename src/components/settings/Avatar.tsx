import type { Profile } from "@/lib/data/types";

type AvatarProfile = Pick<Profile, "id" | "avatar_color" | "avatar_image_url">;

/** The same 8 built-in portraits seeded into avatar_library (migration
 * 0009) — kept here too as a zero-network fallback so a profile always has
 * *some* avatar to show, even one that's never picked or generated one yet.
 * Deterministic by profile id, matching the pattern used for board tiles
 * (see creaturePortraitFor in BoardGrid.tsx) so a given user always lands
 * on the same default rather than a different one on every render. */
const PRESET_PORTRAITS = [
  "icon-dragon.jpg",
  "icon-goblin.jpg",
  "icon-sorcerer.jpg",
  "icon-boar.jpg",
  "icon-golem.jpg",
  "icon-venomroot.jpg",
  "icon-bat.jpg",
  "avatar-ranger.jpg",
];

export function defaultPortraitFor(profileId: string) {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) hash = (hash * 31 + profileId.charCodeAt(i)) >>> 0;
  return `/design/${PRESET_PORTRAITS[hash % PRESET_PORTRAITS.length]}`;
}

/** Avatars are AI-generated (or preset) images only — no emoji fallback. */
export function Avatar({ profile, size = 8 }: { profile: AvatarProfile; size?: number }) {
  const px = size * 4;
  const src = profile.avatar_image_url ?? defaultPortraitFor(profile.id);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL or a static /design/ default
    <img
      src={src}
      alt="Avatar"
      className="shrink-0 rounded-full object-cover"
      style={{ width: px, height: px, border: `1.5px solid ${profile.avatar_color}` }}
    />
  );
}
