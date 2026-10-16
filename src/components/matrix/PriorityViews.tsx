"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { TaskWithBoard } from "@/lib/data/tasks";
import type { Board } from "@/lib/data/types";
import { DEFAULT_WEIGHTS, scoreAll, type Weights } from "@/lib/priority";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { PriorityMatrix } from "./PriorityMatrix";
import { WeightsPanel } from "./lab/shared";
import { Ladder } from "./lab/Ladder";
import { Constellation } from "./lab/Constellation";
import { TugBoard } from "./lab/TugBoard";
import { Lens } from "./lab/Lens";
import { ParallelLines } from "./lab/ParallelLines";

type View = "matrix" | "ladder" | "constellation" | "tug" | "lens" | "lines";
const VIEWS: { key: View; label: string }[] = [
  { key: "matrix", label: "Matrix" },
  { key: "ladder", label: "Ladder" },
  { key: "constellation", label: "Constellation" },
  { key: "tug", label: "Tug board" },
  { key: "lens", label: "Lens" },
  { key: "lines", label: "Lines" },
];
const VIEW_KEY = "priority-view";
const WEIGHTS_KEY = "priority-weights";
const noop = () => () => {};

/**
 * The Priority Lab: the two classic matrices plus views that weigh every
 * factor at once. All of them share one set of weights.
 */
export function PriorityViews({
  tasks,
  boards,
  theme,
  plotIds,
  confirmImports,
}: {
  tasks: TaskWithBoard[];
  boards: (Pick<Board, "id" | "title"> & Partial<Board>)[];
  theme: "calm" | "adventure";
  plotIds?: string[];
  confirmImports?: boolean;
}) {
  const isAdventure = theme === "adventure";
  const [view, setView] = useState<View>("matrix");
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [editing, setEditing] = useState<TaskWithBoard | null>(null);
  const now = useSyncExternalStore(noop, () => Math.floor(Date.now() / 600_000) * 600_000, () => 0);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY) as View | null;
      const w = window.localStorage.getItem(WEIGHTS_KEY);
      /* eslint-disable react-hooks/set-state-in-effect -- saved choices are only readable after hydration */
      if (v && VIEWS.some((x) => x.key === v) && !plotIds?.length) setView(v);
      if (w) setWeights({ ...DEFAULT_WEIGHTS, ...(JSON.parse(w) as Weights) });
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* storage unavailable */
    }
  }, [plotIds]);

  function pickView(v: View) {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  }
  function changeWeights(w: Weights) {
    setWeights(w);
    try {
      window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
    } catch {
      /* storage unavailable */
    }
  }

  // Imports still waiting for review stay out of the lab.
  const live = tasks.filter((t) => !t.needs_review);
  const scored = now ? scoreAll(live, weights, now) : [];
  const open = (t: TaskWithBoard) => setEditing(t);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Priority views" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {VIEWS.map((v) => {
          const on = v.key === view;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pickView(v.key)}
              className="h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold"
              style={{
                background: on ? (isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)") : isAdventure ? "rgba(14,18,10,.45)" : "var(--t-card)",
                color: on ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-cream)" : "var(--t-ink)",
                border: `1.5px solid ${on ? (isAdventure ? "#8a6116" : "transparent") : isAdventure ? "rgba(217,180,95,.35)" : "var(--t-card-border)"}`,
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {view === "matrix" ? (
        <PriorityMatrix tasks={tasks} theme={theme} boards={boards} plotIds={plotIds} confirmImports={confirmImports} />
      ) : (
        <>
          {view !== "tug" && <WeightsPanel weights={weights} onChange={changeWeights} isAdventure={isAdventure} />}
          {view === "ladder" && <Ladder scored={scored} isAdventure={isAdventure} onOpen={open} />}
          {view === "constellation" && <Constellation scored={scored} boards={boards} onOpen={open} />}
          {view === "tug" && <TugBoard scored={scored} weights={weights} onWeights={changeWeights} isAdventure={isAdventure} onOpen={open} />}
          {view === "lens" && <Lens scored={scored} isAdventure={isAdventure} onOpen={open} />}
          {view === "lines" && <ParallelLines scored={scored} isAdventure={isAdventure} onOpen={open} />}
        </>
      )}

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </div>
  );
}
