"use client";

import { useEffect } from "react";
import { useViewTransitionNavigate, useViewTransitionHistory } from "@/components/ui/ViewTransitionProvider";

/**
 * Settings' "X" close button: returns to wherever the user actually came
 * from (tracked by ViewTransitionProvider) rather than a fixed destination,
 * falling back to Today's Quest ("/") when there's no previous in-app
 * screen (e.g. Settings was opened directly). Also closable with Esc, and
 * fades out to the destination instead of the default expand/zoom root
 * transition (see the "settings-close" rules in globals.css).
 */
export function CloseSettingsButton({ isAdventure }: { isAdventure: boolean }) {
  const navigate = useViewTransitionNavigate();
  const getPreviousPathname = useViewTransitionHistory();

  function close() {
    const target = getPreviousPathname() ?? "/";
    document.documentElement.setAttribute("data-transition", "settings-close");
    const transition = navigate(target);
    if (transition) {
      transition.finished.finally(() => {
        document.documentElement.removeAttribute("data-transition");
      });
    } else {
      document.documentElement.removeAttribute("data-transition");
    }
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
      aria-label="Close settings"
      className="hover-glow flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{
        background: isAdventure ? "rgba(0,0,0,.16)" : "var(--t-card)",
        border: `1px solid ${isAdventure ? "rgba(214,200,150,.25)" : "var(--t-card-border)"}`,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
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
