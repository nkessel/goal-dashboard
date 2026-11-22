export function FactCaret({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-60 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}>
      <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A tiny ticked list: the Steps label glyph. */
export function StepsGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: "#7a5f2a" }}>
      <rect x="3" y="4" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.3 6.6l1.2 1.2 2.1-2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="14" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 6.5h10M11 16.5h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** A map pin (a quest's place). */
export function PinGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" fill="rgba(217,180,95,.35)" />
      <circle cx="12" cy="9.8" r="2.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
