"use client";

import { useEffect, useState, useTransition } from "react";
import {
  generateAvatarImageAction,
  clearAvatarImageAction,
  pickAvatarFromLibraryAction,
  removeAvatarFromLibraryAction,
  ensureStyleExamplesAction,
} from "@/app/actions";
import { SAMPLE_AVATAR_PROMPTS, AVATAR_STYLE_OPTIONS, DEFAULT_AVATAR_STYLE } from "@/lib/avatar-prompts";
import type { AvatarLibraryEntry } from "@/lib/data/types";

/**
 * Avatar editor: generate an AI portrait (background on/off, an optional
 * art-style preset), or pick straight from the shared library — presets
 * seeded by migration 0009 plus every avatar anyone has ever generated
 * (generateAvatarImageAction adds each new one to the library
 * automatically). No emoji/accessory builder, no color picker — avatars are
 * AI-generated or library-picked images only, and the border tint isn't
 * user-set.
 */
export function AvatarBuilder({
  initialColor,
  initialImageUrl,
  library,
  theme = "calm",
}: {
  initialColor: string;
  initialImageUrl: string | null;
  library: AvatarLibraryEntry[];
  theme?: "calm" | "adventure";
}) {
  const isAdventure = theme === "adventure";

  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [prompt, setPrompt] = useState("");
  const [withBackground, setWithBackground] = useState(false);
  const [style, setStyle] = useState<string>(DEFAULT_AVATAR_STYLE);
  const [examples, setExamples] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    ensureStyleExamplesAction()
      .then(setExamples)
      .catch(() => setExamples({}));
  }, []);
  const [isGenerating, startGenerating] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);
  const [isPicking, startPicking] = useTransition();
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  // Draws attention to the Generate button right after a sample prompt gets
  // auto-filled, since picking a sample no longer generates immediately —
  // the user is meant to glance at (and optionally tweak) the prompt first.
  // pulseKey forces the button to remount (and its CSS animation to replay)
  // every time a new sample is picked, even picking the same one twice.
  const [pulsing, setPulsing] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  // Fixed to the real panel token now — var(--t-nav-bg) here (a near-black
  // "legacy/general-chrome" accent, not a panel background) was why this
  // section rendered solid black in Adventure mode.
  const panelBg = isAdventure ? "var(--t-panel)" : "var(--t-accent-soft)";
  const panelBorder = isAdventure ? "rgba(209,161,60,.35)" : "var(--t-card-border)";
  const fieldBg = isAdventure ? "var(--t-panel-2)" : "var(--t-card)";
  const fieldBorder = isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)";
  const inkColor = "var(--t-ink)";
  const inkSoft = "var(--t-ink-soft)";
  const accentBg = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  const accentInk = isAdventure ? "#2a1c10" : "#fff";

  function generate() {
    setGenError(null);
    startGenerating(async () => {
      try {
        const url = await generateAvatarImageAction(prompt, withBackground, style);
        setImageUrl(url);
      } catch (e) {
        setGenError(e instanceof Error ? e.message : "Couldn't generate an image.");
      }
    });
  }

  function pickSample(sample: string) {
    // Fills the prompt but deliberately doesn't generate — the user should
    // get a chance to tweak wording before spending a generation on it.
    setPrompt(sample);
    setPulsing(true);
    setPulseKey((k) => k + 1);
  }

  function pickFromLibrary(url: string) {
    setImageUrl(url);
    startPicking(async () => {
      await pickAvatarFromLibraryAction(url);
    });
  }

  function removeFromLibrary(id: string) {
    setRemoved((prev) => new Set(prev).add(id));
    startPicking(async () => {
      try {
        await removeAvatarFromLibraryAction(id);
      } catch {
        setRemoved((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }

  function clearImage() {
    startGenerating(async () => {
      await clearAvatarImageAction();
      setImageUrl(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img
            src={imageUrl}
            alt="Your avatar"
            className="h-32 w-32 shrink-0 rounded-full object-cover"
            style={{ border: `3px solid ${isAdventure ? "var(--t-gold)" : initialColor}` }}
          />
        ) : (
          <div
            className="h-32 w-32 shrink-0 rounded-full"
            style={{ background: `${initialColor}33`, border: `3px solid ${initialColor}` }}
          />
        )}
        <div className="flex flex-col items-center gap-1">
          <span className="text-sm font-medium" style={{ color: inkColor }}>
            Your avatar
          </span>
          <span className="text-xs" style={{ color: inkSoft }}>
            Shown on the Friend Feed and in comments.
          </span>
        </div>
      </div>

      <div
        className="flex flex-col gap-2 rounded-lg p-3"
        style={{ background: panelBg, border: `1px solid ${panelBorder}` }}
      >
        <p className="text-xs font-medium" style={{ color: inkSoft }}>
          ✨ Generate an avatar
        </p>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. a grizzled fox mercenary in scarred plate armor"
            className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
            style={{ background: fieldBg, borderColor: fieldBorder, color: inkColor }}
          />
          <button
            key={pulseKey}
            type="button"
            onClick={() => generate()}
            disabled={isGenerating || !prompt.trim()}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
              pulsing ? "generate-pulse" : ""
            }`}
            style={{ background: accentBg, color: accentInk }}
          >
            {isGenerating ? "Generating…" : "Generate"}
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-xs" style={{ color: inkSoft }}>
          <input
            type="checkbox"
            checked={withBackground}
            onChange={(e) => setWithBackground(e.target.checked)}
          />
          Illustrated scene background (unchecked = no background)
        </label>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium" style={{ color: inkSoft }}>
            Art style
          </p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Art style">
            {AVATAR_STYLE_OPTIONS.map((s) => {
              const active = style === s.key;
              const src = examples?.[s.key];
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={s.description}
                  onClick={() => setStyle(s.key)}
                  className="hover-glow flex flex-col overflow-hidden rounded-xl text-left transition-transform active:scale-95"
                  style={{
                    border: `3px solid ${active ? accentBg : fieldBorder}`,
                    background: fieldBg,
                    boxShadow: active ? "0 0 0 2px rgba(209,161,60,.35)" : undefined,
                  }}
                >
                  <div className="relative aspect-square w-full" style={{ background: isAdventure ? "#e9dcbd" : "#f1f1f1" }}>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
                      <img src={src} alt={`${s.label} example`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px]" style={{ color: inkSoft }}>
                        {examples ? "No preview" : "Painting…"}
                      </div>
                    )}
                    {active && (
                      <span
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: accentBg, color: accentInk }}
                        aria-hidden
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <span
                    className="px-1.5 py-1.5 text-center text-[12px] font-semibold leading-tight"
                    style={{ color: inkColor, background: active ? (isAdventure ? "rgba(209,161,60,.25)" : "var(--t-accent-soft)") : undefined }}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {genError && (
          <p className="text-xs" style={{ color: "var(--t-warn)" }}>
            {genError}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <p className="text-xs" style={{ color: inkSoft }}>
            Or start from one of these (you can still edit it before generating):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_AVATAR_PROMPTS.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => pickSample(sample)}
                disabled={isGenerating}
                title={sample}
                className="hover-glow rounded-full px-2.5 py-1 text-[11px] disabled:opacity-50"
                style={{ background: fieldBg, border: `1px solid ${fieldBorder}`, color: inkColor }}
              >
                {sample.split(" ").slice(0, 3).join(" ")}…
              </button>
            ))}
          </div>
        </div>

        {imageUrl && (
          <button
            type="button"
            onClick={clearImage}
            disabled={isGenerating}
            className="self-start text-xs underline"
            style={{ color: inkSoft }}
          >
            Remove avatar (use a preset below instead)
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium" style={{ color: inkSoft }}>
          Avatar library — presets, plus every avatar anyone has made
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {library
            .filter((entry) => !removed.has(entry.id))
            .map((entry) => (
              <div key={entry.id} className="relative">
                <button
                  type="button"
                  onClick={() => pickFromLibrary(entry.image_url)}
                  disabled={isPicking}
                  title={entry.prompt ?? undefined}
                  className="hover-glow block aspect-square w-full overflow-hidden rounded-full disabled:opacity-50"
                  style={{
                    border: `3px solid ${imageUrl === entry.image_url ? (isAdventure ? "var(--t-gold)" : initialColor) : "transparent"}`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- static /design/ asset or external Supabase Storage URL */}
                  <img src={entry.image_url} alt="" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFromLibrary(entry.id)}
                  aria-label="Remove from library"
                  title="Remove from library"
                  className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold shadow"
                  style={{ background: isAdventure ? "#2f2a1f" : "var(--t-ink)", color: "#fff", border: "2px solid var(--t-panel)" }}
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
