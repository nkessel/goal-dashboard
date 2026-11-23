"use client";

import { PillTrays } from "@/components/ui/PillTrays";
import { sessionRef } from "@/lib/calendar-task-window";
import { CardLookPicker } from "@/components/calendar/CardLookPicker";
import { useQuestWindow } from "@/lib/use-quest-cal";
import { minutesOf, rangeWords } from "@/lib/auto-schedule";
import { useProgressUnit, saveProgressUnit } from "@/lib/use-progress-units";
import { pctOf, type ProgressUnit } from "@/lib/progress-units";
import { FileChips } from "@/components/ui/FileChips";
import { AddFile } from "@/components/ui/AddFile";
import type { FileRef } from "@/lib/file-refs";
import { LinkOuts } from "@/components/ui/Linked";
import { TimeWheels } from "@/components/ui/TimeWheels";
import { CloseIcon } from "@/components/ui/Icons";
import { Fragment, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  listQuestTemplatesAction,
  completeTaskAction,
  createBoardFromEditorAction,
  createQuestAction,
  deleteTaskAction,
  archiveTaskAction,
  generateTaskIconAction,
  listBoardOptionsAction,
  listQuestStepsAction,
  logDoingNowAction,
  reopenTaskAction,
  saveQuestStepsAction,
  scheduleTaskAction,
  setTaskPlanByAction,
  setTaskStatSplitAction,
  setTaskPrivateAction,
  sequenceLinkAction,
  setTaskPlacementAction,
  setTaskProgressAction,
  updateTaskAction,
  listTagsAction,
  setTaskTagsAction,
} from "@/app/actions";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { IconPicker } from "./IconPicker";
import { CheckMark } from "./TaskRow";
import { Fold } from "@/components/ui/Fold";
import { useCalCardLook } from "@/lib/use-quest-cal";
import { BoardPicker } from "./BoardPicker";
import { useEscape } from "@/lib/use-escape";
import { useEditorToolbar, useIsEmbedded, usePortalTarget } from "@/components/ui/EmbedHost";
import { freshKey, loadDrafts, removeDraft, saveDraft, type QuestDraftSave } from "@/lib/quest-drafts";
import { isNetworkError, isOffline, queueOffline, saveOrQueue, settleCompletion } from "@/lib/offline";
import { addOptimisticQuest, markOptimisticQueued, resolveOptimisticQuest } from "@/lib/optimistic-quests";
import { EditorScale } from "./editor/EditorScales";
import { coinsForXp } from "@/lib/coins";
import type { QuestTemplate } from "@/lib/quest-templates";
import { stepPayload, treeOrder } from "@/lib/quest-steps";
import { EditorArrange } from "./EditorArrange";
import { readEditorLayout, serverEditorLayout, subscribeEditorLayout, type EditorPart } from "@/lib/quest-editor-layout";
import { DateField } from "@/components/ui/DateField";
import type { QuestDraft, QuestEditorMode } from "./editor/types";
import { localDate, localTime, planByIn, dueIso, ESTIMATE_PICKS } from "./editor/dates";
import { FactCaret } from "./editor/glyphs";
import { PlacePanel, PlacePill } from "./editor/EditorPlaceLook";
import { AutoGrowText } from "./editor/AutoGrowText";
import { EditorTime } from "./editor/EditorTime";
import { EditorShowsIn } from "./editor/EditorShowsIn";
import { EditorMatrix } from "./editor/EditorMatrix";
import { EditorSequence } from "./editor/EditorSequence";
import { EditorHeader } from "./editor/EditorHeader";
import { EditorPresets } from "./editor/EditorPresets";
import { EditorXp } from "./editor/EditorXp";
import { EditorProgress } from "./editor/EditorProgress";
import { useQuestSteps } from "./editor/use-quest-steps";
import { EditorSteps } from "./editor/EditorSteps";
import { useQuestScheduling } from "./editor/use-quest-scheduling";
import { EditorScheduling } from "./editor/EditorScheduling";
import { editorWhenFace } from "./editor/when-state";
import { EditorAlsoOn, EditorStandsFor } from "./editor/EditorBoardTray";
import { EditorTags } from "./editor/EditorTags";
import { EditorSaveTemplate, TemplateList } from "./editor/EditorTemplates";
import { LABEL_CLS, chipBorderFor, fieldStyleFor, smallBtnClass } from "./editor/style";

export type { QuestDraft, QuestEditorMode };

const noSubscribe = () => () => {};

/** Coins follow XP (1 per XP_PER_COIN) unless a quest sets its own. */
const autoCoins = coinsForXp;

