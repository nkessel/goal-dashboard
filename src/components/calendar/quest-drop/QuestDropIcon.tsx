/** Quest Drop's glyph: a block falling toward a stacked row, in one line colour (the app's icon style). */
export function QuestDropIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <rect x="9" y="2.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v3.2M10.4 12.3l1.6 1.6 1.6-1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="15.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="15" y="15.5" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="15.5" width="6" height="6" rx="1.2" fill="currentColor" opacity=".35" />
    </svg>
  );
}
