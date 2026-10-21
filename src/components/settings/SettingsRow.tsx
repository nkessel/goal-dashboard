"use client";

import { useEffect, useState } from "react";
import { useReportOpen } from "./ReorderableSections";

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
  children,
}: {
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
  const isAdventure = theme === "adventure";
  // While a section is open, the list of sections can't be dragged around.
  const report = useReportOpen();
  useEffect(() => {
    report?.(label, open);
    return () => report?.(label, false);
  }, [report, label, open]);

  return (
    <div
      className={isAdventure ? "parchment" : ""}
      style={{
        ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }),
        borderRadius: 14,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${disabled ? "" : "hover-glow"} flex w-full items-center gap-3 rounded-[14px] px-4 py-3.5 text-left`}
        style={{ cursor: disabled ? "default" : "pointer" }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: isAdventure ? "rgba(209,161,60,.16)" : "var(--t-accent-soft)" }}
        >
          {icon}
        </span>
        <span className="flex-1 text-[16px] font-medium" style={{ color: "var(--t-ink)" }}>
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
      {open && !disabled && children && (
        <div
          className="flex flex-col gap-2 px-4 pb-4 pt-1"
          style={{ borderTop: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
