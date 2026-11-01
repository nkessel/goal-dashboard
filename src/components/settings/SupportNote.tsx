"use client";

import { useState, useTransition } from "react";
import { saveSupportNoteAction } from "@/app/actions";

/** "How to support me": a few lines your party sees on your profile. Saves when you leave the box. */
export function SupportNote({ support = "" }: { support?: string }) {
  const [note, setNote] = useState(support);
  const [noteSaved, setNoteSaved] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
      <label className="flex w-full flex-col gap-1 text-left">
        <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--t-ink)" }}>
          How to support me
          {noteSaved && <span className="text-xs font-normal" style={{ color: "var(--t-ink-soft)" }}>{noteSaved === "saving" ? "Saving…" : "Saved ✓"}</span>}
        </span>
        <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
          A few words your party sees on your profile: what helps, what doesn&rsquo;t.
        </span>
        <textarea
          value={note}
          onChange={(e) => (setNote(e.target.value.slice(0, 600)), setNoteSaved(""))}
          onBlur={() => {
            if (note.trim() === support.trim() && !noteSaved) return;
            setNoteSaved("saving");
            startTransition(async () => {
              try {
                await saveSupportNoteAction(note);
                setNoteSaved("saved");
              } catch (e) {
                setNoteSaved("");
                setError(e instanceof Error ? e.message : "Couldn't save that.");
              }
            });
          }}
          rows={3}
          placeholder="e.g. Check in on me midweek. Body doubling helps. Ask about my music."
          className="w-full resize-y rounded-lg border px-2.5 py-1.5 text-[16px] leading-snug"
          style={{ background: "rgba(255,250,238,.6)", borderColor: "rgba(139,112,64,.35)", color: "var(--t-ink)" }}
        />
        {error && (
          <span className="text-xs" style={{ color: "var(--t-warn)" }}>
            {error}
          </span>
        )}
      </label>
  );
}
