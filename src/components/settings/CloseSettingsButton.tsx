"use client";

import { useEffect } from "react";
import { useViewTransitionNavigate, useLastAppPathname } from "@/components/ui/ViewTransitionProvider";

/**
 * Settings' "X" close button: returns to wherever the user actually came
 * from (tracked by ViewTransitionProvider) rather than a fixed destination,
 * falling back to Today's Quest ("/") when there's no previous in-app
 * screen (e.g. Settings was opened directly). Also closable with Esc, and
 * fades out to the destination instead of the default expand/zoom root
 * transition (see the "settings-close" rules in globals.css).
 */
export function CloseSettingsButton({
  isAdventure,
  size = 32,
  label = "Close settings",
}: {
  isAdventure: boolean;
  size?: number;
  label?: string;
}) {
  const navigate = useViewTransitionNavigate();
  const getLastAppPathname = useLastAppPathname();

  function close() {
    const target = getLastAppPathname() ?? "/";
    document.documentElement.setAttribute("data-transition", "settings-close");
    navigate(target);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() reads fresh refs each call, doesn't need to be a dep
  }, []);

  return (
    <button
      type="button"
      onClick={close}
      aria-label={label}
      className="hover-glow flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: isAdventure ? "rgba(0,0,0,.16)" : "var(--t-card)",
        border: `1px solid ${isAdventure ? "rgba(214,200,150,.25)" : "var(--t-card-border)"}`,
      }}
    >
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none">
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke={isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)"}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
