"use client";

import { useEffect, useState, useTransition } from "react";
import {
  setTaskIconAction,
  generateTaskIconAction,
  listTaskIconLibraryAction,
  pickTaskIconFromLibraryAction,
} from "@/app/actions";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import type { TaskIconLibraryEntry } from "@/lib/data/types";

export function IconPicker({
  taskId,
  currentIcon,
  currentSource,
  taskTitle = "",
  theme = "calm",
  size = 28,
  fallbackEmoji = "➕",
}: {
  taskId: string;
  currentIcon: string | null;
  currentSource: "monster" | "library" | "ai";
  taskTitle?: string;
  theme?: "calm" | "adventure";
  /** Trigger diameter in px — lets a caller use this as the quest card's
   * actual avatar (bigger) rather than only the small "+" badge under it. */
  size?: number;
  /** Shown when there's no icon set yet — pass the card's own placeholder
   * (e.g. "❔"/"✦") so swapping in IconPicker as the avatar itself doesn't
   * change what an icon-less card looks like. */
  fallbackEmoji?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"library" | "ai">("library");
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<TaskIconLibraryEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [aiPrompt, setAiPrompt] = useState(taskTitle);
  const [isGeneratingIcon, startGeneratingIcon] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);

  function generateIcon() {
    setGenError(null);
    startGeneratingIcon(async () => {
      try {
        await generateTaskIconAction(taskId, aiPrompt);
        setOpen(false);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Couldn't generate an icon.");
      }
    });
  }

  useEffect(() => {
    if (tab === "library" && !library) {
      listTaskIconLibraryAction().then(setLibrary);
    }
  }, [tab, library]);

  function pickLibraryEntry(imageUrl: string) {
    startTransition(async () => {
      await pickTaskIconFromLibraryAction(taskId, imageUrl);
      setOpen(false);
    });
  }

  function clear() {
    startTransition(async () => {
      await setTaskIconAction(taskId, null, "monster");
      setOpen(false);
    });
  }

  // "ai" is a freshly-generated-this-click image; "library" is one picked
  // from the shared library (its own generation, or someone else's) — both
  // just hold a plain image URL. "monster" is the old emoji picker's source,
  // kept only so any pre-existing data still renders correctly; nothing in
  // this component lets you choose a new emoji any more.
  const currentImageUrl = currentSource === "ai" || currentSource === "library" ? currentIcon : null;
  const currentEmoji = currentSource === "monster" ? MONSTER_ICONS.find((m) => m.key === currentIcon)?.emoji : null;

  const filteredLibrary =
    library && query.trim()
      ? library.filter((e) => e.prompt?.toLowerCase().includes(query.trim().toLowerCase()))
      : library;

  const tabBtnStyle = (active: boolean) => ({
    background: active ? "var(--t-gold)" : "transparent",
    color: active ? "#2a1c10" : "var(--t-ink-soft)",
  });
  const fieldStyle = {
    borderColor: "var(--t-panel-border)",
    background: "var(--t-panel-2)",
    color: "var(--t-ink)",
  };

  const isAdventure = theme === "adventure";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // don't also trigger a card-level "click to edit"
          setOpen((v) => !v);
        }}
        title="Click to change the avatar"
        className="hover-glow flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.45,
          border: isAdventure ? "2px solid var(--t-panel-border)" : "1.5px dashed var(--t-card-border)",
          background: isAdventure ? undefined : "var(--t-accent-soft)",
          color: "var(--t-ink-soft)",
        }}
      >
        {currentImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={currentImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          currentEmoji || fallbackEmoji
        )}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 z-20 w-72 rounded-xl p-2 shadow-lg"
          style={{
            top: size + 6,
            background: "var(--t-panel)",
            border: "1px solid var(--t-panel-border)",
            color: "var(--t-ink)",
          }}
        >
          <div className="mb-2 flex gap-1 text-xs">
            <button type="button" onClick={() => setTab("library")} className="rounded-full px-2 py-1" style={tabBtnStyle(tab === "library")}>
              Library
            </button>
            <button type="button" onClick={() => setTab("ai")} className="rounded-full px-2 py-1" style={tabBtnStyle(tab === "ai")}>
              ✨ Generate
            </button>
            {currentIcon && (
              <button
                type="button"
                onClick={clear}
                disabled={isPending}
                className="ml-auto"
                style={{ color: "var(--t-ink-soft)" }}
              >
                Clear
              </button>
            )}
          </div>

          {tab === "library" ? (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by prompt, e.g. dragon, fire…"
                className="rounded border px-2 py-1 text-xs"
                style={fieldStyle}
              />
              {!library && (
                <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                  Loading icon library…
                </p>
              )}
              {library && (
                <div className="grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto">
                  {filteredLibrary?.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      title={entry.prompt ?? undefined}
                      disabled={isPending}
                      onClick={() => pickLibraryEntry(entry.image_url)}
                      className="hover-glow aspect-square overflow-hidden rounded-lg disabled:opacity-50"
                      style={{ border: `2px solid ${currentImageUrl === entry.image_url ? "var(--t-gold)" : "transparent"}` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- static /design asset or external Supabase Storage URL */}
                      <img src={entry.image_url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                  {filteredLibrary?.length === 0 && (
                    <p className="col-span-5 text-xs" style={{ color: "var(--t-ink-soft)" }}>
                      No matches — try Generate instead.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe the monster to generate…"
                className="rounded border px-2 py-1 text-xs"
                style={fieldStyle}
              />
              <button
                type="button"
                onClick={generateIcon}
                disabled={isGeneratingIcon || !aiPrompt.trim()}
                className="hover-glow self-start rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
                style={{ background: "var(--t-gold)", color: "#2a1c10" }}
              >
                {isGeneratingIcon ? "Generating…" : "Generate"}
              </button>
              {genError && (
                <p className="text-xs" style={{ color: "var(--t-warn)" }}>
                  {genError}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
