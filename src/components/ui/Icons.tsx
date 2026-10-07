/**
 * Hand-drawn treasure icons in the Adventure palette: a minted gold coin, a
 * cut diamond (rewards), and a treasure chest (rewards in menus).
 * Gradient ids are unique per icon kind and identical wherever reused.
 */

export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <radialGradient id="coin-face" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset=".45" stopColor="#f2c94c" />
          <stop offset="1" stopColor="#a87a1c" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#coin-face)" stroke="#5a3f0c" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="7.6" stroke="#8a6116" strokeWidth="1" opacity=".75" />
      <path d="M12 7.2l1.3 3.4 3.5.3-2.7 2.3.9 3.5L12 14.8l-3 1.9.9-3.5-2.7-2.3 3.5-.3z" fill="#b8861f" stroke="#7a5512" strokeWidth=".5" />
      <path d="M6.5 7.5a7.5 7.5 0 0 1 5-2.6" stroke="#fffbe6" strokeWidth="1.1" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

export function DiamondIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="gem-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset="1" stopColor="#8fd8ec" />
        </linearGradient>
        <linearGradient id="gem-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6fc9e2" />
          <stop offset="1" stopColor="#24708e" />
        </linearGradient>
      </defs>
      {/* crown */}
      <path d="M7 3.5h10l4 5H3z" fill="url(#gem-top)" stroke="#164a5e" strokeWidth="1" strokeLinejoin="round" />
      {/* pavilion */}
      <path d="M3 8.5h18L12 21z" fill="url(#gem-body)" stroke="#164a5e" strokeWidth="1" strokeLinejoin="round" />
      {/* facets */}
      <path d="M7 3.5 9.5 8.5 12 3.5l2.5 5L17 3.5M9.5 8.5 12 21l2.5-12.5" stroke="#164a5e" strokeWidth=".7" strokeLinejoin="round" opacity=".7" />
      <path d="M5 8.2 7.3 4.6" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".9" />
      <path d="M8 10.5l2.6 6.2" stroke="#e9fbff" strokeWidth=".9" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

export function ChestIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="chest-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b5793a" />
          <stop offset="1" stopColor="#6e4219" />
        </linearGradient>
      </defs>
      <path d="M3 10a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v1H3z" fill="url(#chest-wood)" stroke="#3a240c" strokeWidth="1.1" />
      <rect x="3" y="11" width="18" height="9" rx="1.5" fill="url(#chest-wood)" stroke="#3a240c" strokeWidth="1.1" />
      <path d="M3 11h18" stroke="#e2b85a" strokeWidth="1.6" />
      <path d="M7 5.6V20M17 5.6V20" stroke="#d9b45f" strokeWidth="1.3" />
      <rect x="10.4" y="9.6" width="3.2" height="4.2" rx=".8" fill="#f2d27e" stroke="#5a3f0c" strokeWidth=".8" />
    </svg>
  );
}
