"use client";

import { useState } from "react";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import type { Task } from "@/lib/data/types";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { formatTimeRange } from "@/lib/calendar-dates";

import { getTaskDisplayWindow } from "@/lib/calendar-task-window";
export { getTaskDisplayWindow };

export function CalendarTaskChip({
  task,
  theme = "calm",
  showTime = false,
  compact = false,
  timeLabel,
  oneLine = false,
  portrait = false,
}: {
  /** The quest's portrait large above its title, like a card on a quest map. */
  portrait?: boolean;
  task: Task;
  theme?: "calm" | "adventure";
  showTime?: boolean;
  compact?: boolean;
  /** Shown under the title in the grid (Google-style "9 – 10am"). */
  timeLabel?: string;
  /** Too short for two lines: "Title, 9am" on one line. */
  oneLine?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const [editing, setEditing] = useState(false);
  const isCompleted = task.status === "completed";
  const isWarned = !isCompleted && task.reschedule_count >= 3;
  const tint = !isCompleted ? rescheduleRedness(task.reschedule_count) : undefined;

  // "ai" (freshly generated) and "library" (picked from the shared icon
  // library) both just hold a plain image URL now; "monster" is the old
  // emoji picker's source, kept only so any pre-existing data still renders.
  const monsterImageUrl =
    task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;
  const monsterEmoji =
    task.icon_key && task.icon_source === "monster" ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji : null;

  const { start, end } = getTaskDisplayWindow(task);

  const cardStyle: React.CSSProperties = {
    // The redness tint is a translucent rgba() — layered directly as the
    // background it composites against whatever sits behind the chip (the
    // page itself in Day/Week views), which in Adventure theme is a dark
    // green gradient and leaves --t-ink title text illegible. Layering it
    // as a gradient "wash" over the chip's own opaque base color instead
    // keeps the tint visible while guaranteeing a light surface underneath.
    background: isCompleted
      ? isAdventure
        ? "var(--t-panel)"
        : "var(--t-card)"
      : tint
        ? `linear-gradient(${tint}, ${tint}), ${isAdventure ? "var(--t-panel)" : "var(--t-accent-soft)"}`
        : isAdventure
          ? "var(--t-panel)"
          : "var(--t-accent-soft)",
    borderStyle: "solid",
    borderWidth: isAdventure ? 1.5 : isCompleted || isWarned ? 1 : 0,
    borderColor: isCompleted
      ? "var(--t-good)"
      : isWarned
        ? "var(--t-warn)"
        : isAdventure
          ? "var(--t-panel-border)"
          : "transparent",
    opacity: isCompleted && !isAdventure ? 0.65 : 1,
  };

  // Portrait cards need a little height; very short slots fall back to a line.
  const tall = portrait && !oneLine;
  const iconSize = tall ? 46 : compact ? 18 : isAdventure ? 32 : 28;

  return (
    <>
    <button
      type="button"
      title={`Edit "${task.title}"`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`cal-chip flex h-full w-full min-w-0 overflow-hidden rounded-md ${tall ? "items-center justify-center text-center" : `text-left ${compact ? "items-start" : "items-center"}`}`}
      style={{
        ...cardStyle,
        ...(isAdventure ? { borderLeft: `3px solid ${isCompleted ? "var(--t-good)" : isWarned ? "var(--t-warn)" : "#a88a3f"}` } : {}),
        flexDirection: tall ? "column" : "row",
        gap: tall ? 3 : compact ? 4 : 8,
        padding: tall ? "5px 4px" : compact ? "3px 4px" : "6px 8px",
      }}
    >
      <div
        className={`${compact && !tall ? "hidden" : "flex"} shrink-0 items-center justify-center overflow-hidden ${tall ? "rounded-lg" : "rounded-full"}`}
        style={{
          width: iconSize,
          height: iconSize,
          border: isAdventure ? "1.5px solid var(--t-panel-border)" : undefined,
          background: isAdventure ? undefined : "#fff",
        }}
      >
        {isCompleted ? (
          <svg width={iconSize - 4} height={iconSize - 4} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="var(--t-good)" />
            <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2" fill="none" />
          </svg>
        ) : monsterImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
          <img src={monsterImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span style={{ fontSize: iconSize - 8 }}>{monsterEmoji || (isAdventure ? "❔" : "✦")}</span>
        )}
      </div>

      <div className={tall ? "w-full min-w-0" : "min-w-0 flex-1"}>
        <p
          className={tall ? "line-clamp-3 leading-[1.15]" : oneLine ? "truncate leading-tight" : compact ? "line-clamp-2 leading-[1.15] [overflow-wrap:normal] [word-break:normal]" : "truncate leading-tight"}
          style={{
            color: "var(--t-ink)",
            fontSize: compact ? 11.5 : 13.5,
            fontWeight: 600,
            textDecoration: isCompleted && !isAdventure ? "line-through" : undefined,
          }}
        >
          {oneLine && timeLabel ? (
            <>
              {task.title}
              <span style={{ fontWeight: 400, color: "var(--t-ink-soft)" }}>, {timeLabel}</span>
            </>
          ) : (
            task.title
          )}
        </p>
        {timeLabel && !oneLine && !tall && (
          <p className="truncate leading-tight" style={{ color: "var(--t-ink-soft)", fontSize: 10.5 }}>
            {timeLabel}
          </p>
        )}
        {isCompleted && (
          <p
            className="truncate leading-tight"
            style={{ color: "var(--t-ink-soft)", fontSize: compact ? 10 : 11.5, opacity: 0.8 }}
          >
            Completed
          </p>
        )}
        {showTime && !isCompleted && (
          <p className="truncate leading-tight" style={{ color: "var(--t-ink-soft)", fontSize: 10.5 }}>
            {formatTimeRange(start, end)}
            {isWarned && (
              <span style={{ color: "var(--t-warn)", fontWeight: 600 }}>
                {" "}
                · rescheduled {task.reschedule_count}×
              </span>
            )}
          </p>
        )}
      </div>
    </button>
    {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
    </>
  );
}
