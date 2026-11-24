"use client";

import { GearIcon } from "@/components/ui/Icons";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideImportCardAction, editImportCardAction, importCardAction, markImportCardImportedAction, scheduleTaskAction, applyAutoScheduleAction, unscheduleTaskAction } from "@/app/actions";
import { findSlot } from "@/components/calendar/place-next";
import { localDayKey } from "@/lib/auto-schedule";
import type { ImportCard } from "@/lib/data/import-cards";
import { useEscape } from "@/lib/use-escape";
import { SnoozePicker, type SnoozeChoice } from "@/components/tasks/SnoozePicker";
import { dueChipLabel, slotWords } from "@/components/tasks/editor/dates";
import { QuestEditorDialog } from "@/components/tasks/LazyQuestEditorDialog";
import type { Task } from "@/lib/data/types";
import { ATTRS, ATTRS_KEY, ATTR_LAYOUT_KEY, ATTR_SHOWN_DEFAULT, AttrKey, Attrs, BoardOpt, BoardsCtx, Draft, GOLD, INK, KINDS, Kind, SERVER_KIND, SOFT, Step, addLabel, chip, draftFor, findBoard, inDays, now, questExtras, readJSON, withAttrs, writeJSON } from "./triage/types";
import { BoardStep } from "./triage/Boards";
import { AttrLayout, firmOf } from "./triage/AttrPills";
import { CardView, withinWords } from "./triage/Card";
import { ListView, SetAside } from "./triage/List";
import { AllAtOnce, MattersStep, OftenStep, PlanStep, Review, TimeStep } from "./triage/Wizard";

/*
 * Sorting imports, one card at a time: Import, Snooze or Skip. Import walks
 * through a few small questions (which board, when, how much it matters; for
 * a habit, how often and how long), one at a time, each skippable, ending on
 * a short review. "Fill it all in myself" shows every field at once, and a
 * quest can open the full quest editor from there.
 */

const asQuest = (c: ImportCard): ImportCard => (c.kind === "schedule" ? { ...c, kind: "quest" } : c);

