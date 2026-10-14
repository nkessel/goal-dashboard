"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { TaskWithBoard } from "@/lib/data/tasks";
import { computeMatrixLayout } from "@/lib/matrix-layout";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestCardPopup } from "@/components/tasks/QuestCardPopup";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { confirmImportAction, updateTaskPriorityAction } from "@/app/actions";

// A pointer that moves less than this (px) between down and up is treated as
// a click/tap that opens the view card, not a drag — the dot ends up
// getting pointer capture either way, so a real click event still fires
// even after a drag, and this is what tells the two apart.
const CLICK_MOVE_THRESHOLD = 4;

/**
 * Quadrant washes, in LEGEND order. Importance runs along X (right = more
 * important) and urgency along Y (top = more urgent), so: important & urgent
 * = top-right, important only = bottom-right, urgent only = top-left,
 * neither = bottom-left.
 */
const QUADRANT_TINT = ["rgba(196,72,40,.13)", "rgba(79,109,60,.13)", "rgba(56,104,140,.12)", "rgba(107,98,82,.10)"];
const QUADRANT_CORNER: { side: "left" | "right"; edge: "top" | "bottom" }[] = [
  { side: "right", edge: "top" },
  { side: "right", edge: "bottom" },
  { side: "left", edge: "top" },
  { side: "left", edge: "bottom" },
];
const QUADRANT_POS: React.CSSProperties[] = [
  { right: 0, top: 0, borderTopRightRadius: 14 },
  { right: 0, bottom: 0, borderBottomRightRadius: 14 },
  { left: 0, top: 0, borderTopLeftRadius: 14 },
  { left: 0, bottom: 0, borderBottomLeftRadius: 14 },
];

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
  const [filterOpen, setFilterOpen] = useState(false);
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
  // Quests never rated (importance and urgency both 0) wait in a tray below
  // instead of piling up along the bottom edge.
  const unrated = visibleTasks.filter((t) => !t.importance && !t.urgency);
  const plotted = computeMatrixLayout(visibleTasks.filter((t) => t.importance || t.urgency));
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
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [localPlot, setLocalPlot] = useState<string[] | null>(null);
  const queue = (localPlot ?? plotIds ?? []).filter((id) => tasks.some((t) => t.id === id));
  const plotting = queue.length > 0 && plotIndex < queue.length;
  const plotTask = plotting ? (tasks.find((t) => t.id === queue[plotIndex]) ?? null) : null;

  function placeAt(clientX: number, clientY: number) {
    if (!plotTask || !gridRef.current) return;
    const r = gridRef.current.getBoundingClientRect();
    const xPct = ((clientX - r.left) / r.width) * 100;
    const yPct = ((r.bottom - clientY) / r.height) * 100;
    const importance = pctToScale(xPct);
    const urgency = pctToScale(yPct);
    const id = plotTask.id;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, importance, urgency } : t)));
    startTransition(async () => {
      await updateTaskPriorityAction(id, importance, urgency);
      if (confirmImports) await confirmImportAction("quest", id);
    });
    setPlotIndex((i) => i + 1);
  }

  function commitDrag(taskId: string, xPct: number, yPct: number) {
    const importance = pctToScale(xPct);
    const urgency = pctToScale(yPct);
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
                  <QuestMonogram id={plotTask.id} title={plotTask.title} size={48} />
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
              <Link href="/matrix" className="text-xs underline" style={{ color: "var(--t-ink-soft)" }}>
                Done
              </Link>
            </>
          )}
        </div>
      )}
      {plotEditing && plotTask && (
        <EditTaskModal task={plotTask} theme={theme} onClose={() => setPlotEditing(false)} />
      )}
      {boards && boards.length > 0 && (() => {
        const all = [...boards, ...(hasUnboarded ? [{ id: "none", title: "No board" }] : [])];
        const shown = all.filter((b) => !hiddenBoards.has(b.id)).length;
        return (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
              className="hover-glow flex min-h-10 items-center gap-2 self-start rounded-full px-4 text-[14.5px]"
              style={{ background: isAdventure ? "rgba(15,19,13,.55)" : "var(--t-card)", border: `1px solid ${isAdventure ? "rgba(217,180,95,.45)" : "var(--t-card-border)"}`, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
              </svg>
              <span>
                {isAdventure ? "Showing quests from " : "Showing tasks from "}
                <b style={{ color: isAdventure ? "var(--t-gold)" : undefined }}>{shown === all.length ? "all boards" : `${shown} of ${all.length} boards`}</b>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: filterOpen ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="drawer-body" data-open={filterOpen ? "true" : "false"}>
              <div className="drawer-inner">
                <fieldset className={`board-filter ${isAdventure ? "board-filter-adventure" : "board-filter-calm"} flex flex-wrap items-center gap-x-2 gap-y-2 pb-1 pt-1`}>
                  <legend className="sr-only">Show quests from these boards</legend>
                  {all.map((b) => (
                    <label key={b.id} className="board-chip">
                      <input type="checkbox" className="sr-only" checked={!hiddenBoards.has(b.id)} onChange={() => toggleBoard(b.id)} />
                      <svg className="board-chip-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                        <path d="M2.5 6.4 5 8.8 9.6 3.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>{b.title}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Sized to leave room for what's below: never taller than the screen minus the header area. */}
      <div className="mx-auto flex w-full gap-2" style={{ maxWidth: "min(100%, max(260px, calc(100svh - 420px)))" }}>
        {/* Vertical axis: two rotated labels pinned to the top and bottom. */}
        <div className="relative w-6 shrink-0" style={axisLabelStyle} aria-hidden>
          <span className="absolute left-1/2 top-2 origin-center whitespace-nowrap text-[14px]" style={{ transform: "translateX(-50%) rotate(180deg)", writingMode: "vertical-rl" }}>
            Urgent ↑
          </span>
          <span className="absolute bottom-2 left-1/2 origin-center whitespace-nowrap text-[14px]" style={{ transform: "translateX(-50%) rotate(180deg)", writingMode: "vertical-rl" }}>
            {isAdventure ? "Can wait" : "Not urgent"}
          </span>
        </div>

        <div className="flex-1">
          <div
            ref={gridRef}
            className={`relative aspect-square w-full rounded-2xl ${isAdventure ? "parchment" : ""}`}
            style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
          >
            {/* Quadrant washes + titles */}
            {legend.map((q, i) => (
              <div key={q.title} className="pointer-events-none absolute h-1/2 w-1/2" style={{ ...QUADRANT_POS[i], background: QUADRANT_TINT[i] }}>
                <span
                  className={`absolute text-[15px] italic ${QUADRANT_CORNER[i].side === "right" ? "right-3" : "left-3"} ${QUADRANT_CORNER[i].edge === "top" ? "top-2.5" : "bottom-2.5"}`}
                  style={{ color: "var(--t-ink-soft)", opacity: 0.85 }}
                >
                  {q.title}
                </span>
              </div>
            ))}
            {plotTask && (
              <button
                type="button"
                aria-label={`Place “${plotTask.title}” here`}
                onClick={(e) => placeAt(e.clientX, e.clientY)}
                onPointerMove={(e) => {
                  if (e.pointerType !== "mouse") return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setGhost({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onPointerLeave={() => setGhost(null)}
                className="absolute inset-0 z-30"
                style={{
                  background: "rgba(217,180,95,.08)",
                  boxShadow: "inset 0 0 0 3px rgba(217,180,95,.7)",
                  cursor: ghost ? "none" : "pointer",
                  borderRadius: 14,
                }}
              >
                {ghost && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-full"
                    style={{
                      left: ghost.x,
                      top: ghost.y,
                      width: 40,
                      height: 40,
                      transform: "translate(-50%, -50%)",
                      background: "#f3e6c8",
                      border: "2px solid #8a6c2c",
                      boxShadow: "0 0 0 3px rgba(217,180,95,.55), 0 6px 14px rgba(0,0,0,.4)",
                    }}
                  >
                    {plotTask.icon_key && (plotTask.icon_source === "ai" || plotTask.icon_source === "library") ? (
                      // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                      <img src={plotTask.icon_key} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <QuestMonogram id={plotTask.id} title={plotTask.title} size={36} />
                    )}
                  </span>
                )}
              </button>
            )}
            <div
              className="absolute bottom-0 top-0 left-1/2 w-0"
              style={{ borderLeft: `1.5px dashed ${isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)"}` }}
            />
            <div
              className="absolute left-0 right-0 top-1/2 h-0"
              style={{ borderTop: `1.5px dashed ${isAdventure ? "rgba(139,112,64,.55)" : "var(--t-card-border)"}` }}
            />

            {plotted.map(({ task, xPct, yPct }) => {
              const isDragging = dragState?.taskId === task.id;
              const displayX = isDragging ? dragState.xPct : xPct;
              const displayY = isDragging ? dragState.yPct : yPct;
              const tint = rescheduleRedness(task.reschedule_count);
              const dotColor = tint ?? task.color ?? (isAdventure ? "var(--t-gold)" : "var(--t-accent)");
              const pinImg = task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;

              return (
                <div
                  key={task.id}
                  className="group absolute -translate-x-1/2 translate-y-1/2 hover:z-40"
                  style={{ left: `${displayX}%`, bottom: `${displayY}%`, zIndex: isDragging ? 40 : undefined }}
                >
                  <div
                    className="flex cursor-grab touch-none items-center justify-center overflow-hidden rounded-full active:cursor-grabbing"
                    style={{
                      width: isAdventure ? 34 : 16,
                      height: isAdventure ? 34 : 16,
                      backgroundColor: isAdventure ? "#f3e6c8" : dotColor,
                      border: `2px solid ${isAdventure ? (tint ? "var(--t-warn)" : "#8a6c2c") : "#fff"}`,
                      transform: isDragging ? "scale(1.3)" : undefined,
                      boxShadow: isAdventure
                        ? `0 0 0 2px rgba(217,180,95,.45), 0 ${isDragging ? 6 : 2}px ${isDragging ? 12 : 5}px rgba(0,0,0,.35)`
                        : isDragging
                          ? "0 4px 10px rgba(0,0,0,.3)"
                          : undefined,
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
                  >
                    {isAdventure &&
                      (pinImg ? (
                        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                        <img src={pinImg} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
                      ) : (
                        <span className="pointer-events-none h-full w-full">
                          <QuestMonogram id={task.id} title={task.title} size={30} />
                        </span>
                      ))}
                  </div>
                  <div
                    className={`pointer-events-none absolute z-10 hidden w-56 rounded-xl p-2.5 text-[13.5px] shadow-lg group-hover:block ${isAdventure ? "parchment" : ""}`}
                    style={{
                      ...(displayY > 62 ? { top: isAdventure ? 40 : 22 } : { bottom: isAdventure ? 40 : 22 }),
                      ...(displayX < 28 ? { left: -8 } : displayX > 72 ? { right: -8 } : { left: "50%", transform: "translateX(-50%)" }),
                      background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
                      border: `1px solid ${isAdventure ? "var(--t-gold)" : "var(--t-card-border)"}`,
                      color: "var(--t-ink)",
                      display: isDragging ? "block" : undefined,
                    }}
                  >
                    <p className="text-[15px] font-semibold leading-snug">{task.title}</p>
                    {task.description && (
                      <p className="mt-0.5" style={{ color: "var(--t-ink-soft)" }}>
                        {task.description}
                      </p>
                    )}
                    <p className="mt-1" style={{ color: "var(--t-ink-soft)" }}>
                      Importance {(isDragging ? pctToScale(dragState.xPct) : task.importance).toFixed(1)} · Urgency{" "}
                      {(isDragging ? pctToScale(dragState.yPct) : task.urgency).toFixed(1)}
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

          <div className="mt-1.5 flex justify-between text-[14px]" style={axisLabelStyle}>
            <span>{isAdventure ? "Minor" : "Not important"}</span>
            <span>Important →</span>
          </div>
        </div>
      </div>

      {unrated.length > 0 && !plotting && (
        <section className="flex flex-col gap-2 rounded-2xl px-3 py-3" style={{ background: isAdventure ? "rgba(14,18,10,.4)" : "var(--t-card)", border: `1px solid ${isAdventure ? "rgba(217,180,95,.3)" : "var(--t-card-border)"}` }}>
          <div className="flex items-center gap-2">
            <h2 className={`m-0 flex-1 ${isAdventure ? "font-display text-[17px]" : "text-sm font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
              Not yet plotted <span className="font-normal opacity-70">({unrated.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => {
                setLocalPlot(unrated.map((t) => t.id));
                setPlotIndex(0);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hover-glow h-9 rounded-full px-3.5 text-[13.5px] font-semibold"
              style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
            >
              Plot them one by one
            </button>
          </div>
          <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1 [scrollbar-width:thin]">
            {unrated.map((t) => {
              const img = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
              return (
                <li key={t.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setLocalPlot([t.id]);
                      setPlotIndex(0);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    title={`Plot “${t.title}”`}
                    className="flex w-[72px] flex-col items-center gap-1 rounded-xl p-1 text-center"
                  >
                    <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full" style={{ border: "2px solid #8a6c2c", background: "#f3e6c8" }}>
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <QuestMonogram id={t.id} title={t.title} size={44} />
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11.5px] leading-tight" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
                      {t.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="m-0 text-center text-[14px] italic" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)", opacity: 0.8 }}>
        Drag a quest to re-plot it; tap one to see it.
      </p>

      <div
        className={`flex flex-col rounded-2xl px-5 py-3 ${isAdventure ? "parchment parchment-framed" : ""}`}
        style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
      >
        {legend.map((item, i) => (
          <div
            key={item.title}
            className="relative z-[1] flex items-center gap-3 py-2"
            style={i === 0 ? undefined : { borderTop: `1px solid ${isAdventure ? "rgba(139,112,64,.3)" : "var(--t-card-border)"}` }}
          >
            <span
              aria-hidden
              className="h-5 w-5 shrink-0 rounded-md"
              style={{ background: QUADRANT_TINT[i].replace(/[\d.]+\)$/, ".55)"), border: "1px solid rgba(80,60,20,.35)" }}
            />
            <span className="w-[130px] shrink-0 text-[16.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
              {item.title}
            </span>
            <span className="text-[14.5px]" style={{ color: "var(--t-ink-soft)" }}>
              {item.desc}
            </span>
          </div>
        ))}
      </div>

      {viewingTask && <QuestCardPopup task={viewingTask} theme={theme} onClose={() => setViewingTaskId(null)} />}
    </div>
  );
}
