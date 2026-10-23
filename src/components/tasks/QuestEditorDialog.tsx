"use client";

import { NumberInput } from "@/components/ui/NumberInput";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import {
  deleteQuestTemplateAction,
  listQuestTemplatesAction,
  saveQuestTemplateAction,
  setTaskAlsoOnAction,
  completeTaskAction,
  createBoardFromEditorAction,
  createQuestAction,
  deleteTaskAction,
  generateTaskIconAction,
  listBoardOptionsAction,
  listQuestStepsAction,
  logDoingNowAction,
  reopenTaskAction,
  saveQuestStepsAction,
  scheduleTaskAction,
  setSchedulingAction,
  setTaskStatSplitAction,
  setTaskPrivateAction,
  sequenceLinkAction,
  setTaskPlacementAction,
  setTaskProgressAction,
  updateTaskAction,
  listTagsAction,
  setTaskTagsAction,
  setStandsForAction,
} from "@/app/actions";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { IconPicker } from "./IconPicker";
import { CheckMark } from "./TaskRow";
import { SlotPickerDialog } from "./SlotPickerDialog";
import { BoardPicker } from "./BoardPicker";
import { useEscape } from "@/lib/use-escape";
import { useEditorToolbar, useIsEmbedded, usePortalTarget } from "@/components/ui/EmbedHost";
import { freshKey, loadDrafts, removeDraft, saveDraft, type QuestDraftSave } from "@/lib/quest-drafts";
import { addOptimisticQuest, resolveOptimisticQuest } from "@/lib/optimistic-quests";
import { CoinIcon } from "@/components/ui/Icons";
import { StatSplitEditor } from "./StatSplitEditor";
import { QuestPicker, SequenceDialog } from "./Sequence";
import { coinsForXp, XP_PER_COIN } from "@/lib/coins";
import type { QuestTemplate } from "@/lib/quest-templates";

export type QuestDraft = {
  title?: string;
  description?: string;
  estimateMinutes?: number | null;
  /** 0–5, e.g. from clicking a spot on the Priority Matrix. */
  importance?: number;
  urgency?: number;
  effort?: number;
};

export type QuestEditorMode =
  | { kind: "edit"; task: Task }
  | {
      kind: "create";
      boardId?: string | null;
      pinToBattle?: boolean;
      /** @deprecated Today's Quests no longer has a limit; kept for callers. */
      todayFull?: boolean;
      /** Start as a quick power-up (prefills a short time). */
      powerUp?: boolean;
      /** "Doing now": log something already under way — created and completed at once. */
      doingNow?: boolean;
      /** Place the new quest on the calendar (e.g. from a Google event). */
      schedule?: { startISO: string; endISO: string; googleEventId?: string };
      prefill?: QuestDraft;
      /** A follow-up: the new quest waits right after this one. */
      after?: { id: string; title: string };
    };

type StepDraft = { key: string; id?: string; title: string; done: boolean; xp?: number; weight?: number | null; progress?: number; state?: "skipped" | "failed" | null; parentKey?: string | null };

/** Steps that hold sub-tasks of their own (they count through those). */
const parentKeys = (list: StepDraft[]) => new Set(list.map((st) => st.parentKey).filter(Boolean) as string[]);
/** A step and everything inside it. */
function descendants(list: StepDraft[], key: string): Set<string> {
  const out = new Set<string>([key]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const st of list) if (st.parentKey && out.has(st.parentKey) && !out.has(st.key)) (out.add(st.key), (grew = true));
  }
  return out;
}
/** In the order you'd do them: each step, then whatever sits inside it. */
function treeOrder<T extends { key: string; parentKey?: string | null }>(list: T[]): T[] {
  const keys = new Set(list.map((st) => st.key));
  const kids = new Map<string | null, T[]>();
  for (const st of list) {
    const p = st.parentKey && keys.has(st.parentKey) ? st.parentKey : null;
    kids.set(p, [...(kids.get(p) ?? []), st]);
  }
  const out: T[] = [];
  const walk = (p: string | null) => {
    for (const st of kids.get(p) ?? []) {
      out.push(st);
      walk(st.key);
    }
  };
  walk(null);
  return out;
}

/** What each step is worth (0–1): its own percent, or an equal share of what's left. Steps holding sub-tasks count through them. */
function stepWeights(list: StepDraft[]): number[] {
  // A skipped step is left out: the others share the quest between them.
  const holders = parentKeys(list);
  const live = list.filter((st) => st.state !== "skipped" && !holders.has(st.key));
  const fixed = live.reduce((n, st) => n + (st.weight ?? 0), 0);
  const free = live.filter((st) => !st.weight).length;
  const rest = Math.max(0, 100 - fixed);
  const total = fixed + (free ? rest : 0) || 1;
  return list.map((st) => (st.state === "skipped" || holders.has(st.key) ? 0 : (st.weight ?? (free ? rest / free : 0)) / total));
}
/** How much of the quest the steps add up to (0–100). */
function stepsShare(list: StepDraft[]): number {
  const w = stepWeights(list);
  return Math.round(list.reduce((n, st, i) => n + w[i] * (st.done ? 1 : (st.progress ?? 0) / 100), 0) * 100);
}
const stepPayload = (list: StepDraft[]) => treeOrder(list).map(({ key, id, title, done, xp, weight, progress, state, parentKey }) => ({ key, id, parentKey: parentKey ?? null, title, done, xp: xp ?? 0, weight: weight ?? null, progress: done ? 100 : (progress ?? 0), state: done ? null : (state ?? null) }));

const XP_MAX = 350;
const XP_STEP = 10;
/** Coins follow XP (1 per XP_PER_COIN) unless a quest sets its own. */
const autoCoins = coinsForXp;

