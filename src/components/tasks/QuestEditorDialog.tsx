"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { createQuestAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import { IconPicker } from "./IconPicker";
import { CheckMark } from "./TaskRow";

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
 * One dialog for creating and editing quests. Top to bottom: portrait
 * (library / generate), XP, title, description, time to complete (with the
 * card's clock icon), then importance (bolts) and urgency (flames), each
 * tappable 0–5.
 */
export function QuestEditorDialog({
  mode,
  theme = "calm",
  onClose,
  onCreated,
}: {
  mode: QuestEditorMode;
  theme?: "calm" | "adventure";
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const isAdventure = theme === "adventure";
  const task = mode.kind === "edit" ? mode.task : null;
  const prefill = mode.kind === "create" ? mode.prefill : undefined;

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  const noun = isAdventure ? "quest" : "task";
  const fieldStyle: React.CSSProperties = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };
  const labelCls = "text-[13px] font-semibold";

  function save() {
    setError(null);
    const est = estimate.trim() ? Math.max(0, Math.round(Number(estimate))) : null;
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
          });
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
            schedule: mode.schedule,
          });
          onCreated?.(id);
        }
        close();
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
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete.");
      }
    });
  }

  const checkbox = <CheckMark checked={false} isAdventure={isAdventure} size={96} />;


  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "var(--t-overlay)" }}
      onClick={(e) => {
        e.stopPropagation();
        close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task ? `Edit ${noun}` : `New ${noun}`}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl p-5 shadow-2xl ${
          closing ? "sheet-minimize-out" : "sheet-slide-up-in"
        }`}
        style={{
          background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
          border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
          color: "var(--t-ink)",
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className={isAdventure ? "font-display text-lg" : "text-lg font-bold"}>
            {task ? `Edit ${noun}` : `New ${noun}`}
          </h3>
          <button type="button" onClick={close} aria-label="Close" className="h-9 w-9 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

        {/* 1. Portrait */}
        <div className="flex flex-col items-center gap-1.5">
          {task ? (
            <IconPicker
              taskId={task.id}
              currentIcon={task.icon_key}
              currentSource={task.icon_source}
              taskTitle={title}
              theme={theme}
              size={96}
              emptyContent={checkbox}
              centered
            />
          ) : (
            <IconPicker
              currentIcon={draftIcon?.url ?? null}
              currentSource={draftIcon?.source ?? "monster"}
              taskTitle={title}
              theme={theme}
              size={96}
              emptyContent={checkbox}
              onDraftChange={(url, source) => setDraftIcon(url ? { url, source } : null)}
              centered
            />
          )}
          <span className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
            Tap to pick or generate a portrait
          </span>
        </div>

        {/* 2. XP */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className={labelCls}>{isAdventure ? "XP reward" : "Points"}</span>
          </div>
          <div className="flex items-center gap-3">
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
            <input
              type="number"
              min={0}
              value={xp}
              onChange={(e) => setXp(Math.max(0, Number(e.target.value) || 0))}
              aria-label="XP amount"
              className="h-10 w-20 rounded-lg border px-2 text-right text-base font-bold tabular-nums"
              style={{ ...fieldStyle, color: isAdventure ? "var(--t-xp)" : "var(--t-accent)" }}
            />
          </div>
        </div>

        {/* 3. Title  4. Description */}
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isAdventure ? "Name your quest" : "What needs doing?"}
            autoFocus={!task}
            className="h-11 rounded-lg border px-3 text-base"
            style={fieldStyle}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional"
            className="rounded-lg border px-3 py-2 text-[15px]"
            style={fieldStyle}
          />
        </label>

        {/* 5. Time to complete */}
        <label className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- same clock glyph as the quest card */}
          <img src="/design/ui-clock.png" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
          <span className={`${labelCls} flex-1`}>Time to complete</span>
          <input
            type="number"
            min={0}
            step={5}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="—"
            aria-label="Minutes to complete"
            className="h-10 w-20 rounded-lg border px-2 text-right text-base tabular-nums"
            style={fieldStyle}
          />
          <span className="text-sm" style={{ color: "var(--t-ink-soft)" }}>
            min
          </span>
        </label>

        {/* 6. Importance / urgency */}
        <IconScale
          label="Importance"
          icon="/design/ui-bolt.png"
          value={importance}
          onChange={setImportance}
        />
        <IconScale label="Urgency" icon="/design/ui-flame-sm.png" value={urgency} onChange={setUrgency} />

        {error && (
          <p className="text-sm" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
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
            <button type="button" onClick={close} className="h-11 rounded-full px-4 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow h-11 rounded-full px-5 text-[15px] font-semibold disabled:opacity-50"
              style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
            >
              {isSaving ? "Saving…" : task ? "Save" : `Create ${noun}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Five tappable icons (0–5). Tapping the current top icon again sets it to 0. */
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
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-[13px] font-semibold">{label}</span>
      <div className="flex flex-1 items-center gap-0.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${label} ${n}`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-transform active:scale-90"
            style={{ background: n <= value ? "rgba(255,255,255,.4)" : "transparent" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- card glyph */}
            <img
              src={icon}
              alt=""
              width={14}
              height={14}
              className="h-3.5 w-3.5"
              style={{ opacity: n <= value ? 1 : 0.22, filter: n <= value ? undefined : "grayscale(1)" }}
            />
          </button>
        ))}
      </div>
      <span className="w-5 text-right text-sm font-bold tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
        {value}
      </span>
    </div>
  );
}
