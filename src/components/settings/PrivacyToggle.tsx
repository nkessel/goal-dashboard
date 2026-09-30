"use client";

import { useState, useTransition } from "react";
import { updateProfilePrivacyAction } from "@/app/actions";

export function PrivacyToggle({
  initialIsPublic,
  theme = "calm",
}: {
  initialIsPublic: boolean;
  theme?: "calm" | "adventure";
}) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdventure = theme === "adventure";

  function toggle() {
    const next = !isPublic;
    setError(null);
    setIsPublic(next);
    startTransition(async () => {
      try {
        await updateProfilePrivacyAction(next);
      } catch (e) {
        setIsPublic(!next);
        setError(e instanceof Error ? e.message : "Couldn't update this.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--t-ink)" }}>
            Public profile
          </p>
          <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {isAdventure
              ? "Let party members see your boards and victories in the shared feed."
              : "Let friends see your boards and completed tasks in the shared feed."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          onClick={toggle}
          disabled={isPending}
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
          style={{ background: isPublic ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "var(--t-card-border)" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
            style={{ transform: isPublic ? "translateX(22px)" : "translateX(2px)" }}
          />
        </button>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
