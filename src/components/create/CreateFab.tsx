"use client";

import { useState } from "react";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import { useFabTarget } from "@/lib/fab-target";
import { CreateSheet, type CreateKind } from "./CreateSheet";

/** The floating + : opens the create sheet above it and becomes its ×. */
export function CreateFab({
  kinds,
  initial,
  boardId,
  todayFull,
  theme = "calm",
  label = "Create something new",
}: {
  kinds: CreateKind[];
  initial?: CreateKind;
  boardId?: string;
  todayFull?: boolean;
  theme?: "calm" | "adventure";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
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
      <FloatingActionButton onClick={() => setOpen((v) => !v)} label={open ? "Close" : (target?.label ?? label)} theme={theme} expanded={open} raised={!!target} />
    </>
  );
}
