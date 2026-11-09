"use client";

import { useQuestPlace } from "@/lib/use-quest-places";
import { progressWords } from "@/lib/progress-words";
import { stopKeysButSave } from "@/lib/stop-keys";
import { FileChips } from "@/components/ui/FileChips";
import { Linked } from "@/components/ui/Linked";

import { TimeToken } from "@/components/xp/NightFields";
import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { useOfflineQuest, saveOrQueue } from "@/lib/offline";
import { Gem } from "@/components/ui/Gem";
import { useRewardGem } from "@/lib/use-reward-gems";
import { completeTaskAction, deleteTaskAction, archiveTaskAction, toggleManualPriorityAction, setTaskPlacementAction, snoozeQuestAction, undoSnoozeAction, snoozeQuestUntilAction, undoSnoozeUntilAction, setNextStepAction, moveTaskToBoardAction } from "@/app/actions";
import { TaskScheduleControl } from "./TaskScheduleControl";
import { EditTaskModal } from "./EditTaskModal";
import { earlyBirdBonus, earlyBirdCoins, roomToFinishEarly } from "@/lib/next-action";
import { EarlyBonusPopup } from "./EarlyBonusFields";
import { SnoozePicker, type SnoozeChoice } from "./SnoozePicker";
import { QuestActionMenu, SnoozeGlyph, type QuestAction } from "./QuestActionMenu";
import { SequenceDialog, SequenceStack, stackPad } from "./Sequence";
import { StepsTray } from "./StepsTray";
import { SwipeReveal } from "@/components/ui/SwipeReveal";
import { celebrateQuest, updateQuestCelebration } from "@/components/celebration/QuestCelebrationHost";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { QuestMonogram } from "./QuestMonogram";
import { openFocusMode } from "@/lib/focus-timer";
import { coinsForXp } from "@/lib/coins";
import { DateField } from "@/components/ui/DateField";
import { fillFor, useScaleColors, useScaleStyle, type ScaleKey } from "@/components/ui/LevelScales";
import { Fold, useClosing } from "@/components/ui/Fold";
import { useProgressUnit, saveProgressUnit } from "@/lib/use-progress-units";
import { pctOf, unitLabel, type ProgressUnit } from "@/lib/progress-units";
import { setTaskProgressAction } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";

/** Whether a task is overdue: scheduled in the past and not yet completed.
 * Kept as a plain helper (not inlined in the component) so the impure
 * `Date.now()` read isn't taken during render itself. */
