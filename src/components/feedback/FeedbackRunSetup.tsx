"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { coachShipFeedbackAction, saveFeedbackRunTokenAction } from "@/app/actions";

/**
 * Building your feedback from the app: the toucan (or the button here) starts
 * a Claude Code build of your unshipped "Next update" notes. It needs the
 * scheduled task's token, pasted in once.
 */
export function FeedbackRunSetup({ connected, pending, lastAt, lastUrl, requestedAt, theme }: { connected: boolean; pending: number; lastAt: string | null; lastUrl: string | null; requestedAt: string | null; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string | null } | null>(null);
  const [busy, start] = useTransition();
  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";

  function save(value: string) {
    start(async () => {
      try {
        await saveFeedbackRunTokenAction(value);
        setToken("");
        setEditing(false);
        setMsg({ ok: true, text: value ? "Saved. The toucan can start builds now." : "Removed. The toucan can't start builds until you add a token again." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save that." });
      }
    });
  }
  function build() {
    start(async () => {
      try {
        const r = await coachShipFeedbackAction();
        setMsg(
          !r.pending
            ? { ok: true, text: "Nothing new is waiting." }
            : r.queued
              ? { ok: true, text: "Queued ✓ It starts within the hour." }
              : { ok: true, text: r.already ? "A build started a few minutes ago and is still at work." : `Started ✓ ${r.pending} note${r.pending === 1 ? "" : "s"} on the way.`, url: r.url },
        );
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't start the build." });
      }
    });
  }

  const btn = "flex h-9 items-center rounded-full px-3.5 text-[14px] font-semibold disabled:opacity-60";
  const gold = { background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", border: isAdventure ? "1.5px solid #8a6116" : "1.5px solid transparent" };
  const plain = { background: "transparent", color: ink, border: "1.5px solid var(--t-card-border)" };

  return (
    <section
      aria-label="Build your feedback"
      className={`flex flex-col gap-2 px-4 py-3.5 ${isAdventure ? "parchment parchment-framed" : ""}`}
      style={isAdventure ? { borderRadius: 18 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 18 }}
    >
      <div className="flex flex-col leading-tight">
        <span className="text-[16px] font-semibold" style={{ color: ink }}>
          🛠 Build your feedback
        </span>
        <span className="text-[13px]" style={{ color: soft }}>
          {`Tell the toucan "implement my feedback", or press Build now. ${pending ? `${pending} note${pending === 1 ? "" : "s"} waiting.` : "Nothing new waiting."} `}
          {requestedAt
            ? "A build is queued and starts within the hour."
            : connected
              ? lastAt
                ? `Last build started ${new Date(lastAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
                : "Builds start right away."
              : "Builds start within the hour (add a token to start them right away)."}
        </span>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <ol className="m-0 list-decimal pl-5 text-[13px] leading-snug" style={{ color: soft }}>
              <li>
                Open{" "}
                <a href="https://claude.ai/code/routines" target="_blank" rel="noreferrer" className="underline">
                  your scheduled tasks
                </a>{" "}
                and edit <b>Build app feedback (toucan)</b>.
              </li>
              <li>In the Trigger row, press + and choose API, then Generate token (on the web; not in the desktop app).</li>
              <li>Paste the token here.</li>
            </ol>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="sk-ant-…"
              aria-label="Build token"
              className="h-9 min-w-0 flex-1 rounded-full px-3.5 text-[14px]"
              style={{ background: isAdventure ? "rgba(255,250,235,.7)" : "var(--t-bg)", color: ink, border: "1.5px solid var(--t-card-border)" }}
            />
            <button type="button" className={btn} style={gold} disabled={busy || !token.trim()} onClick={() => save(token)}>
              Save
            </button>
            <button type="button" className={btn} style={plain} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} style={gold} disabled={busy || !pending} onClick={build}>
            {busy ? "Starting…" : "Build now"}
          </button>
          {lastUrl && (
            <a href={lastUrl} target="_blank" rel="noreferrer" className={btn} style={plain}>
              Last build
            </a>
          )}
          <button type="button" className={btn} style={plain} onClick={() => setEditing(true)}>
            {connected ? "Change token" : "Add token (optional)"}
          </button>
          {connected && (
            <button type="button" className={btn} style={plain} disabled={busy} onClick={() => save("")}>
              Remove token
            </button>
          )}
        </div>
      )}

      {msg && (
        <span role="status" className="flex flex-wrap gap-2 text-[13px]" style={{ color: msg.ok ? soft : "#9a3b26" }}>
          {msg.text}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noreferrer" className="underline">
              Watch it
            </a>
          )}
        </span>
      )}
    </section>
  );
}