/** Short names for the "More" fold's one-line summary. */
const MORE_NAMES: Partial<Record<EditorPart, string>> = {
  stats: "stats",
  progress: "progress",
  importance: "importance",
  urgency: "urgency",
  difficulty: "difficulty",
  energy: "energy",
  matrix: "matrix",
  standsFor: "stands for",
  alsoOn: "other boards",
  private: "private",
  template: "template",
  tags: "tags",
  board: "board",
  sequence: "sequence",
  steps: "sub-quests",
};
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
  // Which quick-detail chip is open (one at a time).
  const [factOpen, setFactOpen] = useState<EditorPart | "due" | "bonus" | "place" | "look" | null>(null);
  const [boardCard, setBoardCard] = useState(false);
  const isAdventure = theme === "adventure";
  const task = mode.kind === "edit" ? mode.task : null;
  const create = mode.kind === "create" ? mode : null;
  const prefill = create?.prefill;
  const fixedSchedule = create?.schedule;
  const [doingNow, setDoingNow] = useState(Boolean(create?.doingNow));
  const [tiny, setTiny] = useState(task ? Boolean(task.is_tiny) : Boolean(create?.tiny));

  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? prefill?.description ?? "");
  const [addedFiles, setAddedFiles] = useState<FileRef[]>([]);
  const [importance, setImportance] = useState(task ? Math.round(task.importance) : Math.round(prefill?.importance ?? 0));
  const [urgency, setUrgency] = useState(task ? Math.round(task.urgency) : Math.round(prefill?.urgency ?? 0));
  // Tiny tasks start at 15 XP.
  const [xp, setXp] = useState(task?.xp_value ?? (doingNow ? 30 : 15));
  const [coinValue, setCoinValue] = useState<number | null>(task ? (task.coin_value ?? null) : 1);
  // Early bonus: null = automatic (half its XP for 2+ days early), 0 = none, or your own amount.
  const [earlyBonus, setEarlyBonus] = useState<number | null>(task?.early_bonus_xp ?? null);
  const [earlyCoins, setEarlyCoins] = useState<number | null>(task?.early_bonus_coins ?? null);
  const [earlyPerDay, setEarlyPerDay] = useState<number | null>(task?.early_bonus_per_day ?? null);
  const [effort, setEffort] = useState(task?.effort ?? Math.round(prefill?.effort ?? 0));
  const [energyGain, setEnergyGain] = useState(task?.energy_gain ?? 0);
  const [aspiration, setAspiration] = useState(Boolean(task?.is_aspiration));
  const [estimate, setEstimate] = useState<string>(() => {
    const v = task?.estimate_minutes ?? prefill?.estimateMinutes ?? (create?.powerUp || create?.tiny ? 5 : undefined);
    return v != null ? String(v) : "";
  });
  // "Other" minutes: a field of its own (open when the time isn't one of the picks).
  const [estOther, setEstOther] = useState(() => !!estimate && !ESTIMATE_PICKS.includes(Number(estimate)));
  // Pieces of time are no longer offered; an existing setting is kept as it is.
  const [chunk] = useState<string>(task?.chunk_minutes ? String(task.chunk_minutes) : "");
  // A stand-in shows its board's due date; the editor only edits its own, so saving doesn't freeze the borrowed one in.
  const ownDue = task && task.own_due_at !== undefined ? task.own_due_at : task?.due_at;
  const [dueDate, setDueDate] = useState(localDate(ownDue));
  const [dueTime, setDueTime] = useState(localTime(ownDue));
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
  /** New quests: no portrait (just the empty check box) unless you tick "Paint a portrait". */
  const [noPortrait, setNoPortrait] = useState(true);
  const layout = useSyncExternalStore(subscribeEditorLayout, readEditorLayout, serverEditorLayout);
  // Arranging the editor in place (its gear).
  const [arranging, setArranging] = useState(false);
  const coarsePointer = useSyncExternalStore(noSubscribe, () => window.matchMedia("(pointer: coarse)").matches, () => false);
  // Which of the extra pills (what used to sit under "More") is open.
  const [morePick, setMorePick] = useState<string | null>(null);
  const [stepsReload, setStepsReload] = useState(0);
  const [savedTick, setSavedTick] = useState(false);
  /** Where a new quest sits in a sequence: after (waits for) or before (unlocks) other quests. */
  const [seqLinks, setSeqLinks] = useState<{ rel: "after" | "before"; pick: { id?: string; title: string } }[]>(() =>
    mode.kind === "create" && mode.after ? [{ rel: "after", pick: mode.after }] : []
  );
  const [seqOpen, setSeqOpen] = useState(() => mode.kind === "create" && !!mode.after);
  const [seqDialog, setSeqDialog] = useState(false);
  /** The sequence window opens by adding "Follow-up work" after this quest (and opening it to edit). */
  const [seqFollow, setSeqFollow] = useState(false);
  const initialSlot =
    task?.is_on_calendar && task.scheduled_start && task.scheduled_end
      ? { start: task.scheduled_start, end: task.scheduled_end }
      : null;
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(initialSlot);
  // Share of this quest's XP sent to character stats (saved as you slide, for existing quests).
  const [statSplit, setStatSplit] = useState<Record<string, number>>(task?.stat_split ?? {});
  const statTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  // XP you set yourself (an existing quest whose XP isn't its minutes counts): time to complete no longer sets it.
  const [xpOwn, setXpOwn] = useState(() => !!task && task.xp_value > 0 && task.xp_value !== task.estimate_minutes);
  /** Minutes picked or typed; XP follows the minutes (1 XP a minute) until you set the XP yourself. */
  const pickEstimate = (v: string) => {
    setEstimate(v);
    const m = Math.round(Number(v));
    if (!xpOwn && Number.isFinite(m) && m > 0) setXp(Math.min(1000, m));
  };
  const statTotal = Object.values(statSplit).reduce((a, b) => a + b, 0);
  function changeStatSplit(next: Record<string, number>) {
    setStatSplit(next);
    if (!task) return;
    if (statTimer.current) clearTimeout(statTimer.current);
    statTimer.current = setTimeout(() => void setTaskStatSplitAction(task.id, next).catch(() => {}), 500);
  }
  // When to do it: the calendar and the list to schedule (editor/use-quest-scheduling.ts).
  const sched = useQuestScheduling({ task, slot, setSlot, initialSlot, onUnscheduled: () => void (savedSlotStart.current = null) });
  const { planDays } = sched;
  // The When pill's words read the clock once, when the editor opens.
  const [nowForFace] = useState(() => new Date());
  const [isPriv, setIsPriv] = useState(!!task?.is_private);
  function changePrivate(v: boolean) {
    setIsPriv(v);
    if (task) void setTaskPrivateAction(task.id, v).catch(() => setIsPriv(!v));
  }
  const initialBoard = task ? (task.board_id ?? null) : (create?.boardId ?? null);
  const [boardId, setBoardId] = useState<string | null>(initialBoard);
  const [boardOptions, setBoardOptions] = useState<{ id: string; label: string }[] | null>(null);
  // The board's own name (the last part of "Parent › Child"), for the avatar's tag.
  const boardLabel = boardId ? (boardOptions?.find((o) => o.id === boardId)?.label.split(" › ").pop() ?? null) : null;
  // Quest templates: ready-made quests to start from (new quests), and saving one (existing quests).
  const [templates, setTemplates] = useState<QuestTemplate[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
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
  function buildTemplate(): QuestTemplate {
    return {
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
  }
  // Completed from this window, waiting for Done to celebrate.
  const [completedNow, setCompletedNow] = useState<{ xp: number; totalXp: number | null; coinsEarned: number } | null>(null);
  const isCompleted = task?.status === "completed" || !!completedNow;
  const progressTracked = typeof task?.xp_awarded === "number";
  const initialProgress = task?.progress ?? 0;
  const [progress, setProgress] = useState(initialProgress);
  // Counted in something other than percent ("12 of 32 pages"); undefined until changed here.
  const savedUnit = useProgressUnit(task?.id);
  const [unitEdit, setUnitEdit] = useState<ProgressUnit | null | undefined>(undefined);
  const unit = unitEdit === undefined ? savedUnit : unitEdit;
  const setCount = (u: ProgressUnit) => {
    const clean = { ...u, done: Math.max(0, Math.min(u.total, u.done)) };
    setUnitEdit(clean);
    setProgress(pctOf(clean));
  };
  // Steps: a small checklist inside the quest (editor/use-quest-steps.ts). Loaded below, after the board options.
  const { steps, setSteps, stepsUnavailable, setStepsUnavailable, stepsDirty, setStepsDirty, newStep, setNewStep, addingStep, setAddingStep, newStepMinutes, setNewStepMinutes, newStepMore, setNewStepMore, openSteps, setOpenSteps, updateStep, setStepDone, addSubStep, addStep, renameStep, removeStep, holders, stepsDone } = useQuestSteps({ hasTask: !!task, setProgress });
  // The steps list folds away under its header.
  const [stepsFolded, setStepsFolded] = useState(false);
  const [stepXpPop, setStepXpPop] = useState<number | null>(null);
  const newStepRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const moreRef = useRef<HTMLSpanElement>(null);
  // The ⋯ menu closes on a click anywhere else (except in the feedback box).
  useEffect(() => {
    if (!moreMenu) return;
    const off = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (moreRef.current?.contains(t) || t?.closest?.("[data-feedback-root]")) return;
      setMoreMenu(false);
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [moreMenu]);
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
  const [knownTags, setKnownTags] = useState<string[]>([]);
  useEffect(() => {
    listTagsAction().then(setKnownTags, () => {});
  }, []);
  // ---- Stand-in: this quest speaks for a board's current assignment.
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
    void stepsReload;
    listQuestStepsAction(taskId)
      .then((rows) => {
        if (rows === null) setStepsUnavailable(true);
        setSteps(treeOrder((rows ?? []).map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.done, xp: r.xp ?? 0, coins: r.coins ?? 0, minutes: r.minutes ?? null, statSplit: r.stat_split ?? null, weight: r.weight ?? null, progress: r.progress ?? (r.done ? 100 : 0), state: r.state ?? null, parentKey: r.parent_id ?? null }))));
      })
      .catch(() => {
        setStepsUnavailable(true);
        setSteps([]);
      });
  }, [taskId, stepsReload, setSteps, setStepsUnavailable]);


  const est = estimate.trim() ? Math.max(0, Math.round(Number(estimate))) : null;
  const chunkMinutes = chunk.trim() && Number(chunk) > 0 ? Math.round(Number(chunk)) : null;
  const dueAt = dueIso(dueDate, dueTime);
  // Its own time range for the auto-scheduler ("sometime before 2 PM"; owner, Nov 16).
  const timeWindow = useQuestWindow(task?.id);

  // ---- Saving as you go (existing quests) ----------------------------------
  const autosave = Boolean(task) && !review;
  // Placement isn't saved as you go: moving the quest to another list would
  // take its card (and this dialog) away mid-edit. It's saved on close.
  const fields = JSON.stringify([title, description, importance, urgency, xp, coinValue, earlyBonus, earlyCoins, earlyPerDay, effort, energyGain, est, chunkMinutes, dueAt, slot?.start ?? null, boardId, aspiration, tiny]);
  const [savedFields, setSavedFields] = useState(fields);
  // Anything changed since the window opened: Save lights up.
  const [openedFields] = useState(fields);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const dirty = fields !== savedFields || stepsDirty;
  const changed = fields !== openedFields || stepsDirty;
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
      earlyBonusXp: earlyBonus, earlyBonusCoins: earlyBonus === null ? null : earlyCoins, earlyBonusPerDay: earlyBonus === null ? null : earlyPerDay,
      isTiny: tiny,
    };
    const newSlot = !fixedSchedule && slot && slot.start !== savedSlotStart.current ? slot : null;
    const newPlacement = withPlacement && placement !== savedPlacement.current ? placement : null;
    const sendSteps = stepsDirty;
    if (sendSteps) setStepsDirty(false);
    setSaveState("saving");
    const run = async () => {
      if (deleted.current) return;
      // Offline (or the connection drops), the change waits on this device and syncs later.
      await saveOrQueue("updateQuest", { id: task.id, input }, `quest:${task.id}`);
      if (newPlacement) {
        await saveOrQueue("placeQuest", { id: task.id, placement: newPlacement }, `place:${task.id}`);
        savedPlacement.current = newPlacement;
      }
      if (newSlot && !isOffline()) {
        await scheduleTaskAction(sessionRef(task), newSlot.start, newSlot.end);
        savedSlotStart.current = newSlot.start;
      }
      if (sendSteps && stepsRef.current) {
        const list = stepsRef.current;
        const out = await saveOrQueue(
          "questSteps",
          { id: task.id, steps: stepPayload(list).map((st, i) => ({ ...st, id: st.id ?? stepIds.current.get(list[i].key) })) },
          `steps:${task.id}`
        );
        if (out.queued) return;
        const res = out.result;
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
        setSavedTick(true);
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
  const fieldStyle = fieldStyleFor(isAdventure);
  const chipBorder = chipBorderFor(isAdventure);
  const labelCls = LABEL_CLS;

  function celebrateCompleted() {
    if (!task || !completedNow) return;
    const done = completedNow;
    setCompletedNow(null);
    celebrateQuest({
      taskId: task.id,
      title,
      description,
      xp: Math.max(0, xp - Math.round((xp * initialProgress) / 100)),
      iconSrc: task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null,
      // XP changed after completing is paid (or taken back) on save, so the total moves with it.
      totalXp: done.totalXp === null ? null : done.totalXp + (xp - done.xp),
      coinsEarned: done.coinsEarned,
    });
    router.refresh();
  }  function close() {
    if (phase === "closing") return;
    setConfirmLeave(false);
    if (autosave) {
      if (task && unitEdit !== undefined && JSON.stringify(unitEdit) !== JSON.stringify(savedUnit)) void saveProgressUnit(task.id, unitEdit).catch(() => {});
      const saving = dirty || placement !== savedPlacement.current ? persist(true) : null;
      commitProgress();
      // Completed here: celebrate once the last changes are saved.
      if (completedNow) void Promise.resolve(saving).catch(() => {}).then(celebrateCompleted);
    }
    setPhase("closing");
    // One of a repeating event's quests: ask whether its others should take this look (owner, Nov 18).
    if (task) window.dispatchEvent(new CustomEvent("series-look-check", { detail: { taskId: task.id } }));
    // Made shorter than its block on the calendar: ask before shrinking the block (owner, Nov 5: "if the time was
    // decreased… ask the user if they want to update the quest on the calendar with the shorter time").
    if (task && task.status === "open" && task.is_on_calendar && task.scheduled_start && task.scheduled_end && est && est > 0 && est !== task.estimate_minutes) {
      const len = Math.round((new Date(task.scheduled_end).getTime() - new Date(task.scheduled_start).getTime()) / 60_000);
      if (est < len) window.dispatchEvent(new CustomEvent("calendar-shrink-ask", { detail: { taskId: task.session_id ? `s:${task.session_id}` : task.id, title: task.title, start: task.scheduled_start, minutes: est, was: len } }));
    }
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
    if (!draftIcon && !noPortrait && prompt) void generateTaskIconAction(id, prompt).catch(() => {});
  }

  /** Create (or confirm a reviewed import). Existing quests save themselves. `completeNow` creates it already done. */
  function save(completeNow = false) {
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
            earlyBonusXp: earlyBonus, earlyBonusCoins: earlyBonus === null ? null : earlyCoins, earlyBonusPerDay: earlyBonus === null ? null : earlyPerDay,
            isTiny: tiny,
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
        const showNow = !completeNow && !fixedSchedule && placement !== "none" && !seqLinks.some((l) => l.rel === "after");
        const tempId = showNow
          ? addOptimisticQuest({ title: title.trim(), description: description.trim() || null, xp, estimate: est, placement: placement === "today" ? "today" : "additional", iconUrl: draftIcon?.url ?? null, tiny })
          : null;
        if (tempId) {
          if (embedded) onClose();
          else {
            setPhase("closing");
            setTimeout(onClose, 180);
          }
        }
        const createInput = {
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
          earlyBonusXp: earlyBonus, earlyBonusCoins: earlyBonus === null ? null : earlyCoins, earlyBonusPerDay: earlyBonus === null ? null : earlyPerDay,
          isTiny: tiny,
        };
        // Offline (owner, Nov 6): the new quest waits on this device (its card stays on Today) and is
        // made once the connection is back. Its tags and sub-quests go with it.
        const waitOffline = () => {
          const offlineSteps = (steps ?? []).filter((st) => st.title.trim());
          queueOffline("createQuest", { tempId: tempId ?? "", input: createInput, tags, steps: stepPayload(offlineSteps).map(({ id: _id, ...st }) => st) }); // eslint-disable-line @typescript-eslint/no-unused-vars
          if (tempId) markOptimisticQueued(tempId);
          finished.current = true;
          if (draftIdRef.current) removeDraft(draftIdRef.current);
          if (!tempId) {
            setPhase("closing");
            setTimeout(onClose, embedded ? 0 : 180);
          }
        };
        if (isOffline() && !completeNow) return waitOffline();
        let id: string;
        try {
          id = await createQuestAction(createInput);
        } catch (e) {
          if (!completeNow && isNetworkError(e)) return waitOffline();
          if (tempId) resolveOptimisticQuest(tempId, null, e instanceof Error ? e.message : "Couldn't save that quest.");
          throw e;
        }
        if (tempId) resolveOptimisticQuest(tempId, id);
        finished.current = true;
        if (draftIdRef.current) removeDraft(draftIdRef.current);
        if (tags.length) await setTaskTagsAction(id, tags).catch(() => {});
        if (planDays !== null) await setTaskPlanByAction(id, planByIn(planDays)).catch(() => {});
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
        if (completeNow) {
          const fd = new FormData();
          fd.set("taskId", id);
          const res = await completeTaskAction(fd);
          celebrateQuest({ taskId: id, title, description, xp, iconSrc: draftIcon?.url ?? null, totalXp: res?.totalXp ?? null, coinsEarned: res?.coinsEarned ?? 0 });
          router.refresh();
          setPhase("closing");
          setTimeout(onClose, embedded ? 0 : 180);
          return;
        }
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

  /** An existing quest: save what's changed, then complete it (the Quest complete party plays). */
  /**
   * Saves what's changed (XP included), completes it and plays the celebration straight away
   * (owner, Nov 5: "when I hit complete, it should trigger the celebration screen"; it used to wait for Done).
   */
  // Complete asks when it was finished first (owner, Nov 8): just now, or earlier on the time wheels.
  const [askWhen, setAskWhen] = useState(false);
  const [earlier, setEarlier] = useState(false);
  // How many days ago it was done: Today, Yesterday, or any earlier day from "More…" (owner, Nov 21).
  const [whenAgo, setWhenAgo] = useState(0);
  const [whenMins, setWhenMins] = useState(0);
  function completeEarlier() {
    const at = new Date();
    at.setDate(at.getDate() - whenAgo);
    at.setHours(Math.floor(whenMins / 60), whenMins % 60, 0, 0);
    const now = new Date();
    completeExisting(at > now ? now : at);
  }
  function completeExisting(at?: Date) {
    if (!task) return;
    setAskWhen(false);
    setError(null);
    startSaving(async () => {
      try {
        await persist(true);
        // Offline, the completion waits on the device (the XP total shows once it's sent).
        const out = await saveOrQueue("completeQuest", { id: task.id, at: (at ?? new Date()).toISOString() });
        const res = out.queued ? null : out.result;
        deleted.current = true; // nothing more to save or pay out as it closes
        celebrateQuest({
          taskId: task.id,
          title,
          description,
          xp: Math.max(0, xp - Math.round((xp * initialProgress) / 100)),
          iconSrc: task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null,
          totalXp: res?.totalXp ?? null,
          coinsEarned: res?.coinsEarned ?? 0,
        });
        setPhase("closing");
        setTimeout(onClose, embedded ? 0 : 180);
        if (!out.queued) router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't complete it.");
      }
    });
  }

  function remove(archive = false) {
    if (!task) return;
    setError(null);
    deleted.current = true;
    startSaving(async () => {
      try {
        if (archive) await archiveTaskAction(task.id);
        else await deleteTaskAction(task.id);
        setPhase("closing");
        setTimeout(onClose, 180);
      } catch (e) {
        deleted.current = false;
        setError(e instanceof Error ? e.message : "Couldn't delete.");
      }
    });
  }

  // Ctrl/⌘+S saves, like Ctrl/⌘+Enter (which the + sheet handles when the editor sits inside it).
  function handleSaveKey(e: KeyboardEvent) {
    const s = e.key === "s" || e.key === "S";
    if (!(e.ctrlKey || e.metaKey) || !(s || (e.key === "Enter" && !embedded))) return;
    if (e.target instanceof Element && e.target.closest("[data-feedback-root]")) return;
    // Handled once per press: the panel catches it (a quest card the editor was opened from stops keys
    // bubbling up to the window, so editing from a card never saved; owner, Nov 2), the window as a fallback.
    const seen = e as KeyboardEvent & { qeSaved?: boolean };
    if (seen.qeSaved) return;
    seen.qeSaved = true;
    e.preventDefault();
    if (autosave) close();
    else if (!isSaving && title.trim()) save();
  }
  const onSaveKey = useEffectEvent((e: KeyboardEvent) => handleSaveKey(e));
  useEffect(() => {
    const h = (e: KeyboardEvent) => onSaveKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
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
  // In the + sheet these sit in its scrolling row, so they look like its other choices.
  const smallBtn = smallBtnClass(!!toolbarHost);
  const smallBtnStyle = (on: boolean): React.CSSProperties =>
    toolbarHost
      ? { border: "1.5px solid transparent", color: "var(--t-ink)", background: on ? "rgba(217,180,95,.45)" : "rgba(70,50,20,.08)" }
      : { border: `1px solid ${chipBorder}`, color: "var(--t-ink)", background: on ? "rgba(217,180,95,.35)" : "transparent" };
  const toolbarButtons =
    create && !doingNow ? (
      <span className="flex items-center gap-1">
        <button type="button" onClick={() => (setShowTemplates((v) => !v), setShowDrafts(false))} aria-expanded={showTemplates} title="Start from a template or a quick set" className={smallBtn} style={smallBtnStyle(showTemplates)}>
          <span aria-hidden>📜</span> <span className={toolbarHost ? "" : "sr-only"}>Templates</span>
        </button>
        {otherDrafts.length > 0 && (
          <button type="button" onClick={() => (setShowDrafts((v) => !v), setShowTemplates(false))} aria-expanded={showDrafts} title="Quests you started and didn't finish" className={smallBtn} style={smallBtnStyle(showDrafts)}>
            <span aria-hidden>📝</span> <span className={toolbarHost ? "" : "sr-only"}>Drafts</span> <span className="tabular-nums opacity-70">{otherDrafts.length}</span>
          </button>
        )}
      </span>
    ) : null;
  // Each part of the editor, placed by the layout chosen in Settings (main list, or under Advanced settings).
  // The 0–5 scales: rows of icons, or (by your choice) bars side by side. As bars, neighbouring
  // scales in the layout stand together in one group, drawn where the first of them sits.
  const scaleNode = (k: EditorPart) =>
    doingNow ? null : <EditorScale k={k} layout={layout} values={{ importance, urgency, difficulty: effort, energy: energyGain }} setters={{ importance: setImportance, urgency: setUrgency, difficulty: setEffort, energy: setEnergyGain }} />;
  // When to do it, right under when it's due (owner, Nov 7: "make the due date / scheduling tools more
  // integrated"): a time on the calendar picked from the day itself (in place, no popup), another
  // session for a quest that's already placed, and "Schedule within" for the auto-scheduler's list.
  const shownSlot = fixedSchedule ? { start: fixedSchedule.startISO, end: fixedSchedule.endISO ?? fixedSchedule.startISO } : slot;
  // The When pill says it all at a glance (When 2): "Within a week", "By Fri · Thu 3pm", "Due today" (red).
  const dueFace = editorWhenFace({ dueDate, dueTime, planDays }, shownSlot, nowForFace);
  const dueChipWords = [dueFace.words === "When" ? null : dueFace.words, !shownSlot && timeWindow && rangeWords(minutesOf(timeWindow.from), minutesOf(timeWindow.to))].filter(Boolean).join(" · ") || "When";
  /** The sub-quests drawer: out of the "+ Sub-quests" pill, with a caret pointing up at it. */
  const subPillRef = useRef<HTMLButtonElement>(null);
  const cardLook = useCalCardLook(task?.id);
  const stepsHas = (steps ?? []).length > 0 || (steps === null && (task?.steps_total ?? 0) > 0);
  const stepsOpen = !stepsFolded && (addingStep || stepsHas);
  const stepsDrawer = (
    <EditorSteps subPillRef={subPillRef} steps={steps} stepXpPop={stepXpPop} stepsTotal={task?.steps_total ?? 0} isAdventure={isAdventure} addingStep={addingStep} setAddingStep={setAddingStep} openSteps={openSteps} setOpenSteps={setOpenSteps} holders={holders} isCompleted={isCompleted} updateStep={updateStep} setStepDone={setStepDone} renameStep={renameStep} addSubStep={addSubStep} removeStep={removeStep} addStep={addStep} newStepRef={newStepRef} xp={xp} newStep={newStep} setNewStep={setNewStep} newStepMore={newStepMore} setNewStepMore={setNewStepMore} newStepMinutes={newStepMinutes} setNewStepMinutes={setNewStepMinutes} />
  );
  /** "+ Sub-quests" and "+ Sequence": in the quick-details row, before Due (owner, Nov 20); their place among the
      other quick details follows the editor's layout (gear). */
  const seqPills = (
    <>
                    {/* "+ Sub-quests" and "+ Sequence", no icons, like the other + pills (owner, Nov 20). */}
                    {!stepsUnavailable && !isCompleted && (
                      <button
                        type="button"
                        onClick={() => {
                          if (stepsOpen) {
                            setStepsFolded(true);
                            setAddingStep(false);
                            return;
                          }
                          setStepsFolded(false);
                          if (!stepsHas) {
                            setAddingStep(true);
                            requestAnimationFrame(() => newStepRef.current?.focus());
                          }
                        }}
                        ref={subPillRef}
                        aria-expanded={stepsOpen}
                        data-open={stepsOpen ? "true" : undefined}
                        className="qe-fact flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold"
                        title="A checklist inside this quest"
                      >
                        {/* Option 1 (owner, Nov 20): a + before the word while empty; once open or holding something, a
                            caret after it (⌃ open, ⌄ closed), like the other quick details. */}
                        {!stepsOpen && !stepsHas && <PlusMark />}
                        Sub-quests
                        {(() => {
                          const n = (steps ?? []).length || (steps === null ? (task?.steps_total ?? 0) : 0);
                          return n ? <span style={{ color: "var(--t-ink-soft)" }}>· {n}</span> : null;
                        })()}
                        {(stepsOpen || stepsHas) && <FactCaret open={stepsOpen} />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => (task ? setSeqDialog(true) : setSeqOpen((o) => !o))}
                      aria-expanded={task ? undefined : seqOpen}
                      data-open={!task && seqOpen ? "true" : undefined}
                      className="qe-fact flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold"
                      title="Quests before or after this one"
                    >
                      <PlusMark />
                      Sequence
                      {(() => {
                        const n = task ? (task.behind?.length ?? 0) : seqLinks.length;
                        return n ? <span style={{ color: "var(--t-ink-soft)" }}>· {n}</span> : null;
                      })()}
                    </button>
    </>
  );
  const partNodes: Record<EditorPart, React.ReactNode> = {
    showsIn: (
      <EditorShowsIn doingNow={doingNow} isCompleted={isCompleted} fixedSchedule={fixedSchedule} isAdventure={isAdventure} labelCls={labelCls} placement={placement} setPlacement={setPlacement} />
    ),
    time: (
      <EditorTime doingNow={doingNow} labelCls={labelCls} chipBorder={chipBorder} estimate={estimate} estOther={estOther} setEstOther={setEstOther} pickEstimate={pickEstimate} />
    ),
    sequence: (
      <>
              {/* Sub-quests and the sequence from one place (owner, Nov 4 and 13: "sequence and steps should be
                  accessible from the same pill"): a checklist inside this quest, or quests one after another. */}
              {!doingNow && !review && (
                <div className="flex flex-col gap-1.5" data-subseq>
                  {/* Two pills, side by side (owner, Nov 20: "the two pills for each, sub-quests and sequence"): one tap
                      each, no menu of choices. Sequence opens the sequence window (or, on a new quest, its panel here). */}
                  {layout.folded.includes("sequence") && seqPills}
                  {!stepsUnavailable && <Fold open={stepsOpen}>{stepsDrawer}</Fold>}
                  <EditorSequence task={task} title={title} isAdventure={isAdventure} seqOpen={seqOpen} seqLinks={seqLinks} setSeqLinks={setSeqLinks} seqDialog={seqDialog} setSeqDialog={setSeqDialog} seqFollow={seqFollow} setSeqFollow={setSeqFollow} setStepsDirty={setStepsDirty} setStepsReload={setStepsReload} />
                </div>
              )}
      </>
    ),
    // Shown right under the "Scheduled" button (in Time to complete), not as a part of its own.
    scheduling: null,
    matrix: (
      <EditorMatrix task={task} isCompleted={isCompleted} onPlot={onPlot} chipBorder={chipBorder} isAdventure={isAdventure} aspiration={aspiration} setAspiration={setAspiration} />
    ),
    steps: (
      <>
              {/* The sub-quests open from their "+ Sub-quests" pill (owner, Nov 20: the pill is the header; the drawer
                  comes out of it and returns to it). Only when the pills aren't shown (a review) do they sit here. */}
              {review && !doingNow && !stepsUnavailable && stepsDrawer}
      </>
    ),
    xp: (
      <EditorXp doingNow={doingNow} isAdventure={isAdventure} labelCls={labelCls} chipBorder={chipBorder} fieldStyle={fieldStyle} xp={xp} setXp={setXp} setXpOwn={setXpOwn} coinValue={coinValue} setCoinValue={setCoinValue} coinsShown={coinsShown} statsOpen={statsOpen} setStatsOpen={setStatsOpen} statTotal={statTotal} statSplit={statSplit} changeStatSplit={changeStatSplit} />
    ),
    stats: (
      <>
              {/* Character stats: a share of the XP can build stats instead of your level */}
              {/* Shown under its button in the XP part now (owner, Nov 5: "open under the button, not under the sub-quests"). */}
      </>
    ),
    tags: (
      <>
              {!doingNow && <EditorTags tags={tags} setTags={setTags} taskId={task?.id ?? null} knownTags={knownTags} fieldStyle={fieldStyle} />}
      </>
    ),
    progress: (
      <EditorProgress hasTask={!!task} isCompleted={isCompleted} progressTracked={progressTracked} progress={progress} initialProgress={initialProgress} setProgress={setProgress} xp={xp} unit={unit} setCount={setCount} setUnitEdit={setUnitEdit} labelCls={labelCls} fieldStyle={fieldStyle} isAdventure={isAdventure} />
    ),
    importance: scaleNode("importance"),
    urgency: scaleNode("urgency"),
    difficulty: scaleNode("difficulty"),
    energy: scaleNode("energy"),
    board: (
      <>
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
      </>
    ),
    standsFor: (
      <>
              {/* A stand-in quest speaks for its board's current assignment. */}
              {task && !review && <EditorStandsFor taskId={task.id} initial={task.stands_for ?? null} boardId={boardId ?? null} boardOptions={boardOptions} />}
      </>
    ),
    alsoOn: (
      <>
              {/* Also show it on other boards (it still lives on the one above). */}
              {task && !review && <EditorAlsoOn taskId={task.id} initial={task.also_on ?? []} boardId={boardId ?? null} boardOptions={boardOptions} />}
      </>
    ),
    private: (
      <>
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
      </>
    ),
    template: (
      <>
              {task && !review && title.trim() && <EditorSaveTemplate build={buildTemplate} onSaved={setTemplates} />}
      </>
    ),
  };
  // The board's own settings (stands for, also on) sit in the board tray; Private is a lock in the footer.
  partNodes.board = (
    <>
      {partNodes.board}
      {partNodes.standsFor}
      {partNodes.alsoOn}
    </>
  );
  // The board is picked from its tag on the portrait (owner, Nov 12), not from a pill in this row.
  const FACT_KEYS: EditorPart[] = ["showsIn", "time", "xp", "sequence"];
  const factLabel = (f: EditorPart) =>
    f === "showsIn"
      ? `${placement === "today" ? "Primary" : placement === "additional" ? "Secondary" : "Backlog"}`
      : f === "time"
        ? // Only how long it takes: scheduling has its own calendar pill (owner, Nov 5).
          estimate.trim()
          ? `${estimate.trim()} min`
          : "Time"
        : f === "xp"
          ? `${xp} XP`
          : (boardOptions?.find((o) => o.id === boardId)?.label ?? "Category");
  const factIcon = (f: EditorPart) => {
    const src = f === "showsIn" ? null : f === "time" ? "/design/ui-clock.png" : f === "xp" ? null : "/design/ui-grid.png";
    if (f === "xp")
      return (
        <span aria-hidden className="text-[11px] font-bold" style={{ color: "var(--t-xp)" }}>
          ✦
        </span>
      );
    if (f === "showsIn")
      return (
        // Priority: a bullseye with an arrow in its heart (the pin is kept for a quest's location).
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="13" r="8.5" fill="#f6e3a8" stroke="#8a6116" strokeWidth="1.6" />
          <circle cx="11" cy="13" r="5.3" fill="#fffaf0" stroke="#a3412a" strokeWidth="1.6" />
          <circle cx="11" cy="13" r="2.2" fill="#a3412a" />
          <path d="M11 13 20.5 3.5" stroke="#4a3913" strokeWidth="1.6" strokeLinecap="round" />
          {/* Feathers at the tail, so the arrow is struck in the centre, not flying out of it (owner, Nov 22). */}
          <path d="M16.5 7.5L19.5 4.5L21.7 5.5L18.7 8.5Z M16.5 7.5L19.5 4.5L18.5 2.3L15.5 5.3Z" fill="#b5452e" stroke="#6b2a1a" strokeWidth=".6" strokeLinejoin="round" />
        </svg>
      );
    // eslint-disable-next-line @next/next/no-img-element -- card glyph
    return <img src={src!} alt="" width={15} height={15} className="h-[15px] w-[15px]" />;
  };
  const partShown: Record<EditorPart, boolean> = {
    showsIn: !doingNow && !isCompleted && !fixedSchedule,
    time: !doingNow,
    sequence: !doingNow && !review,
    scheduling: false,
    matrix: !!task && !isCompleted,
    steps: !doingNow && !stepsUnavailable,
    xp: true,
    stats: !doingNow,
    tags: !doingNow,
    progress: !!task && !isCompleted,
    importance: !doingNow,
    urgency: !doingNow,
    difficulty: !doingNow,
    energy: !doingNow,
    board: true,
    standsFor: !!task && !review,
    alsoOn: !!task && !review,
    private: !doingNow,
    // Templates are out of the editor (owner, Nov 3); the + sheet still has them.
    template: false,
  };
  const foldedParts = layout.order.filter((k) => layout.folded.includes(k) && partShown[k]);
  // No "More" fold (owner, Nov 3): the extra parts are small pills in a row, each opening its own panel in place.
  const SCALE_PARTS: EditorPart[] = ["importance", "urgency", "difficulty", "energy"];
  const pillKeys: string[] = [...new Set<string>(foldedParts.filter((k) => k !== "stats" && k !== "template").map((k) => (SCALE_PARTS.includes(k) ? "scales" : k)))].concat(task ? ["file", "color"] : []);
  const pillName = (k: string) => (k === "scales" ? "Importance & effort" : k === "file" ? "Add a file" : k === "color" ? "Color" : k === "matrix" ? "Matrix" : (MORE_NAMES[k as EditorPart] ?? k).replace(/^./, (c) => c.toUpperCase()));
  const morePills = pillKeys.length > 0 && (
    <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: "rgba(139,112,64,.25)" }}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="More details">
        {pillKeys.map((k) => (
          <button key={k} type="button" onClick={() => setMorePick((o) => (o === k ? null : k))} aria-expanded={morePick === k} className="qe-fact flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold" data-open={morePick === k ? "true" : undefined}>
            {/* Each + pill has its own line icon (owner's picks, Nov 20); a pill without one keeps the +. */}
            {k in PILL_ICONS ? <PillIcon k={k} color={k === "color" ? cardLook?.color : undefined} /> : morePick !== k && !(k === "tags" && tags.length > 0) && <PlusMark />}
            {pillName(k)}
            {(morePick === k || (k === "tags" && tags.length > 0)) && <FactCaret open={morePick === k} />}
          </button>
        ))}
      </div>
      {morePick && pillKeys.includes(morePick) && (
        <div key={morePick} className="reveal qe-fact-panel flex flex-col gap-2 rounded-xl p-3">
          {morePick === "scales" ? (
            SCALE_PARTS.filter((k) => foldedParts.includes(k)).map((k) => <Fragment key={k}>{partNodes[k]}</Fragment>)
          ) : morePick === "color" ? (
            // The card's colour or picture, last in the row as "+ Color" (owner, Nov 20; it was a dot by the place pin).
            task && <CardLookPicker task={task} part="colour" />
          ) : morePick === "file" ? (
            task && (
              <div className="flex items-center gap-2">
                <AddFile taskId={task.id} onAdded={(f) => setAddedFiles((a) => [...a, f])} />
              </div>
            )
          ) : (
            partNodes[morePick as EditorPart]
          )}
        </div>
      )}
    </div>
  );
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
        data-save-keys
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => {
          e.stopPropagation();
          if (confirmLeave) setConfirmLeave(false);
        }}
        onKeyDown={(e) => {
          handleSaveKey(e.nativeEvent);
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
        <div className="qe-body relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          <EditorHeader isAdventure={isAdventure} heading={heading} toolbar={!toolbarHost && toolbarButtons} arranging={arranging} setArranging={setArranging} requestClose={requestClose} />

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
            <div className="relative flex shrink-0 flex-col items-center gap-1">
              {/* The board, on the avatar like the quest card's tag. */}
              {/* The board, on the avatar like the quest card's tag; tapping it folds the board card open below (owner, Nov 9). */}
              {!doingNow && (
                <button
                  type="button"
                  onClick={() => setBoardCard((o) => !o)}
                  aria-expanded={boardCard}
                  aria-label={boardLabel ? `Board: ${boardLabel}. Change it` : "Choose a board"}
                  title={boardLabel ? `${boardLabel}: change its board` : "Choose a board"}
                  data-board-chip
                  className="absolute -top-1.5 left-1/2 z-[2] flex max-w-[92px] -translate-x-1/2 items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-[1px] text-[11px] font-semibold"
                  style={{ background: "#f6ecd2", border: boardLabel ? "1px solid #a58c66" : "1px dashed #a58c66", color: "#3b2a14", boxShadow: boardCard ? "0 0 0 2px #f3d98d, 0 1px 2px rgba(0,0,0,.25)" : "0 1px 2px rgba(0,0,0,.25)" }}
                >
                  <span className="truncate">{boardLabel ?? "+ Board"}</span>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ transform: boardCard ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}>
                    <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              {task ? (
                <>
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
                    footer={<CardLookPicker task={task} part="picture" />}
                  />
                  {/* Switch between a tiny task (half height on Today) and a standard quest. */}
                  {!isCompleted && (
                    <label className="flex cursor-pointer items-center gap-1 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }} title="Tiny tasks show half height on Today, with just a check box unless they have a portrait">
                      <input type="checkbox" checked={tiny} onChange={(e) => (setTiny(e.target.checked), e.target.checked && xp === 0 && setXp(15))} className="h-3.5 w-3.5" style={{ accentColor: "#7a5f2a" }} />
                      Tiny task
                    </label>
                  )}
                </>
              ) : (
                <>
                  <IconPicker
                    currentIcon={draftIcon?.url ?? null}
                    currentSource={draftIcon?.source ?? "monster"}
                    taskTitle={title}
                    taskDescription={description}
                    theme={theme}
                    size={72}
                    emptyContent={empty}
                    showEditHint
                    onDraftChange={(url, source) => {
                      setDraftIcon(url ? { url, source } : null);
                      if (url) setNoPortrait(false);
                    }}
                    onPromptChange={setArtPrompt}
                  />
                  {/* Opt in: paint a portrait once it's saved. Otherwise it stays the empty check box, ready to tick. */}
                  {/* Tiny lives here, in one place, for new and existing quests alike. */}
                  {!doingNow && (
                    <label className="flex cursor-pointer items-center gap-1 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }} title="Tiny tasks show half height on Today, with just a check box unless they have a portrait">
                      <input
                        type="checkbox"
                        checked={tiny}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setTiny(on);
                          if (on && xp === 0) setXp(15);
                          if (on && !estimate.trim()) setEstimate("5");
                        }}
                        className="h-3.5 w-3.5"
                        style={{ accentColor: "#7a5f2a" }}
                      />
                      Tiny task
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="relative flex">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={doingNow ? "What are you doing?" : isAdventure ? "Quest title" : "Task title"}
                  aria-label="Title"
                  // Phones: the window opens steady and the keyboard waits for a tap on the title
                  // (rising mid-animation is what made it jump and resize).
                  autoFocus={!task && !coarsePointer}
                  enterKeyHint="next"
                  className={`h-10 min-w-0 flex-1 rounded-lg border px-2.5 text-[16px] font-semibold ${autosave ? "pr-8" : ""}`}
                  style={fieldStyle}
                />
                {/* Saved: a small green check beside the title. */}
                {autosave && savedTick && !dirty && saveState === "idle" && (
                  <span role="img" aria-label="Saved" title="Saved" className="card-pop-in pointer-events-none absolute right-2 top-2.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--t-good)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </span>
              <AutoGrowText
                value={description}
                onChange={setDescription}
                minRows={2}
                placeholder="Description (optional)"
                ariaLabel="Description"
                className="rounded-lg border px-2.5 py-1.5 text-[15px]"
                style={fieldStyle}
              />
              <LinkOuts text={description} />
              {/* Private files kept with it (a form to fill in): open in a tap, add more. */}
              {task && (task.attachments?.length || addedFiles.length) ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <FileChips files={[...(task.attachments ?? []), ...addedFiles]} />
                </div>
              ) : null}
            </div>
          </div>
          {/* The board picker, opened from the tag on the portrait (owner, Nov 12): which board, mirroring it, other boards it shows on. */}
          {!doingNow && (
            <Fold open={boardCard}>
              <div className="qe-fact-panel relative mt-1 flex flex-col gap-2 rounded-xl p-3" data-board-panel>
                <span aria-hidden className="absolute -top-[7px] left-[30px] h-3 w-3 rotate-45" style={{ background: "inherit", borderLeft: "1px solid rgba(139,112,64,.35)", borderTop: "1px solid rgba(139,112,64,.35)" }} />
                {partNodes.board}
                {task && boardId && (
                  <button
                    type="button"
                    onClick={() => {
                      const to = `/boards/${boardId}?q=${task.id}`;
                      close();
                      setTimeout(() => router.push(to), embedded ? 0 : 200);
                    }}
                    className="self-end text-[13px] font-semibold underline underline-offset-2"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    See quest in board ›
                  </button>
                )}
              </div>
            </Fold>
          )}

          {/* Templates and quick sets, opened from the 📜 button at the top (new quests only). */}
          {create && !doingNow && showTemplates && (
            <div className="reveal flex flex-col gap-1.5 rounded-xl p-1.5" style={{ background: "rgba(70,50,20,.07)", border: "1px solid rgba(139,112,64,.25)" }}>
              {templates && templates.length > 0 && <TemplateList templates={templates} setTemplates={setTemplates} onApply={applyTemplate} boardOptions={boardOptions} />}
          {/* Presets: one tap sets several attributes at once (new quests only). */}
          <EditorPresets labelCls={labelCls} chipBorder={chipBorder} setImportance={setImportance} setUrgency={setUrgency} setEffort={setEffort} setEnergyGain={setEnergyGain} setEstimate={setEstimate} setXp={setXp} />
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
                    <CloseIcon size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {toolbarHost && toolbarButtons && createPortal(toolbarButtons, toolbarHost)}

          {arranging && <EditorArrange layout={layout} shown={partShown} names={MORE_NAMES} previews={partNodes} onDone={() => setArranging(false)} />}
          {/* Shown parts first (in your order), then the Advanced settings fold with the rest. */}
          {!arranging && layout.order.filter((k) => !layout.folded.includes(k)).map((k) => {
            // Where it shows, its time, its XP and its board: one calm row of chips, each opening its control.
            if (k === "board") return null;
            if (FACT_KEYS.includes(k)) {
              const facts = layout.order.filter((x) => FACT_KEYS.includes(x) && !layout.folded.includes(x) && partShown[x]);
              if (facts[0] !== k) return null;
              return (
                <PillTrays key="facts" open={!!factOpen}>
                  <div className="contents" role="group" aria-label="Quick details">
                    {facts.map((f) => f === "sequence" ? <Fragment key={f}>{seqPills}</Fragment> : (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFactOpen((o) => (o === f ? null : f))}
                        aria-expanded={factOpen === f}
                        className="qe-fact flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold"
                        data-open={factOpen === f ? "true" : undefined}
                        data-tour={`fact-${f}`}
                      >
                        {factIcon(f)}
                        <span className="max-w-[150px] truncate">{factLabel(f)}</span>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-60 transition-transform" style={{ transform: factOpen === f ? "rotate(180deg)" : undefined }}>
                          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ))}
                    {/* When it's due, right on the surface; and once it has a date, an optional bonus for finishing early. */}
                    {!doingNow && !isCompleted && (
                      <button type="button" onClick={() => setFactOpen((o) => (o === "due" ? null : "due"))} aria-expanded={factOpen === "due"} className="qe-fact flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold" data-open={factOpen === "due" ? "true" : undefined} data-tour="fact-due">
                        {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
                        <img src="/design/ui-calendar.png" alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[210px] truncate" style={dueFace.late ? { color: "#a8321e" } : undefined}>{dueChipWords}</span>
                        <FactCaret open={factOpen === "due"} />
                      </button>
                    )}
                    {/* Where it happens: an icon-only pill, last (owner, Nov 3); shown on the card too. */}
                    {task && !doingNow && (
                      <PlacePill taskId={task.id} open={factOpen === "place"} onToggle={() => setFactOpen((o) => (o === "place" ? null : "place"))} />
                    )}

                  </div>
                  {factOpen === "place" && task && <PlacePanel key="place" taskId={task.id} onClose={() => setFactOpen(null)} fieldStyle={fieldStyle} />}
                  {/* Under the row: the sub-quests drawer (pointing up at its pill) and the sequence's panel. */}
                  {facts.includes("sequence") && partNodes.sequence}
                  {factOpen === "due" && (
                    <div key="due" data-pill-tray className="reveal qe-fact-panel pill-tray-box flex flex-col gap-2 rounded-xl p-3" data-tour="panel-due">
                      <EditorScheduling task={task} doingNow={doingNow} isAdventure={isAdventure} labelCls={labelCls} fieldStyle={fieldStyle} chipBorder={chipBorder} dueDate={dueDate} setDueDate={setDueDate} dueTime={dueTime} setDueTime={setDueTime} early={{ xp: earlyBonus, coins: earlyCoins, perDay: earlyPerDay }} onEarlyChange={(v) => (setEarlyBonus(v.xp), setEarlyCoins(v.coins), setEarlyPerDay(v.perDay))} fixedSchedule={!!fixedSchedule} shownSlot={shownSlot} slot={slot} setSlot={setSlot} initialSlot={initialSlot} estimate={estimate} title={title} timeWindow={timeWindow} sched={sched} />
                    </div>
                  )}

                  {factOpen && factOpen !== "due" && factOpen !== "bonus" && factOpen !== "place" && factOpen !== "look" && facts.includes(factOpen) && (
                    <div key={factOpen} data-pill-tray className="reveal qe-fact-panel pill-tray-box flex flex-col gap-2 rounded-xl p-3" data-tour={`panel-${factOpen}`}>
                      {partNodes[factOpen]}
                    </div>
                  )}
                </PillTrays>
              );
            }
            return <Fragment key={k}>{partNodes[k]}</Fragment>;
          })}
          {!arranging && morePills}

          {isCompleted && task && (
            // A victory seal: what was won and when, with a quiet way to take it back.
            <div className="defeated-box flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <span aria-hidden className="defeated-seal flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[18px]" style={task.failed_at ? { background: "radial-gradient(circle at 35% 30%, #e0604a, #b5321f 60%, #7a1f12)", color: "#fff" } : undefined}>
                {task.failed_at ? "✕" : isAdventure ? "⚔" : "✓"}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                {task.failed_at ? (
                  // A failed quest (owner, Nov 9: "a red X rather than a green checkmark"): no XP, and why, if written.
                  <span className={`${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "#8a2414" }}>
                    Quest failed
                    {task.fail_reason && <span className="ml-1.5 font-sans text-[13px] font-normal italic" style={{ color: "#4a3a20" }}>· {task.fail_reason}</span>}
                  </span>
                ) : (
                <span className={`${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "#2f4a1c" }}>
                  {isAdventure ? "Defeated!" : "Completed"}
                  <span className="ml-1.5 text-[13px] font-semibold tabular-nums" style={{ color: "#6a4b0e" }}>
                    +{xp} XP
                  </span>
                </span>
                )}
                {task.completed_at && (
                  <span className="text-[13px]" style={{ color: "#4a3a20" }}>
                    {new Date(task.completed_at).toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
                {!task.failed_at && (
                  <span className="text-[11.5px]" style={{ color: "#6b5631" }}>
                    Change the XP above and what you earned changes too.
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  startSaving(async () => {
                    await chain.current;
                    // A completion still on its way (or waiting offline) is settled first, so it can't land after.
                    if (!(await settleCompletion(task.id))) await reopenTaskAction(task.id);
                    close();
                  })
                }
                className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold disabled:opacity-50"
                style={{ border: "1px solid rgba(139,112,64,.5)", color: "#4a3a20", background: "rgba(255,250,238,.6)" }}
              >
                Undo
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}

          <div className="qe-actions flex flex-wrap items-center justify-between gap-2 pt-1">
            {task ? (
              !confirmingDelete ? (
                // Rarely needed, so it waits in a ⋯ menu (right-click opens it too).
                <span ref={moreRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setMoreMenu((v) => !v)}
                    onContextMenu={(e) => (e.preventDefault(), setMoreMenu(true))}
                    aria-expanded={moreMenu}
                    aria-label="More actions"
                    title="More actions"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[20px] leading-none hover:bg-black/[.06]"
                    style={{ color: "var(--t-ink-soft)" }}
                  >
                    ⋯
                  </button>
                  {moreMenu && (
                    <span className="card-pop-in absolute bottom-11 left-0 z-10 flex min-w-[160px] flex-col rounded-xl p-1 shadow-xl" style={{ background: "var(--t-card, #fffaf0)", border: "1px solid rgba(139,112,64,.4)" }}>
                      {/* Archive first (owner, Nov 5: "replace delete quest with archive"); deleting for good asks. */}
                      <button type="button" onClick={() => (setMoreMenu(false), remove(true))} className="flex h-10 items-center rounded-lg px-3 text-left text-[14px] font-semibold hover:bg-black/[.05]" style={{ color: "var(--t-ink)" }}>
                        Archive {noun}
                      </button>
                      <button type="button" onClick={() => (setMoreMenu(false), setConfirmingDelete(true))} className="flex h-9 items-center rounded-lg px-3 text-left text-[12.5px] hover:bg-black/[.05]" style={{ color: "var(--t-warn)" }}>
                        Delete for good…
                      </button>
                    </span>
                  )}
                </span>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {/* Archive keeps it (Boards › Archived quests brings it back); delete is for good. */}
                  <button
                    type="button"
                    onClick={() => remove(true)}
                    disabled={isSaving}
                    className="rounded-full px-3 py-1.5 font-semibold disabled:opacity-50"
                    style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}
                    title="Keep a copy you can bring back from Boards › Archived quests"
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => remove()}
                    disabled={isSaving}
                    className="rounded-full px-3 py-1.5 font-semibold disabled:opacity-50"
                    style={{ background: "var(--t-warn)", color: "#fff" }}
                  >
                    Delete for good
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                    Keep
                  </button>
                </div>
              )
            ) : create && !doingNow ? (
              // Already done it: create it and complete it in one go. Quiet, on the left, so it's never mistaken for Create.
              <button
                type="button"
                onClick={() => save(true)}
                disabled={isSaving || !title.trim()}
                title={`Already done it? Create this ${noun} and complete it now`}
                className="h-10 whitespace-nowrap rounded-full px-3 text-[13.5px] font-semibold disabled:cursor-default disabled:opacity-45"
                style={{ background: "transparent", color: "var(--t-ink-soft)", border: "1px dashed var(--t-panel-border, rgba(139,112,64,.5))" }}
              >
                Already done ✓
              </button>
            ) : (
              <span />
            )}
            {/* Private: a lock at the bottom (hidden from your party, even on screens you share). */}
            {!doingNow && (
              <button
                type="button"
                onClick={() => changePrivate(!isPriv)}
                aria-pressed={isPriv}
                aria-label={isPriv ? "Private quest: hidden from your party. Make it visible" : "Make this quest private (hidden from your party)"}
                title={isPriv ? "Private: hidden from your party" : "Visible to your party · tap to make it private"}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/[.06]"
                style={{ color: isPriv ? "#8a6116" : "var(--t-ink-soft)", background: isPriv ? "rgba(217,180,95,.28)" : undefined, opacity: isPriv ? 1 : 0.6 }}
              >
                {/* A globe while your party can see it, a lock once it's private (owner, Nov 3). */}
                {isPriv ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity={0.25} />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
                    <path d="M3.5 12h17M12 3.5c2.6 2.5 3.8 5.3 3.8 8.5s-1.2 6-3.8 8.5M12 3.5C9.4 6 8.2 8.8 8.2 12s1.2 6 3.8 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            )}
            <div className="relative ml-auto flex items-center gap-2">
              {autosave ? (
                <>
                  {/* Floats just above the buttons: it used to take room in the row and push the footer onto two lines. */}
                  <span className="pointer-events-none absolute bottom-full right-1 mb-0.5 whitespace-nowrap text-[11.5px] transition-opacity" style={{ color: saveState === "error" ? "var(--t-warn)" : "var(--t-ink-soft)" }} aria-live="polite">
                    {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : ""}
                  </span>
                  {/* Complete in gold, then Done in green at the bottom right. */}
                  {!isCompleted && askWhen && (
                    <div role="dialog" aria-label="When did you finish it?" data-complete-when className="card-pop-in parchment absolute bottom-full right-0 z-20 mb-2 flex w-[min(320px,calc(100vw-48px))] flex-col gap-2 rounded-2xl p-3" style={{ borderRadius: 16, boxShadow: "0 8px 24px rgba(60,40,10,.3)" }} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setAskWhen(false))}>
                      <span className="relative z-[1] flex items-center gap-2">
                        <span className="font-display text-[16px]" style={{ color: "var(--t-ink)" }}>
                          When did you finish it?
                        </span>
                        <button type="button" onClick={() => setAskWhen(false)} aria-label="Not yet" className="ml-auto flex h-7 w-7 items-center justify-center rounded-full" style={{ color: "var(--t-ink-soft)" }}>
                          <CloseIcon size={10} />
                        </button>
                      </span>
                      <span className="relative z-[1] flex gap-2">
                        <button type="button" autoFocus onClick={() => completeExisting()} disabled={isSaving} className="h-10 flex-1 rounded-full text-[14.5px] font-bold disabled:opacity-60" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
                          Just now
                        </button>
                        <button
                          type="button"
                          aria-expanded={earlier}
                          onClick={() => {
                            if (!earlier) {
                              const n = new Date();
                              setWhenMins(Math.max(0, n.getHours() * 60 + n.getMinutes() - 60));
                            }
                            setEarlier((v) => !v);
                          }}
                          className="qe-fact h-10 flex-1 rounded-full text-[14.5px] font-semibold"
                          data-open={earlier ? "true" : undefined}
                        >
                          Earlier…
                        </button>
                      </span>
                      <Fold open={earlier}>
                        <span className="relative z-[1] flex flex-col items-center gap-2 pt-1">
                          <span className="flex gap-1.5">
                            {[0, 1].map((n) => (
                              <button key={n} type="button" aria-pressed={whenAgo === n} onClick={() => setWhenAgo(n)} className="qe-fact h-8 rounded-full px-3 text-[13px] font-semibold" data-open={whenAgo === n ? "true" : undefined}>
                                {n ? "Yesterday" : "Today"}
                              </button>
                            ))}
                            {/* Any earlier day: More… opens the calendar straight away (owner, Nov 21). */}
                            <DateField
                              value={whenAgo > 1 ? dayKeyAgo(whenAgo) : ""}
                              max={dayKeyAgo(0)}
                              onChange={(v) => {
                                if (!v) return;
                                const [y, m, d] = v.split("-").map(Number);
                                const t = new Date();
                                const ago = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
                                setWhenAgo(Math.max(0, ago));
                              }}
                              ariaLabel="Another day"
                              placeholder="More…"
                              className="qe-fact h-8 rounded-full px-3 text-[13px] font-semibold"
                              style={whenAgo > 1 ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", borderColor: "#8a6116", color: "#2a1c10" } : undefined}
                            />
                          </span>
                          <TimeWheels value={whenMins} onChange={setWhenMins} />
                          <button type="button" onClick={completeEarlier} disabled={isSaving} className="qe-complete h-10 rounded-full px-4 text-[14.5px] font-semibold disabled:opacity-60">
                            ✦ Complete {noun}
                          </button>
                        </span>
                      </Fold>
                    </div>
                  )}
                  {!isCompleted && (
                    <button
                      type="button"
                      aria-expanded={askWhen}
                      onClick={() => (setAskWhen((v) => !v), setEarlier(false), setWhenAgo(0))}
                      disabled={isSaving || !title.trim()}
                      title={`Complete this ${noun} now`}
                      className="qe-complete flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[14.5px] font-semibold disabled:cursor-default disabled:opacity-45"
                    >
                      ✦ Complete {noun}
                    </button>
                  )}
                  {completedNow && (
                    <span className="card-pop-in flex h-10 items-center whitespace-nowrap px-1 text-[14px] font-semibold" style={{ color: "#4f6d3c" }}>
                      ✓ Completed · Done to celebrate
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    // Save is the solid forest-green default (owner, Nov 9: option 1); it glows once something changed.
                    data-changed={changed || completedNow ? "" : undefined}
                    className="qe-save h-10 rounded-full px-5 text-[15px] font-semibold"
                  >
                    {completedNow ? "Done" : "Save"}
                  </button>
                </>
              ) : (
                <>
                  {review ? (
                    <button type="button" onClick={review.onLater} className="h-10 rounded-full px-3 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
                      Save the rest for later
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-submit
                    onClick={() => save()}
                    disabled={isSaving || !title.trim()}
                    className="hover-glow h-10 whitespace-nowrap rounded-full px-4 text-[15px] font-semibold disabled:cursor-default disabled:opacity-45 disabled:saturate-0"
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

export { IconScale } from "./IconScale";

/** The + (or −) on the editor's add-on pills: drawn, so it sits exactly on the text's middle (owner, Nov 20). */
function PlusMark({ minus = false }: { minus?: boolean }) {
  return (
    <svg aria-hidden width="9" height="9" viewBox="0 0 10 10" className="shrink-0 opacity-70" style={{ marginRight: 1 }}>
      <path d={minus ? "M1.5 5h7" : "M1.5 5h7M5 1.5v7"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** The + pills' icons, flat lines in the pill's ink (owner's picks, Nov 20). */
const PILL_ICONS: Record<string, string> = {
  // Importance & effort: a flame.
  scales: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 2 0-2-1-3 0-5z",
  // Progress: a rising line (c).
  progress: "M4 20l5-6 4 3 7-9M15 8h5v5",
  // Matrix: arrowed axes with faint quarters and a dot (b4.1); the quarters and dot are drawn below.
  matrix: "M5 5v14h14M5 5l-1.5 2M5 5l1.5 2M19 19l-2-1.5M19 19l-2 1.5",
  // Tags: a # (b).
  tags: "M9 4 7 20M17 4l-2 16M4 9h16M3 15h16",
  // Add a file: a paperclip (b).
  file: "M20 11l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7",
  // Color: the card's own colour, filled (drawn below).
  color: "",
};
function PillIcon({ k, color }: { k: string; color?: string | null }) {
  if (k === "color")
    return <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: "1.4px solid #8a6116", background: color ?? "linear-gradient(180deg, #fbf3dc, #e6cf98)" }} />;
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-80">
      <path d={PILL_ICONS[k]} />
      {k === "matrix" && (
        <>
          <path d="M12 5v14M5 12h14" strokeOpacity=".3" />
          <circle cx="15.5" cy="8.5" r="2" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

/** YYYY-MM-DD for the day `n` days back, on this device. */
function dayKeyAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
