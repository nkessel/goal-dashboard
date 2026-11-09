"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * A board opened with `?q=<quest id>` (the quest editor's "See quest in board") scrolls that
 * quest's card into view and lets it glow for a few seconds.
 */
export function QuestSpotlight() {
  const q = useSearchParams().get("q");
  useEffect(() => {
    if (!q || !/^[0-9a-f-]{36}$/i.test(q)) return;
    let tries = 0;
    let t: ReturnType<typeof setTimeout>;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-task-id="${q}"]`);
      if (el && el.getBoundingClientRect().height > 0) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("quest-spotlight");
        t = setTimeout(() => el.classList.remove("quest-spotlight"), 3600);
        return;
      }
      if (++tries < 20) t = setTimeout(find, 150);
    };
    t = setTimeout(find, 250);
    return () => clearTimeout(t);
  }, [q]);
  return null;
}
