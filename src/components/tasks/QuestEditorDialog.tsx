"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { createQuestAction, deleteTaskAction, scheduleTaskAction, updateTaskAction } from "@/app/actions";
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
  const [importance, setImportance] = useState(task ? Math.round(task.importance) : 3);
  const [urgency, setUrgency] = useState(task ? Math.round(task.urgency) : 3);
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
  const [grantsReward, setGrantsReward] = useState(Boolean(task?.grants_reward));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [phase, setPhase] = useState<"open" | "closing">("open");
  const panelRef = useRef<HTMLDivElement>(null);

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
            grantsReward,
            confirmImport: Boolean(review),
          });
          if (newSlot) await scheduleTaskAction(task.id, newSlot.start, newSlot.end);
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
            goalId: mode.goalId,
            iconKey: draftIcon?.url ?? null,
            iconSource: draftIcon?.source,
            pinToBattle: mode.pinToBattle,
            grantsReward,
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
        className={`flex max-h-[94vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl p-4 shadow-2xl ${
          phase === "closing" ? exitCls : enterCls
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className={isAdventure ? "font-display text-lg" : "text-lg font-bold"}>{review ? `Review import ${review.index} of ${review.total}` : task ? `Edit ${noun}` : `New ${noun}`}</h3>
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

        <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={grantsReward}
            onChange={(e) => setGrantsReward(e.target.checked)}
            className="h-4 w-4"
            style={{ accentColor: isAdventure ? "var(--t-gold-deep)" : "var(--t-accent)" }}
          />
          <span className="font-semibold">Completing this lets me pick a reward</span>
          <span aria-hidden>🎁</span>
        </label>

        {task && (
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