export function ImportTriage({ waiting, setAside, boards: boardsIn, theme, toSchedule, focus = null, query: initialQuery = "" }: { waiting: ImportCard[]; setAside: ImportCard[]; boards: BoardOpt[]; theme: "calm" | "adventure"; toSchedule: Task[]; /** /import?card=<id>: open on that card. */ focus?: string | null; /** /import?q=…: start with a search. */ query?: string }) {
  const router = useRouter();
  // Boards (a new one made from the picker joins at once).
  const [boards, setBoards] = useState(boardsIn);
  // "To schedule" isn't a type any more (owner, Nov 15): it imports exactly like a quest, so those cards show as quests.
  const [queue, setQueue] = useState(() => waiting.map(asQuest));
  const [aside, setAsideList] = useState(() => setAside.map(asQuest));
  const [mode, setMode] = useState<"card" | "guided" | "all">("card");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stepAt, setStepAt] = useState(0);
  const [snoozing, setSnoozingFor] = useState<ImportCard | null>(null);
  const setSnoozing = (on: boolean, c: ImportCard | null = card) => setSnoozingFor(on ? c : null);
  const [menu, setMenu] = useState(false);
  const [editor, setEditor] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void; act?: { label: string; run: () => void } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which kinds this session sorts (all, unless you narrow it).
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set(KINDS.map((k) => k.key)));
  // Find one: words from its title, notes or steps.
  const [query, setQuery] = useState(initialQuery);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (c: ImportCard) => !words.length || words.every((w) => [c.title, c.description ?? "", ...c.steps, c.source_text ?? ""].join(" ").toLowerCase().includes(w));
  const visible = queue.filter((c) => kinds.has(c.kind) && matches(c));
  // One card at a time, or the whole list (each row keeps its buttons).
  const [view, setViewState] = useState<"one" | "list">("one");
  // Quest details picked on cards (XP, coins, due…), kept on this device until imported; and which pills show (the gear).
  const [attrs, setAttrsAll] = useState<Record<string, Attrs>>({});
  const [shownAttrs, setShownAttrs] = useState<AttrKey[]>(ATTR_SHOWN_DEFAULT);
  const [gear, setGear] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
    setAttrsAll(readJSON(ATTRS_KEY, {}));
    const saved = readJSON<AttrKey[] | null>(ATTR_LAYOUT_KEY, null);
    if (Array.isArray(saved)) setShownAttrs(saved.filter((k) => ATTRS.some((a) => a.key === k)));
  }, []);
  const attrsOf = (id: string): Attrs => attrs[id] ?? {};
  function setAttrs(id: string, a: Attrs) {
    setAttrsAll((m) => {
      const next = { ...m, [id]: a };
      writeJSON(ATTRS_KEY, next);
      return next;
    });
  }
  function setShown(next: AttrKey[]) {
    setShownAttrs(next);
    writeJSON(ATTR_LAYOUT_KEY, next);
  }
  // Remembered: the list stays the list (after adding a card too).
  const setView = (v: "one" | "list") => {
    setViewState(v);
    try {
      window.localStorage.setItem("import-view", v);
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved choice is only readable in the browser
      if (window.localStorage.getItem("import-view") === "list" && !focus) setViewState("list");
    } catch {
      /* storage unavailable */
    }
  }, [focus]);
  // The card being worked on (picked from the list, or the next in line).
  const [focusId, setFocusId] = useState<string | null>(focus);
  const card = visible.find((c) => c.id === focusId) ?? visible[0] ?? null;
  // Steps added from the review ("+ Plan it within…").
  const [extra, setExtra] = useState<Step[]>([]);

  // "How soon" is asked up front for anything to do (quests and buy lists too, not only "to schedule").
  // The board is a pill on the card for quests (owner, Nov 6: "no additional screen needed").
  const baseFor = (d: Draft | null): Step[] => (d?.kind === "habit" ? ["often", "time"] : d?.kind === "schedule" || d?.kind === "quest" || d?.kind === "shopping" ? ["plan"] : d?.kind === "ritual" ? ["plan"] : d?.kind === "reward" ? [] : ["board"]).filter((x): x is Step => !(x === "plan" && d?.rated)) as Step[];
  const base: Step[] = baseFor(draft);
  const steps: Step[] = [...base, ...extra.filter((x) => !base.includes(x)), "review"];
  const step = steps[Math.min(stepAt, steps.length - 1)];
  function jump(s: Step) {
    const at = steps.indexOf(s);
    if (at >= 0) return setStepAt(at);
    setExtra((e) => [...e, s]);
    setStepAt(steps.length - 1);
  }
  function retag(kind: Kind, id = card?.id) {
    if (!id) return;
    setQueue((q) => q.map((c) => (c.id === id ? { ...c, kind } : c)));
    editImportCardAction(id, { kind }).catch(() => null);
  }
  // How soon it needs a time (owner, Nov 6): one tap on the card or its row, kept with it.
  function rate(id: string, days: number | null) {
    setQueue((q) => q.map((c) => (c.id === id ? { ...c, plan_within_days: days } : c)));
    editImportCardAction(id, { planWithinDays: days }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save that."));
  }
  // ✎ on a card: its name and notes, kept before you sort it.
  function rename(id: string, patch: { title: string; description: string }) {
    setQueue((q) => q.map((c) => (c.id === id ? { ...c, title: patch.title.trim() || c.title, description: patch.description.trim() || null } : c)));
    editImportCardAction(id, { title: patch.title, description: patch.description }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save that change."));
  }

  /** A card's sub-quests as edited on it: shown at once, saved on the card. */
  function resteps(id: string, steps: string[]) {
    setQueue((q) => q.map((c) => (c.id === id ? { ...c, steps } : c)));
    editImportCardAction(id, { steps }).catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save that change."));
  }

  useEscape(() => (mode === "guided" && stepAt > 0 ? setStepAt(stepAt - 1) : setMode("card")), mode !== "card" && !snoozing && !editor);

  function say(text: string, undo?: () => void, act?: { label: string; run: () => void }) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo, act });
    toastTimer.current = setTimeout(() => setToast(null), act ? 8000 : 5000);
  }
  function next(id = card?.id) {
    setFocusId(null);
    setQueue((q) => q.filter((c) => c.id !== id));
    setExtra([]);
    setMode("card");
    setDraft(null);
    setStepAt(0);
    setError(null);
  }
  function putBack(c: ImportCard) {
    setQueue((q) => [c, ...q.filter((x) => x.id !== c.id)]);
    setAsideList((a) => a.filter((x) => x.id !== c.id));
  }
  function begin(all: boolean, c: ImportCard | null = card) {
    if (!c) return;
    setFocusId(c.id);
    const d = draftFor(c);
    const a = attrsOf(c.id);
    const full: Draft = { ...d, boardId: a.board === undefined ? findBoard(boards, c.board_hint)?.id : a.board, minutes: a.minutes === undefined ? d.minutes : a.minutes, due: a.due === undefined ? d.due : a.due, importance: a.importance || d.importance, urgency: a.urgency || d.urgency, rated: d.rated || !!a.slot || !!(a.due === undefined ? d.due : a.due) };
    // Everything already set on the card's pills: import it straight away, no questions.
    if (!all && withAttrs(full.kind) && baseFor(full).length === 0) return save(full, c);
    setDraft(full);
    setStepAt(0);
    setExtra([]);
    setMode(all ? "all" : "guided");
  }
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const advance = (p?: Partial<Draft>) => {
    if (p) patch(p);
    setStepAt((i) => Math.min(i + 1, steps.length - 1));
  };

  function decide(choice: { kind: "snooze"; until: string; label: string } | { kind: "skip" } | { kind: "delete" }, target: ImportCard | null = card) {
    if (!target) return;
    const c = target;
    next(c.id);
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
    say(choice.kind === "snooze" ? `Snoozed ${choice.label}` : `Archived “${c.title}”`, restore);
  }

  function snoozeTo(choice: SnoozeChoice) {
    const target = snoozing;
    setSnoozing(false);
    if ("tomorrow" in choice) {
      const d = now();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      decide({ kind: "snooze", until: d.toISOString(), label: "until tomorrow" }, target);
    } else decide({ kind: "snooze", until: choice.until.toISOString(), label: choice.label }, target);
  }

  /** Already done: logged at once (XP, nothing left open), no questions. */
  function logDone(c: ImportCard) {
    next(c.id);
    start(async () => {
      try {
        // Its board and sub-quests go with it, as an import would take them.
        const a = attrsOf(c.id);
        const boardId = a.board === undefined ? findBoard(boards, c.board_hint)?.id ?? null : a.board;
        await importCardAction(c.id, { kind: "done", title: c.title, description: c.description, steps: c.steps, stepXp: a.stepXp, stepCoins: a.stepCoins, boardId, minutes: a.minutes ?? c.minutes ?? null, ...questExtras(a) });
        say(`Logged “${c.title}” as done ✓`);
        router.refresh();
      } catch (e) {
        putBack(c);
        setError(e instanceof Error ? e.message : "Couldn't log that.");
      }
    });
  }

  /** "Auto-schedule now" from the toast: this one quest into the first free spot (the calendar's own rule), with Undo. */
  function autoNow(id: string, title: string, minutes: number | null, dueAt: string | null, planBy: string | null) {
    setToast(null);
    (async () => {
      try {
        const slot = await findSlot({ id, title, estimate_minutes: minutes ?? 30, effort: undefined, due_at: dueAt, plan_by: planBy });
        if (!slot) return say(`No free spot in the next two weeks for “${title}”: it stays on the list`);
        await applyAutoScheduleAction([{ taskId: id, startISO: slot.start.toISOString(), endISO: slot.end.toISOString() }]);
        const words = slotWords({ start: slot.start.toISOString(), end: slot.end.toISOString() });
        say(`“${title}” is on your calendar ${words}`, () => {
          setToast(null);
          unscheduleTaskAction(id).then(() => router.refresh(), (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't take it off."));
        });
        router.refresh();
      } catch (e) {
        say(e instanceof Error ? e.message : "Couldn't place it.");
      }
    })();
  }

  function save(dIn: Draft | null = draft, cIn: ImportCard | null = card) {
    const card = cIn;
    if (!card || !dIn) return;
    const d = dIn;
    const due = d.due || null;
    // Fixed: a due date (and onto the list, to be placed before it). Flexible: only the list's aim (owner, Nov 18).
    const firm = due ? firmOf(attrsOf(card.id), due) : false;
    const dueAt = due && firm ? new Date(`${due}T23:59`).toISOString() : null;
    const daysOut = due ? Math.round((new Date(`${due}T12:00`).getTime() - new Date(`${inDays(0)}T12:00`).getTime()) / 86_400_000) : null;
    const soonest = [daysOut, d.planDays ?? null].filter((x): x is number => x !== null);
    const near = soonest.length ? Math.min(...soonest) : null;
    const urgency = d.urgency ?? (near === null ? null : near <= 0 ? 5 : near === 1 ? 4 : near <= 7 ? 3 : 2);
    // A time picked on the card puts it straight on the calendar, so it doesn't also wait on the list to schedule.
    const slot = withAttrs(d.kind) && d.kind !== "done" ? (attrsOf(card.id).slot ?? null) : null;
    const planBy = d.kind === "habit" || slot ? null : due ? new Date(`${due}T23:59`).toISOString() : typeof d.planDays === "number" ? new Date(`${inDays(d.planDays)}T23:59`).toISOString() : null;
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
        const made = await importCardAction(card.id, {
          kind: SERVER_KIND(d.kind),
          title: d.title,
          description: d.description.trim() || null,
          steps: d.kind === "shopping" ? d.steps.filter((x) => !d.rewards?.includes(x)) : d.steps,
          rewardItems: d.kind === "shopping" ? d.steps.filter((x) => d.rewards?.includes(x)) : undefined,
          boardId: d.boardId ?? null,
          dueAt,
          planBy,
          importance: d.importance ?? null,
          urgency,
          minutes: d.minutes ?? null,
          ...(d.kind === "habit" ? habitTiming : withAttrs(d.kind) ? { ...questExtras(attrsOf(card.id)), stepXp: attrsOf(card.id).stepXp, stepCoins: attrsOf(card.id).stepCoins } : {}),
        });
        let placed = "";
        if (slot && made.kind === "quest") {
          try {
            await scheduleTaskAction(made.id, slot.start, slot.end);
            placed = `, on your calendar ${slotWords(slot)}`;
          } catch {
            placed = " (couldn't put it on the calendar: try Schedule… from its card)";
          }
        }
        const board = boards.find((b) => b.id === d.boardId);
        const nRewards = d.kind === "shopping" ? d.steps.filter((x) => d.rewards?.includes(x)).length : 0;
        if (nRewards) {
          say(`${nRewards === 1 ? "1 item is a reward" : `${nRewards} items are rewards`} in your Treasure Chest${nRewards < d.steps.length ? `; the rest is on “${d.title}”` : ""}`);
          next(card.id);
          router.refresh();
          return;
        }
        if (made.kind === "quest" && (d.kind === "quest" || d.kind === "schedule" || d.kind === "shopping")) {
          if (slot && placed.startsWith(",")) {
            const day = localDayKey(new Date(slot.start));
            say(`“${d.title}” is on your calendar ${slotWords(slot)}`, undefined, { label: "See it", run: () => (setToast(null), router.push(`/calendar?view=day&date=${day}`)) });
          } else if (planBy) {
            const within = due ? `${firm ? "by" : "around"} ${dueChipLabel(due)}` : typeof d.planDays === "number" ? withinWords(d.planDays) : "soon";
            say(`“${d.title}” is on the auto-scheduler's list (${within})`, undefined, { label: "Auto-schedule now", run: () => autoNow(made.id, d.title, d.minutes ?? null, dueAt, planBy) });
          } else {
            say(`Added “${d.title}”${board ? ` to ${board.title}` : ""} · not on your calendar`);
          }
          next(card.id);
          router.refresh();
          return;
        }
        say(d.kind === "ritual" ? `“${d.title}” is one of your rituals of connection (Insights keeps how long since)${planBy ? ", and on your list to schedule" : ""}` : d.kind === "habit" ? `“${d.title}” is one of your habits now` : d.kind === "reward" ? `“${d.title}” is in your Treasure Chest` : d.kind === "project" ? `“${d.title}” is a board now${d.steps.length ? `, with ${d.steps.length} quests` : ""}` : d.kind === "done" ? `Logged “${d.title}” as done ✓` : planBy ? `“${d.title}” is on your list to schedule` : `Added “${d.title}”${board ? ` to ${board.title}` : ""}${placed}`);
        next(card.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that.");
        if (dIn !== draft) say(e instanceof Error ? e.message : "Couldn't add that.");
      }
    });
  }

  const isAdventure = theme === "adventure";
  const frame: React.CSSProperties = { border: "1.5px solid #a88a3f", boxShadow: "0 10px 30px rgba(0,0,0,.35)", color: "#2a1c10", background: "linear-gradient(180deg,#fbf3df,#f1e3c0)" };

  // The import flow for the card being added (shown in place of its row in List view).
  const flowNode =
    draft && card ? (
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
              {step === "board" && <BoardStep boards={boards} hint={card.board_hint} value={draft.boardId} onPick={(boardId) => advance({ boardId })} onCreate={(b) => (setBoards((x) => [...x, b]), advance({ boardId: b.id }))} />}
              {step === "plan" && <PlanStep draft={draft} noted={card.due_on} onChange={patch} onDone={() => advance()} />}
              {step === "matters" && <MattersStep value={draft.importance} onPick={(importance) => advance({ importance })} />}
              {step === "often" && <OftenStep draft={draft} hint={card.repeat_text} onChange={patch} onDone={() => advance()} />}
              {step === "time" && <TimeStep value={draft.minutes} hint={card.repeat_text} onPick={(minutes) => advance({ minutes })} />}
              {step === "review" && <Review draft={draft} boards={boards} onChange={patch} onJump={jump} />}
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
                  <button type="button" onClick={() => save()} disabled={saving} className="h-11 rounded-full px-6 text-[15px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116", opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Adding…" : addLabel(draft)}
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
                {draft.kind !== "habit" && (
                  <button type="button" onClick={() => setEditor(true)} className="text-[13.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                    Open the full quest editor
                  </button>
                )}
                <span className="flex-1" />
                <button type="button" onClick={() => save()} disabled={saving} className="h-11 rounded-full px-6 text-[15px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Adding…" : addLabel(draft)}
                </button>
              </>
            )}
          </div>
        </div>
    ) : null;
  return (
    <BoardsCtx.Provider value={{ boards, add: (b) => setBoards((x) => [...x, b]), resteps, adventure: isAdventure }}>
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="m-0 whitespace-nowrap font-display text-[24px]" style={{ color: isAdventure ? "#f2d27e" : INK }}>
          Sort your imports
        </h1>
        <button type="button" onClick={() => setGear((v) => !v)} aria-expanded={gear} aria-label="Import settings: which quest details show" title="Which quest details show on each card" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/10" style={{ color: isAdventure ? "#f2d27e" : SOFT, background: gear ? "rgba(217,180,95,.3)" : undefined }}>
          <GearIcon size={18} />
        </button>
        {visible.length > 0 && (
          <span className="text-[13.5px]" style={{ color: isAdventure ? "rgba(242,226,180,.8)" : SOFT }}>
            {visible.length === 1 ? "the last one" : `${visible.length} to sort`}
          </span>
        )}
        <span className="flex-1" />
        {visible.length > 1 && mode === "card" && (
          // One by one, or all of them in a list: one switch.
          <span className="flex shrink-0 rounded-full p-0.5" role="group" aria-label="How to see them" style={{ background: "rgba(255,250,238,.18)", border: "1px solid rgba(217,180,95,.45)" }}>
            {(["one", "list"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => (setView(v), setFocusId(null))} className="h-7 rounded-full px-3 text-[12.5px] font-semibold transition-colors" style={view === v ? { background: "radial-gradient(circle at 35% 25%, #fff0bd, #e2bb5c 70%, #c9a04a)", color: "#2a1c10" } : { color: isAdventure ? "#f2e2b4" : SOFT }}>
                {v === "one" ? "One by one" : "List"}
              </button>
            ))}
          </span>
        )}
      </div>
      <AttrLayout open={gear} shown={shownAttrs} onChange={setShown} />
      {new Set(queue.map((c) => c.kind)).size > 1 && (
        <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label="What to sort now">
          {KINDS.filter((k) => queue.some((c) => c.kind === k.key)).map((k) => {
            const on = kinds.has(k.key);
            const n = queue.filter((c) => c.kind === k.key).length;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={on}
                onClick={() => setKinds((prev) => {
                  const nx = new Set(prev);
                  if (on && nx.size > 1) nx.delete(k.key);
                  else nx.add(k.key);
                  return nx;
                })}
                className="h-8 rounded-full px-3 text-[13px] font-semibold transition-opacity"
                // All showing: quiet chips (nothing to light up); narrowed: the chosen ones glow.
                style={{ ...chip(on && kinds.size < KINDS.length && queue.some((c) => !kinds.has(c.kind))), minHeight: 32, opacity: on ? 1 : 0.55 }}
              >
                {k.icon} {k.label} <span className="font-normal tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {queue.length > 1 && mode === "card" && (
        <div className="-mt-1 flex items-center gap-2 rounded-full px-3" style={{ background: "rgba(255,250,238,.9)", border: "1px solid rgba(160,120,40,.5)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#7a6440" }}>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2.2" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => (setQuery(e.target.value), setFocusId(null))}
            placeholder={`Find one of ${queue.length}…`}
            aria-label="Find a card"
            className="bare-input h-9 min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            style={{ color: "#2a1c10" }}
          />
          {query && (
            <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "#7a6440" }}>
              {visible.length}
            </span>
          )}
        </div>
      )}

      {!card && words.length ? (
        <p className="m-0 text-center text-[14px] italic" style={{ color: isAdventure ? "#f2e2b4" : SOFT }}>
          Nothing matches “{query.trim()}”.
        </p>
      ) : !card ? (
        <div className="card-pop-in parchment flex flex-col items-center gap-2 rounded-3xl px-5 py-8 text-center" style={frame}>
          <span aria-hidden className="text-[34px]">✦</span>
          <h2 className="m-0 font-display text-[22px]">All sorted</h2>
          <p className="m-0 text-[14px]" style={{ color: "#6b5631" }}>
            Everything you brought in has found its place.
          </p>
          {toSchedule.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => router.push("/calendar?auto=1")} className="flex h-11 items-center rounded-full px-6 text-[15px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
                Schedule these ({toSchedule.length})
              </button>
              <Link href="/" className="text-[14px] underline underline-offset-2" style={{ color: "#6b5631" }}>
                Back to Today
              </Link>
            </div>
          ) : (
            <Link href="/" className="mt-2 flex h-10 items-center rounded-full px-5 text-[14.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
              Back to Today
            </Link>
          )}
        </div>
      ) : view === "list" ? (
        <ListView cards={visible} frame={frame} active={mode !== "card" && card ? { id: card.id, node: flowNode } : null} onQuick={(c, u, l) => decide({ kind: "snooze", until: u.toISOString(), label: l }, c)} onEdit={(c, p) => rename(c.id, p)} onRetag={(c, k) => retag(k, c.id)} onRate={(c, d) => rate(c.id, d)} attrsOf={attrsOf} shownAttrs={shownAttrs} onAttrs={setAttrs} onImport={(c) => (c.kind === "done" ? logDone(c) : begin(false, c))} onDone={logDone} onSnooze={(c) => setSnoozing(true, c)} onSkip={(c) => decide({ kind: "skip" }, c)} onDelete={(c) => decide({ kind: "delete" }, c)} />
      ) : mode === "card" ? (
        <CardView key={card.id} card={card} frame={frame} onQuick={(u, l) => decide({ kind: "snooze", until: u.toISOString(), label: l })} onRetag={retag} onRate={(d) => rate(card.id, d)} attrs={attrsOf(card.id)} shownAttrs={shownAttrs} onAttrs={(a) => setAttrs(card.id, a)} onEdit={(p) => rename(card.id, p)} onImport={() => (card.kind === "done" ? logDone(card) : begin(false))} onDone={() => logDone(card)} onSnooze={() => setSnoozing(true)} onSkip={() => decide({ kind: "skip" })} menu={menu} setMenu={setMenu} onDelete={() => (setMenu(false), decide({ kind: "delete" }))} />
      ) : draft ? (
        flowNode
      ) : null}

      {card && toSchedule.length > 0 && mode === "card" && (
        <button type="button" onClick={() => router.push("/calendar?auto=1")} className="self-start text-[13.5px] underline underline-offset-2" style={{ color: isAdventure ? "rgba(242,226,180,.85)" : SOFT }}>
          📅 Schedule what&rsquo;s on the list ({toSchedule.length})
        </button>
      )}
      {aside.length > 0 && <SetAside cards={aside} onBack={(c) => (putBack(c), decideImportCardAction(c.id, { kind: "restore" }).catch(() => null))} isAdventure={isAdventure} />}

      {snoozing && <SnoozePicker title={snoozing.title} tomorrowHint="back on this list tomorrow" onPick={snoozeTo} onClose={() => setSnoozing(false)} />}
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
          {toast.act && (
            <button type="button" onClick={toast.act.run} className="shrink-0 font-semibold underline underline-offset-2" style={{ color: "#f2d27e" }}>
              {toast.act.label} ›
            </button>
          )}
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="shrink-0 font-semibold underline underline-offset-2" style={{ color: "#f2d27e" }}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
    </BoardsCtx.Provider>
  );
}

