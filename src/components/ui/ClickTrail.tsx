"use client";

import { useEffect } from "react";

type Click = { at: string; path: string; label: string; kind: string; gap: number | null; device: string };

const PRESSABLE = 'button, a[href], [role="button"], [role="menuitem"], [role="menuitemradio"], [role="radio"], [role="tab"], [role="switch"], [role="slider"], input, select, textarea, summary, label';

/** What a pressed thing is called: its aria-label, title, or its own words (never what's typed into a field). */
function nameOf(el: Element): string {
  const own = el.getAttribute("aria-label") || el.getAttribute("title");
  if (own) return own;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent;
    return id || ("placeholder" in el ? el.placeholder : "") || `${el.tagName.toLowerCase()}${"type" in el && el.type ? `:${el.type}` : ""}`;
  }
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * The click trail: every button, link or control pressed, where, and the
 * time since the one before, sent in small batches to `/api/clicks` (table
 * `ui_clicks`). The UX design teams read it to find where the app is slow or
 * confusing. Field contents are never recorded.
 */
export function ClickTrail() {
  useEffect(() => {
    let buf: Click[] = [];
    let last = 0;
    const device = () => `${window.matchMedia("(pointer: coarse)").matches ? "phone" : "computer"} ${window.innerWidth}×${window.innerHeight}`;
    const send = (beacon: boolean) => {
      if (!buf.length) return;
      const body = JSON.stringify({ clicks: buf });
      buf = [];
      try {
        if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/clicks", new Blob([body], { type: "application/json" }));
        else void fetch("/api/clicks", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
      } catch {
        /* best effort */
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
      if (!t) return;
      const now = Date.now();
      const kind = t.closest("[data-feedback-root]") ? "feedback" : t.tagName === "A" ? "link" : t.matches("input, select, textarea") ? "field" : "button";
      buf.push({ at: new Date(now).toISOString(), path: location.pathname, label: nameOf(t) || "(unnamed)", kind, gap: last ? now - last : null, device: device() });
      last = now;
      if (buf.length >= 40) send(false);
    };
    const timer = window.setInterval(() => send(false), 20_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") send(true);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHide);
    const onLeave = () => send(true);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      send(true);
    };
  }, []);
  return null;
}
