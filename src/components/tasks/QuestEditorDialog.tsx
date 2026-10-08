"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { completeTaskAction, createBoardFromEditorAction, createQuestAction, deleteTaskAction, listBoardOptionsAction, listQuestStepsAction, reopenTaskAction, saveQuestStepsAction, scheduleTaskAction, setTaskProgressAction, updateTaskAction } from "@/app/actions";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { IconPicker } from "./IconPicker";
import { CheckMark } from "./TaskRow";
import { SlotPickerDialog } from "./SlotPickerDialog";

export type QuestDraft = {
  title?: string;
  description?: string;
  estimateMinutes?: number | null;
};

export type QuestEditorMode =
  | { kind: "edit"; task: Task }
  | {
      kind: "create";
      boardId?: string | null;
      pinToBattle?: boolean;
      /** Start as a quick power-up (prefills a short time). */
      powerUp?: boolean;
      /** Place the new quest on the calendar (e.g. from a Google event). */
      schedule?: { startISO: string; endISO: string; googleEventId?: string };
      prefill?: QuestDraft;
    };

type StepDraft = { key: string; id?: string; title: string; done: boolean };

const XP_MAX = 150;
const XP_STEP = 10;


/**
 * One compact dialog for creating and editing quests, laid out like a quest
 * card: portrait on the left, title + description on the right; then time to
 * complete, XP, importance and urgency (tap or drag), and an optional
 * calendar slot.
 *
 * `origin="fab"` makes it rise out of the floating + button and sink back
 * into it on cancel; after creating, it shrinks into the new quest's card.
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
}: {
  mode: QuestEditorMode;
  theme?: "calm" | "adventure";
  origin?: "fab" | "center";
  onClose: () => void;
  onCreated?: (id: string) => void;
  /** Called after an existing quest is saved (instead of the closing animation when reviewing). */
  onSaved?: () => void;
  /** "Plot on Priority Matrix": override where it goes (default: this quest alone). */
  onPlot?: () => void;
  /** Reviewing imports one by one: header shows progress, Save confirms the import. */
  review?: { index: number; total: number; onLater: () => void };
}) {
  const isAdventure = theme === "adventure";
  const task = mode.kind === "edit" ? mode.task : null;
  const prefill = mode.kind === "create" ? mode.prefill : undefined;
  const fixedSchedule = mode.kind === "create" ? mode.schedule : undefined;

  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? prefill?.description ?? "");
  const [importance, setImportance] = useState(task ? Math.round(task.importance) : 0);
  const [urgency, setUrgency] = useState(task ? Math.round(task.urgency) : 0);
  const [xp, setXp] = useState(task?.xp_value ?? 0);
  const [effort, setEffort] = useState(task?.effort ?? 0);
  const [aspiration, setAspiration] = useState(Boolean(task?.is_aspiration));
  const [estimate, setEstimate] = useState<string>(() => {
    const v = task?.estimate_minutes ?? prefill?.estimateMinutes ?? (mode.kind === "create" && mode.powerUp ? 5 : undefined);
    return v != null ? String(v) : "";
  });
  const [draftIcon, setDraftIcon] = useState<{ url: string; source: "library" | "ai" } | null>(null);
  const initialSlot =
    task?.is_on_calendar && task.scheduled_start && task.scheduled_end
      ? { start: task.scheduled_start, end: task.scheduled_end }
      : null;
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(initialSlot);
  const [pickingSlot, setPickingSlot] = useState(false);
  const initialBoard = task ? (task.board_id ?? null) : mode.kind === "create" ? (mode.boardId ?? null) : null;
  const [boardId, setBoardId] = useState<string | null>(initialBoard);
  const [boardOptions, setBoardOptions] = useState<{ id: string; label: string }[] | null>(null);
  const isCompleted = task?.status === "completed";
  const isPowerUp = mode.kind === "create" && Boolean(mode.powerUp);
  const progressTracked = typeof task?.xp_awarded === "number";
  const initialProgress = task?.progress ?? 0;
  const [progress, setProgress] = useState(initialProgress);
  // Steps: a small checklist inside the quest. null while loading an existing quest's steps.
  const [steps, setSteps] = useState<StepDraft[] | null>(task ? null : []);
  const [stepsUnavailable, setStepsUnavailable] = useState(false);
  const [stepsDirty, setStepsDirty] = useState(false);
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [newBoard, setNewBoard] = useState<{ board: string } | null>(null);
  const [creatingBoard, startCreatingBoard] = useTransition();

  function createBoard() {
    if (!newBoard?.board.trim()) return;
    startCreatingBoard(async () => {
      try {
        const res = await createBoardFromEditorAction(newBoard.board);
        setBoardOptions((opts) => [...(opts ?? []), { id: res.id, label: res.title }]);
        setBoardId(res.id);
        setNewBoard(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the board.");
      }
    });
  }
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

  const noun = isAdventure ? "quest" : "task";
  const fieldStyle: React.CSSProperties = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };
  const labelCls = "text-[13px] font-semibold";

  function close() {
    setPhase("closing");
    setTimeout(onClose, origin === "fab" ? 260 : 180);
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
    // Card hidden (e.g. Other Quests collapsed): shrink into that section instead.
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
    target.animate([{ boxShadow: "0 0 0 3px rgba(217,180,95,.9)" }, { boxShadow: "0 0 0 0 rgba(217,180,95,0)" }], {
      duration: 700,
    });
    onClose();
  }


  function save() {
    setError(null);
    const est = estimate.trim() ? Math.max(0, Math.round(Number(estimate))) : null;
    const newSlot = !fixedSchedule && slot && slot.start !== initialSlot?.start ? slot : null;
    startSaving(async () => {
      try {
        if (task) {
          await updateTaskAction(task.id, {
            title,
            description,
            importance,
            urgency,
            xpValue: xp,
            estimateMinutes: est,
            boardId: boardId !== initialBoard ? boardId : undefined,
            effort: task.effort !== undefined || effort ? effort : undefined,
            isAspiration: aspiration !== Boolean(task.is_aspiration) ? aspiration : undefined,
            confirmImport: Boolean(review),
          });
          if (newSlot) await scheduleTaskAction(task.id, newSlot.start, newSlot.end);
          if (stepsDirty && steps) await saveQuestStepsAction(task.id, steps.map(({ id, title, done }) => ({ id, title, done })));
          if (progressTracked && !isCompleted && progress !== initialProgress) {
            if (progress >= 100) {
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
              const res = await setTaskProgressAction(task.id, progress);
              if (res.xpEarned > 0) {
                celebrateProgress({
                  title,
                  xp: res.xpEarned,
                  coinsEarned: res.coinsEarned,
                  fromPct: initialProgress,
                  toPct: progress,
                  steps: steps && steps.length > 0 ? { done: stepsDone, total: steps.length } : undefined,
                });
              }
            }
          }
          if (onSaved) onSaved();
          else close();
        } else if (mode.kind === "create") {
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
            pinToBattle: mode.pinToBattle,
            schedule: fixedSchedule ?? (newSlot ? { startISO: newSlot.start, endISO: newSlot.end } : undefined),
          });
          const newSteps = (steps ?? []).filter((st) => st.title.trim());
          if (newSteps.length > 0) await saveQuestStepsAction(id, newSteps.map(({ title, done }) => ({ title, done })));
          onCreated?.(id);
          await flyInto(id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function remove() {
    if (!task) return;
    setError(null);
    startSaving(async () => {
      try {
        await deleteTaskAction(task.id);
        if (onSaved) onSaved();
        else close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete.");
      }
    });
  }

  const enterCls = origin === "fab" ? "qe-rise-in" : "sheet-slide-up-in";
  const exitCls = origin === "fab" ? "qe-sink-out" : "sheet-minimize-out";
  const empty = <CheckMark checked={false} isAdventure={isAdventure} size={72} />;

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
        aria-label={task ? `Edit ${noun}` : `New ${noun}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
        className={`flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-2xl parchment parchment-framed shadow-2xl ${
          phase === "closing" ? exitCls : enterCls
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h3 className={isAdventure ? "font-display text-lg" : "text-lg font-bold"}>{review ? `Review import ${review.index} of ${review.total}` : isCompleted ? `Completed ${noun}` : task ? `Edit ${noun}` : isPowerUp ? "New power-up" : `New ${noun}`}</h3>
          <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        {/* Time to complete */}
        <label className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- same clock glyph as the quest card */}
          <img src="/design/ui-clock.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
          <span className={`${labelCls} flex-1`}>Time to complete</span>
          <input
            type="number"
            min={0}
            step={5}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="—"
            aria-label="Minutes to complete"
            className="h-9 w-16 rounded-lg border px-2 text-right text-sm tabular-nums"
            style={fieldStyle}
          />
          <span className="w-7 text-sm" style={{ color: "var(--t-ink-soft)" }}>
            min
          </span>
        </label>

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
              placeholder={isAdventure ? "Quest title" : "Task title"}
              aria-label="Title"
              autoFocus={!task}
              className="h-10 rounded-lg border px-2.5 text-[15px] font-semibold"
              style={fieldStyle}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description (optional)"
              aria-label="Description"
              className="resize-none rounded-lg border px-2.5 py-1.5 text-[13.5px]"
              style={fieldStyle}
            />
          </div>
        </div>

        {/* Steps: a checklist inside the quest */}
        {!stepsUnavailable && (
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
                  className="hover-glow ml-auto h-7 rounded-full border px-3 text-[12.5px] font-semibold"
                  style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", color: "var(--t-ink)" }}
                >
                  + Add steps
                </button>
              )}
            </div>
            {steps === null || (steps.length === 0 && !addingStep) ? null : (
              <ul className="m-0 flex list-none flex-col p-0 pl-[22px]">
                {steps.map((st) => (
                  <li key={st.key} className="quest-step flex items-center gap-2 rounded-md py-0.5 pl-1">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={st.done}
                      aria-label={st.done ? `Untick ${st.title}` : `Tick ${st.title}`}
                      disabled={isCompleted}
                      onClick={() => setStepDone(st.key, !st.done)}
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
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
                    <input
                      value={st.title}
                      onChange={(e) => renameStep(st.key, e.target.value)}
                      aria-label="Step"
                      className="bare-input h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[14px] focus:outline-none"
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
                      placeholder="Add a step, then Enter"
                      aria-label="Add a step"
                      className="bare-input h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-[14px] focus:outline-none"
                      style={{ color: "var(--t-ink)" }}
                    />
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Due date / calendar */}
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
          <img src="/design/ui-calendar.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
          <span className={`${labelCls} w-[70px] shrink-0`}>Due</span>
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
              No date yet
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
                style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", color: "var(--t-ink)" }}
              >
                {slot ? "Change" : "Add to calendar"}
              </button>
            </>
          )}
        </div>
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

        {/* XP */}
        <div className="flex items-center gap-2.5">
          <span className={`${labelCls} w-[92px] shrink-0`}>{isAdventure ? "XP reward" : "Points"}</span>
          <input
            type="range"
            min={0}
            max={XP_MAX}
            step={XP_STEP}
            value={Math.min(XP_MAX, xp)}
            onChange={(e) => setXp(Number(e.target.value))}
            aria-label="XP reward"
            className="h-7 min-w-0 flex-1"
            style={{ accentColor: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
          />
          <input
            type="number"
            min={0}
            value={xp}
            onChange={(e) => setXp(Math.max(0, Number(e.target.value) || 0))}
            aria-label="XP amount"
            className="h-9 w-16 rounded-lg border px-2 text-right text-sm font-bold tabular-nums"
            style={{ ...fieldStyle, color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
          />
          <span className="w-7" />
        </div>

        <IconScale label="Importance" icon="/design/ui-bolt.png" value={importance} onChange={setImportance} />
        <IconScale label="Urgency" icon="/design/ui-flame-sm.png" value={urgency} onChange={setUrgency} />
        <IconScale label="Effort" icon="/design/ui-effort.svg" value={effort} onChange={setEffort} />

        {/* Quest board (the tag on the card) */}
        <label className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- boards glyph */}
          <img src="/design/ui-grid.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
          <span className={`${labelCls} w-[70px] shrink-0`}>Board</span>
          <select
            value={newBoard ? "__new_board" : (boardId ?? "")}
            onChange={(e) => {
              if (e.target.value === "__new_board") return setNewBoard({ board: "" });
              setNewBoard(null);
              setBoardId(e.target.value || null);
            }}
            aria-label="Quest board"
            className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[13.5px]"
            style={fieldStyle}
          >
            <option value="">No board</option>
            {boardOptions === null && boardId && <option value={boardId}>Loading…</option>}
            {(boardOptions ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            <option value="__new_board">+ New quest board…</option>
          </select>
        </label>
        {newBoard && (
          <div className="-mt-1 flex items-center gap-2 rounded-lg p-2.5 sm:ml-[98px]" style={{ background: "rgba(255,250,238,.45)", border: "1px dashed #b39a6a" }}>
            <input
              autoFocus
              value={newBoard.board}
              onChange={(e) => setNewBoard({ board: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createBoard())}
              placeholder="New board name (e.g. Home, Health)"
              aria-label="New board name"
              className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[14px]"
              style={fieldStyle}
            />
            <button type="button" onClick={() => setNewBoard(null)} className="h-8 px-1.5 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={creatingBoard || !newBoard.board.trim()}
              onClick={createBoard}
              className="h-8 shrink-0 rounded-full px-4 text-[13.5px] disabled:opacity-50"
              style={{ background: "var(--t-gold)", color: "#2a1c10" }}
            >
              {creatingBoard ? "…" : "Create"}
            </button>
          </div>
        )}

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
              <span style={{ color: "var(--t-good)", fontWeight: 700 }}>✓</span>{" "}
              {isAdventure ? "Defeated" : "Completed"}
              {task.completed_at &&
                ` ${new Date(task.completed_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
              {" · changing XP updates what you earned"}
            </span>
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                startSaving(async () => {
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
            className="hover-glow flex h-9 items-center justify-center gap-2 rounded-full border text-[13px] font-semibold"
            style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", color: "var(--t-ink)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- matrix glyph */}
            <img src="/design/ui-target.png" alt="" width={18} height={18} />
            Plot importance &amp; urgency on the Priority Matrix
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
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none disabled:opacity-40"
                  style={{ border: "1px solid #a88a3f", color: "#f8e3a0" }}
                >
                  −
                </button>
                <span className="flex items-center rounded-md px-1" style={{ border: "1px solid rgba(168,138,63,.6)", background: "rgba(0,0,0,.25)" }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    value={progress}
                    disabled={!progressTracked}
                    onChange={(e) => setProgress(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
                    aria-label="Progress percent"
                    className="bare-input h-7 w-10 bg-transparent text-right text-[15px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
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
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none disabled:opacity-40"
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
                  ? "Saving at 100% completes the quest."
                  : `+${Math.round((xp * progress) / 100)} XP for progress so far · ${xp - Math.round((xp * progress) / 100)} more on completion`}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {task ? (
            !confirmingDelete ? (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm underline" style={{ color: "var(--t-warn)" }}>
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
          <div className="flex gap-2">
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
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow h-10 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
              style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
            >
              {isSaving ? "Saving…" : review ? "Confirm" : task ? "Save" : `Create ${noun}`}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Five icons for a 0–5 value: tap an icon, or drag across the row like a
 * slider. Tapping the current top icon again sets it to 0. Arrow keys work too.
 */
function IconScale({
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
