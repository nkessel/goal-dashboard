"use client";

/** The hour's chance of rain written inside a blue-filled cloud. */
export function RainPct({ pct }: { pct: number }) {
  return (
    <svg width="32" height="17" viewBox="0 0 32 17" aria-label={`${pct}% chance of rain`} className="mt-px block">
      <path d="M8 16a5 5 0 0 1-1-9.9A7 7 0 0 1 20.2 4.4 5.6 5.6 0 0 1 25 16z" fill="#5b8fd6" stroke="#2f5f99" strokeWidth="1" strokeLinejoin="round" />
      <text x="16.2" y="12.6" textAnchor="middle" fontSize="7.6" fontWeight="700" fill="#fff" style={{ fontVariantNumeric: "tabular-nums" }}>
        {pct}%
      </text>
    </svg>
  );
}

/** A small rain cloud, filled blue (the day's chance of rain sits beside it). */
export function RainCloud() {
  return (
    <svg width="13" height="12" viewBox="0 0 24 22" aria-hidden>
      <path d="M7 14.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.3 1.6A3.8 3.8 0 0 1 17.5 14.5z" fill="#5b8fd6" stroke="#2f5f99" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" stroke="#2f5f99" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
