"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

const DRAFT_KEY = "invite-draft";

/** Ready-made invites to start from, a few wordings per theme; {name} becomes your first name. */
type Name = string | null;
const STARTERS: { key: string; label: string; texts: ((name: Name) => string)[] }[] = [
  {
    key: "warm",
    label: "Warm",
    texts: [
      (n) => `Hey! ${n ? `It's ${n}. ` : ""}I've been using Goal Dashboard to keep up with my goals, and I'd love to have you in my party. We can cheer each other on and see each other's wins. Join me?`,
      (n) => `Hi friend! ${n ? `${n} here. ` : ""}I'd love to share my goals with you, and hear about yours. Come join my party on Goal Dashboard so we can root for each other?`,
      () => `Thinking of you! I've started tracking my goals on Goal Dashboard and it would mean a lot to have you along. Want to join my party?`,
      () => `You're one of the people I'd most like in my corner. Join my little party on Goal Dashboard? We'll see each other's wins and send cheers along the way.`,
    ],
  },
  {
    key: "quest",
    label: "Quest call",
    texts: [
      (n) => `Hail, friend! ${n ? `${n} seeks` : "I seek"} a companion for the road ahead. Join my party on Goal Dashboard, take on quests beside me, and let's celebrate every victory together. ⚔️`,
      () => `A quest awaits, and no hero travels alone. Will you join my party on Goal Dashboard? Dragons to slay, treasures to claim, victories to cheer. 🐉`,
      (n) => `By lantern and by map, ${n ? `${n} calls` : "I call"} you to adventure! Join my party on Goal Dashboard and let's level up together. 🗺️`,
      () => `The tavern's warm and the quest board is full. Pull up a chair and join my party on Goal Dashboard, adventurer? 🍻`,
    ],
  },
  {
    key: "accountability",
    label: "Keep me going",
    texts: [
      () => `I'm working on some big goals and could use a friend to keep me honest. Would you join my party on Goal Dashboard? We'd see each other's progress and can send a cheer when one of us needs it.`,
      () => `I do better with a buddy. Would you be my accountability partner on Goal Dashboard? We'll see each other's progress and nudge each other along.`,
      () => `Small steps, every day, is my plan. Would you join my party on Goal Dashboard to help me keep going (and let me cheer you on too)?`,
      () => `Want to keep each other on track? Join my party on Goal Dashboard: we'll see each other's streaks and wins, no pressure, just support.`,
    ],
  },
  {
    key: "grow",
    label: "Grow together",
    texts: [
      () => `I'd love for us to grow together. Join my party on Goal Dashboard and let's set some intentions, take small steps and celebrate how far we come. 🌱`,
      () => `What would you love to make happen this season? Let's do it side by side: join my party on Goal Dashboard. 🌿`,
      () => `Growth is better shared. Come be part of my party on Goal Dashboard, and we'll water each other's goals. 🌻`,
      () => `Let's become who we're becoming, together. Join my party on Goal Dashboard? 🌱`,
    ],
  },
  {
    key: "playful",
    label: "Playful",
    texts: [
      () => `Psst. I turned my to-do list into a game and it's weirdly working. Want to play with me? Join my party on Goal Dashboard. 🎲`,
      () => `New multiplayer game unlocked: real life. Join my party on Goal Dashboard and let's rack up some XP. 🎮`,
      () => `I'm collecting XP for doing the dishes now. Come join my party on Goal Dashboard and judge me (lovingly). 😄`,
      () => `Level up with me? Goal Dashboard turns goals into quests, and I need a party. 🏆`,
    ],
  },
  {
    key: "short",
    label: "Short",
    texts: [() => `Join my party on Goal Dashboard? 🌟`, () => `Quest with me? 🗡️`, () => `Come cheer me on (and let me cheer you)! 🎉`, () => `Join my party? ✨`],
  },
];

const PICKS_KEY = "invite-theme-picks";
/** The wording you last ended on for each theme: it opens on that one next time. */
function readPicks(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(PICKS_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function savePick(key: string, i: number) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify({ ...readPicks(), [key]: i }));
  } catch {
    /* not kept in a private window */
  }
}
const textOf = (key: string, i: number, name: Name) => {
  const s = STARTERS.find((x) => x.key === key)!;
  return s.texts[((i % s.texts.length) + s.texts.length) % s.texts.length](name);
};

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
  const [text, setText] = useState(() => readDraft() ?? textOf(STARTERS[0].key, readPicks()[STARTERS[0].key] ?? 0, inviterName));
  // Which wording of the theme is showing, and the ones before it (to go back to).
  const [variant, setVariant] = useState(() => readPicks()[STARTERS[0].key] ?? 0);
  const [history, setHistory] = useState<number[]>([]);
  const [copied, setCopied] = useState(false);
  const full = `${text.trim()}\n\n${url}`;
  const subject = `${inviterName ? `${inviterName} invited you` : "You're invited"} to join a party on Goal Dashboard`;

  function edit(next: string) {
    setText(next);
    setStarter(null);
    saveDraft(next);
  }

  function pick(key: string) {
    const i = readPicks()[key] ?? 0;
    setText(textOf(key, i, inviterName));
    setStarter(key);
    setVariant(i);
    setHistory([]);
    saveDraft(null);
  }

  /** A new wording for the chosen theme (the one you end on becomes that theme's default). */
  function another() {
    const key = starter ?? STARTERS[0].key;
    const n = STARTERS.find((x) => x.key === key)!.texts.length;
    const i = (variant + 1) % n;
    setHistory((h) => [...h, variant]);
    show(key, i);
  }
  function back() {
    const key = starter ?? STARTERS[0].key;
    const prev = history[history.length - 1];
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    show(key, prev);
  }
  function show(key: string, i: number) {
    setText(textOf(key, i, inviterName));
    setStarter(key);
    setVariant(i);
    savePick(key, i);
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

          <div className="flex flex-col gap-1">
            <label htmlFor="invite-text" className="text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
              Your message (change anything)
            </label>
            <div className="relative">
              <textarea
                id="invite-text"
                value={text}
                onChange={(e) => edit(e.target.value.slice(0, 1000))}
                rows={5}
                className="block w-full rounded-xl border py-2.5 pl-3 pr-12 text-[15.5px] leading-snug"
                style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)", resize: "vertical" }}
              />
              {/* Top right: another wording for this theme, and back to the one before. */}
              <span className="absolute right-1.5 top-1.5 flex flex-col gap-1">
                <button type="button" onClick={another} aria-label="Another wording for this theme" title="Another wording" className="hover-glow flex h-9 w-9 items-center justify-center rounded-full" style={goldBtn}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
                    <path d="M19.8 3.8v4.6h-4.6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {history.length > 0 && (
                  <button type="button" onClick={back} aria-label="Back to the wording before" title="Undo" className="fade-in flex h-9 w-9 items-center justify-center rounded-full" style={outlineBtn}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M9 7H4.5V2.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4.8 7A8 8 0 1 1 4 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </span>
            </div>
          </div>

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
