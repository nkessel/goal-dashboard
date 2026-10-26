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
  box,
}: {
  /** The card's size on the grid. With it, Adventure draws a picture-book quest card. */
  box?: { w: number; h: number };
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

  if (isAdventure && box) {
    return (
      <>
        <QuestCard
          task={task}
          box={box}
          art={monsterImageUrl ?? (monsterEmoji ? null : creatureFor(task.id))}
          emoji={monsterEmoji ?? null}
          timeLabel={timeLabel}
          warned={isWarned}
          tint={tint}
          portrait={portrait}
          onOpen={() => setEditing(true)}
        />
        {editing && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
      </>
    );
  }

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

/** A quest's picture for the calendar: its portrait, else its creature. */
export function questArt(task: Task) {
  if ((task.icon_source === "ai" || task.icon_source === "library") && task.icon_key) return task.icon_key;
  return creatureFor(task.id);
}

/** Quests with no portrait yet still get a creature, the same one every time. */
const CREATURES = ["goblin", "boar", "bat", "golem", "venomroot", "dragon", "sorcerer"];
export function creatureFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `/design/icon-${CREATURES[hash % CREATURES.length]}.jpg`;
}

/**
 * A quest on the Adventure calendar, drawn like a card in a storybook: its
 * creature beside the title (or above it, in a tall narrow slot), and a
 * green seal once it's done. The layout follows the room the slot has.
 */
function QuestCard({
  task,
  box,
  art,
  emoji,
  timeLabel,
  warned,
  tint,
  portrait,
  onOpen,
}: {
  task: Task;
  box: { w: number; h: number };
  art: string | null;
  emoji: string | null;
  timeLabel?: string;
  warned: boolean;
  tint?: string;
  portrait: boolean;
  onOpen: () => void;
}) {
  const done = task.status === "completed";
  const { w, h } = box;
  const line = h < 30;
  // Narrow and tall enough: the creature stands above the title.
  const stack = !line && (portrait || w < 130) && h >= 54;
  const titlePx = w < 52 ? 11 : w < 110 ? 12.5 : 14;
  // Stacked, the creature takes what's left once the title (up to two lines, by a rough measure) has room.
  const titleLines = Math.min(2, Math.ceil((task.title.length * titlePx * 0.42) / Math.max(1, w - 8)));
  const artPx = line
    ? Math.max(0, Math.min(h - 6, 22))
    : stack
      ? Math.max(0, Math.min(w - 4, h - 12 - Math.ceil(titlePx * 1.12 * titleLines), 64))
      : Math.max(0, Math.min(h - 6, h >= 80 ? 64 : 52, w * 0.38));
  const showArt = artPx >= 16;
  const sealPx = Math.min(artPx, stack ? 24 : 26);
  const doneNote = done && !line && h >= (stack ? 64 : 44);
  const lines = Math.max(1, Math.floor((h - (stack && showArt ? (done ? sealPx : artPx) + 10 : 8) - (doneNote ? 13 : 0)) / (titlePx * 1.12)));

  return (
    <button
      type="button"
      title={`Edit "${task.title}"`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`cal-chip quest-card ${done ? "quest-card-done" : ""} flex h-full w-full min-w-0 overflow-hidden ${stack ? "flex-col items-center justify-start text-center" : "items-center text-left"}`}
      style={{
        gap: stack ? 3 : line ? 4 : 6,
        padding: line ? "1px 4px" : stack ? "5px 3px 4px" : "4px 6px 4px 4px",
        ...(tint && !done ? { backgroundImage: `linear-gradient(${tint}, ${tint}), linear-gradient(180deg, #fbf3dc, #eedcb3)` } : {}),
        ...(warned ? { borderColor: "var(--t-warn)" } : {}),
      }}
    >
      {done && showArt ? (
        <span className="quest-seal flex shrink-0 items-center justify-center rounded-full" style={{ width: sealPx, height: sealPx }}>
          <svg width="62%" height="62%" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : showArt ? (
        <span className="quest-art flex shrink-0 items-center justify-center overflow-hidden" style={{ width: artPx, height: artPx, borderRadius: artPx > 30 ? 8 : 5 }}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL or a static /design/ creature
            <img
              src={art}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              // A portrait that won't load gives way to the quest's creature.
              onError={(e) => {
                const fallback = creatureFor(task.id);
                if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
              }}
            />
          ) : (
            <span style={{ fontSize: artPx * 0.72, lineHeight: 1 }}>{emoji}</span>
          )}
        </span>
      ) : null}
      <span className={stack ? "w-full min-w-0" : "min-w-0 flex-1"}>
        <span
          lang="en" className="font-display [overflow-wrap:break-word] [hyphens:auto]"
          style={{
            color: "#3a2a14",
            fontSize: titlePx,
            fontWeight: 500,
            lineHeight: 1.12,
            overflow: "hidden",
            ...(line
              ? { display: "block", whiteSpace: "nowrap", textOverflow: "ellipsis" }
              : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, WebkitHyphens: "auto" }),
          }}
        >
          {task.title}
        </span>
        {doneNote && (
          <span className="block truncate" style={{ color: "#4e6a35", fontSize: 10.5, fontStyle: "italic", lineHeight: 1.2 }}>
            Completed
          </span>
        )}
        {!done && !stack && !line && timeLabel && h >= 52 && w >= 110 && (
          <span className="block truncate" style={{ color: "var(--t-ink-soft)", fontSize: 10.5, lineHeight: 1.2 }}>
            {timeLabel}
          </span>
        )}
      </span>
    </button>
  );
}
