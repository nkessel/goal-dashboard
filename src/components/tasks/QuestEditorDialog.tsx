"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import {
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
  setTaskPlacementAction,
  setTaskProgressAction,
  updateTaskAction,
} from "@/app/actions";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { IconPicker } from "./IconPicker";
import { CheckMark } from "./TaskRow";
import { SlotPickerDialog } from "./SlotPickerDialog";
import { BoardPicker } from "./BoardPicker";
import { useEscape } from "@/lib/use-escape";
import { useIsEmbedded, usePortalTarget } from "@/components/ui/EmbedHost";
import { BoltIcon, CoinIcon } from "@/components/ui/Icons";

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
      /** Today's Quests already holds 3 — new quests default to Additional Quests. */
      todayFull?: boolean;
      /** Start as a quick power-up (prefills a short time). */
      powerUp?: boolean;
      /** "Doing now": log something already under way — created and completed at once. */
      doingNow?: boolean;
      /** Place the new quest on the calendar (e.g. from a Google event). */
      schedule?: { startISO: string; endISO: string; googleEventId?: string };
      prefill?: QuestDraft;
    };

type StepDraft = { key: string; id?: string; title: string; done: boolean };

const XP_MAX = 350;
const XP_STEP = 10;
const POWER_UP_MINUTES = 15;
/** Coins follow XP at 1 per 10 unless a quest sets its own. */
const autoCoins = (xp: number) => Math.ceil(Math.max(0, xp) / 10);

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
  useEscape(() => close());
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
  const [aspiration, setAspiration] = useState(Boolean(task?.is_aspiration));
  const [estimate, setEstimate] = useState<string>(() => {
    const v = task?.estimate_minutes ?? prefill?.estimateMinutes ?? (create?.powerUp ? 5 : undefined);
    return v != null ? String(v) : "";
  });
  const [chunk, setChunk] = useState<string>(task?.chunk_minutes ? String(task.chunk_minutes) : "");
  const [dueDate, setDueDate] = useState(localDate(task?.due_at));
  const [dueTime, setDueTime] = useState(localTime(task?.due_at));
  type Placement = "today" | "additional" | "none";
  const initialPlacement: Placement = task
    ? task.is_manual_priority
      ? "today"
      : task.in_additional === false
        ? "none"
        : "additional"
    : create?.pinToBattle === false || create?.todayFull || create?.schedule
      ? "additional"
      : "today";
  const [placement, setPlacement] = useState<Placement>(initialPlacement);
  const savedPlacement = useRef<Placement>(initialPlacement);
  const todayFull = Boolean(create?.todayFull) && placement !== "today";
  const [draftIcon, setDraftIcon] = useState<{ url: string; source: "library" | "ai" } | null>(null);
  const initialSlot =
    task?.is_on_calendar && task.scheduled_start && task.scheduled_end
      ? { start: task.scheduled_start, end: task.scheduled_end }
      : null;
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(initialSlot);
  const [pickingSlot, setPickingSlot] = useState(false);
  const initialBoard = task ? (task.board_id ?? null) : (create?.boardId ?? null);
  const [boardId, setBoardId] = useState<string | null>(initialBoard);
  const [boardOptions, setBoardOptions] = useState<{ id: string; label: string }[] | null>(null);
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [phase, setPhase] = useState<"open" | "closing">("open");
  const panelRef = useRef<HTMLDivElement>(null);

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
        setSteps((rows ?? []).map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.done })));
      })
      .catch(() => {
        setStepsUnavailable(true);
        setSteps([]);
      });
  }, [taskId]);

  /** Ticking a step pulls the progress bar up to the share of steps done (never down); unticking caps it. */
  function setStepDone(key: string, done: boolean) {
    if (!steps) return;
    const next = steps.map((st) => (st.key === key ? { ...st, done } : st));
    setSteps(next);
    setStepsDirty(true);
    const share = Math.round((next.filter((st) => st.done).length / next.length) * 100);
    setProgress((p) => (done ? Math.max(p, share) : Math.min(p, share)));
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
    setSteps((list) => (list ?? []).filter((st) => st.key !== key));
    setStepsDirty(true);
  }
  const stepsDone = (steps ?? []).filter((st) => st.done).length;

  const est = estimate.trim() ? Math.max(0, Math.round(Number(estimate))) : null;
  const chunkMinutes = chunk.trim() && Number(chunk) > 0 ? Math.round(Number(chunk)) : null;
  const dueAt = dueIso(dueDate, dueTime);
  const isPowerUp = est !== null && est > 0 && est <= POWER_UP_MINUTES;

  // ---- Saving as you go (existing quests) ----------------------------------
  const autosave = Boolean(task) && !review;
  const fields = JSON.stringify([title, description, importance, urgency, xp, coinValue, effort, est, chunkMinutes, dueAt, slot?.start ?? null, boardId, aspiration, placement]);
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

  /** Queue one save of everything that changed (saves never overlap). */
  function persist() {
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
      isAspiration: aspiration,
      dueAt,
      chunkMinutes,
      coinValue,
    };
    const newSlot = !fixedSchedule && slot && slot.start !== savedSlotStart.current ? slot : null;
    const newPlacement = placement !== savedPlacement.current ? placement : null;
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
        const rows = await saveQuestStepsAction(
          task.id,
          list.map((st) => ({ id: st.id ?? stepIds.current.get(st.key), title: st.title, done: st.done }))
        );
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
    if (autosave) {
      if (dirty) void persist();
      commitProgress();
    }
    setPhase("closing");
    setTimeout(onClose, embedded ? 0 : origin === "fab" ? 260 : 180);
  }

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
    const prompt = [title.trim(), description.trim()].filter(Boolean).join(" — ");
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
            isAspiration: aspiration,
            dueAt,
            chunkMinutes,
            coinValue,
            confirmImport: Boolean(review),
          });
          if (newSlot) await scheduleTaskAction(task.id, newSlot.start, newSlot.end);
          if (stepsDirty && steps) await saveQuestStepsAction(task.id, steps.map(({ id, title, done }) => ({ id, title, done })));
          await setTaskPlacementAction(task.id, placement).catch(() => {});
          if (onSaved) onSaved();
          else close();
          return;
        }
        if (doingNow) {
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
        const id = await createQuestAction({
          title,
          description,
          importance,
          urgency,
          xpValue: xp,
          estimateMinutes: est,
          boardId,
          effort: effort || undefined,
          iconKey: draftIcon?.url ?? null,
          iconSource: draftIcon?.source,
          pinToBattle: placement === "today",
          placement,
          schedule: fixedSchedule ?? (newSlot ? { startISO: newSlot.start, endISO: newSlot.end } : undefined),
          dueAt,
          chunkMinutes,
          coinValue,
        });
        const newSteps = (steps ?? []).filter((st) => st.title.trim());
        if (newSteps.length > 0) await saveQuestStepsAction(id, newSteps.map(({ title, done }) => ({ title, done })));
        paintPortrait(id);
        onCreated?.(id);
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
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${phase === "closing" ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl ${
          phase === "closing" ? exitCls : enterCls
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div onFocus={keepInView} className="qe-body relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4">
          <div data-embed-hide className="flex items-center justify-between">
            <h3 className={isAdventure ? "font-display text-lg" : "text-lg font-bold"}>{heading}</h3>
            <button type="button" onClick={close} aria-label="Close" className="h-9 w-9 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
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
                <IconPicker
                  currentIcon={draftIcon?.url ?? null}
                  currentSource={draftIcon?.source ?? "monster"}
                  taskTitle={title}
                  taskDescription={description}
                  theme={theme}
                  size={72}
                  emptyContent={empty}
                  showEditHint
                  onDraftChange={(url, source) => setDraftIcon(url ? { url, source } : null)}
                />
              )}
              <span className="text-[10.5px]" style={{ color: "var(--t-ink-soft)" }}>
                Portrait
              </span>
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
          {!task && !draftIcon && (
            <p className="-mt-1.5 m-0 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
              A portrait is painted from the title once it&apos;s saved — or tap the circle to choose one.
            </p>
          )}

          {/* Where it shows on Today: Today's Quests, Additional Quests, or neither */}
          {!doingNow && !isCompleted && !fixedSchedule && (
            <div className="flex flex-col gap-1">
              <span className={labelCls}>On the Today screen</span>
              <div role="radiogroup" aria-label="Where it shows on the Today screen" className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { v: "today" as const, label: `Today's ${isAdventure ? "Quests" : "Tasks"}`, hint: todayFull ? "full" : null },
                    { v: "additional" as const, label: `Additional ${isAdventure ? "Quests" : "Tasks"}`, hint: null },
                  ]
                ).map((o) => {
                  const on = placement === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={o.v === "today" && todayFull}
                      // Tap the chosen one again to leave it off both (just on its board).
                      onClick={() => setPlacement(on ? "none" : o.v)}
                      className="flex h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-[13.5px] font-semibold transition-colors disabled:opacity-45"
                      style={
                        on
                          ? { background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", borderColor: "#8a6116", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }
                          : { borderColor: chipBorder, color: "var(--t-ink-soft)" }
                      }
                    >
                      <span
                        aria-hidden
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px]"
                        style={{ border: `1.5px solid ${on ? "#2a1c10" : chipBorder}`, background: on ? "rgba(255,255,255,.35)" : "transparent" }}
                      >
                        {on && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#2a1c10" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {o.label}
                      {o.hint && <span className="font-normal"> ({o.hint})</span>}
                    </button>
                  );
                })}
              </div>
              {placement === "none" && (
                <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  Neither — it stays on its board until you add it to Today.
                </span>
              )}
            </div>
          )}

          {/* Time to complete, power-up, and whether it can be done in pieces */}
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
                  className="h-9 w-16 rounded-lg border px-2 text-right text-[16px] tabular-nums"
                  style={fieldStyle}
                />
                <span className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
                  min
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-[28px]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPowerUp}
                  onClick={() => setEstimate(isPowerUp ? "" : "5")}
                  title={`Power-ups are quick wins — ${POWER_UP_MINUTES} minutes or less`}
                  className="hover-glow flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold"
                  style={{
                    borderColor: isPowerUp ? "#c99a2e" : chipBorder,
                    background: isPowerUp ? "rgba(242,201,76,.35)" : "transparent",
                    color: "var(--t-ink)",
                  }}
                >
                  <BoltIcon size={15} />
                  Power-up{isPowerUp ? " ✓" : ""}
                </button>
                <label className="flex min-h-8 cursor-pointer items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={chunk !== ""}
                    onChange={(e) => setChunk(e.target.checked ? "15" : "")}
                    className="h-4 w-4 shrink-0"
                    style={{ accentColor: isAdventure ? "#8a6c2c" : "var(--t-accent)" }}
                  />
                  <span>Can be done in</span>
                  <input
                    type="number"
                  onFocus={(e) => e.currentTarget.select()}
                    inputMode="numeric"
                    min={1}
                    step={5}
                    value={chunk || "15"}
                    disabled={chunk === ""}
                    onChange={(e) => setChunk(e.target.value)}
                    aria-label="Minutes per piece"
                    className="h-8 w-12 rounded-md border px-1 text-right text-[16px] tabular-nums disabled:opacity-50"
                    style={fieldStyle}
                  />
                  <span>-minute pieces</span>
                </label>
              </div>
            </div>
          )}

          {/* Steps: a checklist inside the quest */}
          {!doingNow && !stepsUnavailable && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <StepsGlyph />
                <span className={labelCls}>Steps</span>
                {steps && steps.length > 0 && (
                  <span className="text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                    {stepsDone} of {steps.length} done
                  </span>
                )}
                {!isCompleted && steps !== null && !addingStep && (
                  <button
                    type="button"
                    onClick={() => setAddingStep(true)}
                    className="hover-glow ml-auto h-8 rounded-full border px-3 text-[12.5px] font-semibold"
                    style={{ borderColor: chipBorder, color: "var(--t-ink)" }}
                  >
                    + Add steps
                  </button>
                )}
              </div>
              {steps === null || (steps.length === 0 && !addingStep) ? null : (
                <ul className="m-0 flex list-none flex-col p-0 pl-[22px]">
                  {steps.map((st) => (
                    <li key={st.key} className="quest-step flex items-start gap-2 rounded-md py-0.5 pl-1">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={st.done}
                        aria-label={st.done ? `Untick ${st.title}` : `Tick ${st.title}`}
                        disabled={isCompleted}
                        onClick={() => setStepDone(st.key, !st.done)}
                        className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
                        style={{
                          border: `1.5px solid ${st.done ? "var(--t-good)" : isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`,
                          background: st.done ? "var(--t-good)" : "transparent",
                        }}
                      >
                        {st.done && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <AutoGrowText
                        value={st.title}
                        onChange={(v) => renameStep(st.key, v.replace(/\n/g, " "))}
                        ariaLabel="Step"
                        className="bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] text-[15px] leading-snug focus:outline-none"
                        style={{
                          color: st.done ? "var(--t-ink-soft)" : "var(--t-ink)",
                          textDecoration: st.done ? "line-through" : undefined,
                          textDecorationColor: "rgba(80,60,20,.45)",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => removeStep(st.key)}
                        aria-label={`Remove step ${st.title}`}
                        className="step-remove h-7 w-7 shrink-0 text-[18px] leading-none"
                        style={{ color: "var(--t-ink-soft)" }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  {!isCompleted && addingStep && (
                    <li className="flex items-center gap-2 py-0.5 pl-1">
                      <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-dashed text-[13px] leading-none" style={{ borderColor: isAdventure ? "#a88a3f" : "var(--t-card-border)", color: "var(--t-ink-soft)" }}>
                        +
                      </span>
                      <input
                        value={newStep}
                        onChange={(e) => setNewStep(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addStep();
                          }
                        }}
                        onBlur={() => {
                          addStep();
                          setAddingStep(false);
                        }}
                        autoFocus
                        enterKeyHint="enter"
                        placeholder="Add a step, then Enter"
                        aria-label="Add a step"
                        className="bare-input h-8 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[16px] focus:outline-none"
                        style={{ color: "var(--t-ink)" }}
                      />
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

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

          {/* XP and coins */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={labelCls}>{isAdventure ? "XP reward" : "Points"}</span>
              <span className="ml-auto text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                {coinValue === null ? "coins follow XP (1 per 10)" : (
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
                <input
                  type="number"
                  onFocus={(e) => e.currentTarget.select()}
                  inputMode="numeric"
                  min={0}
                  value={xp}
                  onChange={(e) => setXp(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                  aria-label="XP amount"
                  className="bare-input h-full w-11 bg-transparent px-1 text-right text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
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
                  <input
                    type="number"
                  onFocus={(e) => e.currentTarget.select()}
                    inputMode="numeric"
                    min={0}
                    value={coinsShown}
                    onChange={(e) => setCoinValue(Math.max(0, Math.round(Number(e.target.value) || 0)))}
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

          {!doingNow && (
            <>
              <IconScale label="Importance" icon="/design/ui-bolt.png" value={importance} onChange={setImportance} />
              <IconScale label="Urgency" icon="/design/ui-flame-sm.png" value={urgency} onChange={setUrgency} />
              <IconScale label="Effort" icon="/design/ui-effort.svg" value={effort} onChange={setEffort} />
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

          {/* Aspiration: keep it on its board, out of today's lists */}
          {task && !isCompleted && (
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
              <input type="checkbox" checked={aspiration} onChange={(e) => setAspiration(e.target.checked)} className="h-4 w-4 shrink-0" style={{ accentColor: isAdventure ? "#8a6c2c" : "var(--t-accent)" }} />
              <span>
                <span className="font-semibold">Not actionable yet</span>
                <span style={{ color: "var(--t-ink-soft)" }}> — keep it as an aspiration on its board, off Today and the map</span>
              </span>
            </label>
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

          {task && !isCompleted && (
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
          )}

          {/* Quest progress: partial progress earns its share of the XP */}
          {task && !isCompleted && (
            <div
              className="flex flex-col gap-1.5 rounded-xl px-3.5 py-2.5"
              style={{
                background: isAdventure ? "linear-gradient(180deg, rgba(48,38,18,.9), rgba(30,24,12,.92))" : "var(--t-bg)",
                border: `1.5px solid ${isAdventure ? "#a88a3f" : "var(--t-card-border)"}`,
                opacity: progressTracked ? 1 : 0.6,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14.5px] font-semibold" style={{ color: isAdventure ? "#f3e7cb" : "var(--t-ink)" }}>
                  Quest progress
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!progressTracked || progress <= 0}
                    onClick={() => setProgress((p) => Math.max(0, Math.ceil(p / 5) * 5 - 5))}
                    aria-label="Less progress"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none disabled:opacity-40"
                    style={{ border: "1px solid #a88a3f", color: "#f8e3a0" }}
                  >
                    −
                  </button>
                  <span className="flex items-center rounded-md px-1" style={{ border: "1px solid rgba(168,138,63,.6)", background: "rgba(0,0,0,.25)" }}>
                    <input
                      type="number"
                  onFocus={(e) => e.currentTarget.select()}
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={progress}
                      disabled={!progressTracked}
                      onChange={(e) => setProgress(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                      aria-label="Progress percent"
                      className="bare-input h-7 w-10 bg-transparent text-right text-[16px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      style={{ color: isAdventure ? "#f8e3a0" : "var(--t-accent)" }}
                    />
                    <span className="text-[14px] font-bold" style={{ color: isAdventure ? "#f8e3a0" : "var(--t-accent)" }}>
                      %
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={!progressTracked || progress >= 100}
                    onClick={() => setProgress((p) => Math.min(100, Math.floor(p / 5) * 5 + 5))}
                    aria-label="More progress"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none disabled:opacity-40"
                    style={{ border: "1px solid #a88a3f", color: "#f8e3a0" }}
                  >
                    +
                  </button>
                </span>
              </div>
              <div className="relative h-5">
                <div
                  className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full"
                  style={{ background: "#141a13", border: "1.5px solid #8a6c2c", boxShadow: "inset 0 2px 4px rgba(0,0,0,.6)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-150"
                    style={{ width: `${progress}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)", boxShadow: "0 0 8px rgba(242,210,126,.5)" }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  disabled={!progressTracked}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  aria-label="Quest progress"
                  className="progress-range absolute inset-0 w-full cursor-pointer"
                />
              </div>
              <p className="m-0 text-[12.5px]" style={{ color: isAdventure ? "rgba(243,231,203,.78)" : "var(--t-ink-soft)" }}>
                {!progressTracked
                  ? "Available after the next database update."
                  : progress >= 100
                    ? "Closing at 100% completes the quest."
                    : progress !== initialProgress
                      ? `+${Math.round((xp * (progress - initialProgress)) / 100)} XP when you close this · ${xp - Math.round((xp * progress) / 100)} more on completion`
                      : `${Math.round((xp * progress) / 100)} XP earned so far · ${xp - Math.round((xp * progress) / 100)} more on completion`}
              </p>
            </div>
          )}

          {create && !fixedSchedule && (
            <button
              type="button"
              onClick={() => {
                setDoingNow(!doingNow);
                if (!doingNow && xp === 0) setXp(30);
              }}
              className="self-start text-[13px] underline underline-offset-2"
              style={{ color: "var(--t-ink-soft)" }}
            >
              {doingNow ? "← Back to a regular quest" : "Already doing it? Log it as done now (+XP)"}
            </button>
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
                    <button type="button" onClick={close} className="h-10 rounded-full px-4 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
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
}: {
  value: string;
  onChange: (v: string) => void;
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
  value,
  onChange,
}: {
  label: string;
  icon: string;
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
      <span className="w-[92px] shrink-0 text-[13px] font-semibold">{label}</span>
      <div
        ref={rowRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
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
