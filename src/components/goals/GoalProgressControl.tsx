"use client";

import { useRef, useState, useTransition } from "react";
import { updateGoalProgressAction } from "@/app/actions";
import { QuestComplete, type QuestCompleteProps } from "@/components/celebration/QuestComplete";

export type GoalCelebration = Omit<QuestCompleteProps, "onClose">;

export function GoalProgressControl({
  goalId,
  boardId,
  initialProgress,
  theme = "calm",
  celebration,
}: {
  goalId: string;
  boardId: string;
  initialProgress: number;
  theme?: "calm" | "adventure";
  /** Details for the quest-complete screen shown when the goal reaches 100%. */
  celebration?: GoalCelebration;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [celebrating, setCelebrating] = useState(false);
  const wasComplete = useRef(initialProgress >= 100);
  const [isPending, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  function commit(next: number) {
    const clamped = Math.max(0, Math.min(100, next));
    setProgress(clamped);
    if (clamped >= 100 && !wasComplete.current && celebration) setCelebrating(true);
    wasComplete.current = clamped >= 100;
    startTransition(() => {
      updateGoalProgressAction(goalId, boardId, clamped);
    });
  }

  const btnStyle = {
    border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    color: "var(--t-ink)",
  };

  return (
    <div className="flex flex-col gap-2.5">
      {celebrating && celebration && <QuestComplete {...celebration} onClose={() => setCelebrating(false)} />}
      <div className="flex items-center gap-2.5">
        <div
          className="h-3 flex-1 overflow-hidden rounded-full"
          style={{ background: isAdventure ? "rgba(59,42,24,.15)" : "var(--t-card-border)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: isAdventure ? "linear-gradient(90deg, var(--t-gold-deep), var(--t-gold))" : "var(--t-accent)",
            }}
          />
        </div>
        <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums" style={{ color: "var(--t-ink)" }}>
          {progress}%
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => commit(progress - 5)}
          disabled={isPending || progress <= 0}
          className="hover-glow flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold disabled:opacity-30"
          style={btnStyle}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => commit(progress + 5)}
          disabled={isPending || progress >= 100}
          className="hover-glow flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold disabled:opacity-30"
          style={btnStyle}
        >
          +
        </button>
      </div>
    </div>
  );
}
