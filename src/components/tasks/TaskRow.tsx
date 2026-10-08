"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { completeTaskAction, deleteTaskAction, toggleManualPriorityAction } from "@/app/actions";
import { TaskScheduleControl } from "./TaskScheduleControl";
import { EditTaskModal } from "./EditTaskModal";
import { QuestActionMenu, type QuestAction } from "./QuestActionMenu";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
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

/** "Due today, 3:00 PM" / "Due tomorrow" / "Due Fri, Oct 9" — read like the mockup's "Due today". */
function dueLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Due today, ${time}`;
  if (diff === 1) return `Due tomorrow, ${time}`;
  if (diff > 1 && diff < 7) return `Due ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `Due ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
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
  behind,
}: {
  task: Task;
  /** A reward locked behind this quest: drawn as a card stacked behind it. */
  behind?: Task | null;
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

  const cardBase = isAdventure ? "var(--t-panel)" : "var(--t-card)";
  const cardStyle: React.CSSProperties = {
    backgroundColor: isOverdue ? "var(--t-warn-bg)" : cardBase,
    backgroundImage: [
      tint ? `linear-gradient(${tint}, ${tint})` : null,
      isAdventure && !isOverdue ? "url(/design/tex-parchment-2.jpg)" : null,
    ]
      .filter(Boolean)
      .join(", ") || undefined,
    backgroundSize: "384px 384px",
    backgroundRepeat: "repeat",
    borderStyle: "solid",
    borderWidth: isAdventure ? 2 : 1,
    borderColor: isWarnedCard ? "var(--t-warn)" : isAdventure ? "#c7a96f" : "var(--t-card-border)",
    boxShadow: isAdventure
      ? "inset 0 0 0 1px rgba(255,244,220,.75), inset 0 0 18px rgba(150,115,60,.18), 0 4px 12px rgba(0,0,0,.35)"
      : undefined,
  };

  const xpColor = isAdventure ? "var(--t-xp)" : "var(--t-accent)";
  const metaColor = "var(--t-ink-soft)";
  const dividerColor = isAdventure ? "var(--t-divider)" : "var(--t-card-border)";
  const avatarSize = 60;

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
          const res = await completeTaskAction(fd);
          celebrateQuest({
            taskId: task.id,
            title: task.title,
            description: task.description,
            tag: categoryLabel,
            xp: task.xp_value,
            iconSrc: imageUrl,
            totalXp: res?.totalXp ?? null,
            coinsEarned: res?.coinsEarned ?? 0,
            isReward: Boolean(task.reward_id),
          });
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
      className={behind ? "relative pt-7" : "relative"}
    >
      {/* A locked reward peeks out from behind its prerequisite quest. */}
      {behind && <LockedRewardCard reward={behind} />}
      <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`quest-card hover-glow relative flex cursor-pointer flex-col rounded-2xl px-3 pb-3 pt-2.5 ${behind ? "z-[1]" : ""} ${task.reward_id ? "reward-quest" : ""} ${
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
          className="quest-dots flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5"
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

      <div className="flex items-stretch gap-2 sm:gap-3">
        {/* Left: board tag centered over (and overlapping) the quest portrait.
            Quests without a goal get a quiet "+ Goal" tag in the same spot, so
            every card lines up and filing one is a click away. */}
        <div className="relative flex w-[66px] shrink-0 flex-col items-center sm:w-[80px]" onClick={(e) => e.stopPropagation()}>
          {task.reward_id ? (
            <span
              className="relative z-[2] -mb-2.5 flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-[11.5px] font-semibold leading-snug sm:px-2 sm:text-[12.5px]"
              style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 60%, #a88a3f)", border: "1px solid #5a4520", color: "#2a1c10", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}
            >
              ◆ Reward
            </span>
          ) : categoryLabel ? (
            <span
              className="relative z-[2] -mb-2.5 max-w-[76px] truncate rounded-md px-2 py-px text-[12.5px] leading-snug sm:max-w-[88px] sm:px-2.5 sm:text-[13px]"
              style={{
                background: isAdventure ? "linear-gradient(180deg,#e2cfa6,#ccb588)" : "var(--t-accent-soft)",
                border: `1px solid ${isAdventure ? "#8a7250" : "var(--t-card-border)"}`,
                color: isAdventure ? "var(--t-ink)" : "var(--t-accent)",
                boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,240,210,.7), 0 1px 3px rgba(0,0,0,.3)" : undefined,
              }}
            >
              {categoryLabel}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Put this quest on a quest board"
              className="relative z-[2] -mb-2.5 rounded-md border border-dashed px-2 py-px text-[12px] leading-snug opacity-70 hover:opacity-100"
              style={{
                background: isAdventure ? "rgba(243,231,203,.92)" : "var(--t-card)",
                borderColor: isAdventure ? "#a58c66" : "var(--t-card-border)",
                color: "var(--t-ink-soft)",
              }}
            >
              + Board
            </button>
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
              background: imageUrl || emoji ? (isAdventure ? "#f3e6c8" : undefined) : "transparent",
              boxShadow: imageUrl || emoji ? (isAdventure ? "0 0 0 3px rgba(217,180,95,.28), 0 2px 5px rgba(0,0,0,.25)" : undefined) : undefined,
            }}
          >
            {done ? (
              <CheckMark checked isAdventure={isAdventure} size={avatarSize} />
            ) : imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL or /design asset
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : emoji ? (
              <span style={{ fontSize: 26 }}>{emoji}</span>
            ) : (
              <CheckMark checked={false} isAdventure={isAdventure} size={avatarSize} />
            )}
          </button>
          {menu === "icon" && menuEl("left")}
        </div>

        {/* Middle: title, description, due + urgency */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pr-1 pt-2">
          <p
            className={`break-words leading-[1.15] ${isAdventure ? "text-[17.5px] font-semibold sm:text-[19px]" : "text-[16px] font-bold"}`}
            style={{ color: isOverdue ? "var(--t-warn)" : "var(--t-ink)" }}
          >
            {task.title}
          </p>
          {task.description && (
            <p className="break-words text-[13.5px] leading-snug sm:text-[14px]" style={{ color: isAdventure ? "#4d4535" : "var(--t-ink-soft)" }}>
              {task.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1" style={{ color: isAdventure ? "#3d3628" : metaColor, fontSize: 13.5 }}>
            {task.is_on_calendar && task.scheduled_start && (
              <span className="flex items-center gap-1.5" style={isOverdue ? { color: "var(--t-warn)", fontWeight: 600 } : undefined}>
                {isAdventure ? (
                  // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                  <img src="/design/ui-calendar.png" alt="" width={16} height={16} />
                ) : (
                  "📅"
                )}
                {isOverdue ? "Overdue" : dueLabel(task.scheduled_start)}
              </span>
            )}
            {task.reschedule_count > 0 && (
              <span style={isWarned ? { color: "var(--t-warn)", fontWeight: 600 } : undefined}>
                &#8635; {task.reschedule_count}
                {isWarned && " — rescheduled often"}
              </span>
            )}
            {urgencyCount > 0 && (
              <span className="flex items-center gap-2.5">
                {(task.is_on_calendar || task.reschedule_count > 0) && (
                  <span style={{ width: 1, height: 16, background: dividerColor }} aria-hidden />
                )}
                <span className="flex items-center gap-1" title={`Urgency ${task.urgency.toFixed(1)}`}>
                  {Array.from({ length: urgencyCount }).map((_, i) =>
                    isAdventure ? (
                      // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                      <img key={i} src="/design/ui-flame-sm.png" alt="" width={15} height={15} />
                    ) : (
                      <span key={i} style={{ color: "var(--t-clay)", fontSize: 12 }}>
                        &#9679;
                      </span>
                    )
                  )}
                </span>
              </span>
            )}
          </div>
          {(task.progress ?? 0) > 0 && (
            <div className="mt-2 flex items-center gap-2" title={`${task.progress}% done`}>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full"
                style={{
                  background: isAdventure ? "#2a2416" : "var(--t-card-border)",
                  border: isAdventure ? "1px solid #8a6c2c" : undefined,
                  boxShadow: isAdventure ? "inset 0 1px 2px rgba(0,0,0,.5)" : undefined,
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${task.progress}%`,
                    background: isAdventure ? "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" : "var(--t-accent)",
                  }}
                />
              </div>
              <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: isAdventure ? "#6f5a24" : "var(--t-ink-soft)" }}>
                {task.progress}%
              </span>
            </div>
          )}
        </div>

        <div className="shrink-0" style={{ width: 1, background: dividerColor }} aria-hidden />

        {/* Right: time, XP, importance */}
        <div className="flex w-[66px] shrink-0 flex-col items-start justify-center gap-1.5 pt-4 sm:w-[84px] sm:pl-1">
          {task.estimate_minutes != null && (
            <span className="flex items-center gap-1.5" style={{ color: "var(--t-ink)", fontSize: 15 }}>
              {isAdventure ? (
                // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                <img src="/design/ui-clock.png" alt="" width={16} height={16} />
              ) : (
                "⏱"
              )}
              {formatEstimate(task.estimate_minutes)}
            </span>
          )}
          <span
            className={`whitespace-nowrap leading-none ${isAdventure ? "text-[18px] sm:text-[21px]" : "text-[15px]"}`}
            style={{ color: xpColor, fontWeight: 700 }}
          >
            {isAdventure ? `XP ${task.xp_value}` : `${task.xp_value} pts`}
          </span>
          {importanceCount > 0 && (
            <span className="flex flex-wrap items-center gap-0.5 sm:gap-[3px]" title={`Importance ${task.importance.toFixed(1)}`}>
              {Array.from({ length: importanceCount }).map((_, i) =>
                isAdventure ? (
                  // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                  <img key={i} src="/design/ui-bolt.png" alt="" width={13} height={13} className="h-[11px] w-[11px] sm:h-[13px] sm:w-[13px]" />
                ) : (
                  <span key={i} style={{ color: "var(--t-accent)", fontSize: 13 }}>
                    &#9889;
                  </span>
                )
              )}
            </span>
          )}
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
    </div>
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

/** The reward waiting behind its prerequisite: a card peeking out above and to the right. */
function LockedRewardCard({ reward }: { reward: Task }) {
  const img = reward.icon_source === "ai" || reward.icon_source === "library" ? reward.icon_key : null;
  return (
    <div
      aria-label={`Locked reward: ${reward.title}`}
      className="parchment pointer-events-none absolute flex items-start gap-2 rounded-2xl px-3 pt-1.5"
      style={{
        zIndex: 0,
        top: 0,
        left: 14,
        right: -6,
        bottom: 26,
        transform: "rotate(1.4deg)",
        borderRadius: 16,
        filter: "saturate(.9) brightness(.94)",
      }}
    >
      <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full" style={{ border: "1px solid #8a6c2c", background: "#f3e6c8" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- reward portrait
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0 truncate text-[13.5px] font-semibold" style={{ color: "#4d4535" }}>
        🔒 {reward.title}
      </span>
      <span className="ml-auto shrink-0 text-[12px] italic" style={{ color: "#6b6252" }}>
        unlocks next
      </span>
    </div>
  );
}
