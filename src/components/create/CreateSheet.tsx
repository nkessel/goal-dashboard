"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { addJournalEntryAction, createBoardAction } from "@/app/actions";
import { EmbedHostContext } from "@/components/ui/EmbedHost";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";
import { RewardEditorDialog } from "@/components/rewards/RewardEditorDialog";
import { RiteEditorDialog } from "@/components/evening/RiteEditorDialog";
import { Moon } from "@/components/evening/BeginEveningButton";
import { BoltIcon, DiamondIcon } from "@/components/ui/Icons";
import { QuestShield } from "@/components/ui/Ornaments";
import { useEscape } from "@/lib/use-escape";
import { QuickCheckIn } from "./QuickCheckIn";
import { EVERYDAY_JOURNAL_KINDS, JOURNAL_KINDS, type JournalKind } from "@/lib/journal-kinds";
import { ChatIcon, openFeedback } from "@/components/feedback/FeedbackDock";

export type CreateKind = "quest" | "now" | "habit" | "reward" | "rite" | "journal" | "board" | "subboard";

const KIND_META: Record<CreateKind, { label: string; icon: React.ReactNode }> = {
  quest: { label: "Quest", icon: <QuestShield size={18} /> },
  now: { label: "Doing now", icon: <NowGlyph /> },
  habit: { label: "Habit", icon: <HabitGlyph /> },
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
  pinToToday = false,
  theme = "calm",
  onClose,
}: {
  /** Opened from Today's Quests' own +: the new quest goes straight there. */
  pinToToday?: boolean;
  kinds: CreateKind[];
  initial?: CreateKind;
  /** Quests (and sub-boards) made here go on this board. */
  boardId?: string;
  todayFull?: boolean;
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  // With both making-things and the journal on offer, the first screen asks which.
  const makeKinds = kinds.filter((k) => k !== "journal");
  const offersChoice = initial !== "journal" && makeKinds.length > 0 && kinds.includes("journal");
  const [stage, setStage] = useState<"choose" | "make" | "journal" | "checkin">(offersChoice ? "choose" : initial === "journal" ? "journal" : "make");
  const sheetRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const [kind, setKind] = useState<CreateKind>(initial ?? makeKinds[0] ?? kinds[0]);
  const [leaving, setLeaving] = useState(false);
  const keyboard = useKeyboardViewport();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const isAdventure = theme === "adventure";
  useEscape(() => close());

  function close() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, 190);
  }

  const shownKind: CreateKind = stage === "journal" ? "journal" : kind;
  const tabKinds = stage === "journal" || stage === "checkin" ? [] : makeKinds;

  // Point the little tail exactly at the + (measured, so scrollbars and
  // centring can't throw it off).
  useEffect(() => {
    const place = () => {
      const tail = tailRef.current;
      const sheet = sheetRef.current;
      if (!tail || !sheet) return;
      const fabX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fab-x")) || window.innerWidth / 2;
      const left = fabX - sheet.getBoundingClientRect().left - 6;
      tail.style.marginLeft = `${Math.max(14, Math.min(sheet.offsetWidth - 26, left))}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  });
  const editorKey = shownKind;
  const editor =
    stage === "checkin" ? (
      <QuickCheckIn key="checkin" isAdventure={isAdventure} onDone={close} />
    ) : shownKind === "quest" || shownKind === "now" ? (
      <QuestEditorDialog key={editorKey} mode={{ kind: "create", boardId, todayFull, doingNow: kind === "now", ...(pinToToday ? { pinToBattle: true } : {}) }} theme={theme} onClose={close} />
    ) : shownKind === "reward" ? (
      <RewardEditorDialog key={editorKey} theme={theme} onClose={close} />
    ) : shownKind === "rite" || shownKind === "habit" ? (
      <RiteEditorDialog key={editorKey} slot={shownKind === "habit" ? "day" : "evening"} onClose={close} />
    ) : shownKind === "journal" ? (
      <JournalComposer key="journal" isAdventure={isAdventure} onDone={close} />
    ) : (
      <BoardComposer key={editorKey} parentBoardId={shownKind === "subboard" ? boardId : undefined} isAdventure={isAdventure} onDone={close} />
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
        ref={sheetRef}
        role="dialog"
        aria-modal
        aria-label="Create something new"
        onKeyDown={(e) => {
          // Ctrl/⌘ + Enter submits whatever form is open.
          if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
          const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-submit]:not(:disabled)");
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }}
        className={`create-sheet fixed inset-x-0 z-[49] mx-auto flex w-[calc(100%-16px)] max-w-md flex-col ${leaving ? "create-sheet-out" : "create-sheet-in"}`}
        style={{
          ...(keyboard
            ? // Keyboard up: use all the room left above it.
              { top: keyboard.top + 6, height: keyboard.height - 12, bottom: "auto" }
            : {
                bottom: "calc(5rem + 66px + env(safe-area-inset-bottom))",
                maxHeight: "calc(100dvh - 5rem - 66px - 12px - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
              }),
        }}
      >
        <div
          className={stage === "choose" ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl"}
          style={
            stage === "choose"
              ? { color: "var(--t-ink)" }
              : {
                  background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
                  border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
                  color: "var(--t-ink)",
                }
          }
        >
        {stage === "choose" ? (
          <div className="relative z-[1] flex flex-col gap-2.5 px-2 pb-2">
            <ChoiceButton
              icon={<QuestShield size={26} />}
              title={makeKinds.includes("board") ? "New quest or board" : makeKinds.includes("subboard") ? "New quest or sub-board" : "New quest"}
              hint={makeKinds.map((k) => KIND_META[k].label).join(" · ")}
              special
              isAdventure={isAdventure}
              onClick={() => setStage("make")}
            />
            <ChoiceButton icon={<ChatIcon size={24} />} title="Feedback" hint="What to change in the next update, or an idea for the future" isAdventure={isAdventure} onClick={() => {
                openFeedback();
                close();
              }} />
            <ChoiceButton icon={<BoltIcon size={24} />} title="Check in" hint="Energy, mood, an event or #tags — all optional" isAdventure={isAdventure} onClick={() => setStage("checkin")} />
            <ChoiceButton icon={<QuillGlyph />} title="Journal entry" hint="Gratitude, reflections, wins, ideas" isAdventure={isAdventure} onClick={() => setStage("journal")} />
          </div>
        ) : (
          <div className="relative z-[1] flex shrink-0 items-center gap-1 px-2 pt-2.5">
            {offersChoice && (
              <button
                type="button"
                onClick={() => setStage("choose")}
                aria-label="Back"
                className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ color: "var(--t-ink-soft)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {stage === "checkin" ? (
              <span className={`flex items-center gap-2 py-1.5 pl-1 ${isAdventure ? "font-display text-[19px]" : "text-base font-bold"}`}>
                <BoltIcon size={18} /> Check in
              </span>
            ) : stage === "journal" ? (
              <span className={`flex items-center gap-2 py-1.5 pl-1 ${isAdventure ? "font-display text-[19px]" : "text-base font-bold"}`}>
                <QuillGlyph /> Journal entry
              </span>
            ) : (
              tabKinds.length > 1 && (
                <div role="tablist" aria-label="What to make" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {tabKinds.map((k) => {
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
              )
            )}
          </div>
        )}
        {stage !== "choose" && (
          <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div ref={setHost} className="embed-host" />
            {host && <EmbedHostContext.Provider value={host}>{editor}</EmbedHostContext.Provider>}
          </div>
        )}
        </div>
        {/* A small tail pointing down at the + it came from. */}
        {!keyboard && !pinToToday && stage !== "choose" && <span ref={tailRef} aria-hidden className="-mt-[7px] block h-3 w-3 shrink-0 rotate-45 self-start" style={{ background: isAdventure ? "#e4cfa3" : "var(--t-card)", borderRight: "2px solid #c7a96f", borderBottom: "2px solid #c7a96f" }} />}
      </div>
    </>,
    document.body
  );
}

/** An unfinished journal entry handed from the + sheet to the journal screen. */
export const JOURNAL_DRAFT_KEY = "journal-draft";

const MOODS = [
  { v: 1, face: "😞", label: "Rough" },
  { v: 2, face: "🙁", label: "Low" },
  { v: 3, face: "😐", label: "Okay" },
  { v: 4, face: "🙂", label: "Good" },
  { v: 5, face: "😄", label: "Great" },
];

/** A quick private journal entry, with an optional mood. */
function JournalComposer({ feedback = false, isAdventure, onDone }: { feedback?: boolean; isAdventure: boolean; onDone: () => void }) {
  // Picks up an entry carried over from the + sheet ("Open journal").
  const [draft] = useState<{ body: string; mood: number | null; kind: JournalKind | null } | null>(() => {
    if (feedback) return null;
    try {
      const raw = window.localStorage.getItem(JOURNAL_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [body, setBody] = useState(draft?.body ?? "");
  const [mood, setMood] = useState<number | null>(draft?.mood ?? null);
  const [kind, setKind] = useState<JournalKind | null>(feedback ? "feedback" : (draft?.kind ?? null));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await addJournalEntryAction(body, feedback ? null : mood, kind);
        try {
          if (!feedback) window.localStorage.removeItem(JOURNAL_DRAFT_KEY);
        } catch {
          /* storage unavailable */
        }
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
        {feedback ? (
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden className="card-pop-in">
            <circle cx="12" cy="12" r="10.5" fill="#58a04a" stroke="#2f5a26" strokeWidth="1.2" />
            <path d="M6.8 12.4l3.4 3.4 7-7.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="text-3xl" aria-hidden>
            ✒️
          </span>
        )}
        <p className={`m-0 ${isAdventure ? "font-display text-xl" : "text-lg font-bold"}`}>
          {!feedback ? "Written in your journal" : kind === "future" ? "Saved to the future ideas log" : "Feedback sent — it goes into the next update"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1.5">
      {feedback ? (
        <div role="radiogroup" aria-label="When" className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["feedback", "Next iteration", "Build it in the next update"],
              ["future", "For the future", "Keep it in the ideas log"],
            ] as const
          ).map(([k, label, hint]) => {
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k)}
                className="create-kind flex flex-col items-start rounded-xl px-3 py-2 text-left"
                style={{ background: on ? "rgba(217,180,95,.45)" : "rgba(70,50,20,.07)", border: `1.5px solid ${on ? "#a88a3f" : "transparent"}`, color: "var(--t-ink)" }}
              >
                <span className="text-[14.5px] font-semibold">{label}</span>
                <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
      <div role="radiogroup" aria-label="Kind of entry" className="flex flex-wrap gap-1.5">
        {EVERYDAY_JOURNAL_KINDS.map((k) => {
          const on = kind === k.key;
          return (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setKind(on ? null : k.key)}
              className="create-kind flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold"
              style={{
                background: on ? "rgba(217,180,95,.45)" : "rgba(70,50,20,.07)",
                border: `1.5px solid ${on ? "#a88a3f" : "transparent"}`,
                color: "var(--t-ink)",
              }}
            >
              <span aria-hidden>{k.icon}</span>
              {k.label}
            </button>
          );
        })}
      </div>
      )}
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        placeholder={JOURNAL_KINDS.find((k) => k.key === kind)?.prompt ?? "What's on your mind?"}
        aria-label="Journal entry"
        className="resize-y rounded-lg border px-3 py-2 text-[16px] leading-relaxed"
        style={{ borderColor: "var(--t-panel-border)" }}
      />
      {!feedback && (
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
      )}
      {error && (
        <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {!feedback ? (
          <Link
            href="/journal"
            onClick={() => {
              // Carry the unfinished entry over to the journal screen.
              try {
                if (body.trim()) window.localStorage.setItem(JOURNAL_DRAFT_KEY, JSON.stringify({ body, mood, kind }));
              } catch {
                /* storage unavailable */
              }
              onDone();
            }}
            className="text-[13px] underline"
            style={{ color: "var(--t-ink-soft)" }}
          >
            Open journal
          </Link>
        ) : (
          <span />
        )}
        <span className="ml-auto hidden text-[12px] sm:inline" style={{ color: "var(--t-ink-soft)" }}>
          Ctrl + Enter
        </span>
        <button
          type="button"
          data-submit
          onClick={save}
          disabled={isSaving || !body.trim()}
          className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-45"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
        >
          {isSaving ? "Saving…" : feedback ? "Submit Feedback" : "Save entry"}
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
          data-submit
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

/** On phones, the area left above the on-screen keyboard (null while it's down). */
function useKeyboardViewport(): { top: number; height: number } | null {
  const [vp, setVp] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const open = vv.height < window.innerHeight - 120;
      setVp(open ? { top: vv.offsetTop, height: vv.height } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return vp;
}

function ChoiceButton({ icon, title, hint, special = false, isAdventure, onClick }: { icon: React.ReactNode; title: string; hint: string; special?: boolean; isAdventure: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="create-kind choice-float hover-glow flex min-h-[64px] items-center gap-3 rounded-full px-3 py-2.5 text-left"
      style={{
        background: special
          ? isAdventure
            ? "linear-gradient(180deg, #f6e2a6, #e2c47a)"
            : "var(--t-accent-soft)"
          : isAdventure
            ? "linear-gradient(180deg, #f4e7c8, #e6d3a8)"
            : "var(--t-card)",
        border: `1.5px solid ${special ? "#a8822a" : "#b39a6a"}`,
        boxShadow: "0 8px 20px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.6)",
        color: "var(--t-ink)",
      }}
    >
      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,250,238,.7)", border: "1.5px solid #c7a96f" }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
          {hint}
        </span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--t-ink-soft)" }}>
        <path d="M9.5 5.5 16 12l-6.5 6.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function HabitGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.1 6" stroke="#7a5f2a" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 4.8l.8 4.9 4.8-1.1" stroke="#7a5f2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 12.4l2.4 2.4 4.6-5" stroke="#4f7d3a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
