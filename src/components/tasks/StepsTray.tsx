"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listQuestStepsAction, saveQuestStepsAction, setTaskProgressAction } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { descendants, parentKeys, stepPayload, stepsShare, treeOrder, type StepDraft } from "@/lib/quest-steps";
import type { Task } from "@/lib/data/types";

/**
 * Slides out under a quest card that has steps: tick them off right there.
 * Ticking pulls the quest's progress (and its share of the XP) up, like the
 * editor does; with every step done it offers to complete the quest.
 */
export function StepsTray({ task, isAdventure, onEdit, onComplete }: { task: Task; isAdventure: boolean; onEdit: () => void; onComplete: () => void }) {
  const router = useRouter();
  const [steps, setSteps] = useState<StepDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pop, setPop] = useState<number | null>(null);
  const [, start] = useTransition();
  useEffect(() => {
    listQuestStepsAction(task.id).then(
      (rows) => setSteps(treeOrder((rows ?? []).map((r) => ({ key: r.id, id: r.id, title: r.title, done: r.done, xp: r.xp ?? 0, weight: r.weight ?? null, progress: r.progress ?? (r.done ? 100 : 0), state: r.state ?? null, parentKey: r.parent_id ?? null })))),
      () => setError("Couldn't load the steps.")
    );
  }, [task.id]);

  const holders = steps ? parentKeys(steps) : new Set<string>();
  const live = (steps ?? []).filter((st) => !holders.has(st.key) && st.state !== "skipped");
  const allDone = live.length > 0 && live.every((st) => st.done);

  function tick(key: string, done: boolean) {
    if (!steps) return;
    const next = steps.map((st) => (st.key === key ? { ...st, done, progress: done ? 100 : 0, state: null } : st));
    setSteps(next);
    setError(null);
    start(async () => {
      try {
        const res = await saveQuestStepsAction(task.id, stepPayload(next));
        let xp = res.xpEarned;
        // The steps carry the quest along: its progress rises to what they add up to (never down here).
        const share = stepsShare(next);
        if (share > (task.progress ?? 0) && share < 100) {
          const p = await setTaskProgressAction(task.id, share);
          xp += p.xpEarned;
          if (p.xpEarned > 0) celebrateProgress({ title: task.title, xp: p.xpEarned, coinsEarned: p.coinsEarned, fromPct: task.progress ?? 0, toPct: share, steps: { done: next.filter((s) => s.done).length, total: next.length } });
        }
        if (xp > 0) {
          setPop(xp);
          setTimeout(() => setPop(null), 1600);
        }
        router.refresh();
      } catch (e) {
        setSteps(steps);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  // Groups (steps with steps inside) fold; the one holding your next step starts open.
  const nextKey = steps?.find((st) => !holders.has(st.key) && !st.done && st.state !== "skipped" && st.state !== "failed")?.key ?? null;
  const [openGroups, setOpenGroups] = useState<Set<string> | null>(null);
  const groupOpen = (key: string) => (openGroups ? openGroups.has(key) : !!(nextKey && steps && descendants(steps, key).has(nextKey)));
  const toggleGroup = (key: string) => {
    const now = new Set(steps ? [...holders].filter((k) => groupOpen(k)) : []);
    if (now.has(key)) now.delete(key);
    else now.add(key);
    setOpenGroups(now);
  };
  const doneCount = live.filter((x) => x.done).length;
  const pct = live.length ? Math.round((doneCount / live.length) * 100) : 0;
  const ink = isAdventure ? "#3a2a10" : "var(--t-ink)";
  const soft = isAdventure ? "#7a6440" : "var(--t-ink-soft)";

  const renderList = (parent: string | null, depth: number): React.ReactNode => {
    const here = (steps ?? []).filter((st) => (st.parentKey ?? null) === parent);
    if (!here.length) return null;
    return (
      <ul className="m-0 flex list-none flex-col p-0" style={depth ? { marginLeft: 11, paddingLeft: 10, borderLeft: `1.5px solid ${isAdventure ? "rgba(168,138,63,.35)" : "var(--t-card-border)"}` } : undefined}>
        {here.map((st) => {
          if (holders.has(st.key)) {
            const inside = [...descendants(steps!, st.key)].filter((k) => k !== st.key && !holders.has(k)).map((k) => steps!.find((y) => y.key === k)!);
            const done = inside.filter((x) => x.done || x.state === "skipped").length;
            const open = groupOpen(st.key);
            const all = inside.length > 0 && done === inside.length;
            return (
              <li key={st.key} className="flex flex-col">
                <button type="button" onClick={() => toggleGroup(st.key)} aria-expanded={open} className="step-group flex min-h-9 w-full items-center gap-2 rounded-lg px-1 text-left">
                  <GroupRing done={done} total={inside.length} isAdventure={isAdventure} />
                  <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${all ? "opacity-60" : ""}`} style={{ color: ink }}>
                    {st.title}
                  </span>
                  <span className="text-[11.5px] tabular-nums" style={{ color: soft }}>
                    {done}/{inside.length}
                  </span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform duration-300" style={{ color: soft, transform: open ? "rotate(180deg)" : undefined }}>
                    <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="drawer-body" data-open={open ? "true" : "false"}>
                  <div className="drawer-inner" inert={!open}>
                    {renderList(st.key, depth + 1)}
                  </div>
                </div>
              </li>
            );
          }
          const struck = st.state === "skipped" || st.state === "failed";
          const checked = st.done;
          const isNext = st.key === nextKey;
          return (
            <li key={st.key}>
              <label className={`step-row flex min-h-8 items-center gap-2.5 rounded-lg px-1 py-[3px] ${struck ? "" : "cursor-pointer"} ${isNext ? "step-next" : ""}`}>
                <input type="checkbox" checked={checked} disabled={struck} onChange={(e) => tick(st.key, e.target.checked)} className="peer sr-only" />
                <span
                  aria-hidden
                  className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] transition-all duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-[#8a6116]"
                  style={
                    checked
                      ? isAdventure
                        ? { background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "1.5px solid #4a3913", boxShadow: "0 0 6px rgba(242,210,126,.5), inset 0 1px 0 rgba(255,255,255,.6)" }
                        : { border: "1.5px solid var(--t-good)", background: "var(--t-good)" }
                      : { background: "rgba(255,250,238,.85)", border: `1.5px solid ${isAdventure ? "#b39a6a" : "var(--t-card-border)"}`, boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)" }
                  }
                >
                  {checked && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="gold-check-draw">
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={isAdventure ? "#3a2a10" : "#fff"} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`min-w-0 flex-1 text-[13.5px] leading-snug transition-opacity duration-300 ${checked || struck ? "line-through opacity-55" : ""}`} style={{ color: ink }}>
                  {st.title}
                </span>
                {isNext && (
                  <span className="shrink-0 rounded-full px-1.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: "#6b4a12", background: "rgba(226,187,92,.28)" }}>
                    Next
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div
      className={`steps-tray relative mx-2 rounded-b-2xl px-3 pb-2.5 pt-5 ${isAdventure ? "parchment" : ""}`}
      onClick={(e) => e.stopPropagation()}
      // A scroll unrolled from under the card: parchment, a gilded hairline inside the edge.
      style={
        isAdventure
          ? { borderRadius: "0 0 16px 16px", border: "1.5px solid #a88a3f", borderTop: 0, boxShadow: "inset 0 7px 9px -6px rgba(60,40,10,.4), inset 0 0 0 3px rgba(255,248,226,.45), inset 0 0 0 4px rgba(168,138,63,.35)" }
          : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", borderTop: 0, boxShadow: "inset 0 6px 8px -6px rgba(60,40,10,.35)" }
      }
    >
      <div className="relative z-[1] flex flex-col">
        {steps && steps.length > 0 && (
          // How far along: a gilded bar that fills as you tick.
          <div className="mb-1.5 flex items-center gap-2.5 px-1">
            <span className={isAdventure ? "font-display text-[14.5px]" : "text-[12px] font-bold uppercase tracking-wide"} style={{ color: isAdventure ? "#6b4a12" : soft }}>
              Steps
            </span>
            <span className="relative h-[7px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(90,64,20,.16)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.18)" }}>
              <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#c99a3a,#f2d27e)", boxShadow: "0 0 6px rgba(242,210,126,.6)" }} />
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: soft }}>
              {doneCount}/{live.length}
            </span>
          </div>
        )}
        {steps === null && !error && (
          <p className="m-0 px-1 text-[13px] italic" style={{ color: soft }}>
            Unrolling the steps…
          </p>
        )}
        {steps && <div className="max-h-[320px] overflow-y-auto overscroll-contain pr-0.5">{renderList(null, 0)}</div>}
        {error && (
          <p role="alert" className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-2.5 px-1 text-[13px]">
          {pop !== null && (
            <span aria-live="polite" className="xp-pop font-bold" style={{ color: "var(--t-xp)" }}>
              +{pop} XP
            </span>
          )}
          {allDone && (
            <button type="button" onClick={onComplete} className={`reveal h-8 rounded-full px-3 text-[13px] font-semibold ${isAdventure ? "one-thing-primary" : ""}`} style={isAdventure ? undefined : { background: "linear-gradient(180deg,#8fae7a,#6f8f5c)", color: "#fbf6e8", border: "1px solid #56703f" }}>
              All done · complete it
            </button>
          )}
          <button type="button" onClick={onEdit} className="ml-auto flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-semibold" style={{ color: soft }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
            Edit steps
          </button>
        </div>
      </div>
    </div>
  );
}

/** A group's progress: a small gilded ring that closes as its steps are done. */
function GroupRing({ done, total, isAdventure }: { done: number; total: number; isAdventure: boolean }) {
  const r = 7.5;
  const c = 2 * Math.PI * r;
  const f = total ? done / total : 0;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <circle cx="10" cy="10" r={r} fill="none" stroke={isAdventure ? "rgba(139,112,64,.3)" : "var(--t-card-border)"} strokeWidth="2.5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke={isAdventure ? "#c99a3a" : "var(--t-good)"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 10 10)" style={{ transition: "stroke-dasharray 400ms ease-out" }} />
      {f === 1 && <path d="M6.5 10.2l2.3 2.3 4.7-4.9" stroke={isAdventure ? "#6b4a12" : "var(--t-good)"} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