function isTaskOverdue(task: Task): boolean {
  if (task.status !== "open") return false;
  const when = task.due_at ?? (task.is_on_calendar ? task.scheduled_start : null);
  return !!when && new Date(when).getTime() < Date.now();
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

/** The due day in a word, for the card's right column: "Today" / "Tomorrow" / "Thu" / "Nov 10" (no clock time: owner, Nov 2). */
function dueShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "25m" / "1h" / "1h 30m" — compact estimate format for the card's clock row. */
function formatEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function TaskRow({
  task: givenTask,
  theme = "calm",
  categoryLabel,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  innerRef,
  behind,
  sortable,
  listMoves,
  onEditorClose,
  compact = false,
}: {
  task: Task;
  /** A smaller card (on the map): one line of description. */
  compact?: boolean;
  /** Called after the editor opened from this card closes (e.g. to close a preview popup too). */
  onEditorClose?: () => void;
  /** On a list that can update instantly (Today): move or drop this card
   * right away, then save. `revert` puts it back if the save fails. */
  listMoves?: {
    move: (to: "priority" | "other" | null) => void;
    revert: (message: string) => void;
    /** A short note under the lists, with an optional Undo. */
    notify?: (n: { text: string; undo?: () => Promise<void> }) => void;
  };
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
  /** dnd-kit sortable wiring (pointer + touch dragging with animated reflow). */
  sortable?: {
    setNodeRef: (el: HTMLElement | null) => void;
    style: React.CSSProperties;
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners: Record<string, unknown> | undefined;
    isDragging: boolean;
  };
}) {
  // Edited offline and not synced yet: show it as edited (the screen may be the copy kept on the device).
  const task = useOfflineQuest(givenTask);
  const rewardGem = useRewardGem(task.reward_id);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // A quest with steps: a tap slides out its checklist instead of opening the editor.
  const [bonusOpen, setBonusOpen] = useState(false);
  // Counted in pages (or anything) instead of percent, and the little stepper to log it from the card.
  const countUnit = useProgressUnit(task.id);
  const place = useQuestPlace(task.id);
  const [logOpen, setLogOpen] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeAt, setSnoozeAt] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const [tray, setTrayOpen] = useState(false);
  // Once opened, the steps stay mounted so the tray can slide closed too.
  const [trayEver, setTrayEver] = useState(false);
  const setTray = (v: boolean | ((t: boolean) => boolean)) => {
    setTrayEver(true);
    setTrayOpen(v);
  };
  const hasSteps = (task.steps_total ?? 0) > 0 && task.status === "open";
  // "Edit first" from Already completed: when the editor closes, the day picker comes back.
  const [backToEarlier, setBackToEarlier] = useState(false);
  const [menu, setMenu] = useState<"icon" | "dots" | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [doneEarlier, setDoneEarlier] = useState(false);
  const [sequencing, setSequencing] = useState(false);
  const queue = task.behind ?? [];
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const liRef = useRef<HTMLLIElement | null>(null);
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
  const avatarSize = compact ? 44 : 60;
  // Tiny tasks: half height, with just a check box (or a small portrait if one was added).
  const tiny = Boolean(task.is_tiny) && !compact;

  // Importance (trophies) and urgency (fire), 0–5 each — same icons as the quest editor.
  const importanceCount = Math.min(5, Math.max(0, Math.round(task.importance)));
  const urgencyCount = Math.min(5, Math.max(0, Math.round(task.urgency ?? 0)));

  const imageUrl = task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;
  const emoji = task.icon_source === "monster" ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji : null;

  /** Completed on another day (or earlier today): pays now, shows in today's victories marked with its day. */
  function completeEarlier(when: Date) {
    setDoneEarlier(false);
    setError(null);
    startTransition(async () => {
      try {
        if (listMoves) {
          await slideOut(liRef.current);
          listMoves.move(null);
        } else setDone(true);
        const fd = new FormData();
        fd.set("taskId", task.id);
        fd.set("completedAt", when.toISOString());
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
      } catch (e) {
        resetSlide(liRef.current);
        setDone(false);
        if (listMoves) listMoves.revert(e instanceof Error ? e.message : "Couldn't save that.");
        else setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  /** Snooze it: off Today now, back when chosen (or at the top of tomorrow's plan). Undo puts it back. */
  function snoozeNow(choice: SnoozeChoice) {
    setSnoozing(false);
    if ("until" in choice) {
      startTransition(async () => {
        if (listMoves) {
          await slideOut(liRef.current);
          listMoves.move(null);
        }
        try {
          const prev = await snoozeQuestUntilAction(task.id, choice.until.toISOString());
          listMoves?.notify?.({ text: `Snoozed ${choice.label}: ${task.title}`, undo: () => undoSnoozeUntilAction(task.id, prev) });
        } catch (e) {
          resetSlide(liRef.current);
          if (listMoves) listMoves.revert(e instanceof Error ? e.message : "Couldn't snooze that quest — try again.");
          else setError(e instanceof Error ? e.message : "Couldn't snooze that quest.");
        }
      });
      return;
    }
    startTransition(async () => {
      if (listMoves) {
        await slideOut(liRef.current);
        listMoves.move(null);
      }
      try {
        const prev = await snoozeQuestAction(task.id);
        listMoves?.notify?.({ text: `Snoozed until tomorrow: ${task.title}`, undo: () => undoSnoozeAction(task.id, prev) });
      } catch (e) {
        resetSlide(liRef.current);
        if (listMoves) listMoves.revert(e instanceof Error ? e.message : "Couldn't snooze that quest — try again.");
        else setError(e instanceof Error ? e.message : "Couldn't snooze that quest.");
      }
    });
  }

  /** Move › a quest board: off Today, filed under that board. */
  function moveToBoard(boardId: string, label: string) {
    setMenu(null);
    setError(null);
    startTransition(async () => {
      if (listMoves) {
        await slideOut(liRef.current);
        listMoves.move(null);
      }
      try {
        await moveTaskToBoardAction(task.id, boardId);
        await setTaskPlacementAction(task.id, "none");
        const prev = task.board_id ?? null;
        listMoves?.notify?.({ text: `Moved to ${label}: ${task.title}`, undo: async () => (await moveTaskToBoardAction(task.id, prev), await setTaskPlacementAction(task.id, "today")) });
        if (!listMoves) router.refresh();
      } catch (e) {
        if (listMoves) {
          resetSlide(liRef.current);
          listMoves.revert(e instanceof Error ? e.message : "Couldn't move that quest — try again.");
        } else setError(e instanceof Error ? e.message : "Couldn't move that quest.");
      }
    });
  }

  function pick(action: QuestAction, fromMenu = true) {
    setMenu(null);
    setError(null);
    if (action === "edit") return setEditing(true);
    if (action === "calendar") return setScheduling(true);
    if (action === "focus") return openFocusMode({ ...task, categoryLabel });
    if (action === "earlier") return setDoneEarlier(true);
    if (action === "sequence") return setSequencing(true);
    if (action === "board" && task.board_id) return router.push(`/boards/${task.board_id}`);
    if (action === "nextstep") {
      startTransition(async () => {
        try {
          await setNextStepAction(task.id);
          listMoves?.notify?.({ text: `Next step: ${task.title}` });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't set that.");
        }
      });
      return;
    }
    if (action === "snooze") {
      // From the menu: choose how long (swiping snoozes until tomorrow straight away).
      if (fromMenu) {
        const r = liRef.current?.getBoundingClientRect();
        setSnoozeAt(r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null);
        return setSnoozing(true);
      }
      return snoozeNow({ tomorrow: true });
    }
    if (listMoves && (action === "battle" || action === "offtoday" || action === "delete" || action === "archive")) {
      // Leave the list right away (slide left, fade, close the gap), then save.
      const to = action === "battle" ? (task.is_manual_priority ? "other" : "priority") : null;
      startTransition(async () => {
        await slideOut(liRef.current);
        listMoves.move(to);
        try {
          if (action === "battle") await toggleManualPriorityAction(task.id, !task.is_manual_priority);
          else if (action === "offtoday") await setTaskPlacementAction(task.id, "none");
          else if (action === "archive") await archiveTaskAction(task.id);
          else await deleteTaskAction(task.id);
        } catch (e) {
          resetSlide(liRef.current);
          listMoves.revert(e instanceof Error ? e.message : "Couldn't move that quest — try again.");
        }
      });
      return;
    }
    startTransition(async () => {
      try {
        if (action === "battle") {
          await toggleManualPriorityAction(task.id, !task.is_manual_priority);
        } else if (action === "offtoday") {
          await setTaskPlacementAction(task.id, "none");
        } else if (action === "delete") {
          await deleteTaskAction(task.id);
        } else if (action === "archive") {
          await archiveTaskAction(task.id);
        } else {
          setDone(true);
          // Save in the background; celebrate as soon as the check has landed
          // (the real totals fill in when the server answers).
          // Offline, the check waits on this device and the server pays it once it's back.
          const req = saveOrQueue("completeQuest", { id: task.id, at: new Date().toISOString() }).then((r) => (r.queued ? null : r.result));
          await new Promise((r) => setTimeout(r, 520));
          celebrateQuest({
            taskId: task.id,
            title: task.stand_in ? task.stand_in.title : task.title,
            description: task.description,
            tag: categoryLabel,
            xp: task.xp_value,
            iconSrc: imageUrl,
            totalXp: null,
            coinsEarned: task.coin_value ?? coinsForXp(task.xp_value),
            isReward: Boolean(task.reward_id),
          });
          try {
            const res = await req;
            if (res) updateQuestCelebration({ taskId: task.id, totalXp: res.totalXp ?? null, coinsEarned: res.coinsEarned ?? 0 });
            // A stand-in stays: it moves on to the next assignment.
            if (task.stand_in) {
              setDone(false);
              router.refresh();
            }
          } catch (e) {
            updateQuestCelebration({ taskId: task.id, failed: true });
            throw e;
          }
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
      isReward={Boolean(task.reward_id)}
      onToday={task.is_manual_priority || task.in_additional !== false}
      onCalendar={task.is_on_calendar}
      canSnooze={Boolean(listMoves) && task.status === "open"}
      onBoard={Boolean(task.board_id)}
      inSequence={queue.length > 0 || Boolean(task.locked_by_task_id && !task.reward_id)}
      align={align}
      anchor={menuAnchor}
      onPick={pick}
      onMoveToBoard={task.is_manual_priority ? moveToBoard : undefined}
      onClose={() => setMenu(null)}
    />
  );

  return (
    <li
      ref={(el) => {
        liRef.current = el;
        innerRef?.(el);
        sortable?.setNodeRef(el);
      }}
      {...(sortable ? sortable.attributes : {})}
      {...((sortable?.listeners ?? {}) as React.HTMLAttributes<HTMLLIElement>)}
      data-task-id={task.id}
      // Explicitly false when this row isn't itself a drag source, so a press
      // inside a goal card on Board Detail doesn't start dragging the goal.
      draggable={draggable ?? false}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={behind ? "relative pt-7" : "relative"}
      style={{
        ...(sortable ? { ...sortable.style, opacity: sortable.isDragging ? 0.35 : 1, touchAction: "manipulation", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } : {}),
        ...(queue.length ? { paddingTop: stackPad(queue.length) } : {}),
      }}
    >
      {/* A locked reward peeks out from behind its prerequisite quest. */}
      {behind && <LockedRewardCard reward={behind} />}
      {/* The quests waiting after this one, stacked underneath. */}
      {queue.length > 0 && <SequenceStack queue={queue} isAdventure={isAdventure} onEdit={() => setSequencing(true)} />}
      {/* On Today, swipe right to snooze it until tomorrow. */}
      <SwipeReveal
        side="left"
        label="Snooze"
        icon={<SnoozeGlyph size={22} />}
        background="linear-gradient(180deg,#56669c,#2f3a68)"
        color="#f6ecd2"
        disabled={!listMoves || task.status !== "open"}
        onAction={() => pick("snooze", false)}
      >
      <div
      onClick={() => (hasSteps && !done ? setTray((t) => !t) : setEditing(true))}
      aria-expanded={hasSteps ? tray : undefined}
      onContextMenu={(e) => {
        // Right-click opens the same menu as ⋯.
        if ((e.target as Element).closest("input,textarea,a")) return;
        const dots = e.currentTarget.querySelector<HTMLElement>(".quest-dots");
        if (!dots) return;
        e.preventDefault();
        setMenuAnchor(dots);
        setMenu("dots");
      }}
      title={hasSteps ? "Click for its sub-quests · right-click for more" : "Click to edit · right-click for more"}
      className={`quest-card hover-glow relative flex cursor-pointer flex-col ${tiny ? "tiny-quest rounded-xl py-1.5 pl-2.5 pr-10" : "rounded-2xl px-3 pb-3 pt-2.5"} ${behind || queue.length ? "z-[1]" : ""} ${task.reward_id ? "reward-quest" : ""} ${
        draggable ? "active:cursor-grabbing" : ""
      } ${isPending ? "opacity-70" : ""}`}
      style={cardStyle}
    >
      {/* ⋯ menu, upper right (centred on a tiny task) */}
      <div className={`absolute right-1 z-10 ${tiny ? "top-1/2 -translate-y-1/2" : "top-1"}`} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label="Quest actions"
          aria-haspopup="menu"
          aria-expanded={menu === "dots"}
          onClick={(e) => {
            setMenuAnchor(e.currentTarget);
            setMenu((m) => (m === "dots" ? null : "dots"));
          }}
          // A finger-sized target (owner, Nov 3: "⋯ opens the steps tray" — a near miss landed on the card).
          className="quest-dots -mr-1 -mt-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-black/5"
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
      {/* Outside both card layouts: a tiny quest's Snooze never opened before (it sat in the full card's branch). */}
      {snoozing && <SnoozePicker title={task.title} anchor={snoozeAt} onPick={snoozeNow} onClose={() => setSnoozing(false)} />}

      {tiny ? (
        <div className="flex min-h-[34px] items-center gap-2.5">
          <div className="relative flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
            {imageUrl || emoji ? (
              // A portrait added in the editor: small, and still opens the quest's actions.
              <button
                type="button"
                aria-label={`Actions for ${task.title}`}
                aria-haspopup="menu"
                aria-expanded={menu === "icon"}
                onClick={(e) => {
                  setMenuAnchor(e.currentTarget);
                  setMenu((m) => (m === "icon" ? null : "icon"));
                }}
                className="hover-glow flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full"
                style={{ border: done ? "none" : `2px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, background: isAdventure ? "#f3e6c8" : undefined }}
              >
                {done ? (
                  <CheckMark checked isAdventure={isAdventure} size={34} />
                ) : imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL or /design asset
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span style={{ fontSize: 18 }}>{emoji}</span>
                )}
              </button>
            ) : (
              <TinyCheckBox checked={done} disabled={isPending || done || task.status !== "open"} isAdventure={isAdventure} label={`Complete ${task.title}`} onCheck={() => pick("complete")} />
            )}
            {menu === "icon" && menuEl("left")}
          </div>
          <p
            dir="auto"
            className={`user-text m-0 min-w-0 flex-1 break-words leading-[1.15] ${isAdventure ? "text-[16px] font-semibold" : "text-[15px] font-bold"}`}
            style={{ color: isOverdue ? "var(--t-warn)" : "var(--t-ink)" }}
          >
            {task.title}
            {(task.steps_total ?? 0) > 0 && (
              <span className="ml-1.5 whitespace-nowrap text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                {progressWords(task.steps_done ?? 0, task.steps_total ?? 0)}
              </span>
            )}
          </p>
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[13px]" style={{ color: isAdventure ? "#3d3628" : metaColor }}>
            {/* The same clock as the full quest cards (owner, Nov 2). */}
            {task.estimate_minutes != null && (
              <span className="flex items-center gap-1">
                {isAdventure ? (
                  // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                  <img src="/design/ui-clock.png" alt="" width={14} height={14} />
                ) : (
                  "⏱"
                )}
                {formatEstimate(task.estimate_minutes)}
              </span>
            )}
            {task.xp_value > 0 && (
              <span className="font-bold" style={{ color: xpColor }}>
                {isAdventure ? `${task.xp_value} XP` : `${task.xp_value} pts`}
              </span>
            )}
          </span>
        </div>
      ) : (
      <div className={`flex items-stretch ${compact ? "gap-1.5" : "gap-2 sm:gap-3"}`}>
        {/* Left: board tag centered over (and overlapping) the quest portrait.
            Quests without a goal get a quiet "+ Goal" tag in the same spot, so
            every card lines up and filing one is a click away. */}
        <div className={`relative flex shrink-0 flex-col items-center ${compact ? "w-[52px]" : "w-[66px] sm:w-[80px]"}`} onClick={(e) => e.stopPropagation()}>
          {task.reward_id ? (
            <span
              className="relative z-[2] -mb-2.5 flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-[11.5px] font-semibold leading-snug sm:px-2 sm:text-[12.5px]"
              style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 60%, #a88a3f)", border: "1px solid #5a4520", color: "#2a1c10", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }}
            >
              <Gem kind={rewardGem} size={13} />
              Reward
            </span>
          ) : categoryLabel ? (
            <span
              className={`relative z-[2] -mb-2.5 truncate rounded-md py-px leading-snug ${compact ? "max-w-[60px] px-1.5 text-[11.5px]" : "max-w-[76px] px-2 text-[12.5px] sm:max-w-[88px] sm:px-2.5 sm:text-[13px]"}`}
              style={{
                background: isAdventure ? "linear-gradient(180deg,#e2cfa6,#ccb588)" : "var(--t-accent-soft)",
                border: `1px solid ${isAdventure ? "#8a7250" : "var(--t-card-border)"}`,
                color: isAdventure ? "var(--t-ink)" : "var(--t-accent)",
                boxShadow: isAdventure ? "inset 0 1px 0 rgba(255,240,210,.7), 0 1px 3px rgba(0,0,0,.3)" : undefined,
              }}
            >
              {categoryLabel}
            </span>
          ) : task.board_id ? null : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              title="Put this quest on a quest board"
              className="tap-pad relative z-[2] -mb-2.5 rounded-md border border-dashed px-2 py-px text-[12px] leading-snug opacity-70 hover:opacity-100"
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
              border: imageUrl || emoji || !done ? `2px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}` : "none",
              background: imageUrl || emoji || !done ? (isAdventure ? "#f3e6c8" : undefined) : "transparent",
              boxShadow: imageUrl || emoji || !done ? (isAdventure ? "0 0 0 3px rgba(217,180,95,.28), 0 2px 5px rgba(0,0,0,.25)" : undefined) : undefined,
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
              <QuestMonogram id={task.id} title={task.title} size={avatarSize} />
            )}
          </button>
          {menu === "icon" && menuEl("left")}
        </div>

        {/* Middle: title, description, due + urgency */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pr-1 pt-2">
          <p
            dir="auto"
            className={`user-text break-words leading-[1.15] ${compact ? (isAdventure ? "text-[15.5px] font-semibold" : "text-[14.5px] font-bold") : isAdventure ? "text-[17.5px] font-semibold sm:text-[19px]" : "text-[16px] font-bold"}`}
            style={{ color: isOverdue ? "var(--t-warn)" : "var(--t-ink)" }}
          >
            {task.title}
          </p>
          {task.stand_in && (
            <p className="m-0 line-clamp-2 text-[12.5px] leading-snug" style={{ color: isAdventure ? "#4d4535" : "var(--t-ink-soft)" }} title={`This quest stands for ${task.stand_in.board ?? "a board"}: it follows its current assignment`}>
              <b style={{ color: isAdventure ? "#6b4a12" : "var(--t-ink)" }}>Now:</b>{" "}
              {task.stand_in.board_id ? (
                <button
                  type="button"
                  className="underline decoration-dotted underline-offset-2"
                  title={`Open ${task.stand_in.board ?? "its board"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/boards/${task.stand_in!.board_id}`);
                  }}
                >
                  {task.stand_in.title}
                </button>
              ) : (
                task.stand_in.title
              )}
              {task.stand_in.next_step && <span> · next: {task.stand_in.next_step}</span>}
            </p>
          )}
          {task.stands_for && task.stand_in === null && (
            <p className="m-0 text-[12.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
              Nothing waiting on its board right now
            </p>
          )}
          {task.description && !compact && (
            <p dir="auto" className={`user-text line-clamp-2 break-words text-[12.5px] leading-snug sm:text-[13px]`} style={{ color: isAdventure ? "#4d4535" : "var(--t-ink-soft)" }}>
              <Linked text={task.description} />
            </p>
          )}
          {place && (
            <p className="m-0 mt-0.5 flex items-center gap-1 truncate text-[12.5px]" style={{ color: isAdventure ? "#5a4a2c" : "var(--t-ink-soft)" }} title={`Where: ${place}`}>
              <span aria-hidden>📍</span>
              <span className="truncate">{place}</span>
            </p>
          )}
          <FileChips files={task.attachments} className="mt-1" />
          <div className={`${compact ? "mt-1" : "mt-1.5"} flex flex-wrap items-center gap-x-2.5 gap-y-1 empty:hidden`} style={{ color: isAdventure ? "#3d3628" : metaColor, fontSize: compact ? 12.5 : 13.5 }}>
            {/* The due day sits in the right column, under the bars (owner, Nov 2: no extra line for it). */}
            {(() => {
              // Get ahead of the deadline: finishing early pays a bonus. The pill opens its choices;
              // with none set (and time to spare), a quiet invitation to choose one.
              if (task.status !== "open" || !task.due_at) return null;
              const bonus = earlyBirdBonus(task);
              const coins = earlyBirdCoins(task);
              const roomy = roomToFinishEarly(task);
              if (bonus <= 0 && coins <= 0 && (!roomy || task.early_bonus_xp === 0)) return null;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBonusOpen(true);
                  }}
                  className="-ml-1 whitespace-nowrap rounded-full px-1.5 text-[0.9em] font-semibold leading-[1.5]"
                  style={bonus > 0 || coins > 0 ? { color: isAdventure ? "#4d6b1f" : "var(--t-accent)", background: isAdventure ? "rgba(122,160,60,.14)" : "var(--t-accent-soft)" } : { color: "var(--t-ink-soft)", border: "1px dashed rgba(139,112,64,.45)" }}
                  title="Early-completion reward"
                >
                  {bonus > 0 || coins > 0 ? `+${bonus} XP${coins ? ` · ${coins}🪙` : ""} early` : "+ Early reward"}
                </button>
              );
            })()}
            {bonusOpen && <EarlyBonusPopup taskId={task.id} initial={{ xp: task.early_bonus_xp ?? null, coins: task.early_bonus_coins ?? null, perDay: task.early_bonus_per_day ?? null }} onClose={() => setBonusOpen(false)} />}
          </div>
          {((task.progress ?? 0) > 0 || (task.steps_total ?? 0) > 0 || !!countUnit) && (
            <div className="mt-2 flex items-center gap-2" title={countUnit ? unitLabel(countUnit) : `${task.progress ?? 0}% done`}>
              {(task.steps_total ?? 0) > 0 && (
                <span
                  className="flex shrink-0 items-center gap-1 text-[12.5px] font-semibold tabular-nums"
                  style={{ color: isAdventure ? "#6f5a24" : "var(--t-ink-soft)" }}
                  title={`${task.steps_done ?? 0} of ${task.steps_total} steps done`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2.4" />
                    <path d="M7.5 12.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {progressWords(task.steps_done ?? 0, task.steps_total ?? 0)}
                </span>
              )}
              {/* The bar shows from the start once a quest has steps or progress. */}
              {true && (
              <>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full"
                style={{
                  background: isAdventure ? "#2a2416" : "var(--t-card-border)",
                  border: isAdventure ? "1px solid #8a6c2c" : undefined,
                  boxShadow: isAdventure ? "inset 0 1px 2px rgba(0,0,0,.5)" : undefined,
                }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${countUnit ? pctOf(countUnit) : (task.progress ?? 0)}%`,
                    background: isAdventure ? "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" : "var(--t-accent)",
                  }}
                />
              </div>
              {/* Tap to log progress right here: ± a page (or 5%). */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (task.status === "open") setLogOpen((v) => !v);
                }}
                aria-expanded={logOpen}
                title="Log progress"
                className="whitespace-nowrap rounded-full px-1.5 text-[12.5px] font-semibold tabular-nums hover:bg-black/[.05]"
                style={{ color: isAdventure ? "#6f5a24" : "var(--t-ink-soft)", background: logOpen ? "rgba(217,180,95,.25)" : undefined }}
              >
                {countUnit ? unitLabel(countUnit) : `${task.progress ?? 0}%`}
              </button>
              </>
              )}
            </div>
          )}
          <Fold open={logOpen && task.status === "open"}>
            <ProgressLog task={task} unit={countUnit} isAdventure={isAdventure} onComplete={() => (setLogOpen(false), pick("complete"))} />
          </Fold>
        </div>

        <div className="shrink-0" style={{ width: 1, background: dividerColor }} aria-hidden />

        {/* Right: time, XP, importance */}
        <div className={`flex shrink-0 flex-col items-start justify-center ${compact ? "w-[56px] gap-1 pt-3" : "w-[66px] gap-1 pt-1.5 sm:w-[84px] sm:pl-1"}`}>
          {task.estimate_minutes != null && (
            <span className="flex items-center gap-1.5" style={{ color: "var(--t-ink)", fontSize: compact ? 13.5 : 15 }}>
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
            className={`whitespace-nowrap leading-none ${compact ? (isAdventure ? "text-[16px]" : "text-[14px]") : isAdventure ? "text-[18px] sm:text-[21px]" : "text-[15px]"}`}
            style={{ color: xpColor, fontWeight: 700 }}
          >
            {isAdventure ? `XP ${task.xp_value}` : `${task.xp_value} pts`}
          </span>
          {task.reschedule_count > 0 && !compact && (
            <span className="text-[12px] font-semibold tabular-nums leading-none" style={{ color: isWarned ? "var(--t-warn)" : "var(--t-ink-soft)" }} title={isWarned ? "Rescheduled often" : `Rescheduled ${task.reschedule_count}×`}>
              &#8635; {task.reschedule_count}
            </span>
          )}
          <ScaleRuns
            compact={compact}
            runs={[
              ...(importanceCount > 0 ? [{ key: "importance" as const, src: "/design/ui-trophy.svg", n: importanceCount, title: `Importance ${task.importance.toFixed(1)}` }] : []),
              ...(urgencyCount > 0 ? [{ key: "urgency" as const, src: "/design/ui-flame-sm.png", n: urgencyCount, title: `Urgency ${(task.urgency ?? 0).toFixed(1)}` }] : []),
            ]}
          />
          {(task.due_at || (task.is_on_calendar && task.scheduled_start)) && (
            <span
              className="flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold leading-none"
              style={{ color: isOverdue ? "var(--t-warn)" : isAdventure ? "#5a4a30" : metaColor }}
              title={isOverdue ? `Overdue · ${new Date((task.due_at ?? task.scheduled_start)!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : dueLabel((task.due_at ?? task.scheduled_start)!)}
            >
              {isAdventure ? (
                // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
                <img src="/design/ui-calendar.png" alt="" width={13} height={13} />
              ) : (
                "📅"
              )}
              {isOverdue ? "Overdue" : dueShort((task.due_at ?? task.scheduled_start)!)}
            </span>
          )}
        </div>
      </div>

      )}

      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {/* Dialogs render in portals, but their events still bubble through this
          card in React — keep typing, selecting and Space from starting a card drag. */}
      <div className="contents" onPointerDown={stopBubble} onMouseDown={stopBubble} onTouchStart={stopBubble} onKeyDown={stopKeysButSave} onClick={stopBubble}>
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

      {editing && (
        <EditTaskModal
          task={task}
          theme={theme}
          onClose={() => {
            setEditing(false);
            onEditorClose?.();
            if (backToEarlier) {
              setBackToEarlier(false);
              setDoneEarlier(true);
            }
          }}
        />
      )}
      {sequencing && <SequenceDialog taskId={task.id} title={task.title} isAdventure={isAdventure} onClose={() => setSequencing(false)} />}
      {doneEarlier && (
        <DoneEarlierDialog
          title={task.title}
          isAdventure={isAdventure}
          onPick={completeEarlier}
          onEdit={() => {
            setDoneEarlier(false);
            setBackToEarlier(true);
            setEditing(true);
          }}
          onClose={() => setDoneEarlier(false)}
        />
      )}
      </div>
    </div>
      </SwipeReveal>
      {hasSteps && !done && (
        // Slides open just under the card.
        <div className="drawer-body" data-open={tray ? "true" : "false"} style={{ marginTop: tray ? 6 : 0, transition: "grid-template-rows 320ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 240ms ease, margin-top 320ms ease" }}>
        <div className="drawer-inner" inert={!tray}>
        {trayEver && <StepsTray
          task={task}
          isAdventure={isAdventure}
          onEdit={() => {
            setTray(false);
            setEditing(true);
          }}
          onComplete={() => {
            setTray(false);
            pick("complete");
          }}
        />}
        </div>
        </div>
      )}
    </li>
  );
}

/** Slide a card out to the left and fade it, then close the gap it leaves. */
const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

function slideOut(el: HTMLElement | null): Promise<void> {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
  const h = el.getBoundingClientRect().height;
  el.style.height = `${h}px`;
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  el.style.transition = "transform 200ms ease-in, opacity 180ms ease-in";
  el.style.transform = "translateX(-56px)";
  el.style.opacity = "0";
  return new Promise((resolve) =>
    setTimeout(() => {
      el.style.transition = "height 220ms cubic-bezier(.2,.8,.2,1), margin-bottom 220ms cubic-bezier(.2,.8,.2,1)";
      el.style.height = "0px";
      // Swallow the list's gap too, so the cards below glide up the whole way.
      el.style.marginBottom = "-12px";
      setTimeout(resolve, 230);
    }, 190)
  );
}

function resetSlide(el: HTMLElement | null) {
  if (!el) return;
  for (const k of ["height", "overflow", "pointerEvents", "transition", "transform", "opacity", "marginBottom"] as const) el.style[k] = "";
}

/** A tiny task's check box: one tap completes it. */
function TinyCheckBox({ checked, disabled, isAdventure, label, onCheck }: { checked: boolean; disabled: boolean; isAdventure: boolean; label: string; onCheck: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title="Tick it off"
      disabled={disabled}
      onClick={onCheck}
      className="hover-glow flex h-[30px] w-[30px] items-center justify-center rounded-lg"
      style={{
        border: `2px solid ${isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`,
        background: isAdventure ? "radial-gradient(circle at 35% 30%, rgba(255,255,255,.6), rgba(255,255,255,.2))" : "var(--t-card)",
        boxShadow: isAdventure ? "inset 0 1px 3px rgba(0,0,0,.18)" : undefined,
      }}
    >
      {checked && (
        <svg className="qc-card-check" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden style={{ filter: "drop-shadow(0 0 5px rgba(110,230,80,.7))" }}>
          <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#16300f" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#3fbf3a" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
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

/** "Already completed": which day (and, if wanted, what time) it was done. */
function DoneEarlierDialog({ title, isAdventure, onPick, onEdit, onClose: closeNow }: { title: string; isAdventure: boolean; onPick: (when: Date) => void; onEdit: () => void; onClose: () => void }) {
  const { closing, close: onClose } = useClosing(closeNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const [now] = useState(() => new Date());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const [day, setDay] = useState(keyOf(yesterday));
  const [time, setTime] = useState("");
  const quick = [0, 1, 2].map((n) => {
    const d = new Date(now);
    d.setDate(now.getDate() - n);
    return { key: keyOf(d), label: n === 0 ? "Earlier today" : n === 1 ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long" }) };
  });
  function confirm() {
    const [y, m, d] = day.split("-").map(Number);
    const [hh, mm] = time ? time.split(":").map(Number) : [12, 0];
    let when = new Date(y, m - 1, d, hh, mm);
    if (when > now) when = now;
    onPick(when);
  }
  return createPortal(
    <div className={`${closing ? "overlay-fade-out pointer-events-none" : "overlay-fade-in"} fixed inset-0 z-[60] flex items-center justify-center p-4`} style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="When was it completed?"
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in parchment parchment-framed flex w-full max-w-sm flex-col gap-3 rounded-2xl p-5"
        style={{ color: "var(--t-ink)", background: isAdventure ? undefined : "var(--t-card)" }}
      >
        <div className="relative z-[1] flex flex-col gap-0.5">
          <p className={`m-0 text-[19px] ${isAdventure ? "font-display" : "font-bold"}`}>When did you finish it?</p>
          <p className="m-0 line-clamp-2 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
            {title}
          </p>
        </div>
        <div className="relative z-[1] flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.key}
              type="button"
              aria-pressed={day === q.key}
              onClick={() => setDay(q.key)}
              className="h-9 rounded-full px-3.5 text-[14px] font-semibold"
              style={day === q.key ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116", color: "#2a1c10" } : { border: "1.5px solid #b39a6a" }}
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="relative z-[1] flex flex-wrap items-center gap-2 text-[14px]">
          <DateField value={day} max={keyOf(now)} onChange={(v) => v && setDay(v)} ariaLabel="Day" className="h-10 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a" }} />
          <TimeToken value={time} onChange={setTime} label="Time (optional)" kind="any" compact />
          <span style={{ color: "var(--t-ink-soft)" }}>time optional</span>
        </div>
        <div className="relative z-[1] flex flex-wrap justify-end gap-2 pt-1">
          {/* Update it first (steps, XP, notes), then come back here to mark it done. */}
          <button type="button" onClick={onEdit} className="mr-auto h-10 rounded-full px-3 text-[14.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--t-ink)" }}>
            ✎ Edit first
          </button>
          <button type="button" onClick={onClose} className="h-10 rounded-full px-4 text-[15px] font-semibold hover:bg-black/5" style={{ border: "1.5px solid #b39a6a" }}>
            Cancel
          </button>
          <button type="button" onClick={confirm} className="hover-glow h-10 rounded-full px-5 text-[15px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Mark completed
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** A short run of trophies or flames, always on one row (they shrink a little rather than wrap). */
type Run = { key?: ScaleKey; src: string; n: number; title: string };
/**
 * Importance, urgency and the like on a card. As bars (the default): side by
 * side, each one smooth bar filled to its level with its icon underneath. As
 * icons: a row of icons per scale, stacked.
 */
function ScaleRuns({ runs, compact }: { runs: Run[]; compact: boolean }) {
  const style = useScaleStyle();
  const colors = useScaleColors();
  if (!runs.length) return null;
  if (style === "bars")
    return (
      <span className="flex items-end gap-1.5">
        {runs.map((r) => (
          <span key={r.src} className="flex flex-col items-center gap-[3px]" title={r.title}>
            {/* Only as tall as its level: no empty track above it. */}
            <span aria-hidden className={`relative block w-[6px] ${compact ? "h-[16px]" : "h-[20px]"}`}>
              <span className="level-fill absolute inset-x-0 bottom-0 block rounded-full" style={{ height: `${Math.min(5, r.n) * 20}%`, minHeight: 4, ...fillFor(r.key ? colors[r.key] : undefined) }} />
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public */}
            <img src={r.src} alt="" width={14} height={14} className={`shrink-0 ${compact ? "h-[11px] w-[11px]" : "h-[12px] w-[12px] sm:h-[13px] sm:w-[13px]"}`} />
          </span>
        ))}
      </span>
    );
  return (
    <>
      {runs.map((r) => (
        <IconRun key={r.src} src={r.src} n={r.n} compact={compact} title={r.title} />
      ))}
    </>
  );
}

function IconRun({ src, n, compact, title }: { src: string; n: number; compact: boolean; title: string }) {
  return (
    <span className={`flex flex-nowrap items-center ${compact ? "gap-px" : "gap-px sm:gap-[3px]"}`} title={title}>
      {Array.from({ length: n }).map((_, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
        <img key={i} src={src} alt="" width={14} height={14} className={`shrink-0 ${compact ? "h-[11px] w-[11px]" : "h-[12px] w-[12px] sm:h-[14px] sm:w-[14px]"}`} />
      ))}
    </span>
  );
}

/**
 * Log progress from the card: − and + (a page, or 5%), or type it. Saved a moment after the last
 * change; it earns its share of the XP like the editor's bar. At the end, a "Complete it" (owner, Nov 2:
 * "how many pages I've read out of 32").
 */
function ProgressLog({ task, unit, isAdventure, onComplete }: { task: Task; unit: ProgressUnit | null; isAdventure: boolean; onComplete: () => void }) {
  const router = useRouter();
  const max = unit ? unit.total : 100;
  const step = unit ? 1 : 5;
  const [value, setValue] = useState(unit ? unit.done : (task.progress ?? 0));
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef(task.progress ?? 0);
  function change(v: number) {
    const next = Math.max(0, Math.min(max, Math.round(v)));
    setValue(next);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const pct = unit ? pctOf({ ...unit, done: next }) : next;
      try {
        if (unit) await saveProgressUnit(task.id, { ...unit, done: next });
        if (pct < 100 && pct !== from.current) {
          const res = await setTaskProgressAction(task.id, pct);
          if (res.xpEarned > 0) celebrateProgress({ title: task.title, xp: res.xpEarned, coinsEarned: res.coinsEarned, fromPct: from.current, toPct: pct });
          from.current = pct;
        }
        setSaved(true);
        router.refresh();
      } catch {
        /* the next change tries again */
      }
    }, 900);
  }
  const btn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px] font-bold leading-none";
  const btnStyle = { border: "1.5px solid #b39a6a", color: isAdventure ? "#6b4a12" : "var(--t-ink)", background: "rgba(255,250,238,.7)" };
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1.5" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={() => change(value - step)} aria-label={unit ? `One ${unit.unit.replace(/s$/, "")} less` : "5% less"} className={btn} style={btnStyle}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        aria-label={unit ? `${unit.unit} done` : "Percent done"}
        className="h-8 rounded-lg border bg-transparent px-1 text-center text-[16px] font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        style={{ borderColor: "#b39a6a", color: isAdventure ? "var(--t-xp)" : "var(--t-accent)", width: 48, minWidth: 0 }}
      />
      <button type="button" onClick={() => change(value + step)} aria-label={unit ? `One ${unit.unit.replace(/s$/, "")} more` : "5% more"} className={btn} style={btnStyle}>
        +
      </button>
      </span>
      <span className="whitespace-nowrap text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
        {unit ? `of ${unit.total} ${unit.unit}` : "%"}
      </span>
      {saved && value < max && (
        <span className="confirm-pop text-[12px] font-semibold" style={{ color: "#3f6a2c" }}>
          ✓ Saved
        </span>
      )}
      {value >= max && (
        <button type="button" onClick={onComplete} className="reveal h-8 rounded-full px-3 text-[13px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
          Complete it ✓
        </button>
      )}
    </div>
  );
}
