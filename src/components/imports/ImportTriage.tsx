"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideImportCardAction, importCardAction, markImportCardImportedAction } from "@/app/actions";
import type { ImportCard } from "@/lib/data/import-cards";
import { useEscape } from "@/lib/use-escape";
import { DateField } from "@/components/ui/DateField";
import { SnoozePicker, type SnoozeChoice } from "@/components/tasks/SnoozePicker";
import { QuestEditorDialog } from "@/components/tasks/QuestEditorDialog";

/*
 * Sorting imports, one card at a time: Import, Snooze or Skip. Import walks
 * through a few small questions (which board, when, how much it matters; for
 * a habit, how often and how long), one at a time, each skippable, ending on
 * a short review. "Fill it all in myself" shows every field at once, and a
 * quest can open the full quest editor from there.
 */

type BoardOpt = { id: string; title: string; color: string | null };
type Step = "board" | "when" | "matters" | "often" | "time" | "review";
type Draft = {
  kind: "quest" | "habit";
  title: string;
  description: string;
  steps: string[];
  boardId: string | null | undefined;
  due: string | null | undefined;
  importance: number | null | undefined;
  minutes: number | null | undefined;
  /** Habits: "daily", "weekdays", "days" (pick weekdays) or an interval. */
  often: "daily" | "weekdays" | "days" | "week" | "2week" | "month" | undefined;
  days: number[];
};

