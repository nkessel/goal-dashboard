import Link from "next/link";

/**
 * Where you are among the boards: Quest Boards › Family › Martin. Every level
 * is a link (the current one isn't), so climbing back up is one tap.
 */
export function BoardTrail({
  ancestors,
  current,
  isAdventure,
  onDark = true,
}: {
  ancestors: { id: string; title: string }[];
  current: string;
  isAdventure: boolean;
  /** Cream text for the dark page background; ink inside parchment. */
  onDark?: boolean;
}) {
  const color = onDark ? (isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)") : "var(--t-ink-soft)";
  const strong = onDark ? (isAdventure ? "#f8e3a0" : "var(--t-ink)") : "var(--t-ink)";
  const crumbs = [{ id: "", title: isAdventure ? "Quest Boards" : "Boards" }, ...ancestors];
  return (
    <nav aria-label="Board levels" className="min-w-0">
      <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-x-1 gap-y-0.5 p-0 text-[13.5px]">
        {crumbs.map((c) => (
          <li key={c.id || "root"} className="flex min-w-0 items-center gap-1">
            <Link
              href={c.id ? `/boards/${c.id}` : "/boards"}
              className="hover-glow flex min-h-8 items-center truncate rounded-md px-1 underline-offset-2 hover:underline"
              style={{ color }}
            >
              {!c.id && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="mr-1 shrink-0">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                  <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                  <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                  <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
              <span className="truncate">{c.title}</span>
            </Link>
            <span aria-hidden style={{ color, opacity: 0.6 }}>
              ›
            </span>
          </li>
        ))}
        <li aria-current="page" className="min-w-0 truncate px-1 font-semibold" style={{ color: strong }}>
          {current}
        </li>
      </ol>
    </nav>
  );
}
