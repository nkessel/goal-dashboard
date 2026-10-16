"use client";

import { Panel, Portrait, type LabTask } from "./shared";

type StepTask = LabTask & { steps_total?: number; steps_done?: number; next_step?: string | null };

/** How hard a quest is to *begin* (0 easy – 1 hard), and why. */
function friction(t: StepTask) {
  const minutes = t.estimate_minutes ?? 30;
  const time = Math.max(0, Math.min(1, Math.log(Math.max(minutes, 5) / 5) / Math.log(48)));
  const effort = t.effort ? (t.effort - 1) / 4 : 0.5;
  const hasSteps = (t.steps_total ?? 0) > (t.steps_done ?? 0);
  const unclear = hasSteps ? 0 : minutes > 30 || t.estimate_minutes == null ? 1 : 0.4;
  const resist = Math.min(1, (t.reschedule_count ?? 0) / 4);
  const score = 0.35 * time + 0.25 * effort + 0.25 * unclear + 0.15 * resist;
  const why = [time > 0.6 && "long", effort > 0.6 && "draining", unclear === 1 && "no first step written", resist > 0.4 && "keeps slipping"].filter(Boolean) as string[];
  return { score, why, hasSteps };
}

/**
 * Starting is the hard part. Quests are ranked by how easy they are to
 * begin — length, effort, whether the first step is written down, and how
 * often they've slipped — each with its smallest next step.
 */
export function StartFriction<T extends StepTask>({ tasks, isAdventure, onOpen }: { tasks: T[]; isAdventure: boolean; onOpen: (t: T) => void }) {
  const rows = tasks.map((t) => ({ t, ...friction(t) })).sort((a, b) => a.score - b.score);

  return (
    <Panel isAdventure={isAdventure} className="flex flex-col gap-3 px-4 py-4">
      <div className="relative z-[1] flex items-center justify-between gap-3 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        <span>Easiest to start at the top.</span>
        <span className="flex items-center gap-1.5">
          easy
          <span className="inline-block h-2 w-16 rounded-full" style={{ background: "linear-gradient(90deg, #e9d7a6, #6b4410)" }} />
          hard
        </span>
      </div>
      <ol className="relative z-[1] m-0 flex list-none flex-col p-0">
        {rows.slice(0, 25).map(({ t, score, why, hasSteps }, i) => (
          <li key={t.id} style={i ? { borderTop: "1px solid rgba(139,112,64,.18)" } : undefined}>
            <button type="button" onClick={() => onOpen(t)} className="flex w-full items-start gap-2.5 rounded-lg px-1 py-2 text-left hover:bg-black/[.03]">
              <Portrait t={t} size={28} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
                    {t.title}
                  </span>
                  <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.1)" }} aria-label={`Friction ${Math.round(score * 100)} of 100`}>
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(6, score * 100)}%`, background: "linear-gradient(90deg, #e9d7a6, #6b4410)" }} />
                  </span>
                </span>
                <span className="text-[13px] leading-snug" style={{ color: "#4d4535" }}>
                  {hasSteps && t.next_step ? (
                    <>
                      <b>Smallest step:</b> {t.next_step}
                    </>
                  ) : (
                    <>
                      <b>Smallest step:</b> open it and write the first two-minute step.
                    </>
                  )}
                </span>
                {why.length > 0 && (
                  <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                    Harder because: {why.join(", ")}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