const pad = (n: number) => String(n).padStart(2, "0");
function localDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** "" for an end-of-day deadline (no particular time). */
function localTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return t === "23:59" ? "" : t;
}
function dueIso(date: string, time: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || "23:59"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * One compact dialog for creating and editing quests, laid out like a quest
 * card: portrait on the left, title + description on the right; then time to
 * complete, steps, due date, XP and coins, importance / urgency / effort, and
 * the board it lives on.
 *
 * Editing an existing quest saves as you go (the button shows "Saved"); its
 * progress bar is committed when the dialog closes, so the XP party plays
 * once. `origin="fab"` makes it rise out of the + button; inside the + sheet
 * (EmbedHost) it renders in place without its own overlay or header.
 */
export function QuestEditorDialog({
  mode,
  theme = "calm",
  origin = "center",
  onClose,
  onCreated,
  onSaved,
  onPlot,
  review,
  altAction,
}: {
  /** A secondary choice shown under the header (e.g. "Put an existing quest here instead"). */
  altAction?: { label: string; onClick: () => void };
  mode: QuestEditorMode;
  theme?: "calm" | "adventure";
  origin?: "fab" | "center";
  onClose: () => void;
  onCreated?: (id: string) => void;
  /** Review mode: called after the import is confirmed. */
  onSaved?: () => void;
  /** "Plot on Priority Matrix": override where it goes (default: this quest alone). */
  onPlot?: () => void;
  /** Reviewing imports one by one: header shows progress, Save confirms the import. */
  review?: { index: number; total: number; onLater: () => void };
}) {
  const embedded = useIsEmbedded();
  const isAdventure = theme === "adventure";
  const task = mode.kind === "edit" ? mode.task : null;
  const create = mode.kind === "create" ? mode : null;
  const prefill = create?.prefill;
  const fixedSchedule = create?.schedule;
  const [doingNow, setDoingNow] = useState(Boolean(create?.doingNow));

  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? prefill?.description ?? "");
  const [importance, setImportance] = useState(task ? Math.round(task.importance) : Math.round(prefill?.importance ?? 0));
  const [urgency, setUrgency] = useState(task ? Math.round(task.urgency) : Math.round(prefill?.urgency ?? 0));
  const [xp, setXp] = useState(task?.xp_value ?? (doingNow ? 30 : 0));
  const [coinValue, setCoinValue] = useState<number | null>(task?.coin_value ?? null);
  const [effort, setEffort] = useState(task?.effort ?? Math.round(prefill?.effort ?? 0));
  const [energyGain, setEnergyGain] = useState(task?.energy_gain ?? 0);
  const [aspiration, setAspiration] = useState(Boolean(task?.is_aspiration));
  const [estimate, setEstimate] = useState<string>(() => {
    const v = task?.estimate_minutes ?? prefill?.estimateMinutes ?? (create?.powerUp ? 5 : undefined);
    return v != null ? String(v) : "";
  });
  // Pieces of time are no longer offered; an existing setting is kept as it is.
  const [chunk] = useState<string>(task?.chunk_minutes ? String(task.chunk_minutes) : "");
  const [dueDate, setDueDate] = useState(localDate(task?.due_at));
  const [dueTime, setDueTime] = useState(localTime(task?.due_at));
  type Placement = "today" | "additional" | "none";
  const initialPlacement: Placement = task
    ? task.is_manual_priority
      ? "today"
      : task.in_additional === false
        ? "none"
        : "additional"
    : create?.pinToBattle && !create?.schedule
      ? "today"
      : "additional";
  const [placement, setPlacement] = useState<Placement>(initialPlacement);
  const savedPlacement = useRef<Placement>(initialPlacement);
  const todayFull = false;
  const [draftIcon, setDraftIcon] = useState<{ url: string; source: "library" | "ai" } | null>(null);
  /** New quests: what to paint instead of the title (blank = paint the title). */
  const [artPrompt, setArtPrompt] = useState("");
  /** Where a new quest sits in a sequence: after (waits for) or before (unlocks) other quests. */
  const [seqLinks, setSeqLinks] = useState<{ rel: "after" | "before"; pick: { id?: string; title: string } }[]>(() =>
    mode.kind === "create" && mode.after ? [{ rel: "after", pick: mode.after }] : []
  );
  const [seqOpen, setSeqOpen] = useState(() => mode.kind === "create" && !!mode.after);
  const [seqAdding, setSeqAdding] = useState<"after" | "before" | null>(null);
  const [seqDialog, setSeqDialog] = useState(false);
  const initialSlot =
    task?.is_on_calendar && task.scheduled_start && task.scheduled_end
      ? { start: task.scheduled_start, end: task.scheduled_end }
      : null;
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(initialSlot);
  // Share of this quest's XP sent to character stats (saved as you slide, for existing quests).
  const [statSplit, setStatSplit] = useState<Record<string, number>>(task?.stat_split ?? {});
  const statTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function changeStatSplit(next: Record<string, number>) {
    setStatSplit(next);
    if (!task) return;
    if (statTimer.current) clearTimeout(statTimer.current);
    statTimer.current = setTimeout(() => void setTaskStatSplitAction(task.id, next).catch(() => {}), 500);
  }
  // The scheduling priority list beside the calendar.
  const [toSchedule, setToSchedule] = useState(task?.schedule_rank != null);
  const [schedOpen, setSchedOpen] = useState(false);
  const [isPriv, setIsPriv] = useState(!!task?.is_private);
  function changePrivate(v: boolean) {
    setIsPriv(v);
    if (task) void setTaskPrivateAction(task.id, v).catch(() => setIsPriv(!v));
  }
  const [schedPlace, setSchedPlace] = useState<"top" | "unordered" | "bottom">("top");
  const [schedNote, setSchedNote] = useState<string | null>(null);
  /** Existing quests join or leave the list at once; new ones when created. */
  function applyScheduling(on: boolean, place: "top" | "unordered" | "bottom") {
    setToSchedule(on);
    setSchedPlace(place);
    if (!task) return;
    setSchedNote(null);
    setSchedulingAction(task.id, on ? place : null)
      .then(() => setSchedNote(on ? "On the scheduling list" : "Off the scheduling list"))
      .catch((e) => setSchedNote(e instanceof Error ? e.message : "Couldn't update the list."));
  }
  const [pickingSlot, setPickingSlot] = useState(false);
  const initialBoard = task ? (task.board_id ?? null) : (create?.boardId ?? null);
  const [boardId, setBoardId] = useState<string | null>(initialBoard);
  const [boardOptions, setBoardOptions] = useState<{ id: string; label: string }[] | null>(null);
  const [alsoOn, setAlsoOn] = useState<string[]>(task?.also_on ?? []);
  const [stepMenu, setStepMenu] = useState<string | null>(null);
  const [shareStep, setShareStep] = useState<string | null>(null);
  // Quest templates: ready-made quests to start from (new quests), and saving one (existing quests).
  const [templates, setTemplates] = useState<QuestTemplate[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateNote, setTemplateNote] = useState<string | null>(null);
  function applyTemplate(t: QuestTemplate) {
    setTitle(t.title);
    setDescription(t.description ?? "");
    if (t.boardId) setBoardId(t.boardId);
    if (t.estimateMinutes) setEstimate(String(t.estimateMinutes));
    if (t.xp) setXp(t.xp);
    if (t.importance) setImportance(t.importance);
    if (t.urgency) setUrgency(t.urgency);
    if (t.effort) setEffort(t.effort);
    setSteps(t.steps.map((title, i) => ({ key: `tpl-${Date.now()}-${i}`, title, done: false })));
    setStepsDirty(true);
    setShowTemplates(false);
  }
  function saveAsTemplate() {
    setTemplateNote(null);
    const tpl = {
      id: `t${crypto.randomUUID().slice(0, 8)}`,
      name: title.trim(),
      title: title.trim(),
      description: description.trim() || null,
      boardId,
      estimateMinutes: est,
      xp,
      importance,
      urgency,
      effort,
      steps: (steps ?? []).map((st) => st.title.trim()).filter(Boolean),
    };
    saveQuestTemplateAction(tpl).then(
      (list) => {
        setTemplates(list);
        setTemplateNote("Saved as a template ✓ — it's in the quest creator now");
      },
      (e) => setTemplateNote(e instanceof Error ? e.message : "Couldn't save the template.")
    );
  }
  const [alsoError, setAlsoError] = useState<string | null>(null);
  function saveAlsoOn(next: string[]) {
    if (!task) return;
    const prev = alsoOn;
    setAlsoOn(next);
    setAlsoError(null);
    setTaskAlsoOnAction(task.id, next).catch((e) => {
      setAlsoOn(prev);
      setAlsoError(e instanceof Error ? e.message : "Couldn't save that.");
    });
  }
  const isCompleted = task?.status === "completed";
  const progressTracked = typeof task?.xp_awarded === "number";
  const initialProgress = task?.progress ?? 0;
  const [progress, setProgress] = useState(initialProgress);
  // Steps: a small checklist inside the quest. null while loading an existing quest's steps.
  const [steps, setSteps] = useState<StepDraft[] | null>(task ? null : []);
  const [stepsUnavailable, setStepsUnavailable] = useState(false);
  const [stepsDirty, setStepsDirty] = useState(false);
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [stepXpPop, setStepXpPop] = useState<number | null>(null);
  const newStepRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [phase, setPhase] = useState<"open" | "closing">("open");
  const [confirmLeave, setConfirmLeave] = useState(false);

  const [tags, setTags] = useState<string[]>(task?.tags ?? []);
  // ---- Drafts (new quests): kept on this device until the quest is made or thrown away.
  // This quest's draft name, made the first time it's saved.
  const draftIdRef = useRef<string | null>(null);
  const [draftId, setDraftIdState] = useState<string | null>(null);
  const ensureDraftId = () => (draftIdRef.current ??= freshKey("d"));
  const setDraftId = (id: string) => {
    draftIdRef.current = id;
    setDraftIdState(id);
  };
  const [drafts, setDrafts] = useState<QuestDraftSave[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const finished = useRef(false);
  useEffect(() => {
    if (!create) return;
    const read = () => setDrafts(loadDrafts());
    read();
    window.addEventListener("quest-drafts", read);
    return () => window.removeEventListener("quest-drafts", read);
  }, [create]);
  const hasWriting = !!create && !doingNow && (title.trim() !== "" || description.trim() !== "" || (steps ?? []).some((st) => st.title.trim()));
  const draftNow = (): QuestDraftSave => ({ id: ensureDraftId(), at: 0, title, description, estimate, xp, importance, urgency, effort, energyGain, boardId, dueDate, dueTime, placement, steps: (steps ?? []).filter((st) => st.title.trim()).map((st) => ({ key: st.key, title: st.title, parentKey: st.parentKey ?? null })), tags });
  const draftRef = useRef<(() => QuestDraftSave) | null>(null);
  useEffect(() => {
    draftRef.current = draftNow;
  });
  // Saved as you write, so a crash or an accidental close never loses it.
  const draftSig = JSON.stringify([title, description, estimate, xp, importance, urgency, effort, energyGain, boardId, dueDate, dueTime, placement, (steps ?? []).map((st) => st.title), tags]);
  useEffect(() => {
    if (!hasWriting || finished.current) return;
    const t = setTimeout(() => {
      if (finished.current) return;
      const d = draftRef.current?.();
      if (!d) return;
      saveDraft(d);
      setDraftIdState(d.id);
    }, 500);
    return () => clearTimeout(t);
  }, [draftSig, hasWriting]);
  function pickDraft(d: QuestDraftSave) {
    if (hasWriting) saveDraft(draftNow());
    setDraftId(d.id);
    setTitle(d.title);
    setDescription(d.description);
    setEstimate(d.estimate);
    setXp(d.xp);
    setImportance(d.importance);
    setUrgency(d.urgency);
    setEffort(d.effort);
    setEnergyGain(d.energyGain);
    setBoardId(d.boardId);
    setDueDate(d.dueDate);
    setDueTime(d.dueTime);
    setPlacement(d.placement);
    setTags(d.tags ?? []);
    setSteps(treeOrder(d.steps.map((st) => ({ key: st.key, title: st.title, done: false, parentKey: st.parentKey ?? null }))));
    setStepsDirty(true);
    setShowDrafts(false);
  }
  // ---- Tags: a few words that sort quests across boards (the life wheel uses them too).
  const [tagText, setTagText] = useState("");
  const [knownTags, setKnownTags] = useState<string[]>([]);
  useEffect(() => {
    listTagsAction().then(setKnownTags, () => {});
  }, []);
  function commitTags(next: string[]) {
    const clean = [...new Set(next.map((t) => t.replace(/^#/, "").trim().toLowerCase()).filter(Boolean))].slice(0, 12);
    setTags(clean);
    if (task) void setTaskTagsAction(task.id, clean).catch(() => {});
  }
  function addTag(raw: string) {
    const parts = raw.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length) commitTags([...tags, ...parts]);
    setTagText("");
  }
  // ---- Stand-in: this quest speaks for a board's current assignment.
  const [standsFor, setStandsFor] = useState<string | null>(task?.stands_for ?? null);
  function changeStandsFor(b: string | null) {
    setStandsFor(b);
    if (task) void setStandsForAction(task.id, b).then(() => router.refresh(), () => setStandsFor(task.stands_for ?? null));
  }
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const isCreate = !!create;
  useEffect(() => {
    if (!isCreate) return;
    listQuestTemplatesAction().then(setTemplates, () => setTemplates([]));
  }, [isCreate]);
  useEffect(() => {
    listBoardOptionsAction()
      .then(setBoardOptions)
      .catch(() => setBoardOptions([]));
  }, []);

  const taskId = task?.id;
  useEffect(() => {
    if (!taskId) return;
    listQuestStepsAction(taskId)
      .then((rows) => {
        if (rows === null) setStepsUnavailable(true);
        setSteps(treeOrder((rows ?? []).map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.done, xp: r.xp ?? 0, weight: r.weight ?? null, progress: r.progress ?? (r.done ? 100 : 0), state: r.state ?? null, parentKey: r.parent_id ?? null }))));
      })
      .catch(() => {
        setStepsUnavailable(true);
        setSteps([]);
      });
  }, [taskId]);

  /**
   * Ticking (or moving a step along) pulls the quest's progress up to what
   * the steps add up to — each step weighs its own percent, or an equal
   * share — never down; unticking caps it.
   */
  function updateStep(key: string, patch: Partial<StepDraft>) {
    if (!steps) return;
    const before = stepsShare(steps);
    const next = steps.map((st) => (st.key === key ? { ...st, ...patch } : st));
    setSteps(next);
    setStepsDirty(true);
    const share = stepsShare(next);
    if (share !== before) setProgress((p) => (share > before ? Math.max(p, share) : Math.min(p, share)));
  }
  function setStepDone(key: string, done: boolean) {
    if (!steps) return;
    const all = descendants(steps, key);
    if (all.size === 1) return updateStep(key, { done, progress: done ? 100 : 0, state: null });
    // A step with sub-tasks: ticking it ticks everything inside it.
    const before = stepsShare(steps);
    const next = steps.map((st) => (all.has(st.key) ? { ...st, done, progress: done ? 100 : 0, state: null } : st));
    setSteps(next);
    setStepsDirty(true);
    const share = stepsShare(next);
    if (share !== before) setProgress((p) => (share > before ? Math.max(p, share) : Math.min(p, share)));
  }
  /** A new sub-task inside a step (or beside another sub-task), ready to type into. */
  function addSubStep(parentKey: string, after?: string) {
    if (!steps) return;
    const key = freshKey("new-");
    const ordered = treeOrder(steps);
    const anchor = after ?? parentKey;
    const tail = [...descendants(ordered, anchor)];
    const lastIdx = Math.max(...tail.map((k) => ordered.findIndex((st) => st.key === k)));
    const next = [...ordered.slice(0, lastIdx + 1), { key, title: "", done: false, parentKey }, ...ordered.slice(lastIdx + 1)];
    setSteps(next);
    setOpenSteps((o) => new Set(o).add(parentKey));
    setFocusStep(key);
  }
  function addStep() {
    const t = newStep.trim();
    if (!t) return;
    setSteps((list) => [...(list ?? []), { key: `new-${Date.now()}`, title: t, done: false }]);
    setStepsDirty(true);
    setNewStep("");
  }
  function renameStep(key: string, title: string) {
    setSteps((list) => (list ?? []).map((st) => (st.key === key ? { ...st, title } : st)));
    setStepsDirty(true);
  }
  function removeStep(key: string) {
    setSteps((list) => {
      const gone = descendants(list ?? [], key);
      return (list ?? []).filter((st) => !gone.has(st.key));
    });
    setStepsDirty(true);
  }
  const holders = parentKeys(steps ?? []);
  const stepsDone = (steps ?? []).filter((st) => st.done && !holders.has(st.key)).length;
  const stepsLive = (steps ?? []).filter((st) => st.state !== "skipped" && !holders.has(st.key)).length;
  // Sub-tasks stay folded away under their step until opened.
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [focusStep, setFocusStep] = useState<string | null>(null);
  useEffect(() => {
    if (!focusStep) return;
    const t = requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-step-key="${focusStep}"] textarea`)?.focus();
      setFocusStep(null);
    });
    return () => cancelAnimationFrame(t);
  }, [focusStep]);

  const est = estimate.trim() ? Math.max(0, Math.round(Number(estimate))) : null;
  const chunkMinutes = chunk.trim() && Number(chunk) > 0 ? Math.round(Number(chunk)) : null;
  const dueAt = dueIso(dueDate, dueTime);

  // ---- Saving as you go (existing quests) ----------------------------------
  const autosave = Boolean(task) && !review;
  // Placement isn't saved as you go: moving the quest to another list would
  // take its card (and this dialog) away mid-edit. It's saved on close.
  const fields = JSON.stringify([title, description, importance, urgency, xp, coinValue, effort, energyGain, est, chunkMinutes, dueAt, slot?.start ?? null, boardId, aspiration]);
  const [savedFields, setSavedFields] = useState(fields);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const dirty = fields !== savedFields || stepsDirty;
  const stepsRef = useRef(steps);
  const stepIds = useRef(new Map<string, string>());
  const savedSlotStart = useRef(initialSlot?.start ?? null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const deleted = useRef(false);
  useEffect(() => {
    stepsRef.current = steps;
  });

  /** Queue one save of everything that changed (saves never overlap); placement only when asked (on close). */
  function persist(withPlacement = false) {
    if (!task || deleted.current || !title.trim()) return chain.current;
    const snap = fields;
    const input = {
      title,
      description,
      importance,
      urgency,
      xpValue: xp,
      estimateMinutes: est,
      boardId,
      effort: task.effort !== undefined || effort ? effort : undefined,
      energyGain,
      isAspiration: aspiration,
      dueAt,
      chunkMinutes,
      coinValue,
    };
    const newSlot = !fixedSchedule && slot && slot.start !== savedSlotStart.current ? slot : null;
    const newPlacement = withPlacement && placement !== savedPlacement.current ? placement : null;
    const sendSteps = stepsDirty;
    if (sendSteps) setStepsDirty(false);
    setSaveState("saving");
    const run = async () => {
      if (deleted.current) return;
      await updateTaskAction(task.id, input);
      if (newPlacement) {
        await setTaskPlacementAction(task.id, newPlacement);
        savedPlacement.current = newPlacement;
      }
      if (newSlot) {
        await scheduleTaskAction(task.id, newSlot.start, newSlot.end);
        savedSlotStart.current = newSlot.start;
      }
      if (sendSteps && stepsRef.current) {
        const list = stepsRef.current;
        const res = await saveQuestStepsAction(
          task.id,
          stepPayload(list).map((st, i) => ({ ...st, id: st.id ?? stepIds.current.get(list[i].key) }))
        );
        if (res.xpEarned > 0) {
          setStepXpPop(res.xpEarned);
          setTimeout(() => setStepXpPop(null), 1600);
        }
        const rows = res.steps;
        for (const r of rows) {
          const sent = list[r.sort_order];
          if (sent && !sent.id) stepIds.current.set(sent.key, r.id);
        }
        setSteps((cur) => cur?.map((st) => (st.id || !stepIds.current.has(st.key) ? st : { ...st, id: stepIds.current.get(st.key) })) ?? cur);
      }
    };
    chain.current = chain.current
      .then(run)
      .then(() => {
        setSavedFields(snap);
        setSaveState("idle");
      })
      .catch((e) => {
        if (sendSteps) setStepsDirty(true);
        setSaveState("error");
        setError(e instanceof Error ? e.message : "Couldn't save.");
      });
    return chain.current;
  }
  const autosaveNow = useEffectEvent(() => void persist());

  useEffect(() => {
    if (!autosave || !dirty) return;
    const t = setTimeout(() => autosaveNow(), 800);
    return () => clearTimeout(t);
  }, [autosave, dirty, fields, stepsDirty]);

  /** Progress is paid out once, when the dialog closes (one XP party, not one per +5%). */
  function commitProgress() {
    if (!task || !progressTracked || isCompleted || progress === initialProgress || deleted.current) return;
    const pct = progress;
    chain.current = chain.current
      .then(async () => {
        if (pct >= 100) {
          const fd = new FormData();
          fd.set("taskId", task.id);
          const res = await completeTaskAction(fd);
          celebrateQuest({
            taskId: task.id,
            title,
            description,
            xp: Math.max(0, xp - Math.round((xp * initialProgress) / 100)),
            iconSrc: task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null,
            totalXp: res?.totalXp ?? null,
            coinsEarned: res?.coinsEarned ?? 0,
          });
        } else {
          const res = await setTaskProgressAction(task.id, pct);
          if (res.xpEarned > 0) {
            celebrateProgress({
              title,
              xp: res.xpEarned,
              coinsEarned: res.coinsEarned,
              fromPct: initialProgress,
              toPct: pct,
              steps: steps && steps.length > 0 ? { done: stepsDone, total: steps.length } : undefined,
            });
          }
        }
      })
      .catch(() => {});
  }

  const noun = isAdventure ? "quest" : "task";
  const fieldStyle: React.CSSProperties = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };
  const chipBorder = isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)";
  const labelCls = "text-[13px] font-semibold";

  function close() {
    if (phase === "closing") return;
    setConfirmLeave(false);
    if (autosave) {
      if (dirty || placement !== savedPlacement.current) void persist(true);
      commitProgress();
    }
    setPhase("closing");
    setTimeout(onClose, embedded ? 0 : origin === "fab" ? 260 : 180);
  }
  /** Leaving a new quest with writing in it asks first: keep writing, save a draft, or discard. */
  function requestClose() {
    if (hasWriting && !finished.current) setConfirmLeave(true);
    else close();
  }
  function leaveWithDraft() {
    saveDraft(draftNow());
    finished.current = true;
    close();
  }
  function discardAndLeave() {
    if (draftIdRef.current) removeDraft(draftIdRef.current);
    finished.current = true;
    close();
  }
  useEscape(() => requestClose());
  // The + sheet around an embedded editor asks before closing it.
  useEffect(() => {
    if (!create) return;
    const h = (e: Event) => {
      if (hasWriting && !finished.current) {
        e.preventDefault();
        setConfirmLeave(true);
      }
    };
    window.addEventListener("qe-request-close", h);
    return () => window.removeEventListener("qe-request-close", h);
  }, [create, hasWriting]);



  /** Shrink the dialog into the newly created quest's card, if it's on screen. */
  async function flyInto(id: string) {
    const panel = panelRef.current;
    let target: Element | null = null;
    for (let i = 0; i < 15 && !target; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const el = document.querySelector(`[data-task-id="${id}"]`);
      if (el && el.getBoundingClientRect().height > 0) target = el;
    }
    // Card hidden (e.g. Additional Quests collapsed): shrink into that section instead.
    if (!target) target = document.querySelector('[data-quest-dropzone="other"]');
    if (!panel || !target || !panel.animate) return close();
    const from = panel.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sx = to.width / from.width;
    const sy = to.height / from.height;
    const overlay = panel.parentElement;
    overlay?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: "ease-in", fill: "forwards" });
    await panel.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.35 },
      ],
      { duration: 380, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }
    ).finished;
    glow(target);
    onClose();
  }

  function glow(el: Element) {
    el.animate([{ boxShadow: "0 0 0 3px rgba(217,180,95,.9)" }, { boxShadow: "0 0 0 0 rgba(217,180,95,0)" }], { duration: 900 });
  }

  /** New quests without a picked portrait get one painted in the background. */
  function paintPortrait(id: string) {
    const prompt = artPrompt.trim() || [title.trim(), description.trim()].filter(Boolean).join(" — ");
    if (!draftIcon && prompt) void generateTaskIconAction(id, prompt).catch(() => {});
  }

  /** Create (or confirm a reviewed import). Existing quests save themselves. */
  function save() {
    setError(null);
    const newSlot = !fixedSchedule && slot && slot.start !== initialSlot?.start ? slot : null;
    startSaving(async () => {
      try {
        if (task) {
          // Review mode: confirm the import with whatever was edited.
          await updateTaskAction(task.id, {
            title,
            description,
            importance,
            urgency,
            xpValue: xp,
            estimateMinutes: est,
            boardId,
            effort: task.effort !== undefined || effort ? effort : undefined,
            energyGain,
            isAspiration: aspiration,
            dueAt,
            chunkMinutes,
            coinValue,
            confirmImport: Boolean(review),
          });
          if (newSlot) await scheduleTaskAction(task.id, newSlot.start, newSlot.end);
          if (stepsDirty && steps) await saveQuestStepsAction(task.id, stepPayload(steps));
          await setTaskPlacementAction(task.id, placement).catch(() => {});
          if (onSaved) onSaved();
          else close();
          return;
        }
        if (doingNow) {
          finished.current = true;
          if (draftIdRef.current) removeDraft(draftIdRef.current);
          const res = await logDoingNowAction({ title, description, xpValue: xp, boardId, iconKey: draftIcon?.url ?? null, iconSource: draftIcon?.source });
          paintPortrait(res.id);
          celebrateQuest({
            taskId: res.id,
            title,
            description,
            xp,
            iconSrc: draftIcon?.url ?? null,
            totalXp: res.totalXp ?? null,
            coinsEarned: res.coinsEarned ?? 0,
          });
          onCreated?.(res.id);
          setPhase("closing");
          setTimeout(onClose, embedded ? 0 : 180);
          return;
        }
        // Show it on Today straight away; the server catches up behind it.
        // A quest that waits behind another stays out of sight, so no instant card for it.
        const showNow = !fixedSchedule && placement !== "none" && !seqLinks.some((l) => l.rel === "after");
        const tempId = showNow
          ? addOptimisticQuest({ title: title.trim(), description: description.trim() || null, xp, estimate: est, placement: placement === "today" ? "today" : "additional", iconUrl: draftIcon?.url ?? null })
          : null;
        if (tempId) {
          if (embedded) onClose();
          else {
            setPhase("closing");
            setTimeout(onClose, 180);
          }
        }
        let id: string;
        try {
          id = await createQuestAction({
          title,
          description,
          importance,
          urgency,
          xpValue: xp,
          estimateMinutes: est,
          boardId,
          effort: effort || undefined,
          energyGain: energyGain || undefined,
          iconKey: draftIcon?.url ?? null,
          iconSource: draftIcon?.source,
          pinToBattle: placement === "today",
          placement,
          schedule: fixedSchedule ?? (newSlot ? { startISO: newSlot.start, endISO: newSlot.end } : undefined),
          dueAt,
          chunkMinutes,
          coinValue,
          });
        } catch (e) {
          if (tempId) resolveOptimisticQuest(tempId, null, e instanceof Error ? e.message : "Couldn't save that quest.");
          throw e;
        }
        if (tempId) resolveOptimisticQuest(tempId, id);
        finished.current = true;
        if (draftIdRef.current) removeDraft(draftIdRef.current);
        if (tags.length) await setTaskTagsAction(id, tags).catch(() => {});
        if (toSchedule) await setSchedulingAction(id, schedPlace).catch(() => {});
        if (Object.keys(statSplit).length) await setTaskStatSplitAction(id, statSplit).catch(() => {});
        if (isPriv) await setTaskPrivateAction(id, true).catch(() => {});
        for (const l of seqLinks) {
          const { id: other, title: name } = l.pick;
          const link =
            l.rel === "after"
              ? other
                ? sequenceLinkAction(other, "after", { id })
                : sequenceLinkAction(id, "before", { title: name })
              : sequenceLinkAction(id, "after", other ? { id: other } : { title: name });
          await link.catch(() => {});
        }
        const newSteps = (steps ?? []).filter((st) => st.title.trim());
        if (newSteps.length > 0) await saveQuestStepsAction(id, stepPayload(newSteps).map(({ id: _id, ...st }) => st)); // eslint-disable-line @typescript-eslint/no-unused-vars
        paintPortrait(id);
        onCreated?.(id);
        // The dialog may already be gone by now (it closes as soon as the quest
        // shows on Today), so ask for fresh data here: the board, matrix or
        // calendar it was added from shows it straight away.
        router.refresh();
        if (tempId) {
          // Already closed: light up the real card once it lands.
          setTimeout(() => {
            const el = document.querySelector(`[data-task-id="${id}"]`);
            if (el) glow(el);
          }, 900);
          return;
        }
        if (embedded) {
          // The + sheet closes itself; then light up the new card where it landed.
          onClose();
          setTimeout(() => {
            const el = document.querySelector(`[data-task-id="${id}"]`);
            if (el) {
              el.scrollIntoView({ block: "nearest", behavior: "smooth" });
              glow(el);
            }
          }, 500);
        } else await flyInto(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function remove() {
    if (!task) return;
    setError(null);
    deleted.current = true;
    startSaving(async () => {
      try {
        await deleteTaskAction(task.id);
        setPhase("closing");
        setTimeout(onClose, 180);
      } catch (e) {
        deleted.current = false;
        setError(e instanceof Error ? e.message : "Couldn't delete.");
      }
    });
  }

  // Ctrl/⌘+S saves, like Ctrl/⌘+Enter (which the + sheet handles when the editor sits inside it).
  const onSaveKey = useEffectEvent((e: KeyboardEvent) => {
    const s = e.key === "s" || e.key === "S";
    if (!(e.ctrlKey || e.metaKey) || !(s || (e.key === "Enter" && !embedded))) return;
    if (e.target instanceof Element && e.target.closest("[data-feedback-root]")) return;
    e.preventDefault();
    if (autosave) close();
    else if (!isSaving && title.trim()) save();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onSaveKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  /** iOS: keep the field you're typing in above the keyboard. */
  function keepInView(e: React.FocusEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["range", "checkbox", "radio"].includes(el.type)))) return;
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
  }

  const enterCls = origin === "fab" ? "qe-rise-in" : "sheet-slide-up-in";
  const exitCls = origin === "fab" ? "qe-sink-out" : "sheet-minimize-out";
  const empty = <CheckMark checked={false} isAdventure={isAdventure} size={72} />;
  const heading = review
    ? `Review import ${review.index} of ${review.total}`
    : isCompleted
      ? `Completed ${noun}`
      : task
        ? `Edit ${noun}`
        : doingNow
          ? "Doing now"
          : `New ${noun}`;
  const coinsShown = coinValue ?? autoCoins(xp);

  const portalTarget = usePortalTarget();
  const toolbarHost = useEditorToolbar();
  const otherDrafts = drafts.filter((d) => d.id !== draftId);
  const smallBtn = "flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold";
  const toolbarButtons =
    create && !doingNow ? (
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => (setShowTemplates((v) => !v), setShowDrafts(false))} aria-expanded={showTemplates} title="Start from a template or a quick set" className={smallBtn} style={{ border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: showTemplates ? "rgba(217,180,95,.35)" : "transparent" }}>
          <span aria-hidden>📜</span> Templates
        </button>
        {otherDrafts.length > 0 && (
          <button type="button" onClick={() => (setShowDrafts((v) => !v), setShowTemplates(false))} aria-expanded={showDrafts} title="Quests you started and didn't finish" className={smallBtn} style={{ border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: showDrafts ? "rgba(217,180,95,.35)" : "transparent" }}>
            <span aria-hidden>📝</span> Drafts <span className="tabular-nums opacity-70">{otherDrafts.length}</span>
          </button>
        )}
      </span>
    ) : null;
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${phase === "closing" ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        // A tap outside first just leaves the field you're in; then it asks before closing.
        const a = document.activeElement as HTMLElement | null;
        if (a && panelRef.current?.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) {
          a.blur();
          return;
        }
        if (confirmLeave) close();
        else setConfirmLeave(true);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => {
          e.stopPropagation();
          if (confirmLeave) setConfirmLeave(false);
        }}
        onKeyDown={(e) => {
          // Escape leaves the field (or little form) you're in first; a second one closes the editor.
          const t = e.target as HTMLElement;
          if (e.key === "Escape" && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) {
            e.preventDefault();
            t.blur();
          }
        }}
        className={`relative flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl ${
          phase === "closing" ? exitCls : enterCls
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        {confirmLeave && (
          <div role="alertdialog" aria-label="Close the editor?" className="card-pop-in absolute inset-x-3 bottom-3 z-30 flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: "rgba(20,14,6,.94)", border: "1px solid rgba(242,210,126,.55)", boxShadow: "0 8px 24px rgba(0,0,0,.45)" }}>
            <span className="min-w-0 flex-1 text-[14.5px]" style={{ color: "#f6ecd2" }}>
              {autosave ? "Done here? Your changes are saved." : hasWriting ? "Leave this quest?" : "Close the editor?"}
            </span>
            <button type="button" onClick={() => setConfirmLeave(false)} className="h-9 rounded-full px-2.5 text-[13.5px] underline" style={{ color: "rgba(246,236,210,.8)" }}>
              Keep editing
            </button>
            {hasWriting ? (
              <>
                <button type="button" onClick={discardAndLeave} className="h-9 rounded-full px-2.5 text-[13.5px] underline" style={{ color: "#f0b8a8" }}>
                  Discard
                </button>
                <button type="button" autoFocus onClick={leaveWithDraft} className="h-9 rounded-full px-3.5 text-[13.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                  Save as draft
                </button>
              </>
            ) : (
              <button type="button" autoFocus onClick={close} className="h-9 rounded-full px-4 text-[13.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                Close
              </button>
            )}
          </div>
        )}
        <div onFocus={keepInView} className="qe-body relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          {/* Stays put while scrolling, small and out of the way. */}
          <div
            data-embed-hide
            className="sticky -top-4 z-20 -mx-4 -mb-1.5 -mt-4 flex items-center justify-between px-4 pb-1 pt-1.5"
            style={{ background: `linear-gradient(180deg, ${isAdventure ? "var(--t-panel)" : "var(--t-card)"} 70%, transparent)` }}
          >
            {/* The quest's own title stays at the top while you scroll. */}
            <h3 className={`m-0 min-w-0 flex-1 truncate pr-2 text-[15px] ${isAdventure ? "font-display" : "font-bold"}`} style={{ color: title.trim() ? "var(--t-ink)" : "var(--t-ink-soft)" }} title={title.trim() || heading}>
              {title.trim() || heading}
            </h3>
            {!toolbarHost && toolbarButtons}
            <button type="button" onClick={requestClose} aria-label="Close" className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
              ×
            </button>
          </div>

          {altAction && (
            <button type="button" onClick={altAction.onClick} className="-mt-1.5 self-start text-[13.5px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
              {altAction.label}
            </button>
          )}

          {doingNow && (
            <p className="m-0 text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
              Something you&apos;re doing right now — it&apos;s logged as done and the XP is yours straight away.
            </p>
          )}

          {/* Portrait left, title + description right — like the quest card */}
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 flex-col items-center gap-1">
              {task ? (
                <IconPicker
                  taskId={task.id}
                  currentIcon={task.icon_key}
                  currentSource={task.icon_source}
                  taskTitle={title}
                  taskDescription={description}
                  theme={theme}
                  size={72}
                  emptyContent={empty}
                  showEditHint
                />
              ) : (
                <>
                  <IconPicker
                    currentIcon={draftIcon?.url ?? null}
                    currentSource={draftIcon?.source ?? "monster"}
                    taskTitle={artPrompt.trim() || title}
                    taskDescription={artPrompt.trim() ? "" : description}
                    theme={theme}
                    size={72}
                    emptyContent={empty}
                    showEditHint
                    onDraftChange={(url, source) => setDraftIcon(url ? { url, source } : null)}
                  />
                  {/* Paint something other than the title (blank = the title). */}
                  {!draftIcon && !doingNow && (
                    <input
                      value={artPrompt}
                      onChange={(e) => setArtPrompt(e.target.value)}
                      placeholder="paint…"
                      aria-label="What the portrait should show (instead of the title)"
                      title="What the portrait should show, if not the title"
                      className="h-6 w-[76px] rounded-md border bg-transparent px-1.5 text-center text-[11.5px] placeholder:italic"
                      style={{ ...fieldStyle, background: "transparent" }}
                    />
                  )}
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={doingNow ? "What are you doing?" : isAdventure ? "Quest title" : "Task title"}
                aria-label="Title"
                autoFocus={!task}
                enterKeyHint="next"
                className="h-10 rounded-lg border px-2.5 text-[16px] font-semibold"
                style={fieldStyle}
              />
              <AutoGrowText
                value={description}
                onChange={setDescription}
                minRows={2}
                placeholder="Description (optional)"
                ariaLabel="Description"
                className="rounded-lg border px-2.5 py-1.5 text-[15px]"
                style={fieldStyle}
              />
            </div>
          </div>

          {/* Templates and quick sets, opened from the 📜 button at the top (new quests only). */}
          {create && !doingNow && showTemplates && (
            <div className="reveal flex flex-col gap-1.5 rounded-xl p-1.5" style={{ background: "rgba(70,50,20,.07)", border: "1px solid rgba(139,112,64,.25)" }}>
              {templates && templates.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {templates.map((t) => (
                    <li key={t.id} className="flex items-center gap-1">
                      <button type="button" onClick={() => applyTemplate(t)} className="flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg px-2.5 py-1.5 text-left hover:bg-black/[.05]">
                        <span className="truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                          {t.name}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                          {[t.steps.length ? `${t.steps.length} steps` : null, t.estimateMinutes ? `${t.estimateMinutes} min` : null, t.boardId ? boardOptions?.find((o) => o.id === t.boardId)?.label : null].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTemplates((l) => (l ?? []).filter((x) => x.id !== t.id));
                          void deleteQuestTemplateAction(t.id).catch(() => {});
                        }}
                        aria-label={`Delete the ${t.name} template`}
                        title="Delete this template"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]"
                        style={{ color: "var(--t-ink-soft)" }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          {/* Presets: one tap sets several attributes at once (new quests only). */}
          {(
            <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1" role="group" aria-label="Quest presets">
              <span className={`${labelCls} mr-0.5`}>Quick set</span>
              {(
                [
                  { name: "Quick win", hint: "Small and satisfying", imp: 2, urg: 3, eff: 1, en: 3, min: 10, xp: 15 },
                  { name: "Big rock", hint: "Important, takes real effort", imp: 5, urg: 3, eff: 4, en: 2, min: 90, xp: 80 },
                  { name: "Deep work", hint: "Focused, meaningful time", imp: 4, urg: 2, eff: 3, en: 2, min: 60, xp: 50 },
                  { name: "Recharge", hint: "Gives energy back", imp: 3, urg: 2, eff: 1, en: 5, min: 20, xp: 20 },
                ] as const
              ).map((p) => (
                <button
                  key={p.name}
                  type="button"
                  title={`${p.hint} · ${p.min} min · ${p.xp} XP`}
                  onClick={() => {
                    setImportance(p.imp);
                    setUrgency(p.urg);
                    setEffort(p.eff);
                    setEnergyGain(p.en);
                    setEstimate(String(p.min));
                    setXp(p.xp);
                  }}
                  className="hover-glow h-8 rounded-full px-3 text-[12.5px] font-semibold"
                  style={{ border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: "rgba(255,250,235,.45)" }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
            </div>
          )}

          {create && showDrafts && otherDrafts.length > 0 && (
            <ul className="reveal m-0 flex list-none flex-col gap-1 rounded-xl p-1.5" style={{ background: "rgba(70,50,20,.07)", border: "1px solid rgba(139,112,64,.25)" }}>
              {otherDrafts.map((d) => (
                <li key={d.id} className="flex items-center gap-1">
                  <button type="button" onClick={() => pickDraft(d)} className="flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg px-2.5 py-1.5 text-left hover:bg-black/[.05]">
                    <span className="w-full truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                      {d.title.trim() || d.description.trim().slice(0, 40) || "Untitled quest"}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                      {new Date(d.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                      {d.steps.length ? ` · ${d.steps.length} steps` : ""}
                    </span>
                  </button>
                  <button type="button" onClick={() => removeDraft(d.id)} aria-label="Throw this draft away" title="Throw this draft away" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {toolbarHost && toolbarButtons && createPortal(toolbarButtons, toolbarHost)}

          {/* Where it shows on Today: Today's Quests, Additional Quests, or the backlog (just its board). One choice. */}
          {!doingNow && !isCompleted && !fixedSchedule && (
            <div className="flex items-center gap-2">
              <span className={`${labelCls} shrink-0`}>Shows in</span>
              <div
                role="radiogroup"
                aria-label="Where it shows on the Today screen"
                className="grid h-9 min-w-0 flex-1 grid-cols-3 gap-0.5 rounded-full p-[3px]"
                style={{ background: "rgba(70,50,20,.09)", boxShadow: "inset 0 1px 2px rgba(70,50,20,.14)" }}
              >
                {(
                  [
                    { v: "today" as const, label: `Today's ${isAdventure ? "Quests" : "Tasks"}`, short: "Today" },
                    { v: "additional" as const, label: `Additional ${isAdventure ? "Quests" : "Tasks"}`, short: "Additional" },
                    { v: "none" as const, label: "Backlog", short: "Backlog" },
                  ]
                ).map((o) => {
                  const on = placement === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={o.label}
                      title={o.label}
                      onClick={() => setPlacement(o.v)}
                      className="flex min-w-0 items-center justify-center gap-1 rounded-full px-1 text-[12.5px] font-semibold transition-[background,box-shadow] duration-150"
                      style={{
                        background: on ? (isAdventure ? "linear-gradient(180deg,#f6e3a8,#dcb763)" : "var(--t-card)") : "transparent",
                        boxShadow: on ? "0 1px 3px rgba(60,40,10,.3), 0 0 0 1px rgba(138,97,22,.55)" : undefined,
                        color: on ? "#2a1c10" : "var(--t-ink-soft)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
                        style={{ border: `1.5px solid ${on ? "#6b4a12" : "rgba(110,90,50,.55)"}` }}
                      >
                        {on && <span className="block h-1.5 w-1.5 rounded-full" style={{ background: "#6b4a12" }} />}
                      </span>
                      <span className="truncate">{o.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time to complete */}
          {!doingNow && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- same clock glyph as the quest card */}
                <img src="/design/ui-clock.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
                <span className={`${labelCls} min-w-0 flex-1`}>Time to complete</span>
                <input
                  type="number"
                  onFocus={(e) => e.currentTarget.select()}
                  inputMode="numeric"
                  min={0}
                  step={5}
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  placeholder="—"
                  aria-label="Minutes to complete"
                  className="h-9 w-16 rounded-lg border px-2 text-right text-[16px] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={fieldStyle}
                />
                <span className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
                  min
                </span>
              </div>
            </div>
          )}

          {/* Scheduling: due date, a calendar slot, the scheduling list, the matrix and "not actionable yet" — folded away until wanted */}
          {!doingNow && (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setSchedOpen((o) => !o)} aria-expanded={schedOpen} className="flex min-h-8 items-center gap-1.5 text-left">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: schedOpen ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
                <img src="/design/ui-calendar.png" alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
                <span className="text-[14px] font-semibold" style={{ color: "var(--t-ink)" }}>
                  Scheduling
                </span>
                <span className="ml-auto min-w-0 truncate text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                  {[
                    dueDate && `due ${new Date(`${dueDate}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
                    (fixedSchedule || slot) && new Date((fixedSchedule?.startISO ?? slot?.start)!).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }),
                    toSchedule && "on the scheduling list",
                    aspiration && "not actionable yet",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "not scheduled"}
                </span>
              </button>
              {schedOpen && (
                <div className="reveal flex flex-col gap-2.5 pb-1">
          {/* Due date */}
          {!doingNow && (
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
              <img src="/design/ui-calendar.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
              <span className={`${labelCls} w-[58px] shrink-0`}>Due</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
                className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[15px]"
                style={{ ...fieldStyle, color: dueDate ? "var(--t-ink)" : "var(--t-ink-soft)" }}
              />
              {dueDate && (
                <>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    aria-label="Due time (optional)"
                    className="h-9 w-[92px] shrink-0 rounded-lg border px-1.5 text-[15px]"
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    onClick={() => (setDueDate(""), setDueTime(""))}
                    aria-label="Clear the due date"
                    className="h-8 w-6 shrink-0 text-[18px] leading-none"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          )}

          {/* Calendar slot */}
          {!doingNow && (
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="w-[18px] shrink-0" />
              <span className={`${labelCls} w-[58px] shrink-0`}>Calendar</span>
              {fixedSchedule || slot ? (
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {new Date((fixedSchedule?.startISO ?? slot?.start)!).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ) : (
                <span className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                  Not scheduled
                </span>
              )}
              {!fixedSchedule && (
                <>
                  {slot && slot !== initialSlot && (
                    <button type="button" onClick={() => setSlot(initialSlot)} className="text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
                      Undo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPickingSlot(true)}
                    className="hover-glow h-8 shrink-0 rounded-full border px-3 text-xs font-semibold"
                    style={{ borderColor: chipBorder, color: "var(--t-ink)" }}
                  >
                    {slot ? "Change" : "Find a time"}
                  </button>
                </>
              )}
            </div>
          )}
          {/* Scheduling priority list */}
          {!doingNow && !fixedSchedule && (
            <div className="flex flex-col gap-1.5">
              <label className="flex min-h-9 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={toSchedule}
                  onChange={(e) => applyScheduling(e.target.checked, schedPlace)}
                  className="h-[18px] w-[18px] shrink-0 accent-[#7a5f2a]"
                />
                <span className="text-[14px]" style={{ color: "var(--t-ink)" }}>
                  Add to the scheduling list
                </span>
                {schedNote && (
                  <span className="ml-auto text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                    {schedNote}
                  </span>
                )}
              </label>
              {toSchedule && (
                <div role="radiogroup" aria-label="Where on the scheduling list" className="reveal ml-7 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["top", "Top"],
                      ["unordered", "Top of unnumbered"],
                      ["bottom", "Bottom"],
                    ] as const
                  ).map(([v, label]) => {
                    const on = schedPlace === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => applyScheduling(true, v)}
                        className="h-8 rounded-full px-3 text-[12.5px] font-semibold"
                        style={{
                          border: `1px solid ${on ? "#7a5f2a" : chipBorder}`,
                          background: on ? "#7a5f2a" : "transparent",
                          color: on ? "#fbf3df" : "var(--t-ink)",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {pickingSlot && (
            <SlotPickerDialog
              durationMinutes={Math.max(15, Number(estimate) || 30)}
              isAdventure={isAdventure}
              onPick={(picked) => {
                setSlot(picked);
                setPickingSlot(false);
              }}
              onClose={() => setPickingSlot(false)}
            />
          )}

          {/* Plot on the matrix, with "not actionable yet" beside it */}
          {task && !isCompleted && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onPlot) onPlot();
                  else window.location.assign(`/matrix?plot=${task.id}`);
                }}
                className="hover-glow flex min-h-9 items-center justify-center gap-2 rounded-full border px-3 text-[13px] font-semibold"
                style={{ borderColor: chipBorder, color: "var(--t-ink)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- matrix glyph */}
                <img src="/design/ui-target.png" alt="" width={18} height={18} />
                Plot on the Priority Matrix
              </button>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px]" title="Keep it as an aspiration on its board, off Today and the map">
                <input type="checkbox" checked={aspiration} onChange={(e) => setAspiration(e.target.checked)} className="h-4 w-4 shrink-0" style={{ accentColor: isAdventure ? "#8a6c2c" : "var(--t-accent)" }} />
                <span className="font-semibold">Not actionable yet</span>
              </label>
            </div>
          )}

                </div>
              )}
            </div>
          )}

          {/* Steps: a checklist inside the quest */}
          {!doingNow && !stepsUnavailable && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <StepsGlyph />
                <span className={labelCls}>Steps</span>
                {steps && steps.length > 0 && (
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                    {stepsDone}/{stepsLive}
                    {/* How far the steps carry the quest. */}
                    <span className="h-2.5 min-w-[40px] max-w-[140px] flex-1 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1px solid #8a6c2c", boxShadow: "inset 0 1px 3px rgba(0,0,0,.6)" }} aria-label={`Steps ${stepsShare(steps)}% done`}>
                      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${stepsShare(steps)}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)", boxShadow: "0 0 6px rgba(242,210,126,.5)" }} />
                    </span>
                  </span>
                )}
                {stepXpPop !== null && (
                  <span aria-live="polite" className="power-spark text-[13px] font-bold" style={{ color: "var(--t-xp)" }}>
                    +{stepXpPop} XP
                  </span>
                )}
                {!isCompleted && steps !== null && !addingStep && (
                  <button
                    type="button"
                    onClick={() => setAddingStep(true)}
                    className="hover-glow ml-auto flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-bold"
                    style={{ background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", border: isAdventure ? "1px solid #8a6116" : undefined, boxShadow: "0 1px 3px rgba(60,40,10,.3)" }}
                  >
                    <span aria-hidden className="text-[16px] leading-none">+</span> Add steps
                  </button>
                )}
              </div>
              {steps === null && (task?.steps_total ?? 0) > 0 ? (
                // Loading: hold the steps' place so the editor doesn't jump when they arrive.
                <ul className="m-0 flex list-none flex-col p-0 pl-[22px]" aria-busy="true" aria-label="Loading steps">
                  {Array.from({ length: task?.steps_total ?? 0 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-2 py-[5px] pl-1">
                      <span className="h-[18px] w-[18px] shrink-0 rounded-[5px]" style={{ border: `1.5px solid ${isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`, opacity: 0.5 }} />
                      <span className="step-skeleton h-[14px] rounded" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                    </li>
                  ))}
                </ul>
              ) : steps === null || (steps.length === 0 && !addingStep) ? null : (
                <ul className="m-0 flex list-none flex-col p-0 pl-[22px]">
                  {(() => {
                    const ordered = treeOrder(steps);
                    const wl = stepWeights(steps);
                    const wOf = new Map(steps.map((x, i) => [x.key, wl[i]]));
                    const depthOf = (x: StepDraft) => {
                      let d = 0;
                      let p = x.parentKey;
                      while (p && d < 6) {
                        d += 1;
                        p = steps.find((y) => y.key === p)?.parentKey ?? null;
                      }
                      return d;
                    };
                    const shownSteps = ordered.filter((x) => {
                      let p = x.parentKey;
                      while (p) {
                        if (!openSteps.has(p)) return false;
                        p = steps.find((y) => y.key === p)?.parentKey ?? null;
                      }
                      return true;
                    });
                    return shownSteps.map((st) => {
                    const isHolder = holders.has(st.key);
                    const inside = isHolder ? [...descendants(steps, st.key)].filter((k) => k !== st.key && !holders.has(k)).map((k) => steps.find((y) => y.key === k)!) : [];
                    const insideDone = inside.filter((x) => x.done).length;
                    const checked = isHolder ? inside.length > 0 && inside.every((x) => x.done || x.state === "skipped") : st.done;
                    const depth = depthOf(st);
                    return (
                    <li key={st.key} data-step-key={st.key} className="quest-step flex flex-col rounded-md py-0.5 pl-1" style={depth ? { marginLeft: depth * 22 } : undefined}>
                    <div className="flex items-start gap-1.5">
                      {isHolder ? (
                        <button
                          type="button"
                          onClick={() => setOpenSteps((o) => { const n = new Set(o); if (n.has(st.key)) n.delete(st.key); else n.add(st.key); return n; })}
                          aria-expanded={openSteps.has(st.key)}
                          aria-label={openSteps.has(st.key) ? `Hide the sub-tasks of ${st.title}` : `Show the sub-tasks of ${st.title}`}
                          className="-ml-[20px] mt-[4px] flex h-5 w-4 shrink-0 items-center justify-center"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: openSteps.has(st.key) ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        aria-label={st.state ? `Reopen ${st.title}` : st.done ? `Untick ${st.title}` : `Tick ${st.title}`}
                        disabled={isCompleted}
                        onClick={() => (st.state ? updateStep(st.key, { state: null }) : setStepDone(st.key, !checked))}
                        className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
                        style={{
                          border: `1.5px solid ${checked ? "var(--t-good)" : st.state === "failed" ? "#b5321f" : st.state === "skipped" ? "#9a9286" : isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`,
                          background: checked ? "var(--t-good)" : st.state === "failed" ? "#b5321f" : st.state === "skipped" ? "#b7b0a4" : "transparent",
                        }}
                        title={st.state === "skipped" ? "Skipped — tap to reopen" : st.state === "failed" ? "Failed — tap to reopen" : undefined}
                      >
                        {checked && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {st.state === "skipped" && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 6l7 6-7 6M13 6l7 6-7 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {st.state === "failed" && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                      <AutoGrowText
                        value={st.title}
                        onChange={(v) => renameStep(st.key, v.replace(/\n/g, " "))}
                        onKeyDown={(e) => {
                          // Enter: on to writing the next step.
                          if (e.key === "Enter" && !isCompleted) {
                            e.preventDefault();
                            // Inside a step: the next sub-task beside this one. At the top: the next step.
                            if (st.parentKey) addSubStep(st.parentKey, st.key);
                            else {
                              setAddingStep(true);
                              requestAnimationFrame(() => newStepRef.current?.focus());
                            }
                          }
                        }}
                        ariaLabel="Step"
                        className={`bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] text-[16px] leading-snug focus:outline-none ${st.state ? "line-through" : ""}`}
                        style={st.state === "failed" ? { color: "#b5321f", textDecorationColor: "#b5321f" } : st.state === "skipped" ? { color: "#9a9286", textDecorationColor: "#9a9286" } : { color: "var(--t-ink)" }}
                      />
                      {isHolder && (
                        <button type="button" onClick={() => setOpenSteps((o) => new Set(o).add(st.key))} className="mt-[3px] flex h-7 shrink-0 items-center rounded-full px-2 text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-ink-soft)", border: "1px solid rgba(139,112,64,.35)" }} title="Sub-tasks done">
                          {insideDone}/{inside.length}
                        </button>
                      )}
                      {/* What this step is worth, right on the row: its share of the quest (tap to change) and the XP that brings. */}
                      {!isHolder && (
                      <span className="mt-[3px] flex h-7 shrink-0 items-center gap-1 text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                        <button
                          type="button"
                          onClick={() => setShareStep(shareStep === st.key ? null : st.key)}
                          aria-expanded={shareStep === st.key}
                          aria-label={`Share of the quest for ${st.title}: ${Math.round((wOf.get(st.key) ?? 0) * 100)} percent — change`}
                          title="Share of the quest (tap to change)"
                          className="step-worth h-7 rounded-md px-1 text-[14px] font-semibold tabular-nums hover:bg-black/[.05]"
                          style={{ color: st.weight ? "var(--t-ink)" : "var(--t-ink-soft)" }}
                        >
                          {Math.round((wOf.get(st.key) ?? 0) * 100)}%
                        </button>
                        <span className="font-semibold" style={{ color: "var(--t-xp)" }}>
                          {Math.round((wOf.get(st.key) ?? 0) * xp) + (st.xp ?? 0)} XP
                        </span>
                      </span>
                      )}
                      <span className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setStepMenu(stepMenu === st.key ? null : st.key)}
                          aria-haspopup="menu"
                          aria-expanded={stepMenu === st.key}
                          aria-label={`More for ${st.title}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]"
                          style={{ color: "var(--t-ink-soft)" }}
                        >
                          ⋯
                        </button>
                        {stepMenu === st.key && (
                          <span role="menu" className="card-pop-in parchment absolute right-0 top-8 z-30 flex w-[170px] flex-col overflow-hidden py-1" style={{ borderRadius: 12, boxShadow: "0 10px 24px rgba(0,0,0,.3)" }}>
                            {(
                              [
                                ["sub", "＋", "Add a sub-task", "var(--t-ink)"],
                                ...(st.state !== "skipped" ? [["skip", "⏭", "Skip it", "var(--t-ink)"]] : []),
                                ...(st.state !== "failed" ? [["fail", "✗", "Failed", "#b5321f"]] : []),
                                ...(st.state || st.done ? [["open", "↺", "Back to open", "var(--t-ink)"]] : []),
                                ["remove", "🗑", "Remove step", "var(--t-ink-soft)"],
                              ] as [string, string, string, string][]
                            ).map(([k, icon, label, color]) => (
                              <button
                                key={k}
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setStepMenu(null);
                                  if (k === "sub") addSubStep(st.key);
                                  if (k === "skip") updateStep(st.key, { state: "skipped", done: false, progress: 0 });
                                  if (k === "fail") updateStep(st.key, { state: "failed", done: false, progress: 0 });
                                  if (k === "open") updateStep(st.key, { state: null, done: false, progress: 0 });
                                  if (k === "remove") removeStep(st.key);
                                }}
                                className="relative z-[1] flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[14.5px] hover:bg-black/5"
                                style={{ color }}
                              >
                                <span aria-hidden className="w-4 text-center">{icon}</span>
                                {label}
                              </button>
                            ))}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* Its share of the quest, as a slider (blank = an equal share). */}
                    {shareStep === st.key && !isHolder && (
                      <div className="reveal ml-[26px] mr-9 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                        <span className="shrink-0">Share</span>
                        <input
                          type="range"
                          min={1}
                          max={100}
                          value={st.weight ?? Math.round((wOf.get(st.key) ?? 0) * 100)}
                          onChange={(e) => updateStep(st.key, { weight: Number(e.target.value) })}
                          aria-label={`Share of the quest for ${st.title}, in percent`}
                          className="h-6 min-w-0 flex-1"
                          style={{ accentColor: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
                        />
                        {st.weight != null && (
                          <button type="button" onClick={() => updateStep(st.key, { weight: null })} className="shrink-0 underline">
                            equal
                          </button>
                        )}
                      </div>
                    )}
                    {/* How far along: a slim slider under each open step. */}
                    {!st.done && !st.state && !isCompleted && !isHolder && (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={st.progress ?? 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateStep(st.key, { progress: v, done: v >= 100 });
                        }}
                        aria-label={`How far along ${st.title} is`}
                        title={`${st.progress ?? 0}% done`}
                        className="step-progress ml-[26px] mr-9"
                        style={{ ["--p" as string]: `${st.progress ?? 0}%` }}
                      />
                    )}
                    </li>
                    );
                    });
                  })()}
                  {!isCompleted && addingStep && (
                    <li className="reveal quest-step flex items-start gap-2 rounded-md py-0.5 pl-1">
                      {/* Same box and type as a saved step, so a step looks the same before and after Enter. */}
                      <span aria-hidden className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-dashed text-[13px] leading-none" style={{ borderColor: isAdventure ? "#8a6c2c" : "var(--t-card-border)", color: "var(--t-ink-soft)" }}>
                        +
                      </span>
                      <input
                        ref={newStepRef}
                        value={newStep}
                        onChange={(e) => setNewStep(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addStep();
                            // Stay on the add row for the next step, whatever re-rendered.
                            requestAnimationFrame(() => newStepRef.current?.focus());
                          } else if (e.key === "Escape") {
                            // Leaves just this row (a second Escape closes the editor).
                            e.preventDefault();
                            e.stopPropagation();
                            setNewStep("");
                            setAddingStep(false);
                          }
                        }}
                        onBlur={() => {
                          addStep();
                          // Only fold the add row away when it was left empty on purpose.
                          setTimeout(() => {
                            if (document.activeElement !== newStepRef.current) setAddingStep(false);
                          }, 0);
                        }}
                        autoFocus
                        enterKeyHint="enter"
                        placeholder="Add a step, then Enter"
                        aria-label="Add a step"
                        className="bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] text-[16px] leading-snug focus:outline-none"
                        style={{ color: "var(--t-ink)" }}
                      />
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          {/* XP and coins */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={labelCls}>{isAdventure ? "XP reward" : "Points"}</span>
              <span className="ml-auto text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                {coinValue === null ? `coins follow XP (1 per ${XP_PER_COIN})` : (
                  <button type="button" onClick={() => setCoinValue(null)} className="underline">
                    custom coins · reset to auto
                  </button>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={XP_MAX}
                step={XP_STEP}
                value={Math.min(XP_MAX, xp)}
                onChange={(e) => setXp(Number(e.target.value))}
                aria-label="XP reward"
                className="h-8 min-w-0 flex-1"
                style={{ accentColor: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
              />
              <span className="flex h-9 shrink-0 items-center rounded-lg border pr-1.5" style={fieldStyle}>
                <NumberInput
                  min={0}
                  max={1000}
                  value={xp}
                  onValueChange={setXp}
                  blankZero
                  aria-label="XP amount"
                  className="bare-input h-full w-11 bg-transparent px-1 text-right text-[16px] font-bold tabular-nums placeholder:opacity-60 placeholder:text-[var(--t-xp)] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
                />
                <span className="text-[12px] font-bold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
                  XP
                </span>
              </span>
              {!doingNow && (
                <span className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg border px-1" style={fieldStyle} title="Coins earned on completion">
                  <button
                    type="button"
                    onClick={() => setCoinValue(Math.max(0, coinsShown - 1))}
                    aria-label="Fewer coins"
                    className="flex h-7 w-6 items-center justify-center text-[17px] leading-none"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    −
                  </button>
                  <CoinIcon size={16} />
                  <NumberInput
                    min={0}
                    value={coinsShown}
                    onValueChange={setCoinValue}
                    aria-label="Coins"
                    className="bare-input h-full w-8 bg-transparent text-center text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ color: coinValue === null ? "var(--t-ink-soft)" : "#8a6116" }}
                  />
                  <button
                    type="button"
                    onClick={() => setCoinValue(coinsShown + 1)}
                    aria-label="More coins"
                    className="flex h-7 w-6 items-center justify-center text-[17px] leading-none"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    +
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Character stats: a share of the XP can build stats instead of your level */}
          {!doingNow && <StatSplitEditor xp={xp} split={statSplit} onChange={changeStatSplit} isAdventure={isAdventure} />}

          {/* Quest progress: partial progress earns its share of the XP (same look as the XP row). */}
          {task && !isCompleted && (
            <div className="flex flex-col gap-1" style={{ opacity: progressTracked ? 1 : 0.6 }}>
              <div className="flex items-center gap-2">
                <span className={labelCls}>Progress</span>
                <span className="ml-auto text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                  {!progressTracked
                    ? "available after the next database update"
                    : progress >= 100
                      ? "closing at 100% completes it"
                      : progress !== initialProgress
                        ? `+${Math.round((xp * (progress - initialProgress)) / 100)} XP when you close this`
                        : `${Math.round((xp * progress) / 100)} XP earned · ${xp - Math.round((xp * progress) / 100)} more on completion`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  disabled={!progressTracked}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  aria-label="Quest progress"
                  className="h-8 min-w-0 flex-1"
                  style={{ accentColor: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
                />
                <span className="flex h-9 shrink-0 items-center rounded-lg border pr-1.5" style={fieldStyle}>
                  <NumberInput
                    min={0}
                    max={100}
                    value={progress}
                    disabled={!progressTracked}
                    onValueChange={setProgress}
                    aria-label="Progress percent"
                    className="bare-input h-full w-11 bg-transparent px-1 text-right text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
                  />
                  <span className="text-[12px] font-bold" style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}>
                    %
                  </span>
                </span>
              </div>
            </div>
          )}

          {!doingNow && (
            <>
              <IconScale label="Importance" icon="/design/ui-trophy.svg" value={importance} onChange={setImportance} />
              <IconScale label="Urgency" icon="/design/ui-flame-sm.png" value={urgency} onChange={setUrgency} />
              <IconScale label="Difficulty" icon="/design/ui-muscle.svg" hint="How hard it is — how much it takes out of you" value={effort} onChange={setEffort} />
              <IconScale label="Energy boost" icon="/design/ui-bolt.png" hint="How much energy finishing it gives you" value={energyGain} onChange={setEnergyGain} />
            </>
          )}

          {/* Quest board (the tag on the card) */}
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- boards glyph */}
            <img src="/design/ui-grid.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
            <span className={`${labelCls} w-[58px] shrink-0`}>Board</span>
            <BoardPicker
              value={boardId}
              options={boardOptions}
              onChange={setBoardId}
              onCreate={async (name) => {
                const res = await createBoardFromEditorAction(name);
                setBoardOptions((opts) => [...(opts ?? []), { id: res.id, label: res.title }].sort((a, b) => a.label.localeCompare(b.label)));
                setBoardId(res.id);
              }}
              isAdventure={isAdventure}
              fieldStyle={fieldStyle}
            />
          </div>

          {/* Tags: a few words that sort quests across boards (and feed the life wheel). */}
          {!doingNow && (
            <div className="-mt-1 flex flex-wrap items-center gap-1.5 pl-[86px] text-[13px]">
              {tags.map((t) => (
                <span key={t} className="flex h-7 items-center gap-0.5 rounded-full pl-2.5 pr-0.5" style={{ background: "rgba(217,180,95,.22)", border: "1px solid rgba(139,112,64,.45)", color: "var(--t-ink)" }}>
                  #{t}
                  <button type="button" onClick={() => commitTags(tags.filter((x) => x !== t))} aria-label={`Remove the tag ${t}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagText}
                list="qe-known-tags"
                onChange={(e) => {
                  const v = e.target.value;
                  if (/[,\n]/.test(v)) addTag(v);
                  else setTagText(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagText.trim()) {
                    e.preventDefault();
                    addTag(tagText);
                  }
                  if (e.key === "Backspace" && !tagText && tags.length) commitTags(tags.slice(0, -1));
                }}
                onBlur={() => tagText.trim() && addTag(tagText)}
                placeholder={tags.length ? "+ tag" : "Tags (e.g. health, learning)"}
                aria-label="Add a tag"
                className="h-7 min-w-[110px] flex-1 rounded-full border px-2.5 text-[13px]"
                style={fieldStyle}
              />
              <datalist id="qe-known-tags">
                {knownTags.filter((t) => !tags.includes(t)).slice(0, 30).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          )}

          {/* A stand-in quest speaks for its board's current assignment. */}
          {task && !review && (
            <label className="-mt-1 flex flex-wrap items-center gap-2 pl-[86px] text-[13px]" title="Keep this quest's clear name, but follow the board's current assignment: its due date, its priority and its next step">
              <input type="checkbox" checked={!!standsFor} onChange={(e) => changeStandsFor(e.target.checked ? (boardId ?? null) : null)} disabled={!boardId && !standsFor} />
              <span>Stands for the board&rsquo;s current assignment</span>
              {standsFor && (
                <select value={standsFor} onChange={(e) => changeStandsFor(e.target.value || null)} aria-label="Which board it follows" className="h-7 max-w-[200px] rounded-full border px-2 text-[13px]" style={{ borderColor: "#b39a6a", background: "transparent", color: "var(--t-ink)" }}>
                  {(boardOptions ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* Also show it on other boards (it still lives on the one above). */}
          {task && !review && (
            <div className="-mt-1 flex flex-wrap items-center gap-1.5 pl-[86px] text-[13px]">
              <span style={{ color: "var(--t-ink-soft)" }}>Also on</span>
              {alsoOn.map((id) => (
                <span key={id} className="flex h-7 items-center gap-0.5 rounded-full pl-2.5 pr-0.5" style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
                  ↗ {boardOptions?.find((o) => o.id === id)?.label ?? "a board"}
                  <button type="button" onClick={() => saveAlsoOn(alsoOn.filter((x) => x !== id))} aria-label="Unlink from this board" className="flex h-6 w-6 items-center justify-center rounded-full text-[14px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
                    ×
                  </button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => e.target.value && saveAlsoOn([...alsoOn, e.target.value])}
                aria-label="Also show it on another board"
                className="h-7 max-w-[180px] rounded-full border px-2 text-[13px]"
                style={{ borderColor: "#b39a6a", background: "transparent", color: "var(--t-ink)" }}
              >
                <option value="">+ another board…</option>
                {(boardOptions ?? [])
                  .filter((o) => o.id !== boardId && !alsoOn.includes(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </select>
              {alsoError && <span style={{ color: "var(--t-warn)" }}>{alsoError}</span>}
            </div>
          )}

          {task && !review && title.trim() && (
            <div className="-mt-1 flex flex-wrap items-center gap-2 pl-[86px] text-[13px]">
              <button type="button" onClick={saveAsTemplate} className="underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }} title="Keep this quest (with its steps) as a ready-made one in the quest creator">
                📜 Save as a template
              </button>
              {templateNote && <span style={{ color: "var(--t-ink)" }}>{templateNote}</span>}
            </div>
          )}

          {isCompleted && task && (
            <div
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px]"
              style={{ background: "rgba(79,109,60,.12)", border: "1px solid rgba(79,109,60,.35)" }}
            >
              <span>
                <span style={{ color: "var(--t-good)", fontWeight: 700 }}>✓</span> {isAdventure ? "Defeated" : "Completed"}
                {task.completed_at && ` ${new Date(task.completed_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
                {" · changing XP updates what you earned"}
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  startSaving(async () => {
                    await chain.current;
                    await reopenTaskAction(task.id);
                    close();
                  })
                }
                className="shrink-0 text-[12.5px] font-semibold underline disabled:opacity-50"
              >
                Restore to Today
              </button>
            </div>
          )}

          {/* Sequence: a fine setting, folded away until wanted. */}
          {!doingNow && !review && (
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => (task ? setSeqDialog(true) : setSeqOpen((o) => !o))} aria-expanded={task ? undefined : seqOpen} className="flex items-center gap-1 self-start text-[12px] underline-offset-2 hover:underline" style={{ color: "var(--t-ink-soft)" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: seqOpen && !task ? "rotate(90deg)" : undefined }}>
                  <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {task
                  ? (task.behind?.length ?? 0) > 0
                    ? `Sequence · ${task.behind!.length} waiting after this…`
                    : "Sequence: quests before or after this…"
                  : seqLinks.length
                    ? `Sequence · ${seqLinks.length} linked`
                    : "Sequence: quests before or after this"}
              </button>
              {!task && seqOpen && (
                <div className="reveal flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ border: "1px dashed rgba(139,112,64,.5)" }}>
                  <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    A quest after another stays stacked out of sight until that one is done.
                  </p>
                  {seqLinks.length > 0 && (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
                      {seqLinks.map((l, i) => (
                        <li key={i} className="flex min-h-8 items-center gap-2">
                          <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
                            {l.rel === "after" ? "Comes after" : "Then"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {l.pick.id ? "" : "＋ "}
                            {l.pick.title}
                          </span>
                          <button type="button" onClick={() => setSeqLinks((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.pick.title}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {seqAdding ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-[12.5px] font-semibold">{seqAdding === "after" ? "This quest comes after…" : "After this quest comes…"}</span>
                      <QuestPicker
                        autoFocus
                        exclude={seqLinks.map((l) => l.pick.id).filter(Boolean) as string[]}
                        onPick={(p) => {
                          setSeqLinks((ls) => [...ls, { rel: seqAdding, pick: p }]);
                          setSeqAdding(null);
                        }}
                      />
                      <button type="button" onClick={() => setSeqAdding(null)} className="self-start text-[12.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => setSeqAdding("after")} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px dashed rgba(139,112,64,.6)" }}>
                        ↑ Comes after a quest
                      </button>
                      <button type="button" onClick={() => setSeqAdding("before")} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px dashed rgba(139,112,64,.6)" }}>
                        ↓ Add what comes next
                      </button>
                    </div>
                  )}
                </div>
              )}
              {task && seqDialog && <SequenceDialog taskId={task.id} title={title} isAdventure={isAdventure} onClose={() => setSeqDialog(false)} />}
            </div>
          )}

          {/* Private: never shown to your party */}
          {!doingNow && (
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[14px]" title="Hidden from your party, even on screens you share">
              <input type="checkbox" checked={isPriv} onChange={(e) => changePrivate(e.target.checked)} />
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "var(--t-ink-soft)" }}>
                <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span>Private quest <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>· hidden from your party</span></span>
            </label>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}

          <div className="qe-actions flex items-center justify-between gap-2 pt-1">
            {task ? (
              !confirmingDelete ? (
                <button type="button" onClick={() => setConfirmingDelete(true)} className="min-h-9 text-sm underline" style={{ color: "var(--t-warn)" }}>
                  Delete {noun}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={remove}
                    disabled={isSaving}
                    className="rounded-full px-3 py-1.5 font-semibold disabled:opacity-50"
                    style={{ background: "var(--t-warn)", color: "#fff" }}
                  >
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                    Keep
                  </button>
                </div>
              )
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {autosave ? (
                <>
                  <span className="text-[12.5px]" style={{ color: saveState === "error" ? "var(--t-warn)" : "var(--t-ink-soft)" }} aria-live="polite">
                    {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : dirty ? "Editing…" : "✓ Saved"}
                  </span>
                  <button
                    type="button"
                    onClick={close}
                    className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold"
                    style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  {review ? (
                    <button type="button" onClick={review.onLater} className="h-10 rounded-full px-3 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
                      Save the rest for later
                    </button>
                  ) : (
                    <button type="button" onClick={requestClose} className="h-10 rounded-full px-4 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    data-submit
                    onClick={save}
                    disabled={isSaving || !title.trim()}
                    className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:cursor-default disabled:opacity-45 disabled:saturate-0"
                    style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
                  >
                    {isSaving ? "Saving…" : review ? "Confirm" : doingNow ? `Log it · +${xp} XP` : `Create ${noun}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

/** A textarea that grows with its text, so nothing is cut off after one line. */
function AutoGrowText({
  value,
  onChange,
  minRows = 1,
  placeholder,
  ariaLabel,
  className,
  style,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  minRows?: number;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      style={style}
    />
  );
}

/**
 * Five icons for a 0–5 value: tap an icon, or drag across the row like a
 * slider. Tapping the current top icon again sets it to 0. Arrow keys work too.
 */
export function IconScale({
  label,
  icon,
  hint,
  value,
  onChange,
}: {
  label: string;
  icon: string;
  /** What the scale measures, shown on hover and read to screen readers. */
  hint?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; moved: boolean; startValue: number } | null>(null);

  function valueAt(clientX: number) {
    const r = rowRef.current!.getBoundingClientRect();
    const t = (clientX - r.left) / r.width;
    return Math.max(0, Math.min(5, Math.ceil(t * 5)));
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[92px] shrink-0 text-[13px] font-semibold" title={hint}>
        {label}
      </span>
      <div
        ref={rowRef}
        role="slider"
        tabIndex={0}
        aria-label={hint ? `${label}: ${hint}` : label}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        className="flex cursor-pointer touch-none select-none items-center gap-0.5 rounded-md px-0.5 py-0.5 outline-offset-2"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { startX: e.clientX, moved: false, startValue: value };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          if (Math.abs(e.clientX - drag.current.startX) > 4) drag.current.moved = true;
          if (drag.current.moved) onChange(valueAt(e.clientX));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const v = valueAt(e.clientX);
          onChange(v === d.startValue ? 0 : v);
        }}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(5, value + 1));
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, value - 1));
        }}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ background: n <= value ? "rgba(255,255,255,.4)" : "transparent" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
            <img
              src={icon}
              alt=""
              width={14}
              height={14}
              draggable={false}
              className="pointer-events-none h-3.5 w-3.5"
              style={{ opacity: n <= value ? 1 : 0.22, filter: n <= value ? undefined : "grayscale(1)" }}
            />
          </span>
        ))}
      </div>
      <span className="ml-auto w-5 text-right text-sm font-bold tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
        {value}
      </span>
    </div>
  );
}

/** A tiny ticked list: the Steps label glyph. */
function StepsGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: "#7a5f2a" }}>
      <rect x="3" y="4" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.3 6.6l1.2 1.2 2.1-2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 6.5h10M11 16.5h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
