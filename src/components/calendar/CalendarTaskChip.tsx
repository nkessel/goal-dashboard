import type { Task } from "@/lib/data/types";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { formatTimeRange } from "@/lib/calendar-dates";

/**
 * The time window a task should be plotted at on the calendar: its real
 * scheduled window when it has one, otherwise a short marker at its
 * completion time (spec: completed tasks show "at their scheduled (or
 * completed) time").
 */
export function getTaskDisplayWindow(task: Task): { start: Date; end: Date } {
  if (task.scheduled_start && task.scheduled_end) {
    return { start: new Date(task.scheduled_start), end: new Date(task.scheduled_end) };
  }
  const completed = task.completed_at ? new Date(task.completed_at) : new Date();
  return { start: completed, end: new Date(completed.getTime() + 30 * 60_000) };
}

export function CalendarTaskChip({
  task,
  theme = "calm",
  showTime = false,
  compact = false,
}: {
  task: Task;
  theme?: "calm" | "adventure";
  showTime?: boolean;
  compact?: boolean;
}) {
  const isAdventure = theme === "adventure";
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

  const iconSize = compact ? (isAdventure ? 22 : 18) : isAdventure ? 32 : 28;

  return (
    <div
      className="flex h-full w-full items-center overflow-hidden rounded-lg"
      style={{
        ...cardStyle,
        flexDirection: compact ? "column" : "row",
        justifyContent: compact ? "center" : "flex-start",
        gap: compact ? 2 : 8,
        padding: compact ? "4px 3px" : "6px 8px",
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
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

      <div className={compact ? "min-w-0 text-center" : "min-w-0 flex-1"}>
        <p
          className="truncate leading-tight"
          style={{
            color: "var(--t-ink)",
            fontSize: compact ? 9 : 12.5,
            fontWeight: 500,
            textDecoration: isCompleted && !isAdventure ? "line-through" : undefined,
          }}
        >
          {task.title}
        </p>
        {isCompleted && (
          <p
            className="truncate leading-tight"
            style={{ color: "var(--t-ink-soft)", fontSize: compact ? 8 : 10.5, opacity: 0.8 }}
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
    </div>
  );
}
