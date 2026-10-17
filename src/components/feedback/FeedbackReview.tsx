"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { editFeedbackAction, reviewFeedbackAction } from "@/app/actions";

type Status = "global" | "personal" | "later" | "skipped";
type Item = {
  id: string;
  body: string;
  edited_body: string | null;
  kind: string;
  created_at: string;
  review_status: Status | null;
  author: { id: string; name: string | null; avatar: string | null };
};

const TABS: { key: "new" | "planned" | "later" | "skipped"; label: string; match: (s: Status | null) => boolean }[] = [
  { key: "new", label: "New", match: (s) => s === null },
  { key: "planned", label: "Planned", match: (s) => s === "global" || s === "personal" },
  { key: "later", label: "Saved for later", match: (s) => s === "later" },
  { key: "skipped", label: "Skipped", match: (s) => s === "skipped" },
];

const WHERE: Record<string, string> = { feedback: "Next update", refill: "When credits refill", future: "Future idea" };

const DONE_LABEL: Record<Status, (name: string) => string> = {
  global: () => "Planned for everyone",
  personal: (name) => `Planned just for ${name}`,
  later: () => "Saved for later",
  skipped: () => "Skipped",
};

const noop = () => () => {};

function when(iso: string, now: number) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * One card per note: who sent it, where they meant it to go, and four
 * choices. A decision moves the note to its tab; any decision can be changed.
 */
