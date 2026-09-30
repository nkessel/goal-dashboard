"use client";

import { useRef, useState, useTransition } from "react";
import { createBoardAction, createGoalAction } from "@/app/actions";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";

type Mode = "closed" | "menu" | "goal" | "subboard";

/**
 * Board Detail page's floating action button. Used to be a single-purpose
 * "Add goal" FAB (what CreateGoalForm rendered on its own); now a small
 * speed-dial menu so the same FAB can also create a nested sub-board
 * without losing one-tap goal creation — "goal" and "quest" are the same
 * thing under the hood (Calm vs Adventure theme naming), so this only adds
 * one genuinely new option, not three.
 */
export function BoardFabMenu({ boardId, theme = "calm" }: { boardId: string; theme?: "calm" | "adventure" }) {
  const [mode, setMode] = useState<Mode>("closed");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isAdventure = theme === "adventure";
  const dimText = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  const borderColor = isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)";
  const inputStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    color: "var(--t-ink)",
  };

  if (mode === "goal" || mode === "subboard") {
    const isGoal = mode === "goal";
    return (
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            if (isGoal) await createGoalAction(formData);
            else await createBoardAction(formData);
            formRef.current?.reset();
            setMode("closed");
          });
        }}
        className="flex flex-col gap-2 rounded-xl p-3"
        style={{ border: `1px solid ${borderColor}`, background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)" }}
      >
        {isGoal ? (
          <input type="hidden" name="boardId" value={boardId} />
        ) : (
          <input type="hidden" name="parentBoardId" value={boardId} />
        )}
        <input
          name="title"
          placeholder={isGoal ? (isAdventure ? "Quest goal title" : "Goal title") : "Sub-board name"}
          required
          autoFocus
          className="rounded border px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <textarea
          name="description"
          placeholder="Description (optional)"
          rows={2}
          className="rounded border px-2 py-1.5 text-sm"
          style={inputStyle}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#3b2a10" : "#fff" }}
          >
            {isPending ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => setMode("closed")}
            className="hover-glow rounded-full px-4 py-1.5 text-sm"
            style={{ color: dimText }}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      {mode === "menu" && (
        <div
          className="pointer-events-none fixed inset-x-0 z-40 mx-auto flex w-full max-w-md justify-center sm:max-w-lg"
          style={{ bottom: 150 }}
        >
          <div className="pointer-events-auto flex flex-col items-stretch gap-2">
            <button
              type="button"
              onClick={() => setMode("subboard")}
              className="hover-glow rounded-full px-4 py-2 text-right text-sm font-medium"
              style={{
                background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
                border: `1px solid ${borderColor}`,
                color: "var(--t-ink)",
                boxShadow: "0 4px 14px rgba(0,0,0,.22)",
              }}
            >
              + {isAdventure ? "Sub quest-board" : "Sub-board"}
            </button>
            <button
              type="button"
              onClick={() => setMode("goal")}
              className="hover-glow rounded-full px-4 py-2 text-right text-sm font-medium"
              style={{
                background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
                border: `1px solid ${borderColor}`,
                color: "var(--t-ink)",
                boxShadow: "0 4px 14px rgba(0,0,0,.22)",
              }}
            >
              + {isAdventure ? "Quest goal" : "Goal"}
            </button>
          </div>
        </div>
      )}
      <FloatingActionButton
        onClick={() => setMode(mode === "menu" ? "closed" : "menu")}
        label={mode === "menu" ? "Close" : `Add ${isAdventure ? "quest goal or sub quest-board" : "goal or sub-board"}`}
        theme={theme}
        expanded={mode === "menu"}
      />
    </>
  );
}
