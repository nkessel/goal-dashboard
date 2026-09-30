"use client";

import { useState } from "react";

export function InviteLinkBox({ code, theme = "calm" }: { code: string; theme?: "calm" | "adventure" }) {
  const [copied, setCopied] = useState(false);
  const path = `/invite/${code}`;
  const isAdventure = theme === "adventure";

  async function copy() {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, non-secure context); the link is still visible to copy manually.
    }
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-2xl p-3.5 text-sm"
      style={{
        background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
        border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        borderWidth: isAdventure ? 2 : 1,
        color: "var(--t-ink)",
      }}
    >
      <h3 className="font-semibold">{isAdventure ? "Recruit a fellow adventurer" : "Invite a friend"}</h3>
      <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Anyone who opens this link and signs in becomes your friend automatically.
      </p>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 overflow-x-auto rounded border px-2 py-1 text-xs"
          style={{
            borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
            background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
          }}
        >
          {path}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
          style={{
            border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          }}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
