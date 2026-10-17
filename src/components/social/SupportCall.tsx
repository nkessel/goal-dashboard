"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { callForSupportAction } from "@/app/actions";

const KINDS = [
  { key: "encouragement", label: "Encouragement", hint: "A kind word to keep going" },
  { key: "accountability", label: "Accountability", hint: "Someone to check in on you" },
  { key: "help", label: "A hand", hint: "Help with something specific" },
] as const;

/** "Call for support": tell your party what you need; it opens a Party thread for replies. */
export function SupportCall({ partySize, isAdventure }: { partySize: number; isAdventure: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("encouragement");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const id = await callForSupportAction(kind, msg);
        setOpen(false);
        setMsg("");
        router.push(`/feed/forum/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send that.");
      }
    });
  }
  return (
    <section className={`flex flex-col gap-2 rounded-2xl px-4 py-3 ${isAdventure ? "parchment parchment-framed" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
      <div className="relative z-[1] flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className={`block ${isAdventure ? "font-display text-[18px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
            Need your party?
          </span>
          <span className="block text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            {partySize ? `Let your ${partySize === 1 ? "party member" : `${partySize} party members`} know.` : "Invite friends to your party first."}
          </span>
        </span>
        <button
          type="button"
          disabled={!partySize}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="hover-glow flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold disabled:opacity-50"
          style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
        >
          <span aria-hidden>🔔</span> Call for support
        </button>
      </div>
      {open && (
        <div className="reveal relative z-[1] flex flex-col gap-2 pt-1">
          <div role="radiogroup" aria-label="What you need" className="grid grid-cols-3 gap-1.5">
            {KINDS.map((k) => {
              const on = k.key === kind;
              return (
                <button
                  key={k.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setKind(k.key)}
                  className="flex min-h-[52px] flex-col items-start justify-center rounded-xl px-2.5 py-1.5 text-left"
                  style={on ? { background: "rgba(217,180,95,.45)", border: "1.5px solid #8a6116", color: "var(--t-ink)" } : { border: "1px solid rgba(139,112,64,.35)", color: "var(--t-ink)" }}
                >
                  <span className="text-[13.5px] font-bold leading-tight">{k.label}</span>
                  <span className="text-[11.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                    {k.hint}
                  </span>
                </button>
              );
            })}
          </div>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="What's going on? (optional)"
            className="rounded-lg border px-3 py-2 text-[15px]"
            style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "var(--t-ink)" }}
          />
          {error && (
            <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <button type="button" onClick={send} disabled={pending} className="h-10 self-end rounded-full px-5 text-[14.5px] font-bold disabled:opacity-60" style={{ background: "#2a1c10", color: "#f2d27e" }}>
            {pending ? "Sending…" : "Send to my party"}
          </button>
        </div>
      )}
    </section>
  );
}
