"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { listQuestStepsAction, saveQuestStepsAction } from "@/app/actions";

type Step = { id: string; title: string; done: boolean; xp: number; progress: number; seconds: number };

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

/**
 * Focus on one step at a time. The step on top is the one in focus: its own
 * timer, partial progress, and a small celebration when it's done (with its
 * XP, if it has any). Drag the cards below to change what comes next, or tap
 * Focus on one to bring it up. When a step is done you can carry the timer
 * on or start fresh. Time spent on each step is saved for insights.
 */
export function FocusSteps({ taskId }: { taskId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The focused step's timer.
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [carry, setCarry] = useState(false);
  // Seconds on the clock already credited to earlier steps (when the timer carries on).
  const credited = useRef(0);
  const [party, setParty] = useState<{ title: string; xp: number; n: number } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    listQuestStepsAction(taskId)
      .then((rows) => alive && setSteps((rows ?? []).map((r) => ({ id: r.id, title: r.title, done: r.done, xp: r.xp ?? 0, progress: r.progress ?? 0, seconds: r.seconds_spent ?? 0 }))))
      .catch(() => alive && setSteps([]));
    try {
      setCarry(window.localStorage.getItem("focus-carry-timer") === "1");
    } catch {
      /* storage unavailable */
    }
    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [running]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!steps || steps.length === 0) return null;
  const open = steps.filter((s) => !s.done);
  const done = steps.filter((s) => s.done);
  const focus = open[0] ?? null;
  const live = elapsed + (running && startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0);

  function persist(next: Step[]) {
    setSteps(next);
    setError(null);
    startTransition(async () => {
      try {
        await saveQuestStepsAction(
          taskId,
          next.map((s) => ({ id: s.id, title: s.title, done: s.done, progress: s.progress, seconds: Math.round(s.seconds) }))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that step.");
      }
    });
  }
  /** The visible order: open steps first (in their order), then the done ones. */
  const ordered = (list: Step[]) => [...list.filter((s) => !s.done), ...list.filter((s) => s.done)];

  /** Give the time since the last hand-over to step `id`. */
  function pauseInto(list: Step[], id: string | undefined): Step[] {
    if (!id) return list;
    const add = Math.max(0, live - credited.current);
    credited.current = live;
    return list.map((s) => (s.id === id ? { ...s, seconds: s.seconds + add } : s));
  }
  /** After a hand-over: carry the clock on, or start it fresh. */
  function handOver() {
    if (carry) return;
    setElapsed(0);
    credited.current = 0;
    startedAt.current = running ? Date.now() : null;
  }
  function toggleTimer() {
    if (running) {
      setElapsed(live);
      startedAt.current = null;
      setRunning(false);
    } else {
      startedAt.current = Date.now();
      setRunning(true);
    }
  }
  function resetTimer() {
    if (focus) {
      // Keep what's been spent on this step before clearing the clock.
      const list = pauseInto(steps!, focus.id);
      persist(list);
    }
    setElapsed(0);
    credited.current = 0;
    startedAt.current = running ? Date.now() : null;
  }
  function setCarryPref(v: boolean) {
    setCarry(v);
    try {
      window.localStorage.setItem("focus-carry-timer", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  function bringUp(id: string) {
    // The time so far belongs to the step that was in focus.
    const list = pauseInto(steps!, focus?.id);
    const s = list.find((x) => x.id === id)!;
    const rest = list.filter((x) => x.id !== id);
    handOver();
    persist(ordered([s, ...rest]));
  }

  function finish() {
    if (!focus) return;
    const list = pauseInto(steps!, focus.id).map((s) => (s.id === focus.id ? { ...s, done: true, progress: 100 } : s));
    setParty({ title: focus.title, xp: focus.xp, n: Date.now() });
    setTimeout(() => setParty((p) => (p && Date.now() - p.n >= 1500 ? null : p)), 1600);
    handOver();
    persist(ordered(list));
  }

  function setProgress(p: number) {
    if (!focus) return;
    persist(steps!.map((s) => (s.id === focus.id ? { ...s, progress: Math.max(0, Math.min(99, p)) } : s)));
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = open.map((s) => s.id);
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(open, from, to);
    // If the top changes, the time so far stays with the step that had focus.
    const list = reordered[0].id !== focus?.id ? pauseInto([...reordered, ...done], focus?.id) : [...reordered, ...done];
    if (reordered[0].id !== focus?.id) handOver();
    persist(list);
  }

  return (
    <div className="relative z-[1] flex w-full flex-col gap-2 text-left">
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#6b5534" }}>
        Steps · {done.length}/{steps.length}
      </span>

      {/* The step in focus */}
      {focus ? (
        <div key={focus.id} className="reveal relative flex flex-col gap-2 overflow-hidden rounded-2xl px-3.5 py-3" style={{ background: "linear-gradient(180deg, rgba(48,38,18,.94), rgba(30,24,12,.95))", border: "1.5px solid #a88a3f", boxShadow: "0 6px 16px rgba(0,0,0,.3)" }}>
          <span className="text-[11.5px] font-bold uppercase tracking-[.18em]" style={{ color: "#d9b45f" }}>
            Now
          </span>
          <span className="text-[18px] font-semibold leading-snug" style={{ color: "#f6ecd2" }}>
            {focus.title}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-display min-w-[64px] text-[24px] tabular-nums" style={{ color: "#f8e3a0" }} aria-live="off">
              {fmt(live)}
            </span>
            <button type="button" onClick={toggleTimer} className="h-9 rounded-full px-3.5 text-[13.5px] font-bold" style={{ background: running ? "transparent" : "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #d9b45f", color: running ? "#f8e3a0" : "#2a1c10" }}>
              {running ? "Pause" : live > 0 ? "Resume" : "Start"}
            </button>
            <button type="button" onClick={resetTimer} disabled={live === 0} className="h-9 rounded-full px-3 text-[13px] disabled:opacity-40" style={{ border: "1px solid rgba(217,180,95,.5)", color: "#f3e7cb" }}>
              Reset
            </button>
            {focus.seconds > 0 && (
              <span className="ml-auto text-[12px] tabular-nums" style={{ color: "rgba(243,231,203,.7)" }}>
                {fmt(focus.seconds)} before
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setProgress(focus.progress - 1)} aria-label="Less progress" className="flex h-8 w-8 items-center justify-center rounded-full text-[17px]" style={{ border: "1px solid #a88a3f", color: "#f8e3a0" }}>
              −
            </button>
            <div className="relative h-5 min-w-0 flex-1">
              <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1.5px solid #8a6c2c" }}>
                <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${focus.progress}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" }} />
              </div>
              <input type="range" min={0} max={99} value={focus.progress} onChange={(e) => setProgress(Number(e.target.value))} aria-label="Step progress" className="progress-range absolute inset-0 w-full cursor-pointer" />
            </div>
            <button type="button" onClick={() => setProgress(focus.progress + 1)} aria-label="More progress" className="flex h-8 w-8 items-center justify-center rounded-full text-[17px]" style={{ border: "1px solid #a88a3f", color: "#f8e3a0" }}>
              +
            </button>
            <span className="w-9 text-right text-[13px] font-bold tabular-nums" style={{ color: "#f8e3a0" }}>
              {focus.progress}%
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={finish} className="hover-glow h-10 flex-1 rounded-full text-[15px] font-bold" style={{ background: "linear-gradient(180deg,#7cc06a,#4f9a3f)", border: "1.5px solid #2f5a26", color: "#fff" }}>
              ✓ Step done{focus.xp ? ` · +${focus.xp} XP` : ""}
            </button>
            <label className="flex min-h-9 cursor-pointer items-center gap-1.5 text-[12.5px]" style={{ color: "#f3e7cb" }} title="When a step is done, keep the clock running for the next one">
              <input type="checkbox" checked={carry} onChange={(e) => setCarryPref(e.target.checked)} />
              Keep timer going
            </label>
          </div>
          {party && (
            <div key={party.n} className="step-party pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-live="polite">
              <span className="font-display text-[22px] font-bold" style={{ color: "#ffe39a", textShadow: "0 0 14px rgba(255,214,102,.8)" }}>
                Step done!
              </span>
              {party.xp > 0 && (
                <span className="text-[16px] font-bold" style={{ color: "#f6ecd2" }}>
                  +{party.xp} XP
                </span>
              )}
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} className="step-confetto" style={{ "--a": `${(i / 14) * 360}deg`, "--d": `${70 + (i % 3) * 22}px`, background: ["#f2c94c", "#58a04a", "#e2bf63", "#c0503a", "#f6e6bb"][i % 5] } as React.CSSProperties} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="reveal m-0 rounded-2xl px-3.5 py-3 text-[15px] font-semibold" style={{ background: "rgba(88,160,74,.15)", border: "1.5px solid #58a04a", color: "var(--t-ink)" }}>
          Every step is done. Finish the quest when you&rsquo;re ready.
        </p>
      )}

      {/* Up next: drag to reorder, or bring one up */}
      {open.length > 1 && (
        <DndContext id={`dnd-focus-${taskId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={open.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {open.slice(1).map((s) => (
                <UpNext key={s.id} step={s} onFocus={() => bringUp(s.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {done.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {done.map((s) => (
            <li key={s.id} className="flex min-h-9 items-center gap-2 text-[14.5px]" style={{ color: "var(--t-ink-soft)" }}>
              <span aria-hidden style={{ color: "#58a04a" }}>✓</span>
              <span className="min-w-0 flex-1 truncate line-through">{s.title}</span>
              {s.seconds > 0 && <span className="text-[12px] tabular-nums">{fmt(s.seconds)}</span>}
              <button type="button" onClick={() => persist(ordered(steps.map((x) => (x.id === s.id ? { ...x, done: false, progress: 0 } : x))))} className="text-[12px] underline" title="Not done after all">
                undo
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function UpNext({ step, onFocus }: { step: Step; onFocus: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: step.id });
  return (
    <li
      ref={setNodeRef}
      className="flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1, background: "rgba(255,250,235,.55)", border: "1px solid rgba(139,112,64,.3)", position: "relative", zIndex: isDragging ? 5 : undefined }}
    >
      <button type="button" {...attributes} {...listeners} aria-label={`Move ${step.title}`} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center" style={{ color: "rgba(110,85,40,.55)" }}>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" aria-hidden>
          {[2, 7, 12].map((y) => (
            <g key={y}>
              <circle cx="2" cy={y} r="1.2" />
              <circle cx="6" cy={y} r="1.2" />
            </g>
          ))}
        </svg>
      </button>
      <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--t-ink)" }}>
        {step.title}
        {step.progress > 0 && <span className="ml-1.5 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>{step.progress}%</span>}
      </span>
      <button type="button" onClick={onFocus} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
        Focus
      </button>
    </li>
  );
}
