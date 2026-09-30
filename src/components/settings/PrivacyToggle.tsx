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
          className="relative block h-7 w-12 shrink-0 rounded-full p-0 transition-colors disabled:opacity-50"
          style={{
            background: isPublic ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "rgba(0,0,0,.18)",
            border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          }}
        >
          <span
            className="absolute left-[2px] top-1/2 h-[22px] w-[22px] rounded-full bg-white shadow transition-transform"
            style={{ transform: `translate(${isPublic ? 20 : 0}px, -50%)` }}
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
