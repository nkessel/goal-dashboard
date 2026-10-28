"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

const DRAFT_KEY = "invite-draft";

/** Ready-made invites to start from; {name} becomes your first name. */
const STARTERS: { key: string; label: string; text: (name: string | null) => string }[] = [
  {
    key: "warm",
    label: "Warm",
    text: (n) => `Hey! ${n ? `It's ${n}. ` : ""}I've been using Goal Dashboard to keep up with my goals, and I'd love to have you in my party. We can cheer each other on and see each other's wins. Join me?`,
  },
  {
    key: "quest",
    label: "Quest call",
    text: (n) => `Hail, friend! ${n ? `${n} seeks` : "I seek"} a companion for the road ahead. Join my party on Goal Dashboard, take on quests beside me, and let's celebrate every victory together. ⚔️`,
  },
  {
    key: "accountability",
    label: "Keep me going",
    text: () => `I'm working on some big goals and could use a friend to keep me honest. Would you join my party on Goal Dashboard? We'd see each other's progress and can send a cheer when one of us needs it.`,
  },
  {
    key: "short",
    label: "Short",
    text: () => `Join my party on Goal Dashboard? 🌟`,
  },
];

function readDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function saveDraft(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, text);
  } catch {
    /* private window: the draft just isn't kept */
  }
}

/**
 * "Write an invite": a parchment popup with a pre-filled message you can
 * change, a few starters to pick from, and ways to send it (share sheet,
 * text, email, copy). The invite link always rides along at the end.
 */
export function InviteComposer({ url, inviterName, canShare, theme, onClose }: { url: string; inviterName: string | null; canShare: boolean; theme: "calm" | "adventure"; onClose: () => void }) {
  const isAdventure = theme === "adventure";
  const [starter, setStarter] = useState<string | null>(() => (readDraft() === null ? STARTERS[0].key : null));
  const [text, setText] = useState(() => readDraft() ?? STARTERS[0].text(inviterName));
  const [copied, setCopied] = useState(false);
  const full = `${text.trim()}\n\n${url}`;
  const subject = `${inviterName ? `${inviterName} invited you` : "You're invited"} to join a party on Goal Dashboard`;

  function edit(next: string) {
    setText(next);
    setStarter(null);
    saveDraft(next);
  }

  function pick(key: string) {
    const s = STARTERS.find((x) => x.key === key)!;
    setText(s.text(inviterName));
    setStarter(key);
    saveDraft(null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the message stays in the box to copy by hand */
    }
  }

  async function share() {
    try {
      await navigator.share({ title: subject, text: text.trim(), url });
    } catch {
      /* closed the share sheet */
    }
  }

  const goldBtn = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1.5px solid #4a3913" };
  const outlineBtn = { border: `1.5px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, color: "var(--t-ink)", background: "rgba(255,255,255,.35)" };

  return (
    <BottomSheet onClose={onClose} theme={theme}>
      {(close) => (
        <div role="dialog" aria-modal="true" aria-labelledby="invite-composer-title" className="relative z-[1] flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- painted party banner */}
            <img src="/design/ui-party.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" />
            <h2 id="invite-composer-title" className={`m-0 min-w-0 flex-1 ${isAdventure ? "font-display text-[21px]" : "text-[17px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
              Write your invite
            </h2>
            <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
              ×
            </button>
          </div>

          <div role="radiogroup" aria-label="Start from" className="flex flex-wrap gap-1.5">
            {STARTERS.map((s) => {
              const on = s.key === starter;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(s.key)}
                  className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
                  style={on ? { background: "rgba(217,180,95,.45)", border: "1.5px solid #8a6116", color: "var(--t-ink)" } : { border: "1px solid rgba(139,112,64,.35)", color: "var(--t-ink)" }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
              Your message (change anything)
            </span>
            <textarea
              value={text}
              onChange={(e) => edit(e.target.value.slice(0, 1000))}
              rows={5}
              className="rounded-xl border px-3 py-2.5 text-[15.5px] leading-snug"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)", resize: "vertical" }}
            />
          </label>

          <p className="m-0 flex min-w-0 items-center gap-1.5 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
            <span className="shrink-0">Your link goes at the end:</span>
            <code className="min-w-0 truncate" title={url}>
              {url.replace(/^https?:\/\//, "")}
            </code>
          </p>

          <div className="flex flex-wrap gap-2">
            {canShare && (
              <button type="button" onClick={share} disabled={!text.trim()} className="hover-glow h-11 flex-1 rounded-full px-5 text-[15px] font-bold disabled:opacity-60" style={goldBtn}>
                Share…
              </button>
            )}
            <button type="button" onClick={copy} disabled={!text.trim()} className="hover-glow h-11 flex-1 rounded-full px-5 text-[15px] font-bold disabled:opacity-60" style={canShare ? outlineBtn : goldBtn}>
              {copied ? "Copied ✓" : "Copy message"}
            </button>
          </div>
          <div className="flex gap-2">
            <a href={`sms:?&body=${encodeURIComponent(full)}`} className="hover-glow flex h-10 flex-1 items-center justify-center rounded-full text-[14.5px] font-semibold no-underline" style={outlineBtn}>
              Text
            </a>
            <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(full)}`} className="hover-glow flex h-10 flex-1 items-center justify-center rounded-full text-[14.5px] font-semibold no-underline" style={outlineBtn}>
              Email
            </a>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
