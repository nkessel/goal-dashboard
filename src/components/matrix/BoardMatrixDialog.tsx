"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Board } from "@/lib/data/types";
import { setMatrixStateAction, updateBoardMatrixAction } from "@/app/actions";
import { IconPicker } from "@/components/tasks/IconPicker";
import { IconScale } from "@/components/tasks/QuestEditorDialog";
import { BoardSeal } from "@/components/boards/BoardSeal";
import { useEscape } from "@/lib/use-escape";

/**
 * A board as one item on the Priority Matrix (e.g. a course instead of each
 * assignment): its portrait, notes and ratings, edited like a quest.
 */
export function BoardMatrixDialog({
  board,
  openQuests,
  theme,
  onClose,
}: {
  board: Board;
  openQuests: number;
  theme: "calm" | "adventure";
  onClose: () => void;
}) {
  useEscape(() => onClose());
  const isAdventure = theme === "adventure";
  const [title, setTitle] = useState(board.title);
  const [description, setDescription] = useState(board.description ?? "");
  const [icon, setIcon] = useState<{ key: string | null; source: "library" | "ai" }>({
    key: board.icon_key ?? null,
    source: board.icon_source === "ai" ? "ai" : "library",
  });
  const [importance, setImportance] = useState(Math.round(board.importance ?? 0));
  const [urgency, setUrgency] = useState(Math.round(board.urgency ?? 0));
  const [effort, setEffort] = useState(Math.round(board.effort ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await updateBoardMatrixAction(board.id, {
          title,
          description: description.trim() || null,
          importance,
          urgency,
          effort,
          icon_key: icon.key,
          icon_source: icon.source,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the board.");
      }
    });
  }

  function remove() {
    startSaving(async () => {
      try {
        await setMatrixStateAction("board", board.id, "hidden");
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove it.");
      }
    });
  }

  const field = "w-full rounded-lg border px-3 py-2 text-[16px]";
  const fieldStyle = {
    borderColor: isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)",
    background: isAdventure ? "rgba(255,250,238,.55)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[52] flex items-center justify-center p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${board.title}`}
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in parchment parchment-framed flex max-h-[90svh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-4"
        style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: "var(--t-ink)" }}
      >
        <div className="relative z-[1] flex items-center justify-between">
          <h3 className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-base font-bold"}`} style={{ color: "var(--t-ink)" }}>
            Board on the matrix
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        <div className="relative z-[1] flex items-start gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <IconPicker
              currentIcon={icon.key}
              currentSource={icon.key ? icon.source : "monster"}
              taskTitle={title}
              taskDescription={description}
              theme={theme}
              size={72}
              emptyContent={<BoardSeal size={44} />}
              showEditHint
              onDraftChange={(url, source) => setIcon({ key: url, source })}
            />
            <span className="text-[11px]" style={{ color: "var(--t-ink-soft)" }}>
              Portrait
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Board title" className={`${field} font-semibold`} style={fieldStyle} />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this board is about"
              aria-label="Description"
              rows={2}
              className={field}
              style={fieldStyle}
            />
          </div>
        </div>

        <div className="relative z-[1] flex flex-col gap-1.5 rounded-xl px-3 py-2" style={{ background: isAdventure ? "rgba(120,90,40,.1)" : "var(--t-bg)", color: "var(--t-ink)" }}>
          <IconScale label="Importance" icon="/design/ui-heart.svg" value={importance} onChange={setImportance} />
          <IconScale label="Urgency" icon="/design/ui-flame-sm.png" value={urgency} onChange={setUrgency} />
          <IconScale label="Challenge" icon="/design/ui-muscle.svg" hint="How much it takes out of you" value={effort} onChange={setEffort} />
        </div>

        <p className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {openQuests === 1 ? "1 open quest on this board." : `${openQuests} open quests on this board.`}{" "}
          <Link href={`/boards/${board.id}`} className="underline underline-offset-2">
            Open the board
          </Link>
        </p>

        {error && (
          <p className="relative z-[1] m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="relative z-[1] flex items-center gap-2">
          <button type="button" onClick={remove} disabled={saving} className="h-11 rounded-full px-3 text-[14px] underline" style={{ color: "var(--t-ink-soft)" }}>
            Remove from matrix
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="ml-auto h-11 rounded-full px-6 text-[15px] font-bold"
            style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
