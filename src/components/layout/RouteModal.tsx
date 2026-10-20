"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEscape } from "@/lib/use-escape";

/**
 * A page shown as a centered popup over a dimmed screen (an intercepted
 * route). Closing — ×, the backdrop or Escape — steps back to where you were.
 */
export function RouteModal({ theme, title, children }: { theme: "calm" | "adventure"; title: string; children: React.ReactNode }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const isAdventure = theme === "adventure";

  function close() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => router.back(), 170);
  }
  useEscape(close);
  // The screen underneath stays put while this is open.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const was = [html.style.overflow, body.style.overflow, html.style.overscrollBehavior];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    return () => {
      [html.style.overflow, body.style.overflow, html.style.overscrollBehavior] = was;
    };
  }, []);

  return (
    <div data-theme={theme} className="fixed inset-0 z-[55] flex items-center justify-center p-4" style={{ background: "transparent", minHeight: 0 }}>
      <div className={`absolute inset-0 touch-none ${closing ? "overlay-fade-out" : "overlay-fade-in"}`} style={{ background: "var(--t-overlay)" }} onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl ${closing ? "card-pop-out" : "card-pop-in"}`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-5">
          <div className="flex items-center justify-between">
            <h2 className={`m-0 ${isAdventure ? "font-display text-[22px]" : "text-lg font-bold"}`}>{title}</h2>
            <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
