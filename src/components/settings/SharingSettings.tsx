"use client";

import { useState, useTransition } from "react";
import { saveSupportNoteAction, setShareSettingsAction } from "@/app/actions";
import { SHARE_SCREENS, shares, type ShareKey, type ShareSettings } from "@/lib/sharing";

/** "What your party can see": one switch per screen. Today is on by default. */
export function SharingSettings({ initial, theme, support = "" }: { initial: ShareSettings; theme: "calm" | "adventure"; /** "How to support me", shown on your profile. */ support?: string }) {
  const [note, setNote] = useState(support);
  const [noteSaved, setNoteSaved] = useState<"" | "saving" | "saved">("");
  const [s, setS] = useState<ShareSettings>(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdventure = theme === "adventure";
  function flip(k: ShareKey) {
    const before = s;
    const next = { ...s, [k]: !shares(s, k) };
    setS(next);
    setError(null);
    startTransition(async () => {
      try {
        await setShareSettingsAction({ [k]: !!next[k] });
      } catch (e) {
        setS(before);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="mb-2 flex flex-col gap-1">
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
      </label>
      <p className="m-0 text-sm font-medium" style={{ color: "var(--t-ink)" }}>
        What your party can see
      </p>
      <p className="m-0 mb-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
        Party members can open your profile and see the screens switched on here. Private quests and private boards are never shown.
      </p>
      {SHARE_SCREENS.map((sc) => {
        const on = shares(s, sc.key);
        return (
          <div key={sc.key} className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--t-ink)" }}>
                {sc.label}
              </span>
              <span className="block text-xs" style={{ color: "var(--t-ink-soft)" }}>
                {sc.hint}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`Share ${sc.label} with your party`}
              onClick={() => flip(sc.key)}
              className="relative block h-7 w-12 shrink-0 rounded-full p-0"
              style={{
                background: on ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "rgba(0,0,0,.18)",
                border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              }}
            >
              <span className="absolute left-[2px] top-1/2 h-[22px] w-[22px] rounded-full bg-white shadow transition-transform duration-200" style={{ transform: `translate(${on ? 20 : 0}px, -50%)` }} />
            </button>
          </div>
        );
      })}
      {error && (
        <p className="m-0 text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
