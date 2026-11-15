"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuestAction, failTaskAction } from "@/app/actions";
import type { Task } from "@/lib/data/types";

/**
 * Failing a quest, in place in a menu (owner, Nov 9–13: "fail it from the context menu… an optional reason… a red X
 * rather than a green checkmark… no need to make the item card redder… give the option to plan a follow-up quest,
 * based off the failed quest or a new one"). The reason is written straight on the menu's parchment (no white box).
 * After it's marked, two ways on: try again (a copy of the quest on Today's Quests) or start a new one (the + menu).
 */
export function FailQuest({ task, onBack, onDone }: { task: Pick<Task, "id" | "title" | "description" | "xp_value" | "coin_value" | "estimate_minutes" | "board_id" | "importance" | "urgency" | "icon_key" | "icon_source">; onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [again, setAgain] = useState<string | null>(null);

  if (failed)
    return (
      <div className="relative z-[1] flex flex-col gap-2 p-3" data-fail-next>
        <span className="font-display text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
          Marked as failed
        </span>
        <span className="text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
          Every quest teaches something. Want to plan a follow-up to finish the mission?
        </span>
        {again ? (
          <span className="reveal text-[13px] font-semibold" style={{ color: "var(--t-good, #3f6b2a)" }}>
            ✓ {again}
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              disabled={pending}
              className="min-h-10 rounded-full px-4 text-left text-[14px] font-semibold disabled:opacity-60"
              style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await createQuestAction({
                      title: task.title,
                      description: task.description ?? undefined,
                      importance: task.importance ?? 3,
                      urgency: task.urgency ?? 3,
                      xpValue: task.xp_value,
                      coinValue: task.coin_value ?? null,
                      estimateMinutes: task.estimate_minutes ?? null,
                      boardId: task.board_id ?? null,
                      iconKey: task.icon_key ?? null,
                      iconSource: task.icon_source === "ai" || task.icon_source === "library" ? task.icon_source : undefined,
                      placement: "today",
                    });
                    setAgain("Added to Today's Quests");
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Couldn't add it.");
                  }
                })
              }
            >
              ↻ Try again: a new copy of this quest
            </button>
            <button
              type="button"
              className="min-h-10 rounded-full px-4 text-left text-[14px] font-semibold"
              style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}
              onClick={() => {
                onDone();
                // The + menu, so the new quest starts fresh.
                setTimeout(() => (document.querySelector('[aria-label="Create something new"]') as HTMLElement | null)?.click(), 60);
              }}
            >
              ✦ Start a new quest
            </button>
          </div>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className="h-9 px-2 text-[13px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
            {again ? "Close" : "Not now"}
          </button>
        </div>
        {error && (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
      </div>
    );

  return (
    <form
      className="relative z-[1] flex flex-col gap-2 p-3"
      data-fail-form
      onSubmit={(e) => {
        e.preventDefault();
        const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
        setError(null);
        startTransition(async () => {
          try {
            await failTaskAction(task.id, reason);
            setFailed(true);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't mark it failed.");
          }
        });
      }}
    >
      <span className="font-display text-[16px] font-semibold" style={{ color: "var(--t-ink)" }}>
        Quest failure
      </span>
      <label className="flex flex-col gap-0.5">
        <span className="text-[12px] italic" style={{ color: "var(--t-ink-soft)" }}>
          What got in the way? (optional)
        </span>
        <input
          name="reason"
          autoFocus
          maxLength={300}
          aria-label="Why it failed (optional)"
          className="bare-input fail-reason text-[16px]"
          style={{ color: "var(--t-ink)" }}
        />
      </label>
      <span className="text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        It earns no XP and shows a red ✕. You can undo it later.
      </span>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className="h-9 px-2 text-[13px] underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
          Back
        </button>
        <button type="submit" disabled={pending} className="h-9 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-60" style={{ background: "#b5321f", color: "#fff" }}>
          Mark failed
        </button>
      </div>
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