const INK = "var(--t-ink)";
const SOFT = "var(--t-ink-soft)";
const GOLD = "#8a6116";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The clock, read when a choice is drawn or made.
const now = () => new Date();
const inDays = (n: number) => {
  const d = now();
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const nextDow = (dow: number) => {
  const d = now();
  d.setDate(d.getDate() + (((dow - d.getDay() + 7) % 7) || 7));
  return keyOf(d);
};
const dayLabel = (k: string) => {
  if (k === inDays(0)) return "Today";
  if (k === inDays(1)) return "Tomorrow";
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const minutesLabel = (m: number) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} hr` : `${m} min`);
const findBoard = (boards: BoardOpt[], hint: string | null) => {
  if (!hint) return undefined;
  const h = hint.trim().toLowerCase();
  return boards.find((b) => b.title.trim().toLowerCase() === h) ?? boards.find((b) => b.title.toLowerCase().includes(h) || h.includes(b.title.toLowerCase()));
};

function draftFor(card: ImportCard): Draft {
  const r = card.repeat;
  let often: Draft["often"];
  let days: number[] = [];
  if (r?.weekdays?.length) {
    often = "days";
    days = r.weekdays.filter((d) => d >= 0 && d <= 6);
  } else if (r?.times && r.times > 1 && (r.unit ?? "week") === "week") often = "days";
  else if (r?.unit === "day") often = "daily";
  else if (r?.unit === "week") often = (r.every ?? 1) >= 2 ? "2week" : "week";
  else if (r?.unit === "month") often = "month";
  return {
    kind: card.kind,
    title: card.title,
    description: card.description ?? "",
    steps: card.steps,
    boardId: undefined,
    due: card.due_on ?? undefined,
    importance: undefined,
    minutes: card.minutes ?? undefined,
    often,
    days,
  };
}

const chip = (on: boolean, big = false): React.CSSProperties => ({
  border: `1.5px solid ${on ? "#8a6116" : "#b39a6a"}`,
  color: "#2a1c10",
  background: on ? "radial-gradient(circle at 35% 25%, #fff0bd, #e2bb5c 70%, #c9a04a)" : "rgba(255,250,238,.7)",
  boxShadow: on ? "0 0 10px rgba(242,210,126,.5)" : undefined,
  minHeight: big ? 44 : 36,
});

export function ImportTriage({ waiting, setAside, boards, theme }: { waiting: ImportCard[]; setAside: ImportCard[]; boards: BoardOpt[]; theme: "calm" | "adventure" }) {
  const router = useRouter();
  const [queue, setQueue] = useState(waiting);
  const [aside, setAsideList] = useState(setAside);
  const [mode, setMode] = useState<"card" | "guided" | "all">("card");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stepAt, setStepAt] = useState(0);
  const [snoozing, setSnoozing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editor, setEditor] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = queue[0] ?? null;

  const steps: Step[] = draft?.kind === "habit" ? ["often", "time", "review"] : ["board", "when", "matters", "review"];
  const step = steps[Math.min(stepAt, steps.length - 1)];

  useEscape(() => (mode === "guided" && stepAt > 0 ? setStepAt(stepAt - 1) : setMode("card")), mode !== "card" && !snoozing && !editor);

  function say(text: string, undo?: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }
  function next() {
    setQueue((q) => q.slice(1));
    setMode("card");
    setDraft(null);
    setStepAt(0);
    setError(null);
  }
  function putBack(c: ImportCard) {
    setQueue((q) => [c, ...q.filter((x) => x.id !== c.id)]);
    setAsideList((a) => a.filter((x) => x.id !== c.id));
  }
  function begin(all: boolean) {
    if (!card) return;
    const d = draftFor(card);
    setDraft({ ...d, boardId: findBoard(boards, card.board_hint)?.id });
    setStepAt(0);
    setMode(all ? "all" : "guided");
  }
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const advance = (p?: Partial<Draft>) => {
    if (p) patch(p);
    setStepAt((i) => Math.min(i + 1, steps.length - 1));
  };

  function decide(choice: { kind: "snooze"; until: string; label: string } | { kind: "skip" } | { kind: "delete" }) {
    if (!card) return;
    const c = card;
    next();
    if (choice.kind === "delete") {
      // Deleted for good after a moment, unless undone.
      const t = setTimeout(() => decideImportCardAction(c.id, { kind: "delete" }).catch(() => null), 5200);
      say(`Deleted “${c.title}”`, () => {
        clearTimeout(t);
        putBack(c);
        setToast(null);
      });
      return;
    }
    const restore = () => {
      putBack(c);
      setToast(null);
      decideImportCardAction(c.id, { kind: "restore" }).catch(() => null);
    };
    decideImportCardAction(c.id, choice.kind === "snooze" ? { kind: "snooze", until: choice.until } : { kind: "skip" })
      .then(() => setAsideList((a) => [{ ...c, status: choice.kind === "snooze" ? "snoozed" : "skipped" }, ...a]))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't save that."));
    say(choice.kind === "snooze" ? `Snoozed ${choice.label}` : `Skipped “${c.title}”`, restore);
  }

  function snoozeTo(choice: SnoozeChoice) {
    setSnoozing(false);
    if ("tomorrow" in choice) {
      const d = now();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      decide({ kind: "snooze", until: d.toISOString(), label: "until tomorrow" });
    } else decide({ kind: "snooze", until: choice.until.toISOString(), label: choice.label });
  }

  function save() {
    if (!card || !draft) return;
    const d = draft;
    const due = d.due || null;
    const dueAt = due ? new Date(`${due}T23:59`).toISOString() : null;
    const daysOut = due ? Math.round((new Date(`${due}T12:00`).getTime() - new Date(`${inDays(0)}T12:00`).getTime()) / 86_400_000) : null;
    const urgency = daysOut === null ? null : daysOut <= 0 ? 5 : daysOut === 1 ? 4 : daysOut <= 7 ? 3 : 2;
    const from = inDays(0);
    const habitTiming =
      d.often === "weekdays"
        ? { days: [1, 2, 3, 4, 5], repeat: null }
        : d.often === "days" && d.days.length
          ? { days: d.days, repeat: null }
          : d.often === "week"
            ? { days: null, repeat: { every: 1, unit: "week" as const, from } }
            : d.often === "2week"
              ? { days: null, repeat: { every: 2, unit: "week" as const, from } }
              : d.often === "month"
                ? { days: null, repeat: { every: 1, unit: "month" as const, from } }
                : { days: null, repeat: null };
    start(async () => {
      try {
        setError(null);
        await importCardAction(card.id, {
          kind: d.kind,
          title: d.title,
          description: d.description.trim() || null,
          steps: d.steps,
          boardId: d.boardId ?? null,
          dueAt,
          importance: d.importance ?? null,
          urgency,
          minutes: d.minutes ?? null,
          ...(d.kind === "habit" ? habitTiming : {}),
        });
        const board = boards.find((b) => b.id === d.boardId);
        say(d.kind === "habit" ? `“${d.title}” is one of your habits now` : `Added “${d.title}”${board ? ` to ${board.title}` : ""}`);
        next();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that.");
      }
    });
  }

  const isAdventure = theme === "adventure";
  const frame: React.CSSProperties = { border: "1.5px solid #a88a3f", boxShadow: "0 10px 30px rgba(0,0,0,.35)", color: "#2a1c10", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h1 className="m-0 font-display text-[26px]" style={{ color: isAdventure ? "#f2d27e" : INK }}>
          Sort your imports
        </h1>
        {queue.length > 0 && (
          <span className="text-[13.5px]" style={{ color: isAdventure ? "rgba(242,226,180,.8)" : SOFT }}>
            {queue.length === 1 ? "the last one" : `${queue.length} to sort`}
          </span>
        )}
      </div>

      {!card ? (
        <div className="card-pop-in parchment flex flex-col items-center gap-2 rounded-3xl px-5 py-8 text-center" style={frame}>
          <span aria-hidden className="text-[34px]">✦</span>
          <h2 className="m-0 font-display text-[22px]">All sorted</h2>
          <p className="m-0 text-[14px]" style={{ color: "#6b5631" }}>
            Everything you brought in has found its place.
          </p>
          <Link href="/" className="mt-2 flex h-10 items-center rounded-full px-5 text-[14.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Back to Today
          </Link>
        </div>
      ) : mode === "card" ? (
        <CardView key={card.id} card={card} frame={frame} onImport={() => begin(false)} onSnooze={() => setSnoozing(true)} onSkip={() => decide({ kind: "skip" })} menu={menu} setMenu={setMenu} onDelete={() => (setMenu(false), decide({ kind: "delete" }))} />
      ) : draft ? (
        <div key={`${card.id}-${mode}`} className="card-pop-in parchment flex flex-col gap-3 rounded-3xl p-4" style={frame}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => (mode === "guided" && stepAt > 0 ? setStepAt(stepAt - 1) : setMode("card"))} aria-label="Back" className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-[20px]" style={{ color: "#6b5631" }}>
              ‹
            </button>
            <span className="min-w-0 flex-1 truncate font-display text-[17px]">{draft.title}</span>
            {mode === "guided" && (
              <span className="flex shrink-0 items-center gap-1" aria-hidden>
                {steps.map((s, i) => (
                  <span key={s} className="h-1.5 rounded-full transition-all" style={{ width: i === stepAt ? 16 : 6, background: i <= stepAt ? "#b8913f" : "rgba(139,112,64,.3)" }} />
                ))}
              </span>
            )}
          </div>

          {mode === "guided" ? (
            <div key={step} className="reveal flex flex-col gap-3">
              {step === "board" && <BoardStep boards={boards} hint={card.board_hint} value={draft.boardId} onPick={(boardId) => advance({ boardId })} />}
              {step === "when" && <WhenStep noted={card.due_on} value={draft.due} onPick={(due) => advance({ due })} />}
              {step === "matters" && <MattersStep value={draft.importance} onPick={(importance) => advance({ importance })} />}
              {step === "often" && <OftenStep draft={draft} hint={card.repeat_text} onChange={patch} onDone={() => advance()} />}
              {step === "time" && <TimeStep value={draft.minutes} hint={card.repeat_text} onPick={(minutes) => advance({ minutes })} />}
              {step === "review" && <Review draft={draft} boards={boards} onChange={patch} onJump={(s) => setStepAt(steps.indexOf(s))} />}
              <div className="flex items-center gap-3 pt-1">
                {step !== "review" ? (
                  <button type="button" onClick={() => advance()} className="h-9 rounded-full px-3 text-[13.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                    Skip this
                  </button>
                ) : (
                  <span />
                )}
                <span className="flex-1" />
                {step === "review" && (
                  <button type="button" onClick={save} disabled={saving} className="h-11 rounded-full px-6 text-[15px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Adding…" : draft.kind === "habit" ? "Add the habit" : "Add the quest"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <AllAtOnce draft={draft} boards={boards} hint={card} onChange={patch} />
          )}

          {error && (
            <p role="alert" className="m-0 text-[13px]" style={{ color: "var(--t-warn, #a33)" }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2.5" style={{ borderColor: "rgba(139,112,64,.3)" }}>
            {mode === "guided" ? (
              <button type="button" onClick={() => setMode("all")} className="text-[13.5px] font-semibold underline underline-offset-2" style={{ color: GOLD }}>
                Fill it all in myself
              </button>
            ) : (
              <>
                <button type="button" onClick={() => (setStepAt(0), setMode("guided"))} className="text-[13.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                  Step by step instead
                </button>
                {draft.kind === "quest" && (
                  <button type="button" onClick={() => setEditor(true)} className="text-[13.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                    Open the full quest editor
                  </button>
                )}
                <span className="flex-1" />
                <button type="button" onClick={save} disabled={saving} className="h-11 rounded-full px-6 text-[15px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Adding…" : draft.kind === "habit" ? "Add the habit" : "Add the quest"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {aside.length > 0 && <SetAside cards={aside} onBack={(c) => (putBack(c), decideImportCardAction(c.id, { kind: "restore" }).catch(() => null))} isAdventure={isAdventure} />}

      {snoozing && card && <SnoozePicker title={card.title} onPick={snoozeTo} onClose={() => setSnoozing(false)} />}
      {editor && card && draft && (
        <QuestEditorDialog
          mode={{ kind: "create", boardId: draft.boardId ?? null, prefill: { title: draft.title, description: draft.description, estimateMinutes: draft.minutes ?? null, importance: draft.importance ?? undefined } }}
          theme={theme}
          onClose={() => setEditor(false)}
          onCreated={(id) => {
            setEditor(false);
            markImportCardImportedAction(card.id, id).catch(() => null);
            say(`Added “${draft.title}”`);
            next();
            router.refresh();
          }}
        />
      )}

      {toast && (
        <div role="status" className="card-pop-in fixed inset-x-0 bottom-24 z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full px-4 py-2 text-[14px]" style={{ background: "rgba(28,26,16,.95)", color: "#f6e7c1", border: "1px solid #8d7642", boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>
          <span className="min-w-0 truncate">{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="shrink-0 font-semibold underline underline-offset-2" style={{ color: "#f2d27e" }}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CardView({ card, frame, onImport, onSnooze, onSkip, menu, setMenu, onDelete }: { card: ImportCard; frame: React.CSSProperties; onImport: () => void; onSnooze: () => void; onSkip: () => void; menu: boolean; setMenu: (v: boolean) => void; onDelete: () => void }) {
  const [source, setSource] = useState(false);
  const facts = [card.repeat_text, card.due_on ? `Due ${dayLabel(card.due_on)}` : null, card.minutes ? minutesLabel(card.minutes) : null, card.board_hint ? `Board: ${card.board_hint}` : null].filter(Boolean) as string[];
  return (
    <div className="card-pop-in parchment relative flex flex-col gap-2.5 rounded-3xl p-4" style={frame} onContextMenu={(e) => (e.preventDefault(), setMenu(true))}>
      <div className="flex items-center gap-2 pr-9">
        <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[.08em]" style={{ background: "rgba(217,180,95,.25)", color: GOLD, border: "1px solid rgba(139,112,64,.4)" }}>
          {card.kind === "habit" ? "🌱 Habit" : "⚔ Quest"}
        </span>
      </div>
      <button type="button" onClick={() => setMenu(!menu)} aria-label="More choices" aria-expanded={menu} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-[18px] hover:bg-black/[.06]" style={{ color: "#6b5631" }}>
        ⋯
      </button>
      {menu && (
        <div className="reveal absolute right-2 top-11 z-[5] flex min-w-[160px] flex-col rounded-xl p-1" style={{ background: "#fbf3df", border: "1px solid #a88a3f", boxShadow: "0 8px 20px rgba(0,0,0,.25)" }}>
          <button type="button" onClick={onDelete} className="h-9 rounded-lg px-3 text-left text-[14px] hover:bg-black/[.05]" style={{ color: "#8b2c1a" }}>
            Delete for good
          </button>
        </div>
      )}
      <h2 className="m-0 font-display text-[23px] leading-tight [overflow-wrap:anywhere]">{card.title}</h2>
      {card.description && (
        <p className="m-0 whitespace-pre-wrap text-[14.5px] leading-snug [overflow-wrap:anywhere]" style={{ color: "#4a3a22" }}>
          {card.description}
        </p>
      )}
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <span key={f} className="rounded-full px-2.5 py-1 text-[12.5px]" style={{ background: "rgba(255,250,238,.7)", border: "1px solid #c8b38a", color: "#4a3a22" }}>
              {f}
            </span>
          ))}
        </div>
      )}
      {card.steps.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {card.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-[14px]">
              <span aria-hidden className="mt-[3px] text-[10px]" style={{ color: "#b8913f" }}>
                ◆
              </span>
              <span className="[overflow-wrap:anywhere]">{s}</span>
            </li>
          ))}
        </ul>
      )}
      {(card.source_label || card.source_text) && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => setSource(!source)} disabled={!card.source_text} aria-expanded={source} className="flex items-center gap-1 self-start text-[12.5px]" style={{ color: "#7a6440" }}>
            From {card.source_label || "your notes"}
            {card.source_text && <span aria-hidden className="inline-block transition-transform" style={{ transform: source ? "rotate(90deg)" : undefined }}>›</span>}
          </button>
          <div className="drawer-body" data-open={source || undefined}>
            <div className="drawer-inner">
              <p className="m-0 max-h-[180px] overflow-y-auto whitespace-pre-wrap rounded-lg px-2.5 py-2 text-[13px] italic" style={{ background: "rgba(255,250,238,.55)", color: "#5a4a30", border: "1px dashed #c8b38a" }}>
                {card.source_text}
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={onSkip} className="h-10 rounded-full px-4 text-[14px] font-semibold" style={chip(false)}>
          Skip
        </button>
        <button type="button" onClick={onSnooze} className="h-10 rounded-full px-4 text-[14px] font-semibold" style={chip(false)}>
          Snooze…
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onImport} className="h-11 rounded-full px-6 text-[15px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          Import ✦
        </button>
      </div>
    </div>
  );
}

function Question({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="m-0 font-display text-[20px]">{children}</h3>
      {hint && (
        <span className="text-[13px]" style={{ color: "#6b5631" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Choices({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Choice({ on, onClick, children, note }: { on: boolean; onClick: () => void; children: React.ReactNode; note?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex items-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold" style={chip(on, true)}>
      {children}
      {note && (
        <span className="text-[11.5px] font-normal italic" style={{ color: "#7a6440" }}>
          {note}
        </span>
      )}
    </button>
  );
}

function BoardStep({ boards, hint, value, onPick }: { boards: BoardOpt[]; hint: string | null; value: string | null | undefined; onPick: (id: string | null) => void }) {
  const suggested = findBoard(boards, hint);
  const ordered = suggested ? [suggested, ...boards.filter((b) => b.id !== suggested.id)] : boards;
  return (
    <>
      <Question hint={hint && !suggested ? `The note suggests “${hint}”, which isn't a board yet.` : undefined}>Which board does it belong on?</Question>
      <Choices>
        {ordered.map((b) => (
          <Choice key={b.id} on={value === b.id} onClick={() => onPick(b.id)} note={b.id === suggested?.id ? "suggested" : undefined}>
            {b.color && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />}
            {b.title}
          </Choice>
        ))}
        <Choice on={value === null} onClick={() => onPick(null)}>
          No board
        </Choice>
      </Choices>
    </>
  );
}

