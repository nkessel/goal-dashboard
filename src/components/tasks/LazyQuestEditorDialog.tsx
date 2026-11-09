"use client";

import dynamic from "next/dynamic";

/**
 * The quest editor is the biggest piece of client code and is only needed once something is opened,
 * so it loads on its own instead of with Today. It's fetched quietly after the page settles (see
 * `warmQuestEditor`), so the first open is still instant.
 */
export const QuestEditorDialog = dynamic(() => import("./QuestEditorDialog").then((m) => m.QuestEditorDialog), { ssr: false });

let warmed = false;
export function warmQuestEditor() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const go = () => void import("./QuestEditorDialog");
  if ("requestIdleCallback" in window) (window as unknown as { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(go, { timeout: 6000 });
  else setTimeout(go, 3000);
}
