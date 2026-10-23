"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listQuestStepsAction, saveQuestStepsAction, setTaskProgressAction } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { descendants, parentKeys, stepPayload, stepsShare, treeOrder, type StepDraft } from "@/lib/quest-steps";
import type { Task } from "@/lib/data/types";

/**
 * Slides out under a quest card that has steps: tick them off right there.
 * Ticking pulls the quest's progress (and its share of the XP) up, like the
 * editor does; with every step done it offers to complete the quest.
 */
export function StepsTray({ task, isAdventure, onEdit, onComplete }: { task: Task; isAdventure: boolean; onEdit: () => void; onComplete: () => void }) {
  const router = useRouter();
  const [steps, setSteps] = useState<StepDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pop, setPop] = useState<number | null>(null);
  const [, start] = useTransition();
  useEffect(() => {
    listQuestStepsAction(task.id).then(
      (rows) => setSteps(treeOrder((rows ?? []).map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.done, xp: r.xp ?? 0, weight: r.weight ?? null, progress: r.progress ?? (r.done ? 100 : 0), state: r.state ?? null, parentKey: r.parent_id ?? null })))),
      () => setError("Couldn't load the steps.")
    );
  }, [task.id]);

  const holders = steps ? parentKeys(steps) : new Set<string>();
  const depthOf = (st: StepDraft) => {
    let d = 0;
    let p = st.parentKey;
    while (p && d < 6) {
      d += 1;
      p = steps?.find((y) => y.key === p)?.parentKey ?? null;
    }
    return d;
  };
  const live = (steps ?? []).filter((st) => !holders.has(st.key) && st.state !== "skipped");
  const allDone = live.length > 0 && live.every((st) => st.done);

  function tick(key: string, done: boolean) {
    if (!steps) return;
    const next = steps.map((st) => (st.key === key ? { ...st, done, progress: done ? 100 : 0, state: null } : st));
    setSteps(next);
    setError(null);
    start(async () => {
      try {
        const res = await saveQuestStepsAction(task.id, stepPayload(next));
        let xp = res.xpEarned;
        // The steps carry the quest along: its progress rises to what they add up to (never down here).
        const share = stepsShare(next);
        if (share > (task.progress ?? 0) && share < 100) {
          const p = await setTaskProgressAction(task.id, share);
          xp += p.xpEarned;
          if (p.xpEarned > 0) celebrateProgress({ title: task.title, xp: p.xpEarned, coinsEarned: p.coinsEarned, fromPct: task.progress ?? 0, toPct: share, steps: { done: next.filter((s) => s.done).length, total: next.length } });
        }
        if (xp > 0) {
          setPop(xp);
          setTimeout(() => setPop(null), 1600);
        }
        router.refresh();
      } catch (e) {
        setSteps(steps);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const box = isAdventure ? "#8a6c2c" : "var(--t-card-border)";
  return (
    <div
      className="steps-tray reveal relative -mt-3 mx-2 rounded-b-2xl px-3 pb-2.5 pt-5"
      onClick={(e) => e.stopPropagation()}
      style={{ background: isAdventure ? "linear-gradient(180deg, #e9d8b0, #dcc697)" : "var(--t-card)", border: `1px solid ${isAdventure ? "#a58c66" : "var(--t-card-border)"}`, borderTop: 0, boxShadow: "inset 0 6px 8px -6px rgba(60,40,10,.35)" }}
    >
      {steps === null && !error && (
        <p className="m-0 text-[13px] italic" style={{ color: "var(--t-ink-soft)" }}>
          Unrolling the steps…
        </p>
      )}
      {steps && (
        <ul className="m-0 flex list-none flex-col p-0">
          {steps.map((st) => {
            const isHolder = holders.has(st.key);
            const inside = isHolder ? [...descendants(steps, st.key)].filter((k) => k !== st.key && !holders.has(k)).map((k) => steps.find((y) => y.key === k)!) : [];
            const checked = isHolder ? inside.length > 0 && inside.every((x) => x.done || x.state === "skipped") : st.done;
            const struck = st.state === "skipped" || st.state === "failed";
            return (
              <li key={st.key} style={{ marginLeft: depthOf(st) * 20 }}>
                <label className={`flex min-h-9 items-center gap-2.5 ${isHolder || struck ? "" : "cursor-pointer"}`}>
                  {isHolder ? (
                    <span className="w-[18px] shrink-0 text-center text-[11.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
                      {inside.filter((x) => x.done).length}/{inside.length}
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={struck}
                      onChange={(e) => tick(st.key, e.target.checked)}
                      className="peer sr-only"
                    />
                  )}
                  {!isHolder && (
                    <span
                      aria-hidden
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] peer-focus-visible:outline peer-focus-visible:outline-2"
                      style={{ border: `1.5px solid ${checked ? "var(--t-good)" : box}`, background: checked ? "var(--t-good)" : "rgba(255,250,235,.5)" }}
                    >
                      {checked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span className={`min-w-0 flex-1 text-[14.5px] leading-snug ${isHolder ? "font-semibold" : ""} ${checked || struck ? "line-through opacity-60" : ""}`} style={{ color: "var(--t-ink)" }}>
                    {st.title}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <div className="mt-1 flex items-center gap-3 text-[13px]">
        {pop !== null && (
          <span aria-live="polite" className="font-bold" style={{ color: "var(--t-xp)" }}>
            +{pop} XP
          </span>
        )}
        {allDone && (
          <button type="button" onClick={onComplete} className="hover-glow h-8 rounded-full px-3 text-[13px] font-semibold" style={{ background: "linear-gradient(180deg,#8fae7a,#6f8f5c)", color: "#fbf6e8", border: "1px solid #56703f" }}>
            All done · complete it
          </button>
        )}
        <button type="button" onClick={onEdit} className="ml-auto underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
          Edit {isAdventure ? "quest" : "task"}
        </button>
      </div>
    </div>
  );
}
