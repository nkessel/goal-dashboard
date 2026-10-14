"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { addJournalEntryAction, createBoardAction } from "@/app/actions";
import { EmbedHostContext } from "@/components/ui/EmbedHost";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { RewardEditorDialog } from "@/components/rewards/RewardEditorDialog";
import { RiteEditorDialog } from "@/components/evening/RiteEditorDialog";
import { Moon } from "@/components/evening/BeginEveningButton";
import { DiamondIcon } from "@/components/ui/Icons";
import { QuestShield } from "@/components/ui/Ornaments";
import { useEscape } from "@/lib/use-escape";

export type CreateKind = "quest" | "now" | "reward" | "rite" | "journal" | "board" | "subboard";

const KIND_META: Record<CreateKind, { label: string; icon: React.ReactNode }> = {
  quest: { label: "Quest", icon: <QuestShield size={18} /> },
  now: { label: "Doing now", icon: <NowGlyph /> },
  reward: { label: "Reward", icon: <DiamondIcon size={17} /> },
  rite: { label: "Evening rite", icon: <Moon size={17} /> },
  journal: { label: "Journal", icon: <QuillGlyph /> },
  board: { label: "Quest board", icon: <ScrollGlyph /> },
  subboard: { label: "Sub-board", icon: <ScrollGlyph /> },
};

/**
 * Everything the + button can make, in one sheet that rises out of it: a row
 * of kinds along the top (Quest first and gilded), the matching editor below.
 * The rest of the screen dims; the + turns into × and stays put.
 */
