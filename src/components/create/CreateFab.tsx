"use client";

import { useState } from "react";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
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
  return (
    <>
      {open && <CreateSheet kinds={kinds} initial={initial} boardId={boardId} todayFull={todayFull} theme={theme} onClose={() => setOpen(false)} />}
      <FloatingActionButton onClick={() => setOpen((v) => !v)} label={open ? "Close" : label} theme={theme} expanded={open} />
    </>
  );
}
