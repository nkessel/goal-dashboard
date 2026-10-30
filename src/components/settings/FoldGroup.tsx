/** One folded group of settings inside a section: tap its title to open or close it. */
export function FoldGroup({ title, hint, isAdventure, open, children }: { title: string; hint?: string; isAdventure?: boolean; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open || undefined} className="rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
      <summary className={`cursor-pointer ${isAdventure === false ? "text-sm font-bold" : "font-display text-[15px]"}`}>{title}</summary>
      <div className="mt-2">
        {hint && (
          <p className="mb-2 mt-0 text-xs" style={{ color: "var(--t-ink-soft)" }}>
            {hint}
          </p>
        )}
        {children}
      </div>
    </details>
  );
}