function WhenStep({ noted, value, onPick }: { noted: string | null; value: string | null | undefined; onPick: (d: string | null) => void }) {
  const [picking, setPicking] = useState(false);
  const options: { label: string; day: string }[] = [
    { label: "Today", day: inDays(0) },
    { label: "Tomorrow", day: inDays(1) },
    { label: "This weekend", day: nextDow(6) },
    { label: "Next week", day: nextDow(1) },
    { label: "In 2 weeks", day: inDays(14) },
  ];
  return (
    <>
      <Question hint="A due date keeps it in view as it comes near.">When should it be done by?</Question>
      <Choices>
        {noted && (
          <Choice on={value === noted} onClick={() => onPick(noted)} note="as noted">
            {dayLabel(noted)}
          </Choice>
        )}
        {options.map((o) => (
          <Choice key={o.label} on={value === o.day && value !== noted} onClick={() => onPick(o.day)}>
            {o.label}
          </Choice>
        ))}
        <Choice on={picking} onClick={() => setPicking(true)}>
          Pick a day…
        </Choice>
        <Choice on={value === null} onClick={() => onPick(null)}>
          No due date
        </Choice>
      </Choices>
      {picking && (
        <div className="reveal">
          <DateField value={value ?? ""} min={inDays(0)} onChange={(d) => d && onPick(d)} ariaLabel="Due date" className="h-10 rounded-xl px-3 text-[15px]" />
        </div>
      )}
    </>
  );
}

