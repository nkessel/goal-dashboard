"use client";

import { useEffect, useState } from "react";
import { InlineNumber } from "@/components/ui/InlineNumber";
import { LinkOuts } from "@/components/ui/Linked";
import { CoinIcon } from "@/components/ui/Icons";
import { progressWords } from "@/lib/progress-words";
import { descendants, stepsShare, stepWeights, treeOrder, type StepDraft } from "@/lib/quest-steps";
import { AutoGrowText } from "./AutoGrowText";
import type { useQuestSteps } from "./use-quest-steps";

type Steps = ReturnType<typeof useQuestSteps>;

/**
 * The sub-quests drawer (E6): out of the "+ Sub-quests" pill, with a caret pointing up at it. The list
 * and its operations come from `useQuestSteps` in the dialog; only which ⋯ menu and which detail row are
 * open live here.
 */
export function EditorSteps({ subPillRef, steps, stepXpPop, stepsTotal, isAdventure, addingStep, setAddingStep, openSteps, setOpenSteps, holders, isCompleted, updateStep, setStepDone, renameStep, addSubStep, removeStep, addStep, newStepRef, xp, newStep, setNewStep, newStepMore, setNewStepMore, newStepMinutes, setNewStepMinutes }: {
  subPillRef: React.RefObject<HTMLButtonElement | null>;
  steps: StepDraft[] | null;
  stepXpPop: number | null;
  stepsTotal: number;
  isAdventure: boolean;
  addingStep: boolean;
  setAddingStep: (b: boolean) => void;
  openSteps: Set<string>;
  setOpenSteps: Steps["setOpenSteps"];
  holders: Set<string>;
  isCompleted: boolean;
  updateStep: Steps["updateStep"];
  setStepDone: Steps["setStepDone"];
  renameStep: Steps["renameStep"];
  addSubStep: Steps["addSubStep"];
  removeStep: Steps["removeStep"];
  addStep: Steps["addStep"];
  newStepRef: React.RefObject<HTMLInputElement | null>;
  xp: number;
  newStep: string;
  setNewStep: (v: string) => void;
  newStepMore: boolean;
  setNewStepMore: Steps["setNewStepMore"];
  newStepMinutes: number | null;
  setNewStepMinutes: (v: number | null) => void;
}) {
  const [stepMenu, setStepMenu] = useState<string | null>(null);
  /** The sub-quest whose time, progress and XP share are open under its card (from its ⋯). */
  const [stepDetail, setStepDetail] = useState<string | null>(null);
  const [stepMenuUp, setStepMenuUp] = useState(false);
  // A sub-quest's ⋯ menu closes on a click outside it or Escape (it stayed open; owner, Nov 5).
  useEffect(() => {
    if (!stepMenu) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.("[data-step-menu]") || t?.closest?.("[data-feedback-root]")) return;
      setStepMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setStepMenu(null);
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [stepMenu]);
  return (
    <div className="relative mt-1.5 flex flex-col gap-1 rounded-xl px-3 pb-2.5 pt-2" style={{ background: "#f7eed6", border: "1px solid rgba(139,112,64,.4)" }} data-steps-drawer>
      <span aria-hidden className="absolute -top-[6px] h-[11px] w-[11px] rotate-45" ref={(el) => {
        // Points at the "+ Sub-quests" pill, wherever it sits in the row above.
        const pill = subPillRef.current;
        const box = el?.parentElement;
        if (!el || !pill || !box) return;
        el.style.left = `${Math.max(10, pill.getBoundingClientRect().left - box.getBoundingClientRect().left + pill.offsetWidth / 2 - 6)}px`;
      }} style={{ background: "#f7eed6", borderLeft: "1px solid rgba(139,112,64,.4)", borderTop: "1px solid rgba(139,112,64,.4)" }} />
      {((steps && steps.length > 0) || stepXpPop !== null) && (
        <span className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[12.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
          {steps && steps.length > 0 && (
            <>
              {/* How far the sub-quests carry the quest, labelled (owner, Nov 4). */}
              <span className="h-2.5 min-w-[40px] max-w-[160px] flex-1 overflow-hidden rounded-full" style={{ background: "#141a13", border: "1px solid #8a6c2c", boxShadow: "inset 0 1px 3px rgba(0,0,0,.6)" }} aria-label={`Sub-quests ${stepsShare(steps)}% done`}>
                <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${stepsShare(steps)}%`, background: "linear-gradient(180deg, #f8e3a0, #d9b45f 55%, #a88a3f)", boxShadow: "0 0 6px rgba(242,210,126,.5)" }} />
              </span>
              <span>{stepsShare(steps)}% done</span>
            </>
          )}
          {stepXpPop !== null && (
            <span aria-live="polite" className="power-spark text-[13px] font-bold" style={{ color: "var(--t-xp)" }}>
              +{stepXpPop} XP
            </span>
          )}
        </span>
      )}
                  {steps === null && (stepsTotal ?? 0) > 0 ? (
                    // Loading: hold the steps' place so the editor doesn't jump when they arrive.
                    <ul className="m-0 flex list-none flex-col p-0" aria-busy="true" aria-label="Loading sub-quests">
                      {Array.from({ length: stepsTotal ?? 0 }).map((_, i) => (
                        <li key={i} className="flex items-center gap-2 py-[5px] pl-1">
                          <span className="h-[18px] w-[18px] shrink-0 rounded-[5px]" style={{ border: `1.5px solid ${isAdventure ? "#8a6c2c" : "var(--t-card-border)"}`, opacity: 0.5 }} />
                          <span className="step-skeleton h-[14px] rounded" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                        </li>
                      ))}
                    </ul>
                  ) : steps === null || (steps.length === 0 && !addingStep) ? null : (
                    <ul className="m-0 flex list-none flex-col p-0">
                      {(() => {
                        const ordered = treeOrder(steps);
                        const wl = stepWeights(steps);
                        const wOf = new Map(steps.map((x, i) => [x.key, wl[i]]));
                        const depthOf = (x: StepDraft) => {
                          let d = 0;
                          let p = x.parentKey;
                          while (p && d < 6) {
                            d += 1;
                            p = steps.find((y) => y.key === p)?.parentKey ?? null;
                          }
                          return d;
                        };
                        const shownSteps = ordered.filter((x) => {
                          let p = x.parentKey;
                          while (p) {
                            if (!openSteps.has(p)) return false;
                            p = steps.find((y) => y.key === p)?.parentKey ?? null;
                          }
                          return true;
                        });
                        return shownSteps.map((st) => {
                        const isHolder = holders.has(st.key);
                        const inside = isHolder ? [...descendants(steps, st.key)].filter((k) => k !== st.key && !holders.has(k)).map((k) => steps.find((y) => y.key === k)!) : [];
                        const insideDone = inside.filter((x) => x.done).length;
                        const checked = isHolder ? inside.length > 0 && inside.every((x) => x.done || x.state === "skipped") : st.done;
                        const depth = depthOf(st);
                        return (
                        <li key={st.key} data-step-key={st.key} className="quest-step mb-1.5 flex flex-col rounded-[10px] py-0.5 pl-2 pr-0.5" style={{ background: "rgba(255,250,236,.85)", border: "1px solid rgba(139,112,64,.32)", ...(depth ? { marginLeft: depth * 22 } : {}) }}>
                        <div className="flex items-start gap-1.5">
                          {isHolder ? (
                            <button
                              type="button"
                              onClick={() => setOpenSteps((o) => { const n = new Set(o); if (n.has(st.key)) n.delete(st.key); else n.add(st.key); return n; })}
                              aria-expanded={openSteps.has(st.key)}
                              aria-label={openSteps.has(st.key) ? `Hide the sub-tasks of ${st.title}` : `Show the sub-tasks of ${st.title}`}
                              className="-ml-[20px] mt-[4px] flex h-5 w-4 shrink-0 items-center justify-center"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: openSteps.has(st.key) ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
                                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={st.state ? `Reopen ${st.title}` : st.done ? `Untick ${st.title}` : `Tick ${st.title}`}
                            disabled={isCompleted}
                            onClick={() => (st.state ? updateStep(st.key, { state: null }) : setStepDone(st.key, !checked))}
                            className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                            style={{
                              // Round gold, like the quest's own check (owner's pick C, Nov 20).
                              border: `1.5px solid ${checked ? "#8a6116" : st.state === "failed" ? "#b5321f" : st.state === "skipped" ? "#9a9286" : "#a4884f"}`,
                              background: checked ? "radial-gradient(circle at 35% 30%, #f8e3a0, #c9a24a)" : st.state === "failed" ? "#b5321f" : st.state === "skipped" ? "#b7b0a4" : "transparent",
                            }}
                            title={st.state === "skipped" ? "Skipped — tap to reopen" : st.state === "failed" ? "Failed — tap to reopen" : undefined}
                          >
                            {checked && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#3b2a14" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {st.state === "skipped" && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M5 6l7 6-7 6M13 6l7 6-7 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {st.state === "failed" && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
                              </svg>
                            )}
                          </button>
                          <AutoGrowText
                            value={st.title}
                            onChange={(v) => renameStep(st.key, v.replace(/\n/g, " "))}
                            onKeyDown={(e) => {
                              // Enter: on to writing the next step.
                              if (e.key === "Enter" && !isCompleted) {
                                e.preventDefault();
                                // Inside a step: the next sub-task beside this one. At the top: the next step.
                                if (st.parentKey) addSubStep(st.parentKey, st.key);
                                else {
                                  setAddingStep(true);
                                  requestAnimationFrame(() => newStepRef.current?.focus());
                                }
                              }
                            }}
                            ariaLabel="Step"
                            className={`bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] text-[16px] leading-snug focus:outline-none ${st.state ? "line-through" : ""}`}
                            style={st.state === "failed" ? { color: "#b5321f", textDecorationColor: "#b5321f" } : st.state === "skipped" ? { color: "#9a9286", textDecorationColor: "#9a9286" } : { color: "var(--t-ink)" }}
                          />
                          <span className="mt-[3px] shrink-0">
                            <LinkOuts text={st.title} iconOnly />
                          </span>
                          {isHolder && (
                            <button type="button" onClick={() => setOpenSteps((o) => new Set(o).add(st.key))} className="mt-[3px] flex h-7 shrink-0 items-center rounded-full px-2 text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-ink-soft)", border: "1px solid rgba(139,112,64,.35)" }} title="Sub-tasks done">
                              {progressWords(insideDone, inside.length)}
                            </button>
                          )}
                          {/* Its time estimate, once set (⋯ › Time estimate), like the time on a quest card. */}
                          {!isHolder && st.minutes ? (
                            <span className="mt-[3px] flex h-7 shrink-0 items-center gap-0.5 text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--t-ink-soft)" }} title="Time estimate">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                              {st.minutes >= 60 ? `${Math.floor(st.minutes / 60)}h${st.minutes % 60 ? ` ${st.minutes % 60}m` : ""}` : `${st.minutes}m`}
                            </span>
                          ) : null}
                          {/* The XP it brings, on its row; its share and how far along sit behind ⋯ › Time, progress & XP share. */}
                          {!isHolder && (
                            <span className="mt-[3px] flex h-7 shrink-0 items-center text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--t-xp)" }} title="XP this sub-quest brings">
                              {Math.round((wOf.get(st.key) ?? 0) * xp) + (st.xp ?? 0)} XP
                            </span>
                          )}
                          {/* Its own coins, once given (⋯ › Give coins; owner, Nov 14): tap the number to change it. */}
                          {!isHolder && (st.coins ?? 0) > 0 && (
                            <span className="mt-[3px] flex h-7 shrink-0 items-center gap-0.5 text-[12.5px] font-semibold" style={{ color: "#8a6116" }} title="Coins this sub-quest brings (tap to change; 0 takes them off)">
                              <InlineNumber value={st.coins ?? 0} min={0} max={100} suffix="" label={`Coins for ${st.title}`} onChange={(v) => updateStep(st.key, { coins: v })} />
                              <CoinIcon size={13} />
                            </span>
                          )}
                          <span className="relative shrink-0" data-step-menu>
                            <button
                              type="button"
                              onClick={(e) => {
                                // Opens upward when it would run past the bottom of the editor (it floats; nothing below moves).
                                {
                                  const box = e.currentTarget.closest("[role=dialog]")?.getBoundingClientRect();
                                  setStepMenuUp(e.currentTarget.getBoundingClientRect().bottom > Math.min(window.innerHeight, box?.bottom ?? window.innerHeight) - 290);
                                }
                                setStepMenu(stepMenu === st.key ? null : st.key);
                              }}
                              aria-haspopup="menu"
                              aria-expanded={stepMenu === st.key}
                              aria-label={`More for ${st.title}`}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]"
                              style={{ color: "var(--t-ink-soft)" }}
                            >
                              ⋯
                            </button>
                            {stepMenu === st.key && (
                              <span role="menu" className={`card-pop-in parchment absolute right-0 ${stepMenuUp ? "bottom-8" : "top-8"} z-30 flex w-[220px] flex-col overflow-hidden py-1`} style={{ borderRadius: 12, boxShadow: "0 10px 24px rgba(0,0,0,.3)" }}>
                                {(
                                  [
                                    // Order and words from the owner (Nov 4): Skip, then Remove, Failed last, all in black ink.
                                    ...(!isHolder ? [["detail", "◷", "Time, progress & XP share", "var(--t-ink)"]] : []),
                                    ["sub", "＋", "Add a sub-task", "var(--t-ink)"],
                                    ...(!isHolder && !(st.coins ?? 0) ? [["coins", "◎", "Give coins", "var(--t-ink)"]] : []),
                                    ...(st.state || st.done ? [["open", "↺", "Back to open", "var(--t-ink)"]] : []),
                                    ...(st.state !== "skipped" ? [["skip", "»", "Skip", "var(--t-ink)"]] : []),
                                    ["remove", "−", "Remove", "var(--t-ink)"],
                                    ...(st.state !== "failed" ? [["fail", "✕", "Failed", "var(--t-ink)"]] : []),
                                  ] as [string, string, string, string][]
                                ).map(([k, icon, label, color]) => (
                                  <button
                                    key={k}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setStepMenu(null);
                                      if (k === "sub") addSubStep(st.key);
                                      if (k === "detail") setStepDetail((d) => (d === st.key ? null : st.key));
                                      if (k === "coins") updateStep(st.key, { coins: 1 });
                                      if (k === "skip") updateStep(st.key, { state: "skipped", done: false, progress: 0 });
                                      if (k === "fail") updateStep(st.key, { state: "failed", done: false, progress: 0 });
                                      if (k === "open") updateStep(st.key, { state: null, done: false, progress: 0 });
                                      if (k === "remove") removeStep(st.key);
                                    }}
                                    className="relative z-[1] flex min-h-10 items-center gap-2.5 px-3.5 text-left text-[14.5px] hover:bg-black/5"
                                    style={{ color }}
                                  >
                                    <span aria-hidden className="w-4 text-center">{icon}</span>
                                    {label}
                                  </button>
                                ))}
                              </span>
                            )}
                          </span>
                        </div>
                        {/* Labelled, and each number is typed over in place (owner, Nov 4): how far along it is, and its share of the quest's XP. */}
                        {!isHolder && !isCompleted && stepDetail === st.key && (
                          <div className="reveal ml-[26px] mr-9 flex flex-col gap-0.5 pb-1 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                            <span className="flex items-center gap-2">
                              <span className="w-[74px] shrink-0">Time</span>
                              <InlineNumber value={st.minutes ?? 0} min={0} max={1440} suffix=" min" label={`Time estimate for ${st.title}, in minutes`} onChange={(v) => updateStep(st.key, { minutes: v > 0 ? v : null })} className="justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
                            </span>
                            {!st.done && !st.state && (
                              <span className="flex items-center gap-2">
                                <span className="w-[74px] shrink-0">Done</span>
                                <InlineNumber value={st.progress ?? 0} label={`How far along ${st.title} is, in percent`} onChange={(v) => updateStep(st.key, { progress: v, done: v >= 100 })} className="w-[38px] justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={st.progress ?? 0}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    updateStep(st.key, { progress: v, done: v >= 100 });
                                  }}
                                  aria-label={`How far along ${st.title} is`}
                                  className="step-progress min-w-0 flex-1"
                                  style={{ ["--p" as string]: `${st.progress ?? 0}%` }}
                                />
                              </span>
                            )}
                            <span className="flex items-center gap-2">
                              <span className="w-[74px] shrink-0">Share of XP</span>
                              <InlineNumber value={st.weight ?? Math.round((wOf.get(st.key) ?? 0) * 100)} min={1} label={`Share of the quest's XP for ${st.title}, in percent`} onChange={(v) => updateStep(st.key, { weight: v })} className="w-[38px] justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
                              <input
                                type="range"
                                min={1}
                                max={100}
                                value={st.weight ?? Math.round((wOf.get(st.key) ?? 0) * 100)}
                                onChange={(e) => updateStep(st.key, { weight: Number(e.target.value) })}
                                aria-label={`Share of the quest's XP for ${st.title}, in percent`}
                                className="step-progress min-w-0 flex-1"
                                style={{ ["--p" as string]: `${st.weight ?? Math.round((wOf.get(st.key) ?? 0) * 100)}%` }}
                              />
                              {st.weight != null && (
                                <button type="button" onClick={() => updateStep(st.key, { weight: null })} className="shrink-0 underline underline-offset-2" title="Back to an equal share">
                                  equal
                                </button>
                              )}
                            </span>
                          </div>
                        )}
                        </li>
                        );
                        });
                      })()}
                      {!isCompleted && addingStep && (
                        <li className="reveal quest-step flex flex-col rounded-[10px] py-0.5 pl-2 pr-0.5" style={{ border: "1.3px dashed rgba(169,132,58,.75)" }}>
                          <div className="flex items-start gap-2">
                          {/* Same box and type as a saved step, so a step looks the same before and after Enter. */}
                          <span aria-hidden className="mt-[5px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed text-[13px] leading-none" style={{ borderColor: isAdventure ? "#8a6c2c" : "var(--t-card-border)", color: "var(--t-ink-soft)" }}>
                            +
                          </span>
                          <input
                            ref={newStepRef}
                            value={newStep}
                            onChange={(e) => setNewStep(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addStep();
                                // Stay on the add row for the next step, whatever re-rendered.
                                requestAnimationFrame(() => newStepRef.current?.focus());
                              } else if (e.key === "Escape") {
                                // Leaves just this row (a second Escape closes the editor).
                                e.preventDefault();
                                e.stopPropagation();
                                setNewStep("");
                                setAddingStep(false);
                              }
                            }}
                            onBlur={() => {
                              addStep();
                              // Only fold the add row away when it was left empty on purpose.
                              setTimeout(() => {
                                if (document.activeElement !== newStepRef.current && !newStepMore) setAddingStep(false);
                              }, 0);
                            }}
                            autoFocus
                            enterKeyHint="enter"
                            placeholder="Add a sub-quest, then Enter"
                            aria-label="Add a sub-quest"
                            className="bare-input min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-[3px] text-[16px] leading-snug focus:outline-none"
                            style={{ color: "var(--t-ink)" }}
                          />
                          {/* Its ⋯: the details for this one before you press Enter (owner, Nov 20). */}
                          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setNewStepMore((o) => !o)} aria-expanded={newStepMore} aria-label="Details for the new sub-quest" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
                            ⋯
                          </button>
                          </div>
                          {newStepMore && (
                            <span className="reveal ml-[26px] flex items-center gap-2 pb-1 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                              <span className="w-[74px] shrink-0">Time</span>
                              <InlineNumber value={newStepMinutes ?? 0} min={0} max={1440} suffix=" min" label="Time estimate for the new sub-quest, in minutes" onChange={(v) => setNewStepMinutes(v > 0 ? v : null)} className="justify-end font-semibold" style={{ color: "var(--t-ink)" }} />
                            </span>
                          )}
                        </li>
                      )}
                    </ul>
                  )}
                  {!isCompleted && steps !== null && steps.length > 0 && !addingStep && (
                    <button
                      type="button"
                      aria-label="Add a sub-quest"
                      onClick={() => setAddingStep(true)}
                      className="hover-glow mt-1 flex h-8 items-center gap-1 self-start rounded-full px-3 text-[13px] font-bold"
                      style={{ background: isAdventure ? "linear-gradient(180deg,#f2d58a,#d9b45f)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff", border: isAdventure ? "1px solid #8a6116" : undefined, boxShadow: "0 1px 3px rgba(60,40,10,.3)" }}
                    >
                      <span aria-hidden className="text-[16px] leading-none">+</span> Add sub-quest
                    </button>
                  )}
    </div>
  );
}
