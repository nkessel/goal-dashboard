"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/ui/Icons";
import { QuestPicker, SequenceDialog } from "../Sequence";

export type SeqLink = { rel: "after" | "before"; pick: { id?: string; title: string } };

/** The sequence's panel on a new quest ("A quest after another stays stacked out of sight until that one is done") and the sequence window on an existing one. The links stay with the dialog (Save reads them); the pills that open this are drawn by the dialog. */
export function EditorSequence({ task, title, isAdventure, seqOpen, seqLinks, setSeqLinks, seqDialog, setSeqDialog, seqFollow, setSeqFollow, setStepsDirty, setStepsReload }: {
  task: { id: string } | null | undefined;
  title: string;
  isAdventure: boolean;
  seqOpen: boolean;
  seqLinks: SeqLink[];
  setSeqLinks: React.Dispatch<React.SetStateAction<SeqLink[]>>;
  seqDialog: boolean;
  setSeqDialog: (b: boolean) => void;
  seqFollow: boolean;
  setSeqFollow: (b: boolean) => void;
  setStepsDirty: (b: boolean) => void;
  setStepsReload: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [seqAdding, setSeqAdding] = useState<"after" | "before" | null>(null);
  return (
    <>
  {!task && seqOpen && (
    <div className="reveal flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ border: "1px dashed rgba(139,112,64,.5)" }}>
      <p className="m-0 text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
        A quest after another stays stacked out of sight until that one is done.
      </p>
      {seqLinks.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
          {seqLinks.map((l, i) => (
            <li key={i} className="flex min-h-8 items-center gap-2">
              <span className="shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
                {l.rel === "after" ? "Comes after" : "Then"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {l.pick.id ? "" : "＋ "}
                {l.pick.title}
              </span>
              <button type="button" onClick={() => setSeqLinks((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.pick.title}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "var(--t-ink-soft)" }}>
                <CloseIcon size={9} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {seqAdding ? (
        <div className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold">{seqAdding === "after" ? "This quest comes after…" : "After this quest comes…"}</span>
          <QuestPicker
            autoFocus
            exclude={seqLinks.map((l) => l.pick.id).filter(Boolean) as string[]}
            onPick={(p) => {
              setSeqLinks((ls) => [...ls, { rel: seqAdding, pick: p }]);
              setSeqAdding(null);
            }}
          />
          <button type="button" onClick={() => setSeqAdding(null)} className="self-start text-[12.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSeqAdding("after")} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px dashed rgba(139,112,64,.6)" }}>
            ↑ Comes after a quest
          </button>
          <button type="button" onClick={() => setSeqAdding("before")} className="flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1px dashed rgba(139,112,64,.6)" }}>
            ↓ Add what comes next
          </button>
        </div>
      )}
    </div>
  )}
  {task && seqDialog && (
    <SequenceDialog
      taskId={task.id}
      title={title}
      isAdventure={isAdventure}
      addFollowUp={seqFollow}
      onClose={() => (setSeqDialog(false), setSeqFollow(false))}
      onEditSelf={() => setSeqDialog(false)}
      onStepsMoved={() => {
        setStepsDirty(false);
        setStepsReload((n) => n + 1);
      }}
    />
  )}
    </>
  );
}
