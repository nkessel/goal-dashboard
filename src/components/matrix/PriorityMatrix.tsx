"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { TaskWithBoard } from "@/lib/data/tasks";
import { computeMatrixLayout } from "@/lib/matrix-layout";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { confirmImportAction, updateTaskPriorityAction } from "@/app/actions";
import { TaskViewCard } from "@/components/tasks/TaskViewCard";

// A pointer that moves less than this (px) between down and up is treated as
// a click/tap that opens the view card, not a drag — the dot ends up
// getting pointer capture either way, so a real click event still fires
// even after a drag, and this is what tells the two apart.
const CLICK_MOVE_THRESHOLD = 4;

const LEGEND = {
  adventure: [
    { title: "Battle Now", desc: "Important & urgent" },
    { title: "Plan the Siege", desc: "Important, not urgent" },
    { title: "Send a Scout", desc: "Urgent, not important" },
    { title: "Abandon Quest", desc: "Neither important nor urgent" },
  ],
  calm: [
    { title: "Do now", desc: "Important & urgent" },
    { title: "Plan for later", desc: "Important, not urgent" },
    { title: "Delegate", desc: "Urgent, not important" },
    { title: "Let go", desc: "Neither important nor urgent" },
  ],
};

function clampPct(n: number) {
  return Math.min(96, Math.max(4, n));
}

/**
 * Inverts computeMatrixLayout's 10-90% mapping back to a 1-5 value with one
 * decimal place of precision (e.g. 3.4), so a quest can be dropped almost
 * anywhere in the grid rather than snapping to 5 coarse steps per axis.
 */
function pctToScale(pct: number) {
  const value = Math.round(((pct - 10) / 80) * 5 * 10) / 10;
  return Math.min(5, Math.max(0, value));
}

