"use client";

import type { Goal, Task } from "@/lib/data/types";
import { reorderGoalsAction } from "@/app/actions";
import { useDragReorder } from "@/lib/use-drag-reorder";
import { useFlip } from "@/lib/use-flip";
import { GoalProgressControl, type GoalCelebration } from "./GoalProgressControl";
import { AddTaskForm } from "@/components/tasks/AddTaskForm";
import { TaskRow } from "@/components/tasks/TaskRow";

/**
 * The goals list on a Board Detail page, extracted into its own client
 * component so goal cards can be dragged to reorder within the board —
 * dragging one over another live-reflows the rest, and the final order is
 * persisted once the drag ends via reorderGoalsAction (writes sort_order).
 */
export function GoalList({
  boardId,
  boardTitle,
  goalsWithTasks: initial,
  theme,
  player,
}: {
  boardId: string;
  /** This board's title, shown as each task's category pill. Every goal on
   * this page belongs to the same board, so it's passed once here rather
   * than resolved per task. */
  boardTitle: string;
  goalsWithTasks: { goal: Goal; tasks: Task[] }[];
  theme: "calm" | "adventure";
  /** Level/XP/avatar for the quest-complete celebration. */
  player?: Pick<GoalCelebration, "level" | "xpIntoLevel" | "xpForNextLevel" | "avatarSrc">;
}) {
  const { items, draggingId, start, moveOver, finish } = useDragReorder({
    items: initial,
    getId: (item) => item.goal.id,
    onCommit: (orderedIds) => reorderGoalsAction(boardId, orderedIds),
  });
  const register = useFlip(items, (item) => item.goal.id);
  const isAdventure = theme === "adventure";

  const cardStyle = (isWarn: boolean) => ({
    background: isWarn ? "#e8cdb8" : isAdventure ? "var(--t-panel)" : "var(--t-card)",
    border: `2px solid ${isWarn ? "var(--t-warn)" : isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    borderWidth: isAdventure ? 2 : 1,
  });

  return (
    <div className="flex flex-col gap-3.5">
      {items.map(({ goal, tasks }) => {
        const isStalled = tasks.some((t) => t.reschedule_count >= 3 && t.status === "open");
        const isDragging = draggingId === goal.id;

        return (
          <div
            key={goal.id}
            ref={register(goal.id)}
            draggable
            onDragStart={(e) => {
              start(goal.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              moveOver(goal.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              finish();
            }}
            onDragEnd={(e) => finish(e.dataTransfer.dropEffect !== "none")}
            className="hover-glow flex cursor-grab flex-col gap-3 rounded-2xl p-3.5 active:cursor-grabbing"
            style={{ ...cardStyle(isStalled), opacity: isDragging ? 0.4 : 1, transition: "opacity 120ms" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm"
                style={{
                  border: isAdventure ? "2px solid var(--t-panel-border)" : undefined,
                  background: isAdventure ? undefined : "var(--t-accent-soft)",
                }}
              >
                {isAdventure ? "⚔️" : "✦"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                  {goal.title}
                  {goal.is_private && <span className="ml-1.5 text-xs font-normal">🔒</span>}
                </p>
                {goal.description && (
                  <p className="truncate text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                    {goal.description}
                  </p>
                )}
              </div>
            </div>

            <GoalProgressControl
              goalId={goal.id}
              boardId={boardId}
              initialProgress={goal.progress}
              theme={theme}
              celebration={
                player && {
                  ...player,
                  title: goal.title,
                  description: goal.description,
                  tag: boardTitle,
                  questXp: tasks.reduce((sum, t) => sum + (t.xp_value ?? 0), 0),
                }
              }
            />

            {tasks.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} theme={theme} categoryLabel={boardTitle} />
                ))}
              </ul>
            )}

            <AddTaskForm goalId={goal.id} theme={theme} />
          </div>
        );
      })}
    </div>
  );
}
