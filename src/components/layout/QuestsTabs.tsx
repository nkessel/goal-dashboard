import Link from "next/link";

/** All Quests: the same quests, seen as boards or weighed by priority. */
export function QuestsTabs({ active, isAdventure }: { active: "boards" | "priority"; isAdventure: boolean }) {
  const tabs = [
    { key: "boards", href: "/boards", label: "Boards" },
    { key: "priority", href: "/matrix", label: "Priority" },
  ] as const;
  return (
    <nav
      aria-label="All quests views"
      className="flex rounded-full p-1"
      style={{
        background: isAdventure ? "var(--t-nav-bg)" : "var(--t-accent-soft)",
        border: isAdventure ? "1px solid rgba(209,161,60,.35)" : undefined,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
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
