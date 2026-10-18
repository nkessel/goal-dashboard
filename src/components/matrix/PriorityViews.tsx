"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { TaskWithBoard } from "@/lib/data/tasks";
import type { Board } from "@/lib/data/types";
import { oneStepPerProject } from "@/lib/next-action";
import { DEFAULT_WEIGHTS, scoreAll, type Weights } from "@/lib/priority";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { PriorityMatrix } from "./PriorityMatrix";
import { WeightsPanel } from "./lab/shared";
import { Ladder } from "./lab/Ladder";
import { Constellation } from "./lab/Constellation";
import { TugBoard } from "./lab/TugBoard";
import { Lens } from "./lab/Lens";
import { TimeTide } from "./lab/TimeTide";
import { SparkMap } from "./lab/SparkMap";
import { FinishLine } from "./lab/FinishLine";
import { MotivationForecast } from "./lab/MotivationForecast";
import { StuckMap } from "./lab/StuckMap";
import { StartFriction } from "./lab/StartFriction";
import { EnergyWeather } from "./lab/EnergyWeather";

type View = "matrix" | "ladder" | "constellation" | "tug" | "lens" | "tide" | "spark" | "finish" | "forecast" | "stuck" | "friction" | "energy";
const GROUPS: { label: string; views: { key: View; label: string }[] }[] = [
  {
    label: "Weigh",
    views: [
      { key: "matrix", label: "Matrix" },
      { key: "ladder", label: "Ladder" },
      { key: "constellation", label: "Constellation" },
      { key: "tug", label: "Tug board" },
      { key: "lens", label: "Lens" },
    ],
  },
  {
    label: "Experiments",
    views: [
      { key: "tide", label: "Time tide" },
      { key: "spark", label: "Spark map" },
      { key: "finish", label: "Finish line" },
      { key: "forecast", label: "Forecast" },
      { key: "stuck", label: "Stuck map" },
      { key: "friction", label: "Easy start" },
      { key: "energy", label: "Energy weather" },
    ],
  },
];
const VIEWS = GROUPS.flatMap((g) => g.views);
/** Views that rank by the shared weights. */
const WEIGHED: View[] = ["ladder", "constellation", "lens"];
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
  energy = [],
}: {
  /** Energy check-ins (last 30 days) for Energy weather. */
  energy?: { level: number; at: string }[];
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
  // A project shows only its next step, so the views point at what's next.
  const live = oneStepPerProject(tasks.filter((t) => !t.needs_review), boards);
  const scored = now ? scoreAll(live, weights, now) : [];
  const open = (t: TaskWithBoard) => setEditing(t);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Priority views" className="flex flex-col gap-1.5">
        {GROUPS.map((g) => (
          <div key={g.label} className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="w-[78px] shrink-0 text-[12.5px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.85 }}>
              {g.label}
            </span>
            {g.views.map((v) => {
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
        ))}
      </div>

      {view === "matrix" ? (
        <PriorityMatrix tasks={tasks} theme={theme} boards={boards} plotIds={plotIds} confirmImports={confirmImports} />
      ) : now === 0 ? null : (
        <>
          {WEIGHED.includes(view) && <WeightsPanel weights={weights} onChange={changeWeights} isAdventure={isAdventure} />}
          {view === "ladder" && <Ladder scored={scored} isAdventure={isAdventure} onOpen={open} />}
          {view === "constellation" && <Constellation scored={scored} boards={boards} onOpen={open} />}
          {view === "tug" && <TugBoard scored={scored} weights={weights} onWeights={changeWeights} isAdventure={isAdventure} onOpen={open} />}
          {view === "lens" && <Lens scored={scored} isAdventure={isAdventure} onOpen={open} />}
          {view === "tide" && <TimeTide tasks={live} now={now} isAdventure={isAdventure} onOpen={open} />}
          {view === "spark" && <SparkMap tasks={live} isAdventure={isAdventure} onOpen={open} />}
          {view === "finish" && <FinishLine tasks={live} isAdventure={isAdventure} onOpen={open} />}
          {view === "forecast" && <MotivationForecast tasks={live} now={now} isAdventure={isAdventure} onOpen={open} />}
          {view === "stuck" && <StuckMap tasks={live} now={now} isAdventure={isAdventure} onOpen={open} />}
          {view === "friction" && <StartFriction tasks={live} isAdventure={isAdventure} onOpen={open} />}
          {view === "energy" && <EnergyWeather tasks={live} energy={energy} now={now} isAdventure={isAdventure} onOpen={open} />}
        </>
      )}

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </div>
  );
}
