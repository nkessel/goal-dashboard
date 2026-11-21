"use client";

import Link from "next/link";
import { useViewTransitionNavigate } from "@/components/ui/ViewTransitionProvider";

/** All Quests: the same quests, seen as boards or weighed by priority. Switching slides like the bottom bar's
 *  screens, left or right by the tabs' order (owner, Nov 13: "animated like going between navbar screens"). */
export function QuestsTabs({ active, isAdventure }: { active: "boards" | "list" | "priority"; isAdventure: boolean }) {
  const go = useViewTransitionNavigate();
  const tabs = [
    { key: "boards", href: "/boards", label: "Boards" },
    { key: "list", href: "/quests", label: "List" },
    { key: "priority", href: "/matrix", label: "Priority" },
  ] as const;
  const at = tabs.findIndex((t) => t.key === active);
  return (
    <nav
      aria-label="All quests views"
      className="flex rounded-full p-1"
      style={{
        background: isAdventure ? "var(--t-nav-bg)" : "var(--t-accent-soft)",
        border: isAdventure ? "1px solid rgba(209,161,60,.35)" : undefined,
      }}
    >
      {tabs.map((t, i) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              if (on) return;
              document.documentElement.setAttribute("data-transition", i < at ? "nav-back" : "nav-forward");
              go(t.href);
            }}
            className={`flex-1 rounded-full py-2 text-center text-[14px] font-semibold ${isAdventure ? "font-display" : ""}`}
            style={{
              background: on ? (isAdventure ? "var(--t-gold)" : "var(--t-accent)") : "transparent",
              color: on ? (isAdventure ? "#2a1c10" : "#fff") : isAdventure ? "var(--t-nav-inactive)" : "var(--t-ink-soft)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
