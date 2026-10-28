"use client";

import { useRouter } from "next/navigation";
import { GearIcon } from "./Icons";

/**
 * Where a gear can take you in Settings: a section's id, or a section and
 * one of its folded groups ("visual-effects.celebrations").
 */
export type SettingsSpot =
  | "welcome-screen"
  | "visual-effects.celebrations"
  | "visual-effects.victories"
  | "toucan-spirit"
  | "party-view"
  | "notifications"
  | "planning"
  | "menus.quest-editor";

const TONES = {
  // The habit gear's look: a dark medallion ringed in gold.
  adventure: { color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" },
  calm: { color: "var(--t-ink-soft)", background: "var(--t-card)", boxShadow: "0 0 0 1px var(--t-card-border), 0 2px 6px rgba(0,0,0,.15)" },
  // Over a dark full-screen scene, beside its round close button.
  night: { color: "#efe6cc", background: "rgba(20,26,18,.55)", border: "1px solid rgba(217,180,95,.45)" },
  // Quiet, for a header that already has its own round buttons.
  plain: { color: "var(--t-ink-soft)", background: "transparent" },
} as const;

/**
 * The app's one gear, on anything whose look or behaviour can be changed in
 * Settings. Tapping it opens Settings at that section. `beforeOpen` lets a
 * popup close itself first.
 */
export function SettingsGear({
  to,
  label = "Settings for this",
  tone = "adventure",
  size = 30,
  className = "",
  beforeOpen,
}: {
  to: SettingsSpot;
  label?: string;
  tone?: keyof typeof TONES;
  size?: number;
  className?: string;
  beforeOpen?: () => void;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        beforeOpen?.();
        router.push(`/settings?open=${to}`);
      }}
      className={`settings-gear flex shrink-0 items-center justify-center rounded-full ${tone === "plain" ? "hover:bg-black/5" : ""} ${className}`}
      style={{ width: size, height: size, ...TONES[tone] }}
    >
      <GearIcon size={Math.round(size * 0.56)} />
    </button>
  );
}
