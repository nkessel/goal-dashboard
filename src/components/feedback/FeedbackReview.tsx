"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { reviewFeedbackAction } from "@/app/actions";

type Status = "global" | "personal" | "later" | "skipped";
type Item = {
  id: string;
  body: string;
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
                <p className="relative z-[1] m-0 whitespace-pre-line text-[16px] leading-relaxed" style={{ color: "var(--t-ink)" }}>
                  {it.body}
                </p>

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
