"use client";

import { useState, useSyncExternalStore } from "react";
import { InviteComposer } from "./InviteComposer";

const noop = () => () => {};

/** "Invite someone to your party": write a custom invite (share sheet, text, email, copy), or just copy the link. */
export function InviteLinkBox({ code, theme = "calm", inviterName, prominent = false }: { code: string; theme?: "calm" | "adventure"; inviterName?: string | null; /** Top of the Guild Hall: a gilded banner. */ prominent?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [composing, setComposing] = useState(false);
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

  const gold = { background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" };
  const composer = composing && <InviteComposer url={url} inviterName={inviterName ?? null} canShare={canShare} theme={theme} onClose={() => setComposing(false)} />;

  if (prominent)
    return (
      <section
        className="relative flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3.5"
        style={{ background: "linear-gradient(180deg, rgba(58,44,16,.95), rgba(30,22,8,.95))", border: "2px solid #d9b45f", boxShadow: "0 0 22px rgba(242,210,126,.25), inset 0 1px 0 rgba(255,235,180,.2)" }}
      >
        <InviteSeal />
        <span className="min-w-[11rem] flex-1">
          <span className={`block ${isAdventure ? "font-display text-[20px]" : "text-[17px] font-bold"}`} style={{ color: "#f6dc8e" }}>
            Invite to your party
          </span>
          <span className="block text-[13.5px] leading-snug" style={{ color: "rgba(246,236,210,.85)" }}>
            Write a note with your link. They sign in with Google and join your party.
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => setComposing(true)} className="hover-glow h-11 rounded-full px-5 text-[15px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1.5px solid #4a3913" }}>
            Write an invite
          </button>
          <button type="button" onClick={copy} className="hover-glow h-11 rounded-full px-5 text-[15px] font-bold" style={{ border: "1.5px solid #d9b45f", color: "#f6ecd2" }}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </span>
        {composer}
      </section>
    );

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
        <button type="button" onClick={() => setComposing(true)} className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold" style={gold}>
          Write an invite
        </button>
        <button
          type="button"
          onClick={copy}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold"
          style={{ border: `1.5px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, color: "var(--t-ink)" }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <code className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--t-ink-soft)" }} title={url}>
          {url.replace(/^https?:\/\//, "")}
        </code>
      </div>
      {composer}
    </section>
  );
}

/** A gilded medallion holding a sealed invitation, with a soft glow and a few sparkles. */
function InviteSeal() {
  return (
    <span aria-hidden className="relative flex h-14 w-14 shrink-0 items-center justify-center" style={{ filter: "drop-shadow(0 0 8px rgba(242,210,126,.45)) drop-shadow(0 3px 5px rgba(0,0,0,.45))" }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <defs>
          <radialGradient id="inv-gold" cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="#fff2c2" />
            <stop offset=".45" stopColor="#e2bf63" />
            <stop offset="1" stopColor="#8a6116" />
          </radialGradient>
          <radialGradient id="inv-wax" cx="38%" cy="32%" r="70%">
            <stop offset="0" stopColor="#e0654a" />
            <stop offset=".6" stopColor="#a8301f" />
            <stop offset="1" stopColor="#6e1a10" />
          </radialGradient>
          <linearGradient id="inv-paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbf3dc" />
            <stop offset="1" stopColor="#e6d2a4" />
          </linearGradient>
        </defs>
        {/* Medallion */}
        <circle cx="28" cy="28" r="25" fill="url(#inv-gold)" stroke="#4a3913" strokeWidth="1.6" />
        <circle cx="28" cy="28" r="21" fill="#2a2010" stroke="#f6dc8e" strokeOpacity=".55" strokeWidth="1" />
        {/* Envelope */}
        <rect x="14.5" y="19" width="27" height="19" rx="2.2" fill="url(#inv-paper)" stroke="#8a6c2c" strokeWidth="1.1" />
        <path d="M15 20l13 10 13-10" stroke="#8a6c2c" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
        <path d="M15 37.3l9.5-8M41 37.3l-9.5-8" stroke="#b39a6a" strokeWidth=".9" />
        {/* Wax seal */}
        <circle cx="28" cy="30.5" r="5" fill="url(#inv-wax)" stroke="#5a160d" strokeWidth=".8" />
        <path d="M28 27.8l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" fill="#f6dc8e" />
        {/* Sparkles */}
        <path d="M44 10.5c.3 2.2 1.3 3.2 3.5 3.5-2.2.3-3.2 1.3-3.5 3.5-.3-2.2-1.3-3.2-3.5-3.5 2.2-.3 3.2-1.3 3.5-3.5z" fill="#fff6d8" />
        <path d="M11 40c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z" fill="#fff6d8" opacity=".85" />
      </svg>
    </span>
  );
}
