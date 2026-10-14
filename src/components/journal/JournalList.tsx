"use client";

import { useState, useTransition } from "react";
import { deleteJournalEntryAction } from "@/app/actions";

type Entry = { id: string; body: string; mood: number | null; created_at: string };
const FACES = ["", "😞", "🙁", "😐", "🙂", "😄"];

/** Entries newest first, grouped by day. */
export function JournalList({ entries, isAdventure }: { entries: Entry[] | null; isAdventure: boolean }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (entries === null) {
    return (
      <p className="text-sm" style={{ color: "var(--t-cream)" }}>
        The journal needs a quick database update before it can save entries.
      </p>
    );
  }
  const shown = entries.filter((e) => !hidden.has(e.id));
  if (shown.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-2 rounded-2xl px-5 py-8 text-center ${isAdventure ? "parchment" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)" }}>
        <span className="text-3xl" aria-hidden>
          ✒️
        </span>
        <p className="m-0 text-[15px]" style={{ color: "var(--t-ink)" }}>
          Nothing written yet. Tap + to write your first entry.
        </p>
      </div>
    );
  }

  const groups: { day: string; items: Entry[] }[] = [];
  for (const e of shown) {
    const day = new Date(e.created_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(e);
    else groups.push({ day, items: [e] });
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.day} className="flex flex-col gap-2">
          <h2 className={`m-0 text-[15px] ${isAdventure ? "font-display" : "font-semibold"}`} style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)" }}>
            {g.day}
          </h2>
          {g.items.map((e) => (
            <article key={e.id} className={`group relative flex flex-col gap-1.5 rounded-2xl px-4 py-3 ${isAdventure ? "parchment" : ""}`} style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}>
              <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                {e.mood && (
                  <span className="text-[17px] leading-none" aria-label={`Mood ${e.mood} of 5`}>
                    {FACES[e.mood]}
                  </span>
                )}
                <span>{new Date(e.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                {confirming === e.id ? (
                  <span className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setHidden((h) => new Set(h).add(e.id));
                        setConfirming(null);
                        startTransition(() => deleteJournalEntryAction(e.id));
                      }}
                      className="rounded-full px-2.5 py-1 font-semibold"
                      style={{ background: "var(--t-warn)", color: "#fff" }}
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(e.id)} aria-label="Delete entry" className="ml-auto h-7 w-7 text-[16px] opacity-60 hover:opacity-100">
                    ×
                  </button>
                )}
              </div>
              <p className="m-0 whitespace-pre-wrap text-[15.5px] leading-relaxed" style={{ color: "var(--t-ink)" }}>
                {e.body}
              </p>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
