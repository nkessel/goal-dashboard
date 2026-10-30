/**
 * One folded group of settings inside a section: tap its title to open or
 * close it. While it's closed, `value` shows what it's set to.
 */
export function FoldGroup({ title, hint, value, isAdventure, open, children }: { title: string; hint?: string; value?: React.ReactNode; isAdventure?: boolean; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open || undefined} className="group rounded-xl px-3 py-2" style={{ border: "1px solid rgba(139,112,64,.3)" }}>
      <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2">
        <span className={isAdventure === false ? "text-sm font-bold" : "font-display text-[15px]"}>{title}</span>
        {value && (
          <span className="text-[13px] group-open:hidden" style={{ color: "var(--t-ink-soft)" }}>
            {value}
          </span>
        )}
      </summary>
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
