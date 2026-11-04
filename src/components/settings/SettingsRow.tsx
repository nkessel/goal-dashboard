"use client";

import { useEffect, useRef, useState } from "react";
import { useReportOpen } from "./ReorderableSections";
import { Fold } from "@/components/ui/Fold";

/**
 * One expandable row in the Settings list (matches the mockup's cream
 * icon+label+chevron cards) — clicking toggles an inline panel open rather
 * than navigating to a sub-page, so every setting stays one tap away.
 */
export function SettingsRow({
  icon,
  label,
  rightLabel,
  defaultOpen = false,
  disabled = false,
  theme = "calm",
  id,
  quiet = false,
  children,
}: {
  /** Found by Settings search (data-settings-row). */
  id?: string;
  /** A smaller, quieter row for things opened less often. */
  quiet?: boolean;
  icon: React.ReactNode;
  label: string;
  /** Short status text shown before the chevron, e.g. "Woodland (Default)". */
  rightLabel?: string;
  defaultOpen?: boolean;
  /** Renders a muted, non-interactive "coming soon" row instead. */
  disabled?: boolean;
  theme?: "calm" | "adventure";
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // A gear elsewhere in the app can send you here while Settings is already
  // showing: open again, and bring the row into view with a short glow.
  const [wasDefault, setWasDefault] = useState(defaultOpen);
  if (defaultOpen !== wasDefault) {
    setWasDefault(defaultOpen);
    if (defaultOpen) setOpen(true);
  }
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!defaultOpen || !el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      el.classList.remove("settings-spotlight");
      void el.offsetWidth;
      el.classList.add("settings-spotlight");
    }, 280);
    return () => window.clearTimeout(t);
  }, [defaultOpen]);
  const isAdventure = theme === "adventure";
  // While a section is open, the list of sections can't be dragged around.
  const report = useReportOpen();
  useEffect(() => {
    report?.(label, open);
    return () => report?.(label, false);
  }, [report, label, open]);

  return (
    <div
      ref={box}
      data-settings-row={id}
      className={isAdventure ? "parchment" : ""}
      style={{
        scrollMarginTop: 12,
        ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }),
        borderRadius: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-settings-toggle
        className={`${disabled ? "" : "hover-glow"} flex w-full items-center gap-3 rounded-[14px] text-left ${quiet ? "px-3.5 py-2" : "px-4 py-3.5"}`}
        style={{ cursor: disabled ? "default" : "pointer" }}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-full ${quiet ? "h-7 w-7" : "h-8 w-8"}`}
          style={{ background: isAdventure ? "rgba(209,161,60,.16)" : "var(--t-accent-soft)" }}
        >
          {icon}
        </span>
        <span className={`flex-1 font-medium ${quiet ? "text-[14.5px]" : "text-[16px]"}`} style={{ color: "var(--t-ink)" }}>
          {label}
        </span>
        {rightLabel && (
          <span className="text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
            {rightLabel}
          </span>
        )}
        {!disabled && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 150ms" }}
          >
            <path d="M9 5l7 7-7 7" stroke="var(--t-ink-soft)" strokeWidth="2" fill="none" />
          </svg>
        )}
        {disabled && (
          <span className="text-[10px] font-medium" style={{ color: "var(--t-ink-soft)" }}>
            Coming soon
          </span>
        )}
      </button>
      {!disabled && children && (
        // Slides open and closed (it used to snap).
        <Fold open={open}>
          <div
            className="flex flex-col gap-2 px-4 pb-4 pt-1"
            style={{ borderTop: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
          >
            {children}
          </div>
        </Fold>
      )}
    </div>
  );
}
