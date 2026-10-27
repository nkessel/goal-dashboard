"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { listQuestStepsAction, saveQuestStepsAction, setTaskProgressAction } from "@/app/actions";
import { stepsShare } from "@/lib/quest-steps";
import { getFocusTimer, spentSeconds, useFocusTimer } from "@/lib/focus-timer";

type Step = { id: string; title: string; done: boolean; xp: number; progress: number; seconds: number; state?: "skipped" | "failed" | null; group?: string | null };
type Holder = { id: string; title: string; done: boolean };

const stamp = () => Date.now();

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

/**
 * Focus on one step at a time, on the quest's one timer (above): the time it
 * runs while a step is on top is that step's, and each finished step shows
 * how long it took. Tick a step below to finish it, tap Focus to bring it up,
 * or drag it to change what comes next. Time spent on each step is saved for
 * insights.
 */
export function FocusSteps({ taskId, progress = 0 }: { taskId: string; /** The quest's own progress, which its steps carry upward. */ progress?: number }) {
  const questPct = useRef(progress);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The quest's timer; the step on top collects what it runs from `mark` on.
  const timer = useFocusTimer();
  const mine = timer.task?.id === taskId;
  const running = mine && timer.runStart !== null;
  const [tick, setTick] = useState(0);
  const [mark, setMark] = useState(0);
  const holders = useRef<Holder[]>([]);
  const [party, setParty] = useState<{ title: string; xp: number; n: number } | null>(null);

  useEffect(() => {
    let alive = true;
    listQuestStepsAction(taskId)
      .then((rows) => {
        if (!alive) return;
        const list = rows ?? [];
        // Steps holding sub-tasks stay as they are; focus works through the sub-tasks (each labelled with its step).
        const parentIds = new Set(list.map((r) => r.parent_id).filter(Boolean) as string[]);
        const title = new Map(list.map((r) => [r.id, r.title]));
        holders.current = list.filter((r) => parentIds.has(r.id)).map((r) => ({ id: r.id, title: r.title, done: r.done }));
        const kids = new Map<string | null, typeof list>();
        for (const r of list) kids.set(r.parent_id ?? null, [...(kids.get(r.parent_id ?? null) ?? []), r]);
        const ordered: typeof list = [];
        const walk = (p: string | null) => {
          for (const r of kids.get(p) ?? []) {
            ordered.push(r);
            walk(r.id);
          }
        };
        walk(null);
        setSteps(ordered.filter((r) => !parentIds.has(r.id)).map((r) => ({ id: r.id, title: r.title, done: r.done, xp: r.xp ?? 0, progress: r.progress ?? 0, seconds: r.seconds_spent ?? 0, state: r.state ?? null, group: r.parent_id ? (title.get(r.parent_id) ?? null) : null })));
        // Time already on the clock belongs to whatever came before.
        const t = getFocusTimer();
        setMark(t.task?.id === taskId ? spentSeconds(t, Date.now()) : 0);
      })
      .catch(() => alive && setSteps([]));
    return () => {
      alive = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  if (!steps || steps.length === 0) return null;
  const open = steps.filter((s) => !s.done && !s.state);
  const done = steps.filter((s) => s.done || !!s.state);
  const focus = open[0] ?? null;
  const live = mine ? spentSeconds(timer, running ? tick || timer.runStart! : 0) : 0;
  // A reset quest timer starts the step afresh too.
  const onThisStep = Math.max(0, live - Math.min(mark, live));

  function persist(next: Step[]) {
    setSteps(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveQuestStepsAction(
          taskId,
          [...next.map((s) => ({ id: s.id, title: s.title, done: s.done, progress: s.progress, seconds: Math.round(s.seconds), state: s.done ? null : (s.state ?? null) })), ...holders.current.map((h) => ({ id: h.id, title: h.title, done: h.done }))]
        );
        // As in the steps tray: the quest's progress rises to what its steps add up to (never down here).
        const share = stepsShare(res.steps.map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.done, xp: r.xp, weight: r.weight, progress: r.progress, state: r.state, parentKey: r.parent_id })));
        if (share > questPct.current && share < 100) {
          questPct.current = share;
          await setTaskProgressAction(taskId, share);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that step.");
      }
    });
  }
  /** The visible order: open steps first (in their order), then the done ones. */
  const ordered = (list: Step[]) => [...list.filter((s) => !s.done && !s.state), ...list.filter((s) => s.done || !!s.state)];

  /** Give the time since the last hand-over to step `id`; the next step starts from now. */
  function pauseInto(list: Step[], id: string | undefined): Step[] {
    setMark(live);
    if (!id) return list;
    return list.map((s) => (s.id === id ? { ...s, seconds: s.seconds + onThisStep } : s));
  }

  /** Skip a step, or mark that it didn't happen: it moves out of the way. */
  function settle(id: string, state: "skipped" | "failed") {
    const list = pauseInto(steps!, focus?.id).map((x) => (x.id === id ? { ...x, state, done: false, progress: 0 } : x));
    persist(ordered(list));
  }
  function bringUp(id: string) {
    // The time so far belongs to the step that was in focus.
    const list = pauseInto(steps!, focus?.id);
    const s = list.find((x) => x.id === id)!;
    const rest = list.filter((x) => x.id !== id);
    persist(ordered([s, ...rest]));
  }

  /** Finish a step: the one in focus, or one ticked off in the list below. */
  function finish(id = focus?.id) {
    const step = steps!.find((x) => x.id === id);
    if (!step) return;
    // Only the step in focus collects the clock's time.
    const list = (id === focus?.id ? pauseInto(steps!, id) : steps!).map((s) => (s.id === id ? { ...s, done: true, progress: 100 } : s));
    const n = stamp();
    setParty({ title: step.title, xp: step.xp, n });
    setTimeout(() => setParty((p) => (p?.n === n ? null : p)), 1600);
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
    persist(list);
  }

  return (
    <div className="relative z-[1] flex w-full flex-col gap-2 text-left">
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#6b5534" }}>
        Steps · {steps.filter((x) => x.done).length}/{steps.filter((x) => x.state !== "skipped").length}
      </span>

      {/* The step in focus: just its name, its time on the quest's clock, and what to do with it. */}
      {focus ? (
        <div key={focus.id} className="reveal relative flex flex-col gap-2 overflow-hidden rounded-2xl px-3.5 py-3" style={{ background: "rgba(255,248,226,.6)", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)" }}>
          <div className="flex items-baseline gap-2">
            <span className="text-[11.5px] font-bold uppercase tracking-[.18em]" style={{ color: "#8a6116" }}>
              Now{focus.group ? ` · ${focus.group}` : ""}
            </span>
            <span className="ml-auto text-[12.5px] tabular-nums" style={{ color: "#6b5534" }} title="Time on this step (the quest's timer above)">
              {fmt(focus.seconds + onThisStep)} on this step
            </span>
          </div>
          <span className="font-display text-[19px] leading-snug" style={{ color: "var(--t-ink)" }}>
            {focus.title}
          </span>
          <div className="-mb-1 flex items-center justify-between text-[11.5px]" style={{ color: "#6b5534" }}>
            <span>How far along this step is (slide to set)</span>
            <span className="font-semibold tabular-nums">{focus.progress}%</span>
          </div>
          <div className="relative h-4">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: "rgba(120,90,40,.15)", border: "1px solid rgba(139,112,64,.4)" }}>
              <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${focus.progress}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)" }} />
            </div>
            <input type="range" min={0} max={99} value={focus.progress} onChange={(e) => setProgress(Number(e.target.value))} aria-label="Step progress" title={`${focus.progress}% done`} className="progress-range absolute inset-0 w-full cursor-pointer" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => finish()} className="one-thing-primary h-10 flex-1 rounded-full text-[15px] font-bold">
              ✓ Complete step{focus.xp ? ` · +${focus.xp} XP` : ""}
            </button>
            <button type="button" onClick={() => settle(focus.id, "skipped")} className="h-10 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(139,112,64,.45)", color: "#4a3c26" }} title="Skip this step">
              Skip
            </button>
            <button type="button" onClick={() => settle(focus.id, "failed")} className="h-10 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px solid rgba(181,70,46,.45)", color: "#9a3b26" }} title="It didn't happen">
              Didn&rsquo;t happen
            </button>
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
                <UpNext key={s.id} step={s} onFocus={() => bringUp(s.id)} onDone={() => finish(s.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {done.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {done.map((s) => (
            <li key={s.id} className="flex min-h-9 items-center gap-2 text-[14.5px]" style={{ color: s.state === "failed" ? "#b5321f" : s.state === "skipped" ? "#9a9286" : "var(--t-ink-soft)" }}>
              <span aria-hidden style={{ color: s.state === "failed" ? "#b5321f" : s.state === "skipped" ? "#9a9286" : "#58a04a", fontWeight: 700 }}>
                {s.state === "failed" ? "✗" : s.state === "skipped" ? "⏭" : "✓"}
              </span>
              <span className="min-w-0 flex-1 truncate line-through" style={s.state ? { textDecorationColor: "currentColor" } : undefined}>{s.title}</span>
              {s.seconds > 0 && <span className="text-[12px] tabular-nums">{fmt(s.seconds)}</span>}
              <button type="button" onClick={() => persist(ordered(steps.map((x) => (x.id === s.id ? { ...x, done: false, progress: 0, state: null } : x))))} className="text-[12px] underline" title="Back to open">
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

function UpNext({ step, onFocus, onDone }: { step: Step; onFocus: () => void; onDone: () => void }) {
  // The whole card drags to change the order; the box ticks it off.
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: step.id });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex min-h-11 cursor-grab touch-pan-y items-center gap-2.5 rounded-xl px-2.5 py-1.5"
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1, background: "rgba(255,250,235,.55)", border: "1px solid rgba(139,112,64,.3)", position: "relative", zIndex: isDragging ? 5 : undefined }}
    >
      <button type="button" onClick={onDone} onPointerDown={(e) => e.stopPropagation()} role="checkbox" aria-checked={false} aria-label={`Complete ${step.title}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ border: "2px solid #8a6c2c", background: "rgba(255,255,255,.5)" }} />
      <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--t-ink)" }}>
        {step.title}
        {step.progress > 0 && <span className="ml-1.5 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>{step.progress}%</span>}
      </span>
      <button type="button" onClick={onFocus} onPointerDown={(e) => e.stopPropagation()} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}>
        Focus
      </button>
    </li>
  );
}
