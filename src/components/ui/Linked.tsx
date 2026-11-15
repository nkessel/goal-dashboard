/** Text with its web addresses as links (opened in a new tab; a tap on one doesn't open the card). */
export function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="underline underline-offset-2 [overflow-wrap:anywhere]" style={{ color: "inherit" }}>
            {p.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        ) : (
          p
        )
      )}
    </>
  );
}

const URLS = /https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/g;

/**
 * The web addresses in text being edited (a description, a sub-quest), as small links beside it: a field
 * can't hold a live link, so they're opened from here (owner: "links should be clickable from the
 * description and entered subquests"). Nothing shows when there's no address.
 */
export function LinkOuts({ text, iconOnly = false }: { text: string; iconOnly?: boolean }) {
  const urls = [...new Set(text.match(URLS) ?? [])].slice(0, 4);
  if (!urls.length) return null;
  return (
    <span className={`flex min-w-0 flex-wrap items-center ${iconOnly ? "gap-0.5" : "gap-x-3 gap-y-0.5"}`}>
      {urls.map((u) => (
        <a
          key={u}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={`Open ${u}`}
          aria-label={`Open ${u.replace(/^https?:\/\/(www\.)?/, "")}`}
          className={`inline-flex min-w-0 items-center gap-1 text-[13px] underline-offset-2 hover:underline ${iconOnly ? "h-7 w-7 justify-center rounded-full" : ""}`}
          style={{ color: "var(--t-ink-soft)" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!iconOnly && <span className="truncate">{u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>}
        </a>
      ))}
    </span>
  );
}
