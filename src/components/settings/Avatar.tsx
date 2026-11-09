"use client";

import { useState } from "react";
import type { Profile } from "@/lib/data/types";
import { defaultPortraitFor } from "@/lib/default-portrait";

type AvatarProfile = Pick<Profile, "id" | "avatar_color" | "avatar_image_url">;

/** Avatars are AI-generated (or preset) images only — no emoji fallback. */
export function Avatar({ profile, size = 8 }: { profile: AvatarProfile; size?: number }) {
  const px = size * 4;
  const fallback = defaultPortraitFor(profile.id);
  const [failed, setFailed] = useState<string | null>(null);
  // If the saved picture can't be fetched, show the default one instead of an empty circle.
  const src = profile.avatar_image_url && failed !== profile.avatar_image_url ? profile.avatar_image_url : fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL or a static /design/ default
    <img
      src={src}
      alt="Avatar"
      onError={() => setFailed(profile.avatar_image_url)}
      className="shrink-0 rounded-full object-cover"
      style={{ width: px, height: px, border: `1.5px solid ${profile.avatar_color}` }}
    />
  );
}

/** A portrait that falls back to a given picture when it can't be fetched (for server-drawn screens). */
export function PortraitImg({ src, fallback, alt = "", className }: { src: string; fallback: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL or a static /design/ default
    <img src={failed === src ? fallback : src} alt={alt} className={className} onError={() => setFailed(src)} />
  );
}
