"use client";

import { useEffect, useState } from "react";
import { freshKey } from "@/lib/quest-drafts";
import { descendants, parentKeys, stepsShare, treeOrder, type StepDraft } from "@/lib/quest-steps";

/**
 * The quest editor's sub-quests: the list and its operations (E6). Called from the dialog, so its
 * spine (autosave, drafts, Save, templates) still reads and writes `steps` and `stepsDirty`. Loading an
 * existing quest's steps stays in the dialog, where it was. Ticking pulls the quest's progress along
 * through `setProgress`.
 */
export function useQuestSteps({ hasTask, setProgress }: { hasTask: boolean; setProgress: React.Dispatch<React.SetStateAction<number>> }) {
  /** The new sub-quest's details before Enter (its ⋯): a time estimate for now. */
  const [newStepMinutes, setNewStepMinutes] = useState<number | null>(null);
  const [newStepMore, setNewStepMore] = useState(false);
  // Steps: a small checklist inside the quest. null while loading an existing quest's steps.
  const [steps, setSteps] = useState<StepDraft[] | null>(hasTask ? null : []);
  const [stepsUnavailable, setStepsUnavailable] = useState(false);
  const [stepsDirty, setStepsDirty] = useState(false);
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  /**
   * Ticking (or moving a step along) pulls the quest's progress up to what
   * the steps add up to — each step weighs its own percent, or an equal
   * share — never down; unticking caps it.
   */
  function updateStep(key: string, patch: Partial<StepDraft>) {
    if (!steps) return;
    const before = stepsShare(steps);
    const next = steps.map((st) => (st.key === key ? { ...st, ...patch } : st));
    setSteps(next);
    setStepsDirty(true);
    const share = stepsShare(next);
    if (share !== before) setProgress((p) => (share > before ? Math.max(p, share) : Math.min(p, share)));
  }
  function setStepDone(key: string, done: boolean) {
    if (!steps) return;
    const all = descendants(steps, key);
    if (all.size === 1) return updateStep(key, { done, progress: done ? 100 : 0, state: null });
    // A step with sub-tasks: ticking it ticks everything inside it.
    const before = stepsShare(steps);
    const next = steps.map((st) => (all.has(st.key) ? { ...st, done, progress: done ? 100 : 0, state: null } : st));
    setSteps(next);
    setStepsDirty(true);
    const share = stepsShare(next);
    if (share !== before) setProgress((p) => (share > before ? Math.max(p, share) : Math.min(p, share)));
  }
  /** A new sub-task inside a step (or beside another sub-task), ready to type into. */
  function addSubStep(parentKey: string, after?: string) {
    if (!steps) return;
    const key = freshKey("new-");
    const ordered = treeOrder(steps);
    const anchor = after ?? parentKey;
    const tail = [...descendants(ordered, anchor)];
    const lastIdx = Math.max(...tail.map((k) => ordered.findIndex((st) => st.key === k)));
    const next = [...ordered.slice(0, lastIdx + 1), { key, title: "", done: false, parentKey }, ...ordered.slice(lastIdx + 1)];
    setSteps(next);
    setOpenSteps((o) => new Set(o).add(parentKey));
    setFocusStep(key);
  }
  function addStep() {
    const t = newStep.trim();
    if (!t) return;
    setSteps((list) => [...(list ?? []), { key: `new-${Date.now()}`, title: t, done: false, ...(newStepMinutes ? { minutes: newStepMinutes } : {}) }]);
    setStepsDirty(true);
    setNewStep("");
    setNewStepMinutes(null);
    setNewStepMore(false);
  }
  function renameStep(key: string, title: string) {
    setSteps((list) => (list ?? []).map((st) => (st.key === key ? { ...st, title } : st)));
    setStepsDirty(true);
  }
  function removeStep(key: string) {
    setSteps((list) => {
      const gone = descendants(list ?? [], key);
      return (list ?? []).filter((st) => !gone.has(st.key));
    });
    setStepsDirty(true);
  }
  const holders = parentKeys(steps ?? []);
  const stepsDone = (steps ?? []).filter((st) => st.done && !holders.has(st.key)).length;
  const stepsLive = (steps ?? []).filter((st) => st.state !== "skipped" && !holders.has(st.key)).length;
  // Sub-tasks stay folded away under their step until opened.
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [focusStep, setFocusStep] = useState<string | null>(null);
  useEffect(() => {
    if (!focusStep) return;
    const t = requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-step-key="${focusStep}"] textarea`)?.focus();
      setFocusStep(null);
    });
    return () => cancelAnimationFrame(t);
  }, [focusStep]);
  return {
    steps, setSteps, stepsUnavailable, setStepsUnavailable, stepsDirty, setStepsDirty,
    newStep, setNewStep, addingStep, setAddingStep, newStepMinutes, setNewStepMinutes, newStepMore, setNewStepMore,
    openSteps, setOpenSteps,
    updateStep, setStepDone, addSubStep, addStep, renameStep, removeStep,
    holders, stepsDone, stepsLive,
  };
}
