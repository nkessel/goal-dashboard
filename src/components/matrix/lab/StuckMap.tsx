"use client";

import { useState, useTransition } from "react";
import { addToTopOfTodayAction, createQuestAction, deleteTaskAction, freshStartAction } from "@/app/actions";
import { Panel, Portrait, type LabTask } from "./shared";

const D = 86_400_000;

/**
 * Quests that keep slipping, sized by how often they've been moved. Each
 * offers a way out: break it into steps, shrink it to a five-minute start,
 * give it a fresh start, or let it go.
 */
export function StuckMap<T extends LabTask>({ tasks, now, isAdventure, onOpen }: { tasks: T[]; now: number; isAdventure: boolean; onOpen: (t: T) => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const overdueDays = (t: T) => {
    const iso = t.due_at ?? (t.is_on_calendar ? t.scheduled_start : null);
    return iso ? (now - new Date(iso).getTime()) / D : 0;
  };
  const stuck = tasks
    .filter((t) => !gone.has(t.id) && ((t.reschedule_count ?? 0) >= 1 || overdueDays(t) > 2))
    .sort((a, b) => (b.reschedule_count ?? 0) - (a.reschedule_count ?? 0) || overdueDays(b) - overdueDays(a));
  const sel = stuck.find((t) => t.id === picked) ?? null;

  function run(label: string, fn: () => Promise<unknown>, hide = false) {
    if (!sel) return;
    const id = sel.id;
    setNote(null);
    startTransition(async () => {
      try {
        await fn();
        if (hide) setGone((g) => new Set(g).add(id));
        setNote(label);
        setPicked(null);
        setConfirmDrop(false);
      } catch (e) {
        setNote(e instanceof Error ? e.message : "Couldn't do that.");
      }
    });
  }

  const action = "hover-glow flex min-h-[48px] flex-col items-start justify-center rounded-xl px-3 py-1.5 text-left";
  const actionStyle = { background: "rgba(255,250,238,.75)", border: "1.5px solid rgba(139,112,64,.4)", color: "var(--t-ink)" };

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-3 px-4 py-4">
      <p className="relative z-[1] m-0 text-[13.5px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        Bigger means it&apos;s been moved more often. Pick one and choose a way out.
      </p>
      {note && (
        <p role="status" className="relative z-[1] m-0 text-[14px] font-semibold" style={{ color: "#3f5a2c" }}>
          {note}
        </p>
      )}
      {stuck.length === 0 ? (
        <p className="relative z-[1] m-0 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
          Nothing is stuck. Every quest is moving.
        </p>
      ) : (
        <ul className="relative z-[1] m-0 flex list-none flex-wrap items-end gap-3 p-0">
          {stuck.map((t) => {
            const n = t.reschedule_count ?? 0;
            const size = Math.min(84, 40 + n * 8);
            const on = picked === t.id;
            return (
              <li key={t.id} className="flex flex-col items-center gap-1" style={{ width: Math.max(size, 76) }}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(on ? null : t.id);
                    setConfirmDrop(false);
                  }}
                  aria-pressed={on}
                  aria-label={`${t.title}, moved ${n} times`}
                  className="relative rounded-full"
                  style={{ boxShadow: on ? "0 0 0 3px #f2d27e, 0 0 0 5px #8a6116" : n >= 3 ? "0 0 0 2px rgba(227,73,72,.75)" : undefined }}
                >
                  <Portrait t={t} size={size} />
                  {n > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-bold tabular-nums" style={{ background: "#7a2f1f", color: "#fff6e0", border: "1.5px solid #f2d27e" }}>
                      ↻{n}
                    </span>
                  )}
                </button>
                <span className="line-clamp-2 text-center text-[12.5px] leading-tight" style={{ color: "var(--t-ink)" }}>
                  {t.title}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {sel && (
        <div className="relative z-[1] flex flex-col gap-2 rounded-xl p-3" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.35)" }}>
          <p className="m-0 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
            {sel.title}
          </p>
          {confirmDrop ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px]" style={{ color: "var(--t-ink)" }}>
                Delete this quest for good?
              </span>
              <button type="button" disabled={isPending} onClick={() => run(`Let go of “${sel.title}”.`, () => deleteTaskAction(sel.id), true)} className="h-9 rounded-full px-4 text-[14px] font-semibold" style={{ background: "#8f2f22", color: "#fff" }}>
                Delete it
              </button>
              <button type="button" onClick={() => setConfirmDrop(false)} className="h-9 rounded-full px-3 text-[14px] underline" style={{ color: "var(--t-ink-soft)" }}>
                Keep it
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" className={action} style={actionStyle} onClick={() => onOpen(sel)}>
                <span className="text-[14px] font-semibold">Break it down</span>
                <span className="text-[12px] opacity-75">Add small steps</span>
              </button>
              <button
                type="button"
                disabled={isPending}
                className={action}
                style={actionStyle}
                onClick={() =>
                  run(`Added “Just start: ${sel.title}” to the top of Today.`, async () => {
                    const id = await createQuestAction({ title: `Just start: ${sel.title}`, importance: sel.importance, urgency: sel.urgency, xpValue: 5, estimateMinutes: 5, effort: 1 });
                    await addToTopOfTodayAction(id);
                  })
                }
              >
                <span className="text-[14px] font-semibold">Shrink it</span>
                <span className="text-[12px] opacity-75">A 5-minute start, on Today</span>
              </button>
              <button type="button" disabled={isPending} className={action} style={actionStyle} onClick={() => run(`Fresh start for “${sel.title}”.`, () => freshStartAction(sel.id))}>
                <span className="text-[14px] font-semibold">Fresh start</span>
                <span className="text-[12px] opacity-75">Clear its slipped count</span>
              </button>
              <button type="button" className={action} style={{ ...actionStyle, background: "transparent" }} onClick={() => setConfirmDrop(true)}>
                <span className="text-[14px] font-semibold">Let it go</span>
                <span className="text-[12px] opacity-75">Delete it</span>
              </button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