export function PriorityMatrix({
  tasks: initialTasks,
  theme = "calm",
  boards,
  plotIds,
  confirmImports = false,
}: {
  tasks: TaskWithBoard[];
  theme?: "calm" | "adventure";
  /** Plot mode: place these quests one by one by clicking the map. */
  plotIds?: string[];
  /** Placing a quest in plot mode also confirms it as a reviewed import. */
  confirmImports?: boolean;
  /** When given, shows a checkbox per board to choose which quests are plotted. */
  boards?: { id: string; title: string }[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [seenInitialTasks, setSeenInitialTasks] = useState(initialTasks);
  // Re-sync from fresh server props (e.g. after an edit or a revalidation)
  // whenever the prop reference changes — done during render, React's
  // recommended pattern for resetting state from props, rather than in a
  // useEffect. A drag's own optimistic update happens via commitDrag below,
  // never mid-gesture, so there's no in-progress state this could clobber.
  if (initialTasks !== seenInitialTasks) {
    setSeenInitialTasks(initialTasks);
    setTasks(initialTasks);
  }
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);
  // While dragging, the dot follows the pointer freely (not snapped to a
  // quadrant cell) so the motion feels smooth; the 1-5 importance/urgency
  // value is only computed — and persisted — on release.
  const [dragState, setDragState] = useState<{ taskId: string; xPct: number; yPct: number } | null>(null);
  // Click-vs-drag detection: reset on pointerdown, flipped once the pointer
  // has moved past CLICK_MOVE_THRESHOLD from its down position.
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const movedPastThreshold = useRef(false);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);

  const isAdventure = theme === "adventure";
  const legend = LEGEND[theme];
  // Board filter: unchecked board ids ("none" = quests without a board).
  // Remembered per browser.
  const [hiddenBoards, setHiddenBoards] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("matrix-hidden-boards") ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      if (Array.isArray(saved) && saved.length) setHiddenBoards(new Set(saved));
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggleBoard(id: string) {
    setHiddenBoards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem("matrix-hidden-boards", JSON.stringify(Array.from(next)));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }
  const visibleTasks = boards ? tasks.filter((t) => !hiddenBoards.has(t.board_id ?? "none")) : tasks;
  const plotted = computeMatrixLayout(visibleTasks);
  const hasUnboarded = tasks.some((t) => !t.board_id);
  // Looked up by id (rather than holding the task object itself) so the
  // popped-up card always reflects the latest data, including right after
  // an edit made from its own Edit button.
  const viewingTask = viewingTaskId ? (tasks.find((t) => t.id === viewingTaskId) ?? null) : null;
  const axisLabelStyle = {
    color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)",
    fontFamily: isAdventure ? "var(--font-display)" : undefined,
    fontWeight: isAdventure ? 500 : 600,
    letterSpacing: isAdventure ? "0.02em" : undefined,
  };

  // ---- Plot mode -------------------------------------------------------
  const [plotIndex, setPlotIndex] = useState(0);
  const [plotEditing, setPlotEditing] = useState(false);
  const queue = (plotIds ?? []).filter((id) => tasks.some((t) => t.id === id));
  const plotting = queue.length > 0 && plotIndex < queue.length;
  const plotTask = plotting ? (tasks.find((t) => t.id === queue[plotIndex]) ?? null) : null;

  function placeAt(clientX: number, clientY: number) {
    if (!plotTask || !gridRef.current) return;
    const r = gridRef.current.getBoundingClientRect();
    const xPct = ((clientX - r.left) / r.width) * 100;
    const yPct = ((r.bottom - clientY) / r.height) * 100;
    const urgency = pctToScale(xPct);
    const importance = pctToScale(yPct);
    const id = plotTask.id;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, importance, urgency } : t)));
    startTransition(async () => {
      await updateTaskPriorityAction(id, importance, urgency);
      if (confirmImports) await confirmImportAction("quest", id);
    });
    setPlotIndex((i) => i + 1);
  }

  function commitDrag(taskId: string, xPct: number, yPct: number) {
    const urgency = pctToScale(xPct);
    const importance = pctToScale(yPct);
    setDragState(null);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, importance, urgency } : t)));
    startTransition(() => {
      updateTaskPriorityAction(taskId, importance, urgency);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {plotIds && plotIds.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl p-3"
          style={{
            background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
            border: `2px solid ${isAdventure ? "var(--t-gold)" : "var(--t-accent)"}`,
            color: "var(--t-ink)",
          }}
          role="status"
        >
          {plotTask ? (
            <>
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{ border: "2px solid #a58c66", background: "rgba(255,255,255,.35)" }}
              >
                {plotTask.icon_key && plotTask.icon_source !== "monster" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- portrait
                  <img src={plotTask.icon_key} alt="" className="h-full w-full object-cover" />
                ) : (
                  "⚔"
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
                  Plot {plotIndex + 1} of {queue.length} — click the map where it belongs
                </span>
                <span className={`block truncate text-[16px] font-bold ${isAdventure ? "font-display" : ""}`}>{plotTask.title}</span>
                {plotTask.description && (
                  <span className="block truncate text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    {plotTask.description}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setPlotEditing(true)}
                  className="h-8 rounded-full border px-3 text-xs font-semibold"
                  style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
                >
                  Edit details
                </button>
                <button type="button" onClick={() => setPlotIndex((i) => i + 1)} className="h-7 text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
                  Skip
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="text-2xl" aria-hidden>
                ✓
              </span>
              <span className="flex-1 text-sm font-semibold">All plotted! Drag any dot to fine-tune.</span>
              <a href="/matrix" className="text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
                Done
              </a>
            </>
          )}
        </div>
      )}
      {plotEditing && plotTask && (
        <EditTaskModal task={plotTask} theme={theme} onClose={() => setPlotEditing(false)} />
      )}
      {boards && boards.length > 0 && (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5">
          <legend className="sr-only">Boards shown on the map</legend>
          {[...boards, ...(hasUnboarded ? [{ id: "none", title: "No board" }] : [])].map((b) => (
            <label
              key={b.id}
              className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"
              style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
            >
              <input
                type="checkbox"
                checked={!hiddenBoards.has(b.id)}
                onChange={() => toggleBoard(b.id)}
                className="h-5 w-5"
                style={{ accentColor: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
              />
              {b.title}
            </label>
          ))}
        </fieldset>
      )}
      {/* Sized to leave room for what's below: never taller than the screen minus the header area. */}
      <div className="mx-auto flex w-full gap-2" style={{ maxWidth: "min(100%, max(260px, calc(100svh - 420px)))" }}>
        <div
          className="flex w-6 shrink-0 flex-col items-center justify-between py-1.5 text-[11px]"
          style={{ ...axisLabelStyle, writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          <span>{isAdventure ? "VITAL" : "IMPORTANT"}</span>
          <span>{isAdventure ? "MINOR" : "NOT IMPORTANT"}</span>
        </div>

        <div className="flex-1">
          <div
            ref={gridRef}
            className="relative aspect-square w-full overflow-hidden rounded-xl"
            style={{
              background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
              border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
              borderWidth: isAdventure ? 2 : 1,
            }}
          >
            {plotTask && (
              <button
                type="button"
                aria-label={`Place “${plotTask.title}” here`}
                onClick={(e) => placeAt(e.clientX, e.clientY)}
                className="absolute inset-0 z-30 cursor-crosshair"
                style={{ background: "rgba(217,180,95,.08)", boxShadow: "inset 0 0 0 3px rgba(217,180,95,.7)" }}
              />
            )}
            <div
              className="absolute bottom-0 top-0 left-1/2 w-px"
              style={{ background: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", opacity: 0.6 }}
            />
            <div
              className="absolute left-0 right-0 top-1/2 h-px"
              style={{ background: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)", opacity: 0.6 }}
            />

            {plotted.map(({ task, xPct, yPct }) => {
              const isDragging = dragState?.taskId === task.id;
              const displayX = isDragging ? dragState.xPct : xPct;
              const displayY = isDragging ? dragState.yPct : yPct;
              const tint = rescheduleRedness(task.reschedule_count);
              const dotColor = tint ?? task.color ?? (isAdventure ? "var(--t-gold)" : "var(--t-accent)");

              return (
                <div
                  key={task.id}
                  className="group absolute -translate-x-1/2 translate-y-1/2"
                  style={{ left: `${displayX}%`, bottom: `${displayY}%`, zIndex: isDragging ? 30 : undefined }}
                >
                  <div
                    className="h-4 w-4 cursor-grab touch-none rounded-full shadow active:cursor-grabbing"
                    style={{
                      backgroundColor: dotColor,
                      border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "#fff"}`,
                      transform: isDragging ? "scale(1.4)" : undefined,
                      boxShadow: isDragging ? "0 4px 10px rgba(0,0,0,.3)" : undefined,
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      pointerDownAt.current = { x: e.clientX, y: e.clientY };
                      movedPastThreshold.current = false;
                      setDragState({ taskId: task.id, xPct, yPct });
                    }}
                    onPointerMove={(e) => {
                      if (dragState?.taskId !== task.id || !gridRef.current) return;
                      if (pointerDownAt.current) {
                        const dx = e.clientX - pointerDownAt.current.x;
                        const dy = e.clientY - pointerDownAt.current.y;
                        if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) movedPastThreshold.current = true;
                      }
                      const rect = gridRef.current.getBoundingClientRect();
                      const nx = clampPct(((e.clientX - rect.left) / rect.width) * 100);
                      const nyFromTop = ((e.clientY - rect.top) / rect.height) * 100;
                      const ny = clampPct(100 - nyFromTop);
                      setDragState({ taskId: task.id, xPct: nx, yPct: ny });
                    }}
                    onPointerUp={() => {
                      if (dragState?.taskId !== task.id) return;
                      if (movedPastThreshold.current) {
                        commitDrag(task.id, dragState.xPct, dragState.yPct);
                      } else {
                        setDragState(null); // no-op drag — just a click, handled by onClick below
                      }
                    }}
                    onClick={() => {
                      if (movedPastThreshold.current) return; // just finished a real drag, not a click
                      setViewingTaskId(task.id);
                    }}
                  />
                  <div
                    className="pointer-events-none absolute bottom-6 left-1/2 z-10 hidden w-48 -translate-x-1/2 rounded-lg p-2 text-xs shadow-lg group-hover:block"
                    style={{
                      background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
                      border: `1px solid ${isAdventure ? "var(--t-gold)" : "var(--t-card-border)"}`,
                      color: "var(--t-ink)",
                      display: isDragging ? "block" : undefined,
                    }}
                  >
                    <p className="font-medium">{task.title}</p>
                    {task.description && (
                      <p className="mt-0.5" style={{ color: "var(--t-ink-soft)" }}>
                        {task.description}
                      </p>
                    )}
                    <p className="mt-1" style={{ color: "var(--t-ink-soft)" }}>
                      Importance {(isDragging ? pctToScale(dragState.yPct) : task.importance).toFixed(1)} · Urgency{" "}
                      {(isDragging ? pctToScale(dragState.xPct) : task.urgency).toFixed(1)}
                      {task.xp_value > 0 && ` · ${task.xp_value} ${isAdventure ? "XP" : "pts"}`}
                    </p>
                  </div>
                </div>
              );
            })}

            {plotted.length === 0 && (
              <p
                className="absolute inset-0 flex items-center justify-center text-sm"
                style={{ color: "var(--t-ink-soft)" }}
              >
                No open tasks to plot yet.
              </p>
            )}
          </div>

          <div className="mt-1.5 flex justify-between text-[11px]" style={axisLabelStyle}>
            <span>{isAdventure ? "NOT URGENT" : "NOT URGENT"}</span>
            <span>URGENT</span>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px]" style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)", opacity: 0.85 }}>
        Drag a dot to re-plot its importance and urgency.
      </p>

      <div className="flex flex-col gap-2">
        {legend.map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-2.5 rounded-lg px-3 py-2"
            style={{
              background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)",
              border: `1px solid ${isAdventure ? "rgba(209,161,60,.3)" : "var(--t-card-border)"}`,
            }}
          >
            <span
              className={isAdventure ? "font-display" : ""}
              style={{
                minWidth: 118,
                fontSize: isAdventure ? 13 : 13,
                fontWeight: isAdventure ? 500 : 700,
                color: isAdventure ? "var(--t-gold)" : "var(--t-ink)",
              }}
            >
              {item.title}
            </span>
            <span className="text-xs" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: isAdventure ? 0.8 : 1 }}>
              {item.desc}
            </span>
          </div>
        ))}
      </div>

      {viewingTask && (
        <TaskViewCard task={viewingTask} theme={theme} onClose={() => setViewingTaskId(null)} />
      )}
    </div>
  );
}