const MATTERS: { label: string; value: number }[] = [
  { label: "A little", value: 2 },
  { label: "Quite a bit", value: 3 },
  { label: "A lot", value: 5 },
];
function MattersStep({ value, onPick }: { value: number | null | undefined; onPick: (v: number) => void }) {
  return (
    <>
      <Question hint="It helps the quest find its place among the rest.">How much does it matter to you?</Question>
      <Choices>
        {MATTERS.map((m) => (
          <Choice key={m.label} on={value === m.value} onClick={() => onPick(m.value)}>
            {m.label}
          </Choice>
        ))}
      </Choices>
    </>
  );
}

const OFTEN: { key: Draft["often"]; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "weekdays", label: "Weekdays" },
  { key: "days", label: "Certain days…" },
  { key: "week", label: "Once a week" },
  { key: "2week", label: "Every 2 weeks" },
  { key: "month", label: "Once a month" },
];
function OftenStep({ draft, hint, onChange, onDone }: { draft: Draft; hint: string | null; onChange: (p: Partial<Draft>) => void; onDone: () => void }) {
  return (
    <>
      <Question hint={hint ? `The note says: ${hint}` : undefined}>How often?</Question>
      <Choices>
        {OFTEN.map((o) => (
          <Choice key={o.key} on={draft.often === o.key} onClick={() => (o.key === "days" ? onChange({ often: "days" }) : (onChange({ often: o.key }), onDone()))}>
            {o.label}
          </Choice>
        ))}
      </Choices>
      {draft.often === "days" && <DayPicker days={draft.days} onChange={(days) => onChange({ days })} onDone={onDone} />}
    </>
  );
}