export function FeedbackReview({ items, theme }: { items: Item[]; theme: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const [local, setLocal] = useState<Record<string, Status | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const textOf = (it: Item) => (it.id in edits ? edits[it.id] : it.edited_body);
  function saveEdit(it: Item, text: string | null) {
    const v = text && text.trim() && text.trim() !== it.body ? text.trim() : null;
    setEditing(null);
    setEdits((e) => ({ ...e, [it.id]: v }));
    startTransition(async () => {
      try {
        await editFeedbackAction(it.id, v);
      } catch (err) {
        setEdits((e) => {
          const x = { ...e };
          delete x[it.id];
          return x;
        });
        setError(err instanceof Error ? err.message : "Couldn't save that edit.");
      }
    });
  }
  const [, startTransition] = useTransition();
  const now = useSyncExternalStore(noop, () => Math.floor(Date.now() / 60_000) * 60_000, () => null);

  const statusOf = (it: Item) => (it.id in local ? local[it.id] : it.review_status);
  const active = TABS.find((t) => t.key === tab)!;
  const shown = items.filter((it) => active.match(statusOf(it)));

  function decide(it: Item, status: Status | null) {
    const before = statusOf(it);
    setError(null);
    setLocal((l) => ({ ...l, [it.id]: status }));
    startTransition(async () => {
      try {
        await reviewFeedbackAction(it.id, status);
      } catch (e) {
        setLocal((l) => ({ ...l, [it.id]: before }));
        setError(e instanceof Error ? e.message : "Couldn't save that decision.");
      }
    });
  }

  const card = isAdventure ? "parchment parchment-framed" : "";
  const cardStyle = isAdventure ? { borderRadius: 18 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderRadius: 18 };

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Feedback by decision" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const n = items.filter((it) => t.match(statusOf(it))).length;
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.key)}
              className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold"
              style={{
                background: on ? (isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)") : isAdventure ? "rgba(14,18,10,.45)" : "var(--t-card)",
                color: on ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-cream)" : "var(--t-ink)",
                border: `1.5px solid ${on ? (isAdventure ? "#8a6116" : "transparent") : isAdventure ? "rgba(217,180,95,.35)" : "var(--t-card-border)"}`,
              }}
            >
              {t.label}
              {n > 0 && <span className="tabular-nums opacity-75">{n}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="m-0 rounded-lg px-3 py-2 text-[14px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className={`m-0 rounded-2xl px-5 py-6 text-center text-[15.5px] ${card}`} style={{ ...cardStyle, color: "var(--t-ink-soft)" }}>
          {tab === "new"
            ? items.length === 0
              ? "No feedback from your party yet. When someone in your party uses the feedback button, their notes land here."
              : "All caught up. New notes from your party land here."
            : "Nothing here."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {shown.map((it) => {
            const status = statusOf(it);
            const name = it.author.name?.split(" ")[0] || "them";
            return (
              <li key={it.id} className={`relative flex flex-col gap-3 px-4 py-3.5 ${card}`} style={cardStyle}>
                <div className="relative z-[1] flex items-center gap-2.5">
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
                    {it.author.avatar && (
                      // eslint-disable-next-line @next/next/no-img-element -- profile portrait
                      <img src={it.author.avatar} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                      {it.author.name ?? "Someone"}
                    </span>
                    <span className="block text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                      {WHERE[it.kind] ?? "Feedback"}
                      {now !== null && ` · ${when(it.created_at, now)}`}
                    </span>
                  </span>
                </div>
                {editing === it.id ? (
                  <div className="relative z-[1] flex flex-col gap-2">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 60)))}
                      aria-label="Edit this feedback"
                      className="rounded-lg border px-3 py-2 text-[16px] leading-relaxed"
                      style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(null);
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(it, draft);
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => saveEdit(it, draft)} className="h-9 rounded-full px-4 text-[14px] font-bold" style={{ background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", border: isAdventure ? "1.5px solid #8a6116" : undefined, color: isAdventure ? "#2a1c10" : "#fff" }}>
                        Save edit
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="h-9 rounded-full px-3 text-[14px] hover:bg-black/[.06]" style={{ color: "var(--t-ink)" }}>
                        Cancel
                      </button>
                      {textOf(it) && (
                        <button type="button" onClick={() => saveEdit(it, null)} className="ml-auto text-[13.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
                          Use their original words
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-[1] flex flex-col gap-1">
                    <p className="m-0 whitespace-pre-line text-[16px] leading-relaxed" style={{ color: "var(--t-ink)" }}>
                      {textOf(it) ?? it.body}
                    </p>
                    <span className="flex flex-wrap items-center gap-x-3 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(textOf(it) ?? it.body);
                          setEditing(it.id);
                        }}
                        className="flex items-center gap-1 underline underline-offset-2"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                        Edit before deciding
                      </button>
                      {textOf(it) && (
                        <button
                          type="button"
                          onClick={() => setShowOriginal((o) => { const x = new Set(o); if (x.has(it.id)) x.delete(it.id); else x.add(it.id); return x; })}
                          className="underline underline-offset-2"
                        >
                          {showOriginal.has(it.id) ? "Hide" : "Edited · show"} their original
                        </button>
                      )}
                    </span>
                    {textOf(it) && showOriginal.has(it.id) && (
                      <p className="m-0 whitespace-pre-line border-l-2 pl-2.5 text-[14px] italic" style={{ borderColor: "rgba(139,112,64,.4)", color: "var(--t-ink-soft)" }}>
                        {it.body}
                      </p>
                    )}
                  </div>
                )}

                {status ? (
                  <div className="relative z-[1] flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="rounded-full px-3 py-1 font-semibold" style={{ background: status === "skipped" ? "rgba(70,50,20,.1)" : "rgba(217,180,95,.4)", color: "var(--t-ink)" }}>
                      {DONE_LABEL[status](name)}
                    </span>
                    <button type="button" onClick={() => decide(it, null)} className="underline" style={{ color: "var(--t-ink-soft)" }}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div role="group" aria-label="Decide" className="relative z-[1] grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Choice primary isAdventure={isAdventure} onClick={() => decide(it, "global")} label="For everyone" hint="Build it into the app" />
                    <Choice isAdventure={isAdventure} onClick={() => decide(it, "personal")} label={`Just for ${name}`} hint="Only on their account" />
                    <Choice isAdventure={isAdventure} onClick={() => decide(it, "later")} label="Save for later" hint="Keep it in mind" />
                    <Choice isAdventure={isAdventure} quiet onClick={() => decide(it, "skipped")} label="Skip" hint="Not planned" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Choice({ label, hint, primary = false, quiet = false, isAdventure, onClick }: { label: string; hint: string; primary?: boolean; quiet?: boolean; isAdventure: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover-glow flex min-h-[52px] flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left"
      style={
        primary
          ? { background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", border: `1.5px solid ${isAdventure ? "#8a6116" : "transparent"}` }
          : { background: quiet ? "transparent" : "rgba(70,50,20,.07)", color: "var(--t-ink)", border: `1.5px solid ${quiet ? "rgba(70,50,20,.18)" : "transparent"}` }
      }
    >
      <span className="text-[14px] font-semibold leading-tight">{label}</span>
      <span className="text-[12px] leading-snug" style={{ opacity: 0.75 }}>
        {hint}
      </span>
    </button>
  );
}
