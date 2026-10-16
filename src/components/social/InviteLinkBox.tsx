"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

/** "Invite someone to your party": share sheet on phones, copy everywhere. */
export function InviteLinkBox({ code, theme = "calm", inviterName }: { code: string; theme?: "calm" | "adventure"; inviterName?: string | null }) {
  const [copied, setCopied] = useState(false);
  const isAdventure = theme === "adventure";
  const path = `/invite/${code}`;
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const url = `${origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link stays visible to copy by hand */
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Join my party on Goal Dashboard",
        text: `${inviterName ? `${inviterName} invited you` : "You're invited"} to join their party on Goal Dashboard — cheer each other on and take on goals together.`,
        url,
      });
    } catch {
      /* closed the share sheet */
    }
  }

  const gold = { background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" };

  return (
    <section
      className={`relative flex flex-col gap-2.5 rounded-2xl px-4 py-4 ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
    >
      <h2 className={`relative z-[1] m-0 ${isAdventure ? "font-display text-[19px]" : "text-base font-bold"}`} style={{ color: "var(--t-ink)" }}>
        Invite someone to your party
      </h2>
      <p className="relative z-[1] m-0 text-[14.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        Send them this link. Once they open it and sign in with Google, you&apos;re in each other&apos;s party.
      </p>
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        {canShare && (
          <button type="button" onClick={share} className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold" style={gold}>
            Share invite
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold"
          style={canShare ? { border: `1.5px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, color: "var(--t-ink)" } : gold}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <code className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--t-ink-soft)" }} title={url}>
          {url.replace(/^https?:\/\//, "")}
        </code>
      </div>
    </section>
  );
}