function DayPicker({ days, onChange, onDone }: { days: number[]; onChange: (d: number[]) => void; onDone?: () => void }) {
  return (
    <div className="reveal flex flex-wrap items-center gap-1.5">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = days.includes(d);
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])} className="h-9 w-12 rounded-full text-[13.5px] font-semibold" style={chip(on)}>
            {DAY_NAMES[d]}
          </button>
        );
      })}
      {onDone && days.length > 0 && (
        <button type="button" onClick={onDone} className="ml-1 h-9 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          Next
        </button>
      )}
    </div>
  );
}

const TIMES = [5, 15, 30, 60, 120];
function TimeStep({ value, hint, onPick }: { value: number | null | undefined; hint: string | null; onPick: (m: number) => void }) {
  const [own, setOwn] = useState(value && !TIMES.includes(value) ? String(value) : "");
  return (
    <>
      <Question hint={hint ? `The note says: ${hint}` : undefined}>How long does it take?</Question>
      <Choices>
        {TIMES.map((m) => (
          <Choice key={m} on={value === m} onClick={() => onPick(m)}>
            {minutesLabel(m)}
          </Choice>
        ))}
      </Choices>
      <label className="flex items-center gap-2 text-[13.5px]" style={{ color: "#6b5631" }}>
        Or
        <input value={own} onChange={(e) => setOwn(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(e) => e.key === "Enter" && Number(own) > 0 && onPick(Number(own))} inputMode="numeric" placeholder="45" aria-label="Minutes" className="h-9 w-20 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
        minutes
        {Number(own) > 0 && (
          <button type="button" onClick={() => onPick(Number(own))} className="h-9 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Next
          </button>
        )}
      </label>
    </>
  );
}

function oftenLabel(d: Draft) {
  if (d.often === "days") return d.days.length ? [1, 2, 3, 4, 5, 6, 0].filter((x) => d.days.includes(x)).map((x) => DAY_NAMES[x]).join(", ") : "Certain days";
  return OFTEN.find((o) => o.key === d.often)?.label ?? "Every day";
}

function Review({ draft, boards, onChange, onJump }: { draft: Draft; boards: BoardOpt[]; onChange: (p: Partial<Draft>) => void; onJump: (s: Step) => void }) {
  const board = boards.find((b) => b.id === draft.boardId);
  const facts: { step: Step; text: string }[] =
    draft.kind === "habit"
      ? [
          { step: "often", text: oftenLabel(draft) },
          { step: "time", text: draft.minutes ? minutesLabel(draft.minutes) : "Any length" },
        ]
      : [
          { step: "board", text: board ? board.title : "No board" },
          { step: "when", text: draft.due ? `Due ${dayLabel(draft.due)}` : "No due date" },
          { step: "matters", text: MATTERS.find((m) => m.value === draft.importance)?.label.replace(/^./, (c) => `Matters ${c.toLowerCase()}`) ?? "Matters: not said" },
        ];
  return (
    <>
      <Question hint="Tap anything to change it.">Ready to add</Question>
      <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Name" maxLength={200} className="h-11 rounded-xl border px-3 font-display text-[18px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
      <div className="flex flex-wrap gap-1.5">
        {facts.map((f) => (
          <button key={f.step} type="button" onClick={() => onJump(f.step)} className="rounded-full px-3 py-1.5 text-[13px]" style={{ background: "rgba(255,250,238,.7)", border: "1px solid #c8b38a", color: "#4a3a22" }}>
            {f.text}
          </button>
        ))}
      </div>
      <StepsList steps={draft.steps} onChange={(steps) => onChange({ steps })} kind={draft.kind} />
    </>
  );
}

function StepsList({ steps, onChange, kind }: { steps: string[]; onChange: (s: string[]) => void; kind: "quest" | "habit" }) {
  const [add, setAdd] = useState("");
  if (!steps.length && !add && kind === "habit") return null;
  return (
    <div className="flex flex-col gap-1">
      {steps.length > 0 && (
        <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
          {kind === "habit" ? "Sub-habits" : "Steps"}
        </span>
      )}
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span aria-hidden className="text-[10px]" style={{ color: "#b8913f" }}>
            ◆
          </span>
          <input value={s} onChange={(e) => onChange(steps.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Step ${i + 1}`} className="bare-input h-8 min-w-0 flex-1 bg-transparent px-1 text-[14.5px]" style={{ color: "#2a1c10", borderBottom: "1px solid rgba(139,112,64,.3)" }} />
          <button type="button" onClick={() => onChange(steps.filter((_, j) => j !== i))} aria-label={`Remove step ${i + 1}`} className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] hover:bg-black/[.05]" style={{ color: "#7a6440" }}>
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-[13px]" style={{ color: "#b8913f" }}>
          +
        </span>
        <input
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && add.trim()) {
              onChange([...steps, add.trim()]);
              setAdd("");
            }
          }}
          placeholder="Add a step"
          aria-label="Add a step"
          className="bare-input h-8 min-w-0 flex-1 bg-transparent px-1 text-[14.5px]"
          style={{ color: "#2a1c10" }}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function AllAtOnce({ draft, boards, hint, onChange }: { draft: Draft; boards: BoardOpt[]; hint: ImportCard; onChange: (p: Partial<Draft>) => void }) {
  const small = (on: boolean) => ({ ...chip(on), minHeight: 32 });
  return (
    <div className="reveal flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(["quest", "habit"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={draft.kind === k} onClick={() => onChange({ kind: k })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.kind === k)}>
            {k === "habit" ? "🌱 Habit" : "⚔ Quest"}
          </button>
        ))}
      </div>
      <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Name" maxLength={200} className="h-11 rounded-xl border px-3 font-display text-[18px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
      <textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} aria-label="Notes" placeholder="Notes" rows={2} className="rounded-xl border px-3 py-2 text-[15px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
      {draft.kind === "quest" ? (
        <>
          <Field label="Board">
            <div className="flex flex-wrap gap-1.5">
              {boards.map((b) => (
                <button key={b.id} type="button" aria-pressed={draft.boardId === b.id} onClick={() => onChange({ boardId: draft.boardId === b.id ? null : b.id })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.boardId === b.id)}>
                  {b.title}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Due">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                ["Today", inDays(0)],
                ["Tomorrow", inDays(1)],
                ["This weekend", nextDow(6)],
                ["Next week", nextDow(1)],
              ].map(([l, d]) => (
                <button key={l} type="button" aria-pressed={draft.due === d} onClick={() => onChange({ due: draft.due === d ? null : d })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.due === d)}>
                  {l}
                </button>
              ))}
              <DateField value={draft.due ?? ""} onChange={(d) => onChange({ due: d || null })} ariaLabel="Due date" placeholder={hint.due_on ? dayLabel(hint.due_on) : "Pick a day"} className="h-8 rounded-full px-3 text-[13px]" />
            </div>
          </Field>
          <Field label="How much it matters">
            <div className="flex flex-wrap gap-1.5">
              {MATTERS.map((m) => (
                <button key={m.label} type="button" aria-pressed={draft.importance === m.value} onClick={() => onChange({ importance: draft.importance === m.value ? null : m.value })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.importance === m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
        </>
      ) : (
        <Field label={hint.repeat_text ? `How often (note: ${hint.repeat_text})` : "How often"}>
          <div className="flex flex-wrap gap-1.5">
            {OFTEN.map((o) => (
              <button key={o.key} type="button" aria-pressed={draft.often === o.key} onClick={() => onChange({ often: o.key })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.often === o.key)}>
                {o.label}
              </button>
            ))}
          </div>
          {draft.often === "days" && <DayPicker days={draft.days} onChange={(days) => onChange({ days })} />}
        </Field>
      )}
      <Field label="Time it takes">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIMES.map((m) => (
            <button key={m} type="button" aria-pressed={draft.minutes === m} onClick={() => onChange({ minutes: draft.minutes === m ? null : m })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.minutes === m)}>
              {minutesLabel(m)}
            </button>
          ))}
          <input value={draft.minutes && !TIMES.includes(draft.minutes) ? String(draft.minutes) : ""} onChange={(e) => onChange({ minutes: Number(e.target.value.replace(/\D/g, "").slice(0, 4)) || null })} inputMode="numeric" placeholder="min" aria-label="Minutes" className="h-8 w-16 rounded-full border px-2 text-center text-[14px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
        </div>
      </Field>
      <StepsList steps={draft.steps} onChange={(steps) => onChange({ steps })} kind={draft.kind} />
    </div>
  );
}

function SetAside({ cards, onBack, isAdventure }: { cards: ImportCard[]; onBack: (c: ImportCard) => void; isAdventure: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 self-start text-[13.5px]" style={{ color: isAdventure ? "rgba(242,226,180,.85)" : SOFT }}>
        <span aria-hidden className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          ›
        </span>
        Set aside ({cards.length})
      </button>
      <div className="drawer-body" data-open={open || undefined}>
        <div className="drawer-inner">
          <div className="parchment flex flex-col gap-1 rounded-2xl p-2" style={{ border: "1px solid #a88a3f", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)" }}>
            {cards.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "#2a1c10" }}>
                  {c.title}
                </span>
                <span className="shrink-0 text-[12px] italic" style={{ color: "#7a6440" }}>
                  {c.status === "snoozed" && c.snoozed_until ? `until ${dayLabel(keyOf(new Date(c.snoozed_until)))}` : "skipped"}
                </span>
                <button type="button" onClick={() => onBack(c)} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold" style={chip(false)}>
                  Bring back
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
