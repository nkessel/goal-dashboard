"use client";

import { useEffect, useState, useTransition } from "react";
import {
  setTaskIconAction,
  generateTaskIconAction,
  listTaskIconLibraryAction,
  pickTaskIconFromLibraryAction,
  generateQuestIconImageAction,
  removeTaskIconFromLibraryAction,
} from "@/app/actions";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import type { TaskIconLibraryEntry } from "@/lib/data/types";
import { useEscape } from "@/lib/use-escape";

export function IconPicker({
  taskId,
  currentIcon,
  currentSource,
  taskTitle = "",
  taskDescription = "",
  theme = "calm",
  size = 28,
  fallbackEmoji = "➕",
  emptyContent,
  onDraftChange,
  centered = false,
  showEditHint = false,
  artStyle = "monster",
}: {
  /** Omit together with `onDraftChange` when the quest doesn't exist yet. */
  taskId?: string;
  currentIcon: string | null;
  currentSource: "monster" | "library" | "ai";
  taskTitle?: string;
  /** With the title, makes the suggested painting prompt. */
  taskDescription?: string | null;
  theme?: "calm" | "adventure";
  /** Trigger diameter in px — lets a caller use this as the quest card's
   * actual avatar (bigger) rather than only the small "+" badge under it. */
  size?: number;
  /** Shown when there's no icon set yet — pass the card's own placeholder
   * (e.g. "❔"/"✦") so swapping in IconPicker as the avatar itself doesn't
   * change what an icon-less card looks like. */
  fallbackEmoji?: string;
  /** Rendered instead of `fallbackEmoji` when no icon is set. */
  emptyContent?: React.ReactNode;
  /** Draft mode (create dialog): report picks instead of saving to a quest. */
  onDraftChange?: (url: string | null, source: "library" | "ai") => void;
  /** Center the popover under the trigger (for large, centered avatars). */
  centered?: boolean;
  /** Show an "Edit" overlay on hover. */
  showEditHint?: boolean;
  /** "treasure" paints rewards on a beaming golden background. */
  artStyle?: "monster" | "treasure";
}) {
  const [open, setOpen] = useState(false);
  // Shows a new pick right away (the quest prop only updates after a refresh).
  const [override, setOverride] = useState<{ icon: string | null; source: "monster" | "library" | "ai" } | null>(null);
  const router = useRouter();
  const [confirmRemove, setConfirmRemove] = useState<TaskIconLibraryEntry | null>(null);
  const [tab, setTab] = useState<"library" | "ai">("ai");
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<TaskIconLibraryEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [aiPrompt, setAiPrompt] = useState(taskTitle);
  const [promptEdited, setPromptEdited] = useState(false);
  const suggestedPrompt = [taskTitle.trim(), taskDescription?.trim()].filter(Boolean).join(" — ");
  const [isGeneratingIcon, startGeneratingIcon] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);

  function generateIcon() {
    setGenError(null);
    startGeneratingIcon(async () => {
      try {
        let url: string | undefined;
        if (onDraftChange) {
          url = await generateQuestIconImageAction(aiPrompt, artStyle);
          onDraftChange(url, "ai");
        } else if (taskId) {
          url = await generateTaskIconAction(taskId, aiPrompt);
          if (url) setOverride({ icon: url, source: "ai" });
          router.refresh();
        }
        // Saved to the shared library server-side; show it there right away too.
        if (url) {
          const newUrl = url;
          setLibrary((prev) =>
            prev && !prev.some((e) => e.image_url === newUrl)
              ? [{ id: `new-${Date.now()}`, image_url: newUrl, prompt: aiPrompt, is_preset: false, created_by: null, created_at: new Date().toISOString() } as TaskIconLibraryEntry, ...prev]
              : prev
          );
        }
        setTab("library");
        setOpen(false);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Couldn't generate an icon.");
      }
    });
  }

  useEscape(() => setOpen(false), open);

  function removeEntry(entry: TaskIconLibraryEntry) {
    setConfirmRemove(null);
    setLibrary((prev) => prev?.filter((e) => e.id !== entry.id) ?? prev);
    if (!entry.id.startsWith("new-")) void removeTaskIconFromLibraryAction(entry.id).catch(() => {});
  }

  useEffect(() => {
    if (tab === "library" && !library) {
      listTaskIconLibraryAction().then(setLibrary);
    }
  }, [tab, library]);

  function pickLibraryEntry(imageUrl: string) {
    if (onDraftChange) {
      onDraftChange(imageUrl, "library");
      setOpen(false);
      return;
    }
    if (!taskId) return;
    startTransition(async () => {
      await pickTaskIconFromLibraryAction(taskId, imageUrl);
      setOverride({ icon: imageUrl, source: "library" });
      router.refresh();
      setOpen(false);
    });
  }

  function clear() {
    if (onDraftChange) {
      onDraftChange(null, "library");
      setOpen(false);
      return;
    }
    if (!taskId) return;
    startTransition(async () => {
      await setTaskIconAction(taskId!, null, "monster");
      setOverride({ icon: null, source: "monster" });
      router.refresh();
      setOpen(false);
    });
  }

  // "ai" is a freshly-generated-this-click image; "library" is one picked
  // from the shared library (its own generation, or someone else's) — both
  // just hold a plain image URL. "monster" is the old emoji picker's source,
  // kept only so any pre-existing data still renders correctly; nothing in
  // this component lets you choose a new emoji any more.
  const shownIcon = override ? override.icon : currentIcon;
  const shownSource = override ? override.source : currentSource;
  const currentImageUrl = shownSource === "ai" || shownSource === "library" ? shownIcon : null;
  const currentEmoji = shownSource === "monster" ? MONSTER_ICONS.find((m) => m.key === shownIcon)?.emoji : null;

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
          // Show the prompt the portrait would be painted from, ready to edit.
          if (!promptEdited) setAiPrompt(suggestedPrompt);
          setOpen((v) => !v);
        }}
        title="Change the portrait"
        className="hover-glow group relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.45,
          border:
            !currentImageUrl && !currentEmoji && emptyContent
              ? "none"
              : isAdventure
                ? "2px solid var(--t-panel-border)"
                : "1.5px dashed var(--t-card-border)",
          background: isAdventure ? undefined : "var(--t-accent-soft)",
          color: "var(--t-ink-soft)",
        }}
      >
        {currentImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={currentImageUrl} alt="" className="h-full w-full object-cover" />
        ) : currentEmoji ? (
          currentEmoji
        ) : (
          emptyContent ?? fallbackEmoji
        )}
        {showEditHint && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center gap-1 rounded-full text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            style={{ background: "rgba(20,16,8,.55)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Edit
          </span>
        )}
      </button>

      {open &&
        createPortal(
        <>
        <div className="fixed inset-0 z-[59] flex items-center justify-center p-4">
        <div
          className="overlay-fade-in absolute inset-0"
          style={{ background: "var(--t-overlay)" }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        />
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a portrait"
          className="card-pop-in relative flex max-h-[86vh] w-full max-w-[380px] flex-col overflow-y-auto rounded-2xl p-3.5 parchment parchment-framed shadow-2xl"
          style={{
            background: "var(--t-panel)",
            border: "2px solid var(--t-panel-border)",
            color: "var(--t-ink)",
          }}
        >
          <div className="relative z-[1] mb-2 flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "2px solid #a58c66", background: "#f3e6c8" }}>
              {currentImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- current portrait
                <img src={currentImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (emptyContent ?? fallbackEmoji)
              )}
            </span>
            <span className={isAdventure ? "font-display text-[19px] leading-tight" : "text-base font-bold"}>
              Portrait
              {taskTitle && (
                <span className="block truncate text-[13px] font-normal" style={{ color: "var(--t-ink-soft)", fontFamily: "var(--font-body)" }}>
                  {taskTitle}
                </span>
              )}
            </span>
          </div>
          <div className="relative z-[1]">
          <div className="mb-2 flex gap-1 text-xs">
            <button type="button" onClick={() => setTab("library")} className="rounded-full px-2 py-1" style={tabBtnStyle(tab === "library")}>
              Library
            </button>
            <button type="button" onClick={() => setTab("ai")} className="rounded-full px-2 py-1" style={tabBtnStyle(tab === "ai")}>
              ✨ Paint
            </button>
            <span className="ml-auto flex items-center gap-2">
              {shownIcon && (
                <button type="button" onClick={clear} disabled={isPending} style={{ color: "var(--t-ink-soft)" }}>
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none hover:bg-black/5"
                style={{ color: "var(--t-ink-soft)" }}
              >
                ×
              </button>
            </span>
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
                <div className="grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto overflow-x-hidden p-1">
                  {filteredLibrary?.map((entry) => (
                    <div key={entry.id} className="group/tile relative">
                      <button
                        type="button"
                        title={entry.prompt ?? undefined}
                        disabled={isPending}
                        onClick={() => pickLibraryEntry(entry.image_url)}
                        className="hover-glow block aspect-square w-full overflow-hidden rounded-lg disabled:opacity-50"
                        style={{ border: `2px solid ${currentImageUrl === entry.image_url ? "var(--t-gold)" : "transparent"}` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- static /design asset or external Supabase Storage URL */}
                        <img src={entry.image_url} alt="" className="h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(entry)}
                        aria-label="Delete from library"
                        title="Delete from library"
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover/tile:opacity-100"
                        style={{ background: "#2f2a1f", color: "#fff", border: "1.5px solid var(--t-panel)" }}
                      >
                        ×
                      </button>
                    </div>
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
              <label className="text-[11.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }} htmlFor="portrait-prompt">
                Painted from this description — change it or clear it
              </label>
              <textarea
                id="portrait-prompt"
                rows={3}
                value={aiPrompt}
                onChange={(e) => {
                  setAiPrompt(e.target.value);
                  setPromptEdited(true);
                }}
                placeholder="Describe the portrait to paint…"
                className="resize-none rounded border px-2 py-1 text-[13px] leading-snug"
                style={fieldStyle}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={generateIcon}
                  disabled={isGeneratingIcon || !aiPrompt.trim()}
                  className="hover-glow rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50"
                  style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                >
                  {isGeneratingIcon ? "Painting…" : "Paint portrait"}
                </button>
                {aiPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiPrompt("");
                      setPromptEdited(true);
                    }}
                    className="text-xs underline"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    Clear text
                  </button>
                )}
                {promptEdited && suggestedPrompt && aiPrompt !== suggestedPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiPrompt(suggestedPrompt);
                      setPromptEdited(false);
                    }}
                    className="ml-auto text-xs underline"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    Reset
                  </button>
                )}
              </div>
              {genError && (
                <p className="text-xs" style={{ color: "var(--t-warn)" }}>
                  {genError}
                </p>
              )}
            </div>
          )}
          {confirmRemove && (
            <div
              role="alertdialog"
              aria-label="Delete this image from the library?"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl p-3 text-center"
              style={{ background: "var(--t-panel)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- library image */}
              <img src={confirmRemove.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />
              <p className="text-sm font-semibold">Delete this image from the library?</p>
              <p className="text-[11px]" style={{ color: "var(--t-ink-soft)" }}>
                Quests already using it keep it.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmRemove(null)} className="h-8 rounded-full px-3 text-xs" style={{ border: "1px solid var(--t-panel-border)" }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeEntry(confirmRemove)}
                  className="h-8 rounded-full px-3 text-xs font-semibold"
                  style={{ background: "var(--t-warn)", color: "#fff" }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
        </div>
        </>,
        document.body
      )}
    </div>
  );
}