export function CreateSheet({
  kinds,
  initial,
  boardId,
  todayFull = false,
  theme = "calm",
  onClose,
}: {
  kinds: CreateKind[];
  initial?: CreateKind;
  /** Quests (and sub-boards) made here go on this board. */
  boardId?: string;
  todayFull?: boolean;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  const [kind, setKind] = useState<CreateKind>(initial ?? kinds[0]);
  const [leaving, setLeaving] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const isAdventure = theme === "adventure";
  useEscape(() => close());

  function close() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 190);
  }

  const editorKey = kind;
  const editor =
    kind === "quest" || kind === "now" ? (
      <QuestEditorDialog key={editorKey} mode={{ kind: "create", boardId, todayFull, doingNow: kind === "now" }} theme={theme} onClose={close} />
    ) : kind === "reward" ? (
      <RewardEditorDialog key={editorKey} theme={theme} onClose={close} />
    ) : kind === "rite" ? (
      <RiteEditorDialog key={editorKey} onClose={close} />
    ) : kind === "journal" ? (
      <JournalComposer key={editorKey} isAdventure={isAdventure} onDone={close} />
    ) : (
      <BoardComposer key={editorKey} parentBoardId={kind === "subboard" ? boardId : undefined} isAdventure={isAdventure} onDone={close} />
    );

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[48] ${leaving ? "overlay-fade-out" : "overlay-fade-in"}`}
        style={{ background: "rgba(8,6,3,.55)", backdropFilter: "blur(1.5px)" }}
        onClick={close}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create something new"
        className={`create-sheet fixed inset-x-0 z-[49] mx-auto flex w-[calc(100%-16px)] max-w-md flex-col ${leaving ? "create-sheet-out" : "create-sheet-in"}`}
        style={{
          bottom: "calc(5rem + 66px + env(safe-area-inset-bottom))",
          maxHeight: "calc(100dvh - 5rem - 66px - 12px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
        }}
      >
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl"
          style={{
            background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
            border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
            color: "var(--t-ink)",
          }}
        >
        {kinds.length > 1 && (
          <div
            role="tablist"
            aria-label="What to make"
            className="relative z-[1] flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {kinds.map((k) => {
              const active = k === kind;
              const special = k === "quest" || k === "board";
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setKind(k)}
                  className="create-kind flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold"
                  style={{
                    background: active ? (isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)") : "rgba(70,50,20,.08)",
                    color: active ? (isAdventure ? "#2a1c10" : "#fff") : "var(--t-ink)",
                    border: special ? `1.5px solid ${active ? "#8a6116" : "#c99a2e"}` : "1.5px solid transparent",
                    boxShadow: active ? "0 1px 4px rgba(60,40,10,.35), inset 0 1px 0 rgba(255,255,255,.5)" : special ? "0 0 0 2px rgba(242,201,76,.25)" : undefined,
                  }}
                >
                  <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center">
                    {KIND_META[k].icon}
                  </span>
                  {KIND_META[k].label}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div ref={setHost} className="embed-host" />
          {host && <EmbedHostContext.Provider value={host}>{editor}</EmbedHostContext.Provider>}
        </div>
        </div>
        {/* A small tail pointing down at the + it came from. */}
        <span aria-hidden className="-mt-[7px] block h-3 w-3 shrink-0 rotate-45 self-start" style={{ background: isAdventure ? "#e4cfa3" : "var(--t-card)", borderRight: "2px solid #c7a96f", borderBottom: "2px solid #c7a96f", marginLeft: "calc(var(--fab-x, 50vw) - max(8px, (100vw - 28rem) / 2) - 7px)" }} />
      </div>
    </>,
    document.body
  );
}

const MOODS = [
  { v: 1, face: "😞", label: "Rough" },
  { v: 2, face: "🙁", label: "Low" },
  { v: 3, face: "😐", label: "Okay" },
  { v: 4, face: "🙂", label: "Good" },
  { v: 5, face: "😄", label: "Great" },
];

/** A quick private journal entry, with an optional mood. */
function JournalComposer({ isAdventure, onDone }: { isAdventure: boolean; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await addJournalEntryAction(body, mood);
        setSaved(true);
        setTimeout(onDone, 900);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-1 px-4 py-8 text-center" role="status">
        <span className="text-3xl" aria-hidden>
          ✒️
        </span>
        <p className={`m-0 ${isAdventure ? "font-display text-xl" : "text-lg font-bold"}`}>Written in your journal</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1.5">
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder="What's on your mind?"
        aria-label="Journal entry"
        className="resize-y rounded-lg border px-3 py-2 text-[16px] leading-relaxed"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">How are you feeling? <span className="font-normal" style={{ color: "var(--t-ink-soft)" }}>(optional)</span></span>
        <div role="radiogroup" aria-label="Mood" className="grid grid-cols-5 gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m.v}
              type="button"
              role="radio"
              aria-checked={mood === m.v}
              onClick={() => setMood(mood === m.v ? null : m.v)}
              className="create-kind flex flex-col items-center rounded-xl py-1.5 text-[11.5px]"
              style={{
                background: mood === m.v ? "rgba(217,180,95,.4)" : "rgba(70,50,20,.07)",
                border: `1.5px solid ${mood === m.v ? "#a88a3f" : "transparent"}`,
              }}
            >
              <span className="text-[22px] leading-tight" aria-hidden>
                {m.face}
              </span>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Link href="/journal" onClick={onDone} className="text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
          Open journal
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={isSaving || !body.trim()}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-45"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {isSaving ? "Saving…" : "Save entry"}
        </button>
      </div>
    </div>
  );
}

/** A new quest board (or a sub-board inside the current one). */
function BoardComposer({ parentBoardId, isAdventure, onDone }: { parentBoardId?: string; isAdventure: boolean; onDone: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          try {
            await createBoardAction(fd);
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't create the board.");
          }
        })
      }
      className="flex flex-col gap-3 px-4 pb-4 pt-1.5"
    >
      {parentBoardId && <input type="hidden" name="parentBoardId" value={parentBoardId} />}
      <input
        name="title"
        required
        autoFocus
        placeholder={parentBoardId ? "Sub-board name" : "Board name (e.g. Health, Family, Work)"}
        aria-label="Board name"
        className="h-11 rounded-lg border px-3 text-[16px] font-semibold"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      <textarea
        name="description"
        rows={2}
        placeholder="What it's for (optional)"
        aria-label="Board description"
        className="resize-none rounded-lg border px-3 py-2 text-[16px]"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      {error && (
        <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {isPending ? "Creating…" : parentBoardId ? "Create sub-board" : "Create board"}
        </button>
      </div>
    </form>
  );
}

function NowGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="#58a04a" stroke="#2f5a26" strokeWidth="1.4" />
      <path d="M10 8.2v7.6l6-3.8z" fill="#fff" />
    </svg>
  );
}

function QuillGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 3.5C13 5 8.5 9.5 6.5 17l1.6.4C9.4 14 11.5 12 14 10.6c-1.6 2-2.6 3.8-3.2 6.1 4.2-1.1 7.6-5.3 9.2-13.2z" fill="#f3e6c8" stroke="#5a4214" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 20.5l3-3.2" stroke="#5a4214" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ScrollGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="4" width="14" height="16" rx="2" fill="#f3e6c8" stroke="#7a5f2a" strokeWidth="1.4" />
      <path d="M8 9h8M8 12.5h8M8 16h5" stroke="#7a5f2a" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
