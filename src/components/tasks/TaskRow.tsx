"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { completeTaskAction, deleteTaskAction, toggleManualPriorityAction } from "@/app/actions";
import { TaskScheduleControl } from "./TaskScheduleControl";
import { EditTaskModal } from "./EditTaskModal";
import { QuestActionMenu, type QuestAction } from "./QuestActionMenu";
import { MONSTER_ICONS } from "@/lib/monster-icons";

/** Whether a task is overdue: scheduled in the past and not yet completed.
 * Kept as a plain helper (not inlined in the component) so the impure
 * `Date.now()` read isn't taken during render itself. */
function isTaskOverdue(task: Task): boolean {
  return (
    task.status === "open" &&
    task.is_on_calendar &&
    !!task.scheduled_start &&
    new Date(task.scheduled_start).getTime() < Date.now()
  );
}

/** "25m" / "1h" / "1h 30m" — compact estimate format for the card's clock row. */
function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function TaskRow({
  task,
  theme = "calm",
  categoryLabel,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  innerRef,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  /** The title of the board the task's goal belongs to — shown as a pill on
   * the card (HANDOFF.md §4 "category pill"). Omitted or null when the
   * caller already knows every card in its list shares one board (e.g. a
   * goal card on Board Detail, where it'd be redundant), or the task has no
   * goal/board at all. */
  categoryLabel?: string | null;
  /** These let a parent list (e.g. TodayTaskBoard) make this row itself the
   * draggable/droppable element — applied straight to this component's own
   * root <li>, rather than the caller wrapping it in a second <li> (which
   * produced invalid <li> inside <li> DOM nesting and a pile of React
   * console warnings). */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLLIElement>) => void;
  innerRef?: (el: HTMLLIElement | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<"icon" | "dots" | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tint = rescheduleRedness(task.reschedule_count);
  const isAdventure = theme === "adventure";
  const isWarned = task.reschedule_count >= 3;
  const isOverdue = isTaskOverdue(task);
  const isWarnedCard = isWarned || isOverdue;

  const cardStyle: React.CSSProperties = {
    background: isOverdue
      ? "var(--t-warn-bg)"
      : tint
        ? `linear-gradient(${tint}, ${tint}), ${isAdventure ? "var(--t-panel)" : "var(--t-card)"}`
        : isAdventure
          ? "var(--t-panel)"
          : "var(--t-card)",
    borderStyle: "solid",
    borderWidth: isAdventure ? 2 : 1,
    borderColor: isWarnedCard ? "var(--t-warn)" : isAdventure ? "#b39a6a" : "var(--t-card-border)",
    boxShadow: isAdventure
      ? "inset 0 0 0 1px #7c6135, inset 0 0 0 2px rgba(255,236,200,.8), 0 3px 8px rgba(0,0,0,.35)"
      : undefined,
  };

  const xpColor = isAdventure ? "var(--t-xp)" : "var(--t-accent)";
  const metaColor = "var(--t-ink-soft)";
  const dividerColor = isAdventure ? "var(--t-divider)" : "var(--t-card-border)";
  const avatarSize = 54;

  // Urgency (flames) and importance (bolts), 0–5 each — same icons as the quest editor.
  const urgencyCount = Math.min(5, Math.max(0, Math.round(task.urgency)));
  const importanceCount = Math.min(5, Math.max(0, Math.round(task.importance)));

  const imageUrl = task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;
  const emoji = task.icon_source === "monster" ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji : null;

  function pick(action: QuestAction) {
    setMenu(null);
    setError(null);
    if (action === "edit") return setEditing(true);
    if (action === "calendar") return setScheduling(true);
    startTransition(async () => {
      try {
        if (action === "battle") {
          await toggleManualPriorityAction(task.id, !task.is_manual_priority);
        } else if (action === "delete") {
          await deleteTaskAction(task.id);
        } else {
          setDone(true);
          // Let the check finish its thud before the card leaves the list.
          await new Promise((r) => setTimeout(r, 800));
          const fd = new FormData();
          fd.set("taskId", task.id);
          await completeTaskAction(fd);
        }
      } catch (e) {
        setDone(false);
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const menuEl = (align: "left" | "right") => (
    <QuestActionMenu
      isAdventure={isAdventure}
      inBattle={task.is_manual_priority}
      onCalendar={task.is_on_calendar}
      align={align}
      anchor={menuAnchor}
      onPick={pick}
      onClose={() => setMenu(null)}
    />
  );

  return (
    <li
      ref={innerRef}
      data-task-id={task.id}
      // Explicitly false when this row isn't itself a drag source, so a press
      // inside a goal card on Board Detail doesn't start dragging the goal.
      draggable={draggable ?? false}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`hover-glow relative flex cursor-pointer flex-col rounded-xl px-3 pb-2.5 pt-2 ${
        draggable ? "active:cursor-grabbing" : ""
      } ${isPending ? "opacity-70" : ""}`}
      style={cardStyle}
    >
      {/* ⋯ menu, upper right */}
      <div className="absolute right-1 top-1 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Quest actions"
          aria-haspopup="menu"
          aria-expanded={menu === "dots"}
          onClick={(e) => {
            setMenuAnchor(e.currentTarget);
            setMenu((m) => (m === "dots" ? null : "dots"));
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5"
          style={{ color: "var(--t-ink-soft)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
        {menu === "dots" && menuEl("right")}
      </div>

      <div className="flex items-stretch gap-3">
        {/* Left: board tag centered over (and overlapping) the quest icon */}
        <div className="relative flex shrink-0 flex-col items-center" onClick={(e) => e.stopPropagation()}>
          {categoryLabel && (
            <span
              className="relative z-[2] -mb-2 max-w-[84px] truncate rounded-md px-2 py-px text-[11.5px] leading-tight"
              style={{
                background: isAdventure ? "#d0b991" : "var(--t-accent-soft)",
                border: `1px solid ${isAdventure ? "#8a7250" : "var(--t-card-border)"}`,
                color: isAdventure ? "var(--t-ink)" : "var(--t-accent)",
                boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,240,210,.6), 0 1px 2px rgba(0,0,0,.25)" : undefined,
              }}
            >
              {categoryLabel}
            </span>
          )}
          <button
            type="button"
            aria-label={`Actions for ${task.title}`}
            aria-haspopup="menu"
            aria-expanded={menu === "icon"}
            onClick={(e) => {
              setMenuAnchor(e.currentTarget);
              setMenu((m) => (m === "icon" ? null : "icon"));
            }}
            className="hover-glow flex items-center justify-center overflow-hidden rounded-full"
            style={{
              width: avatarSize,
              height: avatarSize,
              border: imageUrl || emoji ? `2px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}` : "none",
              background: imageUrl || emoji ? undefined : "transparent",
              marginTop: categoryLabel ? 0 : 4,
            }}
          >
            {done ? (
              <CheckMark checked isAdventure={isAdventure} />
            ) : imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL or /design asset
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : emoji ? (
              <span style={{ fontSize: 26 }}>{emoji}</span>
            ) : (
              <CheckMark checked={false} isAdventure={isAdventure} />
            )}
          </button>
          {menu === "icon" && menuEl("left")}
        </div>

        {/* Middle: title, description, due + urgency */}
        <div className="flex min-w-0 flex-1 flex-col justify-center pr-6 pt-1">
          <p
            className={`truncate text-[16.5px] font-bold leading-tight ${isAdventure ? "font-display" : ""}`}
            style={{ color: isOverdue ? "var(--t-warn)" : "var(--t-ink)" }}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="line-clamp-2 text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
              {task.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1" style={{ color: metaColor, fontSize: 12.5 }}>
            {task.is_on_calendar && task.scheduled_start && (
              <span className="flex items-center gap-1.5" style={isOverdue ? { color: "var(--t-warn)", fontWeight: 600 } : undefined}>
                {isAdventure ? (
                  // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                  <img src="/design/ui-calendar.png" alt="" width={14} height={14} />
                ) : (
                  "📅"
                )}
                {isOverdue
                  ? "Overdue"
                  : new Date(task.scheduled_start).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
              </span>
            )}
            {task.reschedule_count > 0 && (
              <span style={isWarned ? { color: "var(--t-warn)", fontWeight: 600 } : undefined}>
                &#8635; {task.reschedule_count}
                {isWarned && " — rescheduled often"}
              </span>
            )}
            <span className="flex items-center gap-2">
              {(task.is_on_calendar || task.reschedule_count > 0) && (
                <span style={{ width: 1, height: 14, background: dividerColor }} aria-hidden />
              )}
              <span className="flex items-center gap-0.5" title={`Urgency ${task.urgency.toFixed(1)}`}>
                {Array.from({ length: urgencyCount }).map((_, i) =>
                  isAdventure ? (
                    // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                    <img key={i} src="/design/ui-flame-sm.png" alt="" width={13} height={13} />
                  ) : (
                    <span key={i} style={{ color: "var(--t-clay)", fontSize: 12 }}>
                      &#9679;
                    </span>
                  )
                )}
              </span>
            </span>
          </div>
        </div>

        <div className="shrink-0" style={{ width: 1, background: dividerColor }} aria-hidden />

        {/* Right: time, XP, importance */}
        <div className="flex w-[76px] shrink-0 flex-col items-start justify-center gap-1 pt-5">
          {task.estimate_minutes != null && (
            <span className="flex items-center gap-1" style={{ color: "var(--t-ink)", fontSize: 13.5 }}>
              {isAdventure ? (
                // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                <img src="/design/ui-clock.png" alt="" width={15} height={15} />
              ) : (
                "⏱"
              )}
              {formatEstimate(task.estimate_minutes)}
            </span>
          )}
          <span
            className={`whitespace-nowrap ${isAdventure ? "font-display" : ""}`}
            style={{ color: xpColor, fontWeight: 700, fontSize: isAdventure ? 17 : 15 }}
          >
            {isAdventure ? `XP ${task.xp_value}` : `${task.xp_value} pts`}
          </span>
          <span className="flex items-center gap-0.5" title={`Importance ${task.importance.toFixed(1)}`}>
            {Array.from({ length: importanceCount }).map((_, i) =>
              isAdventure ? (
                // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                <img key={i} src="/design/ui-bolt.png" alt="" width={13} height={13} />
              ) : (
                <span key={i} style={{ color: "var(--t-accent)", fontSize: 13 }}>
                  &#9889;
                </span>
              )
            )}
          </span>
        </div>
      </div>

      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {scheduling &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-fade-in"
            style={{ background: "var(--t-overlay)" }}
            onClick={(e) => {
              e.stopPropagation();
              setScheduling(false);
            }}
          >
            <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <TaskScheduleControl task={task} theme={theme} startOpen onDone={() => setScheduling(false)} />
            </div>
          </div>,
          document.body
        )}

      {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
    </li>
  );
}

/** The quest's default "icon": a round badge with a greyed-out check. On
 * completion the same check turns green and thuds in (same motion as the
 * quest-complete screen). */
export function CheckMark({ checked, isAdventure, size = 54 }: { checked: boolean; isAdventure: boolean; size?: number }) {
  const check = Math.round(size * 0.87);
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        border: `2px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`,
        background: isAdventure ? "radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,.15))" : "var(--t-card)",
        boxShadow: isAdventure ? "inset 0 1px 3px rgba(0,0,0,.18)" : undefined,
      }}
    >
      <span
        className={checked ? "qc-card-check" : undefined}
        style={{
          width: check,
          height: check,
          display: "block",
          filter: checked ? "drop-shadow(0 0 6px rgba(110,230,80,.7)) drop-shadow(0 2px 3px rgba(0,0,0,.4))" : undefined,
        }}
      >
        <svg width={check} height={check} viewBox="0 0 24 24" fill="none" aria-hidden>
          {checked ? (
            <>
              <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#16300f" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#3fbf3a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.6 12.6 L9.6 16.6 L18.4 6.9" stroke="#8ff070" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
            </>
          ) : (
            <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="rgba(90,80,60,.28)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </span>
    </span>
  );
}
