/** A small leather backpack glyph. */
export function BackpackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 5.5V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6v.9" stroke="#4a2e18" strokeWidth="1.7" />
      <rect x="4.5" y="5.5" width="15" height="15.5" rx="4.2" fill="#8a5a32" stroke="#3f2814" strokeWidth="1.4" />
      <path d="M4.9 10.2c2.2 1.5 4.6 2.2 7.1 2.2s4.9-.7 7.1-2.2" stroke="#3f2814" strokeWidth="1.3" fill="none" />
      <rect x="7.8" y="14" width="8.4" height="4.8" rx="1.4" fill="#6e4524" stroke="#3f2814" strokeWidth="1.2" />
      <rect x="10.8" y="11.2" width="2.4" height="2.6" rx=".7" fill="#e2bb5c" stroke="#5a3f12" strokeWidth=".8" />
    </svg>
  );
}
