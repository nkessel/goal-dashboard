"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { completeTaskAction, createBoardWithGoalAction, createQuestAction, deleteTaskAction, listGoalOptionsAction, reopenTaskAction, scheduleTaskAction, setTaskProgressAction, updateTaskAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { BoltIcon } from "@/components/ui/Icons";
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
      goalId?: string | null;
      pinToBattle?: boolean;
      /** Start as a power-up (quick win). */
      powerUp?: boolean;
      /** Place the new quest on the calendar (e.g. from a Google event). */
      schedule?: { startISO: string; endISO: string; googleEventId?: string };
      prefill?: QuestDraft;
    };

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
  const [estimate, setEstimate] = useState<string>(() => {
    const v = task?.estimate_minutes ?? prefill?.estimateMinutes;
    return v != null ? String(v) : "";
  });
  const [draftIcon, setDraftIcon] = useState<{ url: string; source: "library" | "ai" } | null>(null);
  const initialSlot =
    task?.is_on_calendar && task.scheduled_start && task.scheduled_end
      ? { start: task.scheduled_start, end: task.scheduled_end }
      : null;
  const [slot, setSlot] = useState<{ start: string; end: string } | null>(initialSlot);
  const [pickingSlot, setPickingSlot] = useState(false);
  const initialGoal = task ? task.goal_id : mode.kind === "create" ? (mode.goalId ?? null) : null;
  const [goalId, setGoalId] = useState<string | null>(initialGoal);
  const [goalOptions, setGoalOptions] = useState<{ id: string; title: string; boardTitle: string }[] | null>(null);
  const isCompleted = task?.status === "completed";
  const initialPowerUp = task ? Boolean(task.is_power_up) : mode.kind === "create" && Boolean(mode.powerUp);
  const [isPowerUp, setIsPowerUp] = useState(initialPowerUp);
  const powerUpSupported = !task || task.is_power_up !== undefined;
  const progressTracked = typeof task?.xp_awarded === "number";
  const initialProgress = task?.progress ?? 0;
  const [progress, setProgress] = useState(initialProgress);
  const [newBoard, setNewBoard] = useState<{ board: string; goal: string } | null>(null);
  const [creatingBoard, startCreatingBoard] = useTransition();

  function createBoard() {
    if (!newBoard?.board.trim()) return;
    startCreatingBoard(async () => {
      try {
        const res = await createBoardWithGoalAction(newBoard.board, newBoard.goal);
        setGoalOptions((opts) => [...(opts ?? []), { id: res.goalId, title: res.goalTitle, boardTitle: res.boardTitle }]);
        setGoalId(res.goalId);
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
    listGoalOptionsAction()
      .then(setGoalOptions)
      .catch(() => setGoalOptions([]));
  }, []);

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
            goalId: goalId !== initialGoal ? goalId : undefined,
            isPowerUp: isPowerUp !== initialPowerUp ? isPowerUp : undefined,
            confirmImport: Boolean(review),
          });
          if (newSlot) await scheduleTaskAction(task.id, newSlot.start, newSlot.end);
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
              await setTaskProgressAction(task.id, progress);
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
            goalId,
            iconKey: draftIcon?.url ?? null,
            iconSource: draftIcon?.source,
            pinToBattle: mode.pinToBattle,
            isPowerUp: isPowerUp || undefined,
            schedule: fixedSchedule ?? (newSlot ? { startISO: newSlot.start, endISO: newSlot.end } : undefined),
          });
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
        className={`flex max-h-[94vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-4 parchment parchment-framed shadow-2xl ${
          phase === "closing" ? exitCls : enterCls
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
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

        {/* Goal (and so the board tag on the card) */}
        <label className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- goals glyph */}
          <img src="/design/ui-shield.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" />
          <span className={`${labelCls} w-[70px] shrink-0`}>Goal</span>
          <select
            value={newBoard ? "__new_board" : (goalId ?? "")}
            onChange={(e) => {
              if (e.target.value === "__new_board") return setNewBoard({ board: "", goal: "" });
              setNewBoard(null);
              setGoalId(e.target.value || null);
            }}
            aria-label="Goal"
            className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[13.5px]"
            style={fieldStyle}
          >
            <option value="">No goal (no board tag)</option>
            {goalOptions === null && goalId && <option value={goalId}>Loading…</option>}
            {Object.entries(
              (goalOptions ?? []).reduce<Record<string, { id: string; title: string }[]>>((acc, g) => {
                (acc[g.boardTitle] ??= []).push(g);
                return acc;
              }, {})
            ).map(([board, goals]) => (
              <optgroup key={board} label={board}>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="__new_board">+ New board…</option>
          </select>
        </label>
        {newBoard && (
          <div className="-mt-1 flex flex-col gap-2 rounded-lg p-2.5 sm:ml-[98px]" style={{ background: "rgba(255,250,238,.45)", border: "1px dashed #b39a6a" }}>
            <input
              autoFocus
              value={newBoard.board}
              onChange={(e) => setNewBoard({ ...newBoard, board: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createBoard())}
              placeholder="Board name (e.g. Home, Health, Startup)"
              aria-label="New board name"
              className="h-9 rounded-lg border px-2.5 text-[14px]"
              style={fieldStyle}
            />
            <input
              value={newBoard.goal}
              onChange={(e) => setNewBoard({ ...newBoard, goal: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createBoard())}
              placeholder="First goal on it (optional — “General”)"
              aria-label="First goal"
              className="h-9 rounded-lg border px-2.5 text-[14px]"
              style={fieldStyle}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewBoard(null)} className="h-8 px-2 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingBoard || !newBoard.board.trim()}
                onClick={createBoard}
                className="h-8 rounded-full px-4 text-[13.5px] disabled:opacity-50"
                style={{ background: "var(--t-gold)", color: "#2a1c10" }}
              >
                {creatingBoard ? "Creating…" : "Create board"}
              </button>
            </div>
          </div>
        )}

        {powerUpSupported && !isCompleted && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
            <input
              type="checkbox"
              checked={isPowerUp}
              onChange={(e) => setIsPowerUp(e.target.checked)}
              className="h-4 w-4"
              style={{ accentColor: isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)" }}
            />
            <BoltIcon size={18} />
            <span>
              <span className="font-semibold">Power-up</span>
              <span style={{ color: "var(--t-ink-soft)" }}> — a quick, low-energy win (lives in the ⚡ menu)</span>
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
              <span className="text-[15px] font-bold tabular-nums" style={{ color: isAdventure ? "#f8e3a0" : "var(--t-accent)" }}>
                {progress}%
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
