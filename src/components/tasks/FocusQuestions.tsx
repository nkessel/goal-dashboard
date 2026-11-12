"use client";

import { useEffect, useState } from "react";
import { focusQuestionsAction, saveFocusQuestionsAction } from "@/app/actions";
import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";

/** The lantern beside Today's Quests (owner, Nov 4): opens the focusing questions under the header. */
export function FocusQuestionsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label="Focus: a question, Prioritize and Auto-schedule" title="Focus: a question, Prioritize and Auto-schedule" className="today-head-btn flex h-8 w-8 items-center justify-center rounded-full">
      {/* A compass (owner's pick, Nov 9: "L3a"): questions that point the way. */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 2.8v1.6M12 19.6v1.6M2.8 12h1.6M19.6 12h1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M15.8 8.2l-5.3 2.3 3 3z" fill="currentColor" />
      </svg>
    </button>
  );
}

/**
 * One focusing question at a time, with ‹ › to step through them; ✎ edits the list in place
 * (type over one, ✕ removes it, "+ Add a question"). Kept on the account.
 */
export function FocusQuestions({ open, children }: { open: boolean; /** The day's tools under the question (Prioritize, Auto-schedule). */ children?: React.ReactNode }) {
  const [list, setList] = useState<string[] | null>(null);
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (open && list === null) focusQuestionsAction().then(setList, () => setList(["What helps me thrive?"]));
  }, [open, list]);
  const save = (next: string[]) => {
    setList(next);
    void saveFocusQuestionsAction(next.filter((q) => q.trim())).catch(() => {});
  };
  const qs = list ?? [];
  const n = qs.length;
  const at = n ? ((i % n) + n) % n : 0;
  const arrow = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[20px] leading-none hover:bg-black/10";
  return (
    <Fold open={open}>
      <div className="mx-auto mt-2 flex max-w-[560px] flex-col gap-1.5 rounded-2xl px-3 py-2.5" style={{ background: "rgba(20,30,20,.45)", border: "1px solid rgba(217,180,95,.45)", color: "var(--t-cream)" }}>
        {!editing ? (
          <div className="flex items-center gap-1">
            <button type="button" className={arrow} onClick={() => setI(at - 1)} disabled={n < 2} aria-label="Previous question">
              ‹
            </button>
            <p key={at} className="font-display reveal m-0 flex-1 text-center text-[18px] leading-snug">
              {list === null ? "…" : n ? qs[at] : "No questions yet. ✎ to add one."}
            </p>
            <button type="button" className={arrow} onClick={() => setI(at + 1)} disabled={n < 2} aria-label="Next question">
              ›
            </button>
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit the questions" title="Edit the questions" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px]" style={{ color: "#e8c873" }}>
              ✎
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {qs.map((q, k) => (
              <div key={k} className="flex items-center gap-1">
                <input
                  value={q}
                  onChange={(e) => setList(qs.map((x, j) => (j === k ? e.target.value : x)))}
                  onBlur={() => save(qs)}
                  maxLength={160}
                  aria-label={`Question ${k + 1}`}
                  className="bare-input h-8 flex-1 bg-transparent px-1 text-[15px] focus:outline-none"
                  style={{ color: "var(--t-cream)", borderBottom: "1px solid rgba(217,180,95,.4)" }}
                />
                <button type="button" onClick={() => save(qs.filter((_, j) => j !== k))} aria-label={`Remove “${q}”`} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/10">
                  <CloseIcon size={10} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setList([...qs, ""])} className="h-8 text-[13.5px] font-semibold" style={{ color: "#e8c873" }}>
                + Add a question
              </button>
              <button type="button" onClick={() => (save(qs), setEditing(false))} className="h-8 rounded-full px-3 text-[13.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                Done
              </button>
            </div>
          </div>
        )}
        {children && !editing && <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{children}</div>}
      </div>
    </Fold>
  );
}
