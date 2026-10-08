"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A panel that slides in from the right over the current screen. Closing
 * (the ×, the dimmed backdrop, or Escape) slides it away and steps back.
 */
export function SideDrawer({ theme, title, children }: { theme: "calm" | "adventure"; title: string; children: React.ReactNode }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const isAdventure = theme === "adventure";

  function close() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => router.back(), 220);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  });

  return (
    <div data-theme={theme} className="fixed inset-0 z-[45]" style={{ background: "transparent", minHeight: 0 }}>
      <div className={`absolute inset-0 ${closing ? "drawer-fade-out" : "drawer-fade-in"}`} style={{ background: "rgba(6,9,5,.55)" }} onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`drawer-panel absolute bottom-0 right-0 top-0 flex w-[min(440px,92vw)] flex-col ${closing ? "drawer-slide-out" : "drawer-slide-in"}`}
        style={{
          background: isAdventure ? "linear-gradient(180deg, #1d2617, #141a10)" : "var(--t-bg)",
          borderLeft: `2px solid ${isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`,
          boxShadow: "-18px 0 40px rgba(0,0,0,.45)",
        }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className={`m-0 ${isAdventure ? "font-display text-[24px]" : "text-lg font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="hover-glow flex h-10 w-10 items-center justify-center rounded-full text-[26px] leading-none"
            style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink)" }}
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-10">{children}</div>
      </aside>
    </div>
  );
}
