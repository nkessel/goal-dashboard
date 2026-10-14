"use client";

import { CreateFab } from "@/components/create/CreateFab";

/** Board Detail page's +: a quest or sub-board on this board (or anything else). */
export function BoardFabMenu({ boardId, theme = "calm" }: { boardId: string; theme?: "calm" | "adventure" }) {
  return <CreateFab kinds={["quest", "subboard", "now", "journal"]} boardId={boardId} theme={theme} label="Add to this board" />;
}
