import type { Profile } from "@/lib/data/types";

export function Avatar({ profile, size = 8 }: { profile: Pick<Profile, "avatar_base" | "avatar_color" | "avatar_accessory">; size?: number }) {
  const px = size * 4;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: px,
        height: px,
        backgroundColor: `${profile.avatar_color}33`,
        border: `1.5px solid ${profile.avatar_color}`,
        fontSize: px * 0.55,
      }}
    >
      {profile.avatar_base}
      {profile.avatar_accessory && (
        <span className="absolute -right-1 -top-1" style={{ fontSize: px * 0.35 }}>
          {profile.avatar_accessory}
        </span>
      )}
    </span>
  );
}
