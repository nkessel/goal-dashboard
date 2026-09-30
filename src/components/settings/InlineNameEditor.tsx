"use client";

import { useRef, useState, useTransition } from "react";
import { updateProfileNameAction } from "@/app/actions";

/** The character name in the Settings header — click it to rename in place. */
export function InlineNameEditor({ initialName, isAdventure }: { initialName: string; isAdventure: boolean }) {
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function start() {
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (!trimmed || trimmed === name) return;
    const prev = name;
    setName(trimmed);
    setError(null);
    startSaving(async () => {
      try {
        await updateProfileNameAction(trimmed);
      } catch (e) {
        setName(prev);
        setError(e instanceof Error ? e.message : "Couldn't save your name.");
      }
    });
  }

  const textCls = `text-lg font-semibold ${isAdventure ? "font-display" : ""}`;

  return (
    <div className="mt-2 flex flex-col items-center">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          maxLength={40}
          aria-label="Character name"
          className={`${textCls} w-60 rounded-lg border px-2 py-0.5 text-center`}
          style={{
            color: "var(--t-ink)",
            background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
            borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={start}
          title="Click to rename"
          className={`${textCls} group flex items-center gap-1.5 rounded-lg px-2 py-0.5 hover:bg-black/5`}
          style={{ color: "var(--t-ink)", opacity: isSaving ? 0.6 : 1 }}
        >
          {name}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
          >
            <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {error && (
        <span className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
