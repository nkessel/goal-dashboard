"use client";

import { useState } from "react";
import type { Task } from "@/lib/data/types";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { TaskActions } from "./TaskActions";
import { TaskScheduleControl } from "./TaskScheduleControl";
import { IconPicker } from "./IconPicker";
import { EditTaskModal } from "./EditTaskModal";

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
  const tint = rescheduleRedness(task.reschedule_count);
  const isAdventure = theme === "adventure";
  const isWarned = task.reschedule_count >= 3;
  // "Overdue" per HANDOFF.md §4: scheduled in the past, still open. Derived
  // here rather than stored — no data-model change.
  const isOverdue = isTaskOverdue(task);
  const isWarnedCard = isWarned || isOverdue;

  // Layer the redness tint over the card's own opaque base rather than using
  // it as the whole background — on Adventure's dark page background (this
  // row appears directly on it on the Home page), a bare translucent tint
  // composites too dark for --t-ink title text to stay legible.
  const cardStyle: React.CSSProperties = {
    background: isOverdue
      ? "var(--t-warn-bg)"
      : tint
        ? `linear-gradient(${tint}, ${tint}), ${isAdventure ? "var(--t-panel)" : "var(--t-card)"}`
        : isAdventure
          ? "var(--t-panel)"
          : "var(--t-card)",
    borderStyle: "solid",
    borderWidth: isAdventure ? 1.5 : 1,
    borderColor: isWarnedCard ? "var(--t-warn)" : isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    boxShadow: isAdventure
      ? "0 3px 8px rgba(0,0,0,.3), inset 0 0 0 1px rgba(255,255,255,.35)"
      : undefined,
  };

  const xpColor = isAdventure ? "var(--t-xp)" : "var(--t-accent)";
  const metaColor = isAdventure ? "var(--t-ink-soft)" : "var(--t-ink-soft)";
  const dividerColor = isAdventure ? "var(--t-divider)" : "var(--t-card-border)";
  const avatarSize = isAdventure ? 52 : 44;

  // Urgency (1–5 flames) and importance (1–3 bolts) — the real data model
  // keeps both on a continuous 1–5 scale (see PriorityMatrix), unlike the
  // mockup's fixed integer scales, so importance is rescaled onto the
  // 1–3 glyph count the design calls for.
  const urgencyCount = Math.min(5, Math.max(1, Math.round(task.urgency)));
  const importanceCount = Math.min(3, Math.max(1, Math.round(1 + ((task.importance - 1) / 4) * 2)));

  return (
    <li
      ref={innerRef}
      // Explicitly false (never just omitted) when this row isn't itself a
      // drag source: GoalList nests TaskRow inside each goal card's own
      // `draggable` <div> (for reordering goals). Without an explicit
      // `draggable=false` here, the browser walks up from any mousedown
      // inside this <li> — including the card-wide click-to-edit area added
      // for quest-card click-to-edit — to that ancestor and starts dragging
      // the *goal card* instead of registering the click, which is what
      // made both "click a quest" and "drag to reorder" feel broken/erratic
      // inside goal boards.
      draggable={draggable ?? false}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`hover-glow flex flex-col gap-2 rounded-2xl p-3.5 transition-transform hover:-translate-y-[1px] cursor-pointer ${
        draggable ? "active:cursor-grabbing" : ""
      }`}
      style={cardStyle}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Its own click swaps/generates the avatar instead of opening the
              task editor — stopPropagation inside IconPicker keeps this from
              also bubbling up to the card's own onClick above. 52px circle /
              1.5px border per HANDOFF.md §4 "creature portrait". */}
          <IconPicker
            taskId={task.id}
            currentIcon={task.icon_key}
            currentSource={task.icon_source}
            taskTitle={task.title}
            theme={theme}
            size={avatarSize}
            fallbackEmoji={isAdventure ? "❔" : "✦"}
          />
          <div className="min-w-0 flex-1">
            {categoryLabel && (
              <span
                className="mb-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 align-middle text-[10px] font-semibold"
                style={{
                  background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
                  border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
                  color: isAdventure ? "var(--t-gold)" : "var(--t-accent)",
                }}
              >
                {categoryLabel}
              </span>
            )}
            <p
              className={`truncate text-[15px] font-semibold ${isAdventure ? "font-display" : ""}`}
              style={{ color: isOverdue ? "var(--t-warn)" : "var(--t-ink)" }}
            >
              {task.title}
            </p>
            {task.description && (
              <p className="truncate text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                {task.description}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2" style={{ color: metaColor, fontSize: 12.5 }}>
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
              {/* Divider grouped together with the flames it introduces (not
                  a bare sibling in the flex-wrap row) so flex-wrap always
                  breaks *before* the pair rather than stranding the divider
                  at the end of the previous line — and only shown at all
                  when there's a badge to its left to separate from, instead
                  of rendering as an orphan mark next to nothing. */}
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
        </div>

        <div className="hidden shrink-0 sm:block" style={{ width: 1, background: dividerColor }} aria-hidden />

        <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-[64px] sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
          {task.xp_value > 0 && (
            <span
              className={isAdventure ? "font-display" : ""}
              style={{ color: xpColor, fontWeight: 700, fontSize: isAdventure ? 17 : 14 }}
            >
              {isAdventure ? "XP " : ""}
              {task.xp_value}
              {!isAdventure ? " pts" : ""}
            </span>
          )}
          {task.estimate_minutes != null && (
            <span className="flex items-center gap-1" style={{ color: metaColor, fontSize: 11.5 }}>
              {isAdventure ? (
                // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                <img src="/design/ui-clock.png" alt="" width={12} height={12} />
              ) : (
                "⏱"
              )}
              {formatEstimate(task.estimate_minutes)}
            </span>
          )}
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

      {/* TaskActions' pin/complete buttons need real width for their text
          labels ("Add to Today's Battle", "Defeat") — they used to be
          crammed into the ~64px XP/estimate/importance column above, which
          only ever had room for compact icons, and squeezed the buttons
          into an overlapping, circular mess once that column's fixed width
          kicked in (the sm: breakpoint). Giving them their own full-width
          row, same pattern as TaskScheduleControl below, fixes that. */}
      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
        <TaskActions task={task} theme={theme} />
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <TaskScheduleControl task={task} theme={theme} />
      </div>

      {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
    </li>
  );
}
