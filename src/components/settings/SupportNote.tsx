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

/** In the Guild Hall: a "How to support me" button that opens the note right there. */
export function SupportButton({ support = "", isAdventure }: { support?: string; isAdventure: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover-glow flex h-10 items-center gap-1.5 rounded-full px-5 text-[15px] font-semibold"
        style={isAdventure ? { background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", color: "#2a1c10", border: "1px solid #8a6116" } : { background: "var(--t-accent)", color: "#fff" }}
      >
        <span aria-hidden>💛</span> How to support me
      </button>
      <div className="drawer-body w-full" data-open={open ? "true" : "false"}>
        <div className="drawer-inner" inert={!open}>
          <div className={`rounded-2xl p-4 ${isAdventure ? "parchment" : ""}`} style={{ ["--t-ink" as string]: "#2a1c10", ["--t-ink-soft" as string]: "#6b5a3a", ...(isAdventure ? {} : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }) }}>
            <SupportNote support={support} />
          </div>
        </div>
      </div>
    </div>
  );
}
