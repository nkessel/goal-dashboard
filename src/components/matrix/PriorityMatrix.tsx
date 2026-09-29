"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { TaskWithBoard } from "@/lib/data/tasks";
import { computeMatrixLayout } from "@/lib/matrix-layout";
import { rescheduleRedness } from "@/lib/reschedule-redness";
import { setTaskMatrixPositionAction } from "@/app/actions";

const GRID_LINES = [20, 40, 60, 80];

/** Plot position (10%-90%) back to a 1-5 score, to one decimal place. */
const toScore = (pct: number) => Math.min(5, Math.max(1, Math.round((1 + ((pct - 10) / 80) * 4) * 10) / 10));

type Drag = { id: string; startX: number; startY: number; x: number; y: number; moved: boolean };

export function PriorityMatrix({ tasks: initial }: { tasks: TaskWithBoard[] }) {
  const [tasks, setTasks] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setTasks(initial);
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const areaRef = useRef<HTMLDivElement>(null);

  const plotted = computeMatrixLayout(tasks);

  function pctFromEvent(e: React.PointerEvent) {
    const r = areaRef.current!.getBoundingClientRect();
    return {
      x: Math.min(96, Math.max(4, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(96, Math.max(4, ((r.bottom - e.clientY) / r.height) * 100)),
    };
  }

  function onDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = pctFromEvent(e);
    setDrag({ id, startX: e.clientX, startY: e.clientY, x, y, moved: false });
  }

  function onMove(e: React.PointerEvent) {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5;
    const { x, y } = pctFromEvent(e);
    setDrag({ ...drag, x, y, moved });
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      setSelected((s) => (s === d.id ? null : d.id));
      return;
    }
    const task = tasks.find((t) => t.id === d.id);
    if (!task) return;
    const importance = toScore(d.y);
    const urgency = toScore(d.x);
    setSelected(d.id);
    if (importance === task.importance && urgency === task.urgency) return;
    const before = tasks;
    setTasks(tasks.map((t) => (t.id === d.id ? { ...t, importance, urgency } : t)));
    setError(null);
    startTransition(async () => {
      try {
        await setTaskMatrixPositionAction(d.id, importance, urgency);
      } catch (err) {
        setTasks(before);
        setError(err instanceof Error ? err.message : "Couldn't move that task");
      }
    });
  }

  const sel = tasks.find((t) => t.id === selected);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex w-6 shrink-0 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-xs font-medium text-zinc-500">Importance →</span>
        </div>

        <div className="flex-1">
          <div
            ref={areaRef}
            className="relative aspect-square w-full touch-none select-none rounded-xl border border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            {GRID_LINES.map((pct) => (
              <div key={`h-${pct}`} className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-zinc-200 dark:border-zinc-800" style={{ bottom: `${pct}%` }} />
            ))}
            {GRID_LINES.map((pct) => (
              <div key={`v-${pct}`} className="pointer-events-none absolute bottom-0 top-0 border-l border-dashed border-zinc-200 dark:border-zinc-800" style={{ left: `${pct}%` }} />
            ))}

            <span className="pointer-events-none absolute right-2 top-2 text-[10px] uppercase tracking-wide text-zinc-400">Do first</span>
            <span className="pointer-events-none absolute bottom-2 right-2 text-[10px] uppercase tracking-wide text-zinc-400">Quick wins</span>
            <span className="pointer-events-none absolute left-2 top-2 text-[10px] uppercase tracking-wide text-zinc-400">Schedule</span>
            <span className="pointer-events-none absolute bottom-2 left-2 text-[10px] uppercase tracking-wide text-zinc-400">Reconsider</span>

            {plotted.map(({ task, xPct, yPct }) => {
              const tint = rescheduleRedness(task.reschedule_count);
              const dragging = drag?.id === task.id && drag.moved;
              const x = dragging ? drag.x : xPct;
              const y = dragging ? drag.y : yPct;
              const isSel = selected === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  aria-label={`${task.title} — importance ${task.importance}, urgency ${task.urgency}. Drag to move.`}
                  aria-pressed={isSel}
                  className={`group absolute flex h-8 w-8 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full ${dragging ? "z-20 cursor-grabbing" : "z-10 cursor-grab"}`}
                  style={{ left: `${x}%`, bottom: `${y}%` }}
                  onPointerDown={(e) => onDown(e, task.id)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected((s) => (s === task.id ? null : task.id));
                    }
                  }}
                >
                  <span
                    className={`block rounded-full border-2 border-white shadow transition-transform dark:border-zinc-950 ${isSel || dragging ? "h-5 w-5 ring-2 ring-amber-400" : "h-4 w-4 group-hover:scale-125"}`}
                    style={{ backgroundColor: tint ?? task.color ?? "#4f46e5" }}
                  />
                  {!dragging && !isSel && (
                    <span className="pointer-events-none absolute bottom-8 left-1/2 hidden w-max max-w-48 -translate-x-1/2 truncate rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow group-hover:block">
                      {task.title}
                    </span>
                  )}
                </button>
              );
            })}

            {drag?.moved && (
              <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-zinc-900/85 px-2 py-1 text-xs text-white">
                Importance {toScore(drag.y)} · Urgency {toScore(drag.x)}
              </span>
            )}

            {plotted.length === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">No open tasks to plot yet.</p>
            )}
          </div>

          <div className="mt-1 flex justify-between text-xs text-zinc-500">
            <span>1</span>
            <span>Urgency →</span>
            <span>5</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {sel ? (
        <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{sel.title}</p>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close details" className="rounded-full px-2 text-zinc-500">
              ×
            </button>
          </div>
          {sel.description && <p className="text-zinc-500">{sel.description}</p>}
          <p className="text-xs text-zinc-500">
            Importance {sel.importance} · Urgency {sel.urgency}
            {sel.xp_value > 0 && ` · ${sel.xp_value} XP`}
          </p>
          {sel.board_id && (
            <Link href={`/boards/${sel.board_id}`} className="self-start text-xs font-semibold text-amber-700 underline">
              Open its board
            </Link>
          )}
        </div>
      ) : (
        plotted.length > 0 && <p className="text-xs text-zinc-500">Tap a quest to see its details, or drag it to change its importance and urgency.</p>
      )}
    </div>
  );
}
