"use client";

import { useRef, useState, useTransition } from "react";
import { updateGoalProgressAction } from "@/app/actions";
import { QuestComplete, type QuestCompleteProps } from "@/components/celebration/QuestComplete";

export type GoalCelebration = Omit<QuestCompleteProps, "onClose">;

export function GoalProgressControl({
  goalId,
  boardId,
  initialProgress,
  celebration,
}: {
  goalId: string;
  boardId: string;
  initialProgress: number;
  /** Details for the quest-complete screen shown when the goal reaches 100%. */
  celebration?: GoalCelebration;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [celebrating, setCelebrating] = useState(false);
  const wasComplete = useRef(initialProgress >= 100);
  const [isPending, startTransition] = useTransition();

  function commit(next: number) {
    const clamped = Math.max(0, Math.min(100, next));
    setProgress(clamped);
    if (clamped >= 100 && !wasComplete.current && celebration) setCelebrating(true);
    wasComplete.current = clamped >= 100;
    startTransition(() => {
      updateGoalProgressAction(goalId, boardId, clamped);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {celebrating && celebration && (
        <QuestComplete {...celebration} onClose={() => setCelebrating(false)} />
      )}
      <button
        type="button"
        onClick={() => commit(progress - 5)}
        disabled={isPending || progress <= 0}
        className="h-6 w-6 shrink-0 rounded-full border border-zinc-300 text-xs disabled:opacity-30 dark:border-zinc-700"
      >
        −
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={progress}
        onChange={(e) => setProgress(Number(e.target.value))}
        onMouseUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onBlur={(e) => commit(Number((e.target as HTMLInputElement).value))}
        className="flex-1 accent-emerald-600"
      />
      <button
        type="button"
        onClick={() => commit(progress + 5)}
        disabled={isPending || progress >= 100}
        className="h-6 w-6 shrink-0 rounded-full border border-zinc-300 text-xs disabled:opacity-30 dark:border-zinc-700"
      >
        +
      </button>
      <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">
        {progress}%
      </span>
    </div>
  );
}
