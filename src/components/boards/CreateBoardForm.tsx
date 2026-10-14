"use client";

import { CreateFab } from "@/components/create/CreateFab";

/** Quest Boards page's +: a new board first, or anything else. */
export function CreateBoardForm({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  return <CreateFab kinds={["board", "quest", "now", "journal"]} initial="board" theme={theme} label="New quest board" />;
}
