"use client";

import { useState, useTransition } from "react";
import { updateProfileNameAction } from "@/app/actions";

/** Editable "character name" shown atop Settings, on the Friend Feed, and in
 * comments. Lives on the avatar editor page since it's part of how your
 * character presents, alongside the portrait. */
export function NameEditor({
  initialName,
  theme = "calm",
}: {
  initialName: string | null;
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";
  const [name, setName] = useState(initialName ?? "");
  const [isSaving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== (initialName ?? "").trim() && name.trim().length > 0;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    startSaving(async () => {
      try {
        await updateProfileNameAction(trimmed);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your name.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--t-ink)" }}>
        Character name
      </label>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="Your name"
          maxLength={40}
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
          style={{
            background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
            borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
            color: "var(--t-ink)",
          }}
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{
              background: isAdventure ? "var(--t-gold)" : "var(--t-accent)",
              color: isAdventure ? "#2a1c10" : "#fff",
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {error && (
        <span className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </span>
      )}
      {saved && !error && (
        <span className="text-xs" style={{ color: "var(--t-good)" }}>
          Saved ✓
        </span>
      )}
    </div>
  );
}
