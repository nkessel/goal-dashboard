"use client";

import { startTransition, useEffect, useState } from "react";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { useFabTarget } from "@/lib/fab-target";
import { CreateSheet, JOURNAL_DRAFT_KEY, type CreateKind } from "./CreateSheet";

/** The floating + : opens the create sheet above it and becomes its ×. */
export function CreateFab({
  kinds,
  initial,
  boardId,
  todayFull,
  theme = "calm",
  label = "Create something new",
  resumeDraft = false,
}: {
  /** Open straight away when an unfinished journal entry was carried over. */
  resumeDraft?: boolean;
  kinds: CreateKind[];
  initial?: CreateKind;
  boardId?: string;
  todayFull?: boolean;
  theme?: "calm" | "adventure";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!resumeDraft) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      if (window.localStorage.getItem(JOURNAL_DRAFT_KEY)) setOpen(true);
    } catch {
      /* storage unavailable */
    }
  }, [resumeDraft]);
  // A board popup is open: add to that board, and sit above the popup.
  const target = useFabTarget();
  const k = target?.kinds ?? kinds;
  return (
    <>
      {open && (
        <CreateSheet
          kinds={k}
          initial={target ? undefined : initial}
          boardId={target ? target.boardId : boardId}
          todayFull={todayFull}
          theme={theme}
          onClose={() => setOpen(false)}
        />
      )}
      <FloatingActionButton
        onClick={() => {
          // The button answers at once; the (heavier) sheet renders right after without holding it up.
          const next = !(pressed ?? open);
          setPressed(next);
          startTransition(() => {
            setOpen(next);
            setPressed(null);
          });
        }}
        label={(pressed ?? open) ? "Close" : (target?.label ?? label)}
        theme={theme}
        expanded={pressed ?? open}
        raised={!!target}
      />
    </>
  );
}
