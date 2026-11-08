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
import { useLongPress } from "@/lib/use-long-press";
import { useFitAboveKeyboard } from "@/lib/use-fit-above-keyboard";
import { CloseIcon } from "@/components/ui/Icons";

const LIB_KEY = "portrait-library-shown";

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
  clearLabel = "Remove portrait",
  onPromptChange,
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
  /** Label for taking the picture off (e.g. "Use the checkbox"). */
  clearLabel?: string;
  /** Draft mode: the description it would be painted from, as you edit it (so a new quest can be painted from it later). */
  onPromptChange?: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // With the keyboard up, the picker sits in the strip above it (owner's recording, Nov 3).
  const kb = useFitAboveKeyboard(open);
  // Opened: the description is selected, ready to type over (owner, Nov 3).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const f = document.getElementById("portrait-prompt") as HTMLTextAreaElement | null;
      if (!f) return;
      f.focus({ preventScroll: true });
      f.select();
    }, 320);
    return () => window.clearTimeout(t);
  }, [open]);
  // Shows a new pick right away (the quest prop only updates after a refresh).
  const [override, setOverride] = useState<{ icon: string | null; source: "monster" | "library" | "ai" } | null>(null);
  const router = useRouter();
  const [confirmRemove, setConfirmRemove] = useState<TaskIconLibraryEntry | null>(null);
  // The library shows under the paint section unless you've hidden it (remembered on this device).
  const [libShown, setLibShown] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(LIB_KEY) !== "0";
    } catch {
      return true;
    }
  });
  function toggleLibrary() {
    const next = !libShown;
    setLibShown(next);
    try {
      window.localStorage.setItem(LIB_KEY, next ? "1" : "0");
    } catch {}
  }
  const [query, setQuery] = useState("");
  // "See more": a wider window and a taller, denser grid (remembered).
  const [wide, setWide] = useState(() => {
    try {
      return window.localStorage.getItem("portrait-grid-wide") === "1";
    } catch {
      return false;
    }
  });
  const toggleWide = () => {
    setWide((w) => {
      try {
        window.localStorage.setItem("portrait-grid-wide", w ? "0" : "1");
      } catch {}
      return !w;
    });
  };
  const [shelf, setShelf] = useState<"all" | "quest" | "reward" | "character">(artStyle === "treasure" ? "reward" : "all");
  // What it's painted as (owner, Nov 3): a quest scene, a reward's treasure, or a routine's calm scene.
  const [paintStyle, setPaintStyle] = useState<"monster" | "treasure" | "routine">(artStyle === "treasure" ? "treasure" : /rite|habit|routine/i.test(taskTitle ?? "") ? "routine" : "monster");
  const [library, setLibrary] = useState<TaskIconLibraryEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [aiPrompt, setAiPrompt] = useState(taskTitle);
  const [promptEdited, setPromptEdited] = useState(false);
  const suggestedPrompt = [taskTitle.trim(), taskDescription?.trim()].filter(Boolean).join(" — ");
  const [isGeneratingIcon, startGeneratingIcon] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);

  function generateIcon() {
    setGenError(null);
    // Painting takes a few seconds: close the picker straight away and let the
    // portrait shimmer while it paints, so nothing waits on it.
    setOpen(false);
    startGeneratingIcon(async () => {
      try {
        let url: string | undefined;
        if (onDraftChange) {
          url = await generateQuestIconImageAction(aiPrompt, paintStyle);
          onDraftChange(url, "ai");
        } else if (taskId) {
          url = await generateTaskIconAction(taskId, aiPrompt, paintStyle);
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
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Couldn't generate an icon.");
        setOpen(true);
      }
    });
  }

  useEscape(() => setOpen(false), open);

  function removeEntry(entry: TaskIconLibraryEntry) {
    setConfirmRemove(null);
    setLibrary((prev) => prev?.filter((e) => e.id !== entry.id) ?? prev);
    if (!entry.id.startsWith("new-") && !entry.id.includes(":")) void removeTaskIconFromLibraryAction(entry.id).catch(() => {});
  }

  useEffect(() => {
    if (open && libShown && !library) {
      listTaskIconLibraryAction().then(setLibrary);
    }
  }, [open, libShown, library]);

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

  const filteredLibrary = library?.filter(
    (e) => (shelf === "all" || (e.category ?? "quest") === shelf) && (!query.trim() || e.prompt?.toLowerCase().includes(query.trim().toLowerCase()))
  );

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
        {isGeneratingIcon && (
          <span aria-hidden className="portrait-painting absolute inset-0 flex items-center justify-center rounded-full">
            <svg width={Math.max(14, size * 0.3)} height={Math.max(14, size * 0.3)} viewBox="0 0 24 24" fill="none" className="portrait-brush">
              <path d="M14.5 3.5l6 6-8.2 8.2a3 3 0 01-2.1.9H6.5v-3.7a3 3 0 01.9-2.1l7.1-9.3z" fill="#f8e3a0" stroke="#5a4214" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M6.5 18.6c-1 1.6-2.4 2.2-3.5 2 .4-1.3.4-2.7 1.6-3.6" stroke="#5a4214" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {isGeneratingIcon && <span className="sr-only">Painting the portrait…</span>}
        {showEditHint && !isGeneratingIcon && (
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
        <div
          data-kb-fit
          data-kb-self
          className={`fixed inset-0 z-[59] flex justify-center ${kb ? "items-start p-2" : "items-center p-4"}`}
          style={kb ? { top: kb.top, height: kb.height, bottom: "auto" } : undefined}
        >
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
          className={`card-pop-in relative flex ${kb ? "" : "max-h-[92vh]"} w-full ${wide ? "max-w-[720px]" : "max-w-[380px]"} flex-col overflow-y-auto rounded-2xl p-3.5 parchment parchment-framed shadow-2xl transition-[max-width] duration-300`}
          style={{
            background: "var(--t-panel)",
            border: "2px solid var(--t-panel-border)",
            color: "var(--t-ink)",
            ...(kb ? { maxHeight: kb.height - 16 } : {}),
          }}
          // A field brought into sight inside the picker's own scroll, once the keyboard is up.
          onFocus={(e) => {
            const f = e.target;
            if (f instanceof HTMLTextAreaElement || f instanceof HTMLInputElement) window.setTimeout(() => f.scrollIntoView({ block: "nearest" }), 320);
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
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
              ✨ Paint a new one
            </span>
            <span className="ml-auto flex items-center gap-2">
              {shownIcon && (
                <button type="button" onClick={clear} disabled={isPending} title="Take the portrait off: the quest shows just its check box" className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold disabled:opacity-60" style={{ border: "1px solid var(--t-panel-border, rgba(139,112,64,.45))", color: "var(--t-ink)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M5 7h14M10 4h4M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {clearLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full text-lg leading-none hover:bg-black/5"
                style={{ color: "var(--t-ink-soft)" }}
              >
                <CloseIcon size={11} />
              </button>
            </span>
          </div>


            <div className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }} htmlFor="portrait-prompt">
                What to paint (type over it)
              </label>
              <div className="relative">
                <textarea
                  id="portrait-prompt"
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => {
                    setAiPrompt(e.target.value);
                    setPromptEdited(true);
                    onPromptChange?.(e.target.value);
                  }}
                  // Ctrl/⌘+Enter paints (owner, Nov 5); it doesn't reach the editor's save behind.
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isGeneratingIcon && aiPrompt.trim()) generateIcon();
                    }
                  }}
                  placeholder="Describe the portrait to paint…"
                  className="w-full resize-none rounded border py-1 pl-2 pr-8 text-[13px] leading-snug"
                  style={fieldStyle}
                />
                {aiPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiPrompt("");
                      setPromptEdited(true);
                      onPromptChange?.("");
                    }}
                    aria-label="Clear the description"
                    title="Clear"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-[15px] leading-none"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    <CloseIcon size={9} />
                  </button>
                )}
              </div>
              <span className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Paint it as">
                <span className="mr-0.5 text-[11.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
                  As a
                </span>
                {([
                  ["monster", "Quest"],
                  ["treasure", "Reward"],
                  ["routine", "Routine"],
                ] as const).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={paintStyle === k} onClick={() => setPaintStyle(k)} className="h-7 rounded-full px-2.5 text-[12px] font-semibold" style={paintStyle === k ? { background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" } : { border: "1px solid var(--t-panel-border, rgba(139,112,64,.45))", color: "var(--t-ink)" }}>
                    {label}
                  </button>
                ))}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={generateIcon}
                  disabled={isGeneratingIcon || !aiPrompt.trim()}
                  className="hover-glow h-9 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50"
                  style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                >
                  {isGeneratingIcon ? "Painting…" : "Paint portrait"}
                </button>
                {suggestedPrompt && aiPrompt !== suggestedPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setAiPrompt(suggestedPrompt);
                      setPromptEdited(false);
                      onPromptChange?.("");
                    }}
                    aria-label="Reset to the quest's own description"
                    title="Reset to the quest's description"
                    className="hover-glow ml-auto flex h-9 w-9 items-center justify-center rounded-full border"
                    style={{ borderColor: "var(--t-panel-border)", color: "var(--t-ink-soft)" }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M4 3.8v4.6h4.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="m-0 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                Takes a few seconds — you can keep editing while it paints.
              </p>
              {genError && (
                <p className="text-xs" style={{ color: "var(--t-warn)" }}>
                  {genError}
                </p>
              )}
            </div>
          {/* The library, under the paint section (shown unless hidden). */}
          <button type="button" onClick={toggleLibrary} aria-expanded={libShown} className="mb-1 mt-3 flex min-h-8 w-full items-center gap-1.5 text-left text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: libShown ? "rotate(90deg)" : undefined }}>
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Library
            <span className="ml-auto text-[11.5px] font-normal underline">{libShown ? "Hide" : "Show"}</span>
          </button>
          {libShown && (
            <button type="button" onClick={toggleWide} aria-pressed={wide} className="-mt-1 mb-1 flex h-8 items-center gap-1.5 self-end rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid var(--t-panel-border)", color: "var(--t-ink)", background: wide ? "rgba(217,180,95,.3)" : undefined }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                {wide ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
              </svg>
              {wide ? "See fewer" : "See more at once"}
            </button>
          )}
          {libShown && (
            <div className="reveal flex flex-col gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search, e.g. book, dragon, fire…"
                className="h-9 rounded-lg border px-2.5 text-[16px]"
                style={fieldStyle}
              />
              <div role="radiogroup" aria-label="Which portraits" className="flex flex-wrap gap-1">
                {(
                  [
                    ["all", "All"],
                    ["quest", "Quests"],
                    ["reward", "Rewards"],
                    ["character", "Characters"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={shelf === k}
                    onClick={() => setShelf(k)}
                    className="h-8 rounded-full px-3 text-[12.5px] font-semibold"
                    style={shelf === k ? { background: "var(--t-gold)", color: "#2a1c10" } : { border: "1px solid var(--t-panel-border)", color: "var(--t-ink-soft)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!library && (
                <p className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                  Loading icon library…
                </p>
              )}
              {library && (
                <div className={`grid gap-1.5 overflow-y-auto overflow-x-hidden p-1 transition-[max-height] duration-300 ${wide ? "max-h-[62vh] grid-cols-5 sm:grid-cols-8" : "max-h-52 grid-cols-5"}`}>
                  {filteredLibrary?.map((entry) => (
                    <div key={entry.id} className="group/tile relative">
                      {/* Tap to use it; long-press (or right-click) to delete it from the library. */}
                      <LibraryTile
                        src={entry.image_url}
                        title={entry.prompt ?? undefined}
                        disabled={isPending}
                        current={currentImageUrl === entry.image_url}
                        onPick={() => pickLibraryEntry(entry.image_url)}
                        onLong={entry.id.includes(":") ? undefined : () => setConfirmRemove(entry)}
                      />
                      {/* Delete: a small menu right on the tile (owner, Nov 3: "a much smaller context menu"). */}
                      {confirmRemove?.id === entry.id && (
                        <div role="menu" aria-label="Delete this image from the library?" className="card-pop-in absolute left-1/2 top-[70%] z-[5] flex w-max -translate-x-1/2 flex-col items-stretch gap-1 rounded-xl p-1.5 text-[12px] shadow-xl" style={{ background: "var(--t-panel)", border: "1px solid var(--t-panel-border)" }}>
                          <button type="button" role="menuitem" autoFocus onClick={() => removeEntry(entry)} className="h-8 rounded-lg px-2.5 font-semibold" style={{ background: "var(--t-warn)", color: "#fff" }} title="Quests already using it keep it">
                            Delete from library
                          </button>
                          <button type="button" role="menuitem" onClick={() => setConfirmRemove(null)} className="h-7 rounded-lg px-2.5" style={{ color: "var(--t-ink-soft)" }}>
                            Keep it
                          </button>
                        </div>
                      )}
                      {!entry.id.includes(":") && (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(entry)}
                        aria-label="Delete from library"
                        title="Delete from library"
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover/tile:opacity-100"
                        style={{ background: "#2f2a1f", color: "#fff", border: "1.5px solid var(--t-panel)" }}
                      >
                        <CloseIcon size={9} />
                      </button>
                      )}
                    </div>
                  ))}
                  {filteredLibrary?.length === 0 && (
                    <p className="col-span-5 text-xs" style={{ color: "var(--t-ink-soft)" }}>
                      No matches — try painting one instead.
                    </p>
                  )}
                </div>
              )}
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

/** A library image: tap to use it, hold (or right-click) to offer deleting it. */
function LibraryTile({ src, title, disabled, current, onPick, onLong }: { src: string; title?: string; disabled: boolean; current: boolean; onPick: () => void; onLong?: () => void }) {
  const { handlers, wasLong } = useLongPress(() => onLong?.());
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      {...(onLong ? handlers : {})}
      onClick={() => !wasLong() && onPick()}
      className="hover-glow block aspect-square w-full select-none overflow-hidden rounded-lg [-webkit-touch-callout:none] disabled:opacity-50"
      style={{ border: `2px solid ${current ? "var(--t-gold)" : "transparent"}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static /design asset or external Supabase Storage URL */}
      <img src={src} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
    </button>
  );
}
