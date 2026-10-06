"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { TaskContext } from "@/lib/data/types";
import { createImportedQuestsAction } from "@/app/actions";
import { CONTEXT_OPTIONS, localDateKey, windowLabel } from "@/lib/flexible";

type Proposal = {
  title: string;
  description: string | null;
  estimateMinutes: number | null;
  importance: number;
  urgency: number;
  dueBy: string | null;
  context: TaskContext | null;
  isUpkeep: boolean;
  keep: boolean;
};

/** Longest edge sent to the model; also keeps the upload small. */
const MAX_EDGE = 1568;

/** Downsize a photo in the browser and return base64 JPEG (no data: prefix). */
async function shrinkImage(file: File): Promise<{ data: string; mediaType: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image — try a JPEG or PNG."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image.");
    ctx.fillStyle = "#fff"; // flatten transparent screenshots onto white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.85);
    return { data: preview.split(",")[1], mediaType: "image/jpeg", preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Smart import: snap a photo of a handwritten list / whiteboard / flyer, or
 * paste a text list, and Claude turns it into proposed quests. Nothing is
 * created until the user reviews the list (untick, rename) and confirms.
 */
export function SmartImportDialog({ theme = "calm", onClose }: { theme?: "calm" | "adventure"; onClose: () => void }) {
  const isAdventure = theme === "adventure";
  const noun = isAdventure ? "quest" : "task";
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ data: string; mediaType: string; preview: string } | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const accent = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  const onAccent = isAdventure ? "#2a1c10" : "#fff";
  const border = isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)";
  const fieldStyle: React.CSSProperties = {
    borderColor: border,
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setImage(await shrinkImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that image.");
    }
  }

  async function read() {
    setError(null);
    setReading(true);
    try {
      const res = await fetch("/api/smart-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          image: image ? { data: image.data, mediaType: image.mediaType } : undefined,
          today: localDateKey(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't read that list.");
      const tasks = (json.tasks ?? []) as Omit<Proposal, "keep">[];
      if (!tasks.length) throw new Error(`No ${noun}s found there — try a clearer photo or paste the list as text.`);
      setProposals(tasks.map((t) => ({ ...t, keep: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that list.");
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (!proposals) return;
    const kept = proposals.filter((p) => p.keep && p.title.trim());
    if (!kept.length) return;
    setError(null);
    startSaving(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the UI-only flag
        const n = await createImportedQuestsAction(kept.map(({ keep, ...rest }) => rest));
        setDone(n);
        setTimeout(onClose, 900);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add those.");
      }
    });
  }

  function update(i: number, patch: Partial<Proposal>) {
    setProposals((ps) => ps && ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  const keptCount = proposals?.filter((p) => p.keep && p.title.trim()).length ?? 0;

  return createPortal(
    <div
      className="overlay-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--t-overlay)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Smart import"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="sheet-slide-up-in flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-4 shadow-2xl"
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${border}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className={isAdventure ? "font-display text-lg" : "text-lg font-bold"}>
            {isAdventure ? "Decipher a scroll" : "Smart import"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        {done !== null ? (
          <p className="py-6 text-center text-[15px] font-semibold">
            ✅ Added {done} {noun}
            {done === 1 ? "" : "s"}
          </p>
        ) : !proposals ? (
          <>
            <p className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              Snap a photo of a handwritten list, whiteboard or screenshot — or paste a list. You&apos;ll review
              everything before it&apos;s added.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {image ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                <img src={image.preview} alt="Selected list" className="max-h-56 w-full rounded-xl object-contain" style={{ background: "#fff" }} />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="absolute right-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: "rgba(0,0,0,.6)", color: "#fff" }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="hover-glow flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm font-medium"
                style={{ borderColor: border, color: "var(--t-ink)" }}
              >
                <span aria-hidden className="text-xl">
                  📷
                </span>
                Take or choose a photo
              </button>
            )}

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={image ? 2 : 6}
              placeholder={
                image
                  ? "Optional note, e.g. “only the left column”"
                  : "haircut this week\nclean car\nsign up for gym\nprep for Tuesday class by Monday"
              }
              aria-label="List of tasks"
              className="resize-none rounded-lg border px-2.5 py-2 text-[14px]"
              style={fieldStyle}
            />
          </>
        ) : (
          <>
            <p className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              Untick anything you don&apos;t want, fix titles, then add. Details can be edited later.
            </p>
            <ul className="flex flex-col">
              {proposals.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 border-t py-2 first:border-t-0" style={{ borderColor: border, opacity: p.keep ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={p.keep}
                    onChange={(e) => update(i, { keep: e.target.checked })}
                    aria-label={`Keep ${p.title}`}
                    className="mt-2 h-5 w-5 shrink-0"
                    style={{ accentColor: accent }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <input
                      value={p.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      aria-label="Title"
                      className="h-9 rounded-lg border px-2 text-[14px] font-medium"
                      style={fieldStyle}
                    />
                    <div className="flex flex-wrap gap-1.5 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                      {p.estimateMinutes ? <span>⏱ {p.estimateMinutes}m</span> : null}
                      {p.dueBy && <span>⏳ {windowLabel(p.dueBy)}</span>}
                      {p.context && <span>{CONTEXT_OPTIONS.find((o) => o.key === p.context)?.emoji} {p.context}</span>}
                      {p.isUpkeep && <span>🧹 upkeep</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        {done === null && (
          <div className="flex items-center justify-end gap-2 pt-1">
            {proposals && (
              <button
                type="button"
                onClick={() => setProposals(null)}
                className="mr-auto text-sm underline"
                style={{ color: "var(--t-ink-soft)" }}
              >
                Back
              </button>
            )}
            <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
              Cancel
            </button>
            {proposals ? (
              <button
                type="button"
                onClick={save}
                disabled={isSaving || !keptCount}
                className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
                style={{ background: accent, color: onAccent }}
              >
                {isSaving ? "Adding…" : `Add ${keptCount} ${noun}${keptCount === 1 ? "" : "s"}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={read}
                disabled={reading || (!text.trim() && !image)}
                className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
                style={{ background: accent, color: onAccent }}
              >
                {reading ? "Reading…" : "Read list"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
