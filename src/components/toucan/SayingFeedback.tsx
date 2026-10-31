"use client";

import { useState } from "react";

const REASONS = ["Not relevant to me", "Too pushy", "Wrong time of day", "Wording feels off", "Heard it too often"];

/** A small speech-bubble button beside the thumbs: say more about this line. */
export function NoteButton({ on, onClick, label = "Custom feedback", text = false }: { on: boolean; onClick: () => void; label?: string; /** Show its name beside the icon ("Custom feedback"). */ text?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`relative flex h-7 items-center justify-center gap-1 rounded-full transition-opacity before:absolute before:-inset-2 before:content-[''] hover:opacity-100 ${text ? "px-2 text-[11.5px] font-semibold" : "w-7"} ${on ? "opacity-100" : text ? "opacity-75" : "opacity-45"}`}
      style={{ background: on ? "rgba(217,180,95,.25)" : "transparent" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 5.5h16v10H10l-4.5 3.5V15.5H4z" stroke="#8a6116" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 9.5h8M8 12.5h5" stroke="#8a6116" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {text && <span style={{ color: "#8a6116" }}>Custom feedback</span>}
    </button>
  );
}

/**
 * Why (after a thumbs down), or anything else to say about a line the toucan
 * said: a few quick reasons and your own words. It goes into the app's
 * feedback, so the lines can be made better.
 */
export function WhyBox({ saying, source, down, onDone }: { saying: string; source: string; down: boolean; onDone: (sent: boolean) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  async function send() {
    if (!picked.length && !text.trim()) return onDone(false);
    setSending(true);
    setError(false);
    try {
      const body = `${down ? "👎" : "💬"} ${source}: "${saying}"${picked.length ? `\nWhy: ${picked.join("; ")}` : ""}${text.trim() ? `\n${text.trim()}` : ""}`;
      const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, kind: "feedback", xp: 1, page: window.location.pathname }) });
      if (!r.ok) throw new Error();
      onDone(true);
    } catch {
      setError(true);
      setSending(false);
    }
  }
  return (
    <div className="reveal mt-1.5 flex w-full flex-col gap-1.5 text-left" onClick={(e) => e.stopPropagation()}>
      <span className="text-[12.5px] font-semibold" style={{ color: "#5a4420" }}>
        {down ? "What didn't sit right?" : "What would make it better?"}
      </span>
      {down && (
        <span className="flex flex-wrap gap-1">
          {REASONS.map((r) => {
            const on = picked.includes(r);
            return (
              <button key={r} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== r) : [...p, r]))} className="h-7 rounded-full px-2.5 text-[12px]" style={on ? { background: "rgba(217,180,95,.5)", border: "1px solid #8a6116", color: "#2a1c10" } : { border: "1px solid rgba(139,112,64,.45)", color: "#3d2f18", background: "rgba(255,250,238,.6)" }}>
                {r}
              </button>
            );
          })}
        </span>
      )}
      <textarea
        autoFocus={!down}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        rows={2}
        maxLength={600}
        placeholder={down ? "Anything else? (optional)" : "e.g. Ask it later in the day, or say it more gently"}
        aria-label="Your words"
        className="w-full resize-none rounded-lg px-2.5 py-1.5 text-[16px] leading-snug"
        style={{ background: "rgba(255,250,238,.92)", border: "1px solid #b39a6a", color: "#2a1c10" }}
      />
      {error && (
        <span className="text-[12px]" style={{ color: "#a33" }}>
          Couldn&rsquo;t send that. Try again?
        </span>
      )}
      <span className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => onDone(false)} className="h-8 rounded-full px-2.5 text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
          {down ? "Skip" : "Cancel"}
        </button>
        <button type="button" data-submit disabled={sending} onClick={() => void send()} className="h-8 rounded-full px-3.5 text-[13px] font-bold disabled:opacity-60" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          {sending ? "…" : "Send"}
        </button>
      </span>
    </div>
  );
}
