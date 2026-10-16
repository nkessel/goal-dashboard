"use client";

import { Panel, Portrait, type LabTask } from "./shared";

type StepTask = LabTask & { steps_total?: number; steps_done?: number; next_step?: string | null };

function progressOf(t: StepTask) {
  const byPct = (t.progress ?? 0) / 100;
  const bySteps = t.steps_total ? (t.steps_done ?? 0) / t.steps_total : 0;
  return Math.max(byPct, bySteps);
}

/**
 * The goal-gradient effect: effort speeds up as the finish nears. Quests
 * already under way line up by how close they are to done, each on its own
 * track. Quests with steps but none ticked get a nudge to take a head start.
 */
export function FinishLine<T extends StepTask>({ tasks, isAdventure, onOpen }: { tasks: T[]; isAdventure: boolean; onOpen: (t: T) => void }) {
  const running = tasks.filter((t) => progressOf(t) > 0 && progressOf(t) < 1).sort((a, b) => progressOf(b) - progressOf(a));
  const ready = tasks.filter((t) => (t.steps_total ?? 0) > 0 && (t.steps_done ?? 0) === 0 && (t.progress ?? 0) === 0);

  const left = (t: T) => {
    if (t.steps_total) {
      const n = t.steps_total - (t.steps_done ?? 0);
      return `${n} step${n === 1 ? "" : "s"} left`;
    }
    return `${Math.round((1 - progressOf(t)) * 100)}% to go`;
  };

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-4 px-4 py-4">
      <div className="relative z-[1] flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h3 className={`m-0 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
            Closest to the finish
          </h3>
          {running.length === 0 ? (
            <p className="m-0 text-[14px]" style={{ color: "var(--t-ink-soft)" }}>
              Nothing under way yet. Tick a step or nudge a quest&apos;s progress, and it lines up here.
            </p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {running.map((t) => {
                const p = progressOf(t);
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => onOpen(t)} className="flex w-full flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left hover:bg-black/[.03]" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
                      <span className="flex items-center gap-2">
                        <Portrait t={t} size={26} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                          {t.title}
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold" style={{ color: p >= 0.75 ? "#3f6a2c" : "#5a4a30" }}>
                          {left(t)}
                        </span>
                      </span>
                      {/* The track: the marker runs toward the flag. */}
                      <span className="relative block h-3" aria-hidden>
                        <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ background: "rgba(139,112,64,.22)" }} />
                        <span className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ width: `${p * 100}%`, background: "linear-gradient(90deg,#d9b45f,#a8812e)" }} />
                        <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${p * 100}%`, background: "radial-gradient(circle at 35% 30%, #fbe7a6, #d9b45f 55%, #8a6116)", border: "1.5px solid #4a3913" }} />
                        <svg className="absolute -top-1 right-0" width="12" height="18" viewBox="0 0 12 18">
                          <path d="M1.5 17V1.5" stroke="#4a3913" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="M2 2h8l-2 3 2 3H2z" fill="#3f6a2c" />
                        </svg>
                      </span>
                      {t.next_step && (
                        <span className="text-[13px]" style={{ color: "#5a4a30" }}>
                          Next: {t.next_step}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {ready.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className={`m-0 ${isAdventure ? "font-display text-[17px]" : "text-[15px] font-bold"}`} style={{ color: "var(--t-ink)" }}>
              Ready for a head start
            </h3>
            <p className="m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
              Progress already on the board pulls you forward. Tick the easiest first step of one of these.
            </p>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {ready.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onOpen(t)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-black/[.03]">
                    <Portrait t={t} size={22} />
                    <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ color: "var(--t-ink)" }}>
                      {t.title}
                    </span>
                    <span className="shrink-0 truncate text-[12.5px]" style={{ color: "#5a4a30", maxWidth: "45%" }}>
                      {t.next_step ? `First: ${t.next_step}` : `${t.steps_total} steps`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Panel>
  );
}
