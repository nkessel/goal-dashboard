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

/** A gilded lightning bolt — Power-ups. */
export function BoltIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="bolt-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c0" />
          <stop offset=".45" stopColor="#f2c94c" />
          <stop offset="1" stopColor="#b07a16" />
        </linearGradient>
      </defs>
      <path d="M13.6 1.8 4.4 13.4h6.1l-1.6 8.8 9.7-12.2h-6.3z" fill="url(#bolt-gold)" stroke="#5a3f0c" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M12.4 4.6 7.6 11.2" stroke="#fffbe6" strokeWidth="1" strokeLinecap="round" opacity=".8" />
    </svg>
  );
}

/** The one settings gear used across the app (beside a section, in a chat, on a card). */
export function GearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.75 4.64 L10.05 1.99 L13.95 1.99 L14.25 4.64 L15.61 5.20 L17.70 3.54 L20.46 6.30 L18.80 8.39 L19.36 9.75 L22.01 10.05 L22.01 13.95 L19.36 14.25 L18.80 15.61 L20.46 17.70 L17.70 20.46 L15.61 18.80 L14.25 19.36 L13.95 22.01 L10.05 22.01 L9.75 19.36 L8.39 18.80 L6.30 20.46 L3.54 17.70 L5.20 15.61 L4.64 14.25 L1.99 13.95 L1.99 10.05 L4.64 9.75 L5.20 8.39 L3.54 6.30 L6.30 3.54 L8.39 5.20Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Snooze, the same everywhere in the app: a little timer with a "z" (owner, Nov 2: not a moon). */
export function SnoozeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="13.5" r="7.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 2.5h4M11 2.5V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.3 11h5l-5 5h5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 4.5h3l-3 3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A close ✕ drawn as two strokes, so it sits dead centre in its circle (a typed × rides off-centre in most fonts; owner, Nov 4). */
export function CloseIcon({ size = 14, strokeWidth = 2.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ display: "block", margin: "0 auto", flexShrink: 0 }}>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/** The magic calendar (owner's pick, Nov 9: "Bd"): a calendar with a star and a dot of time. For Auto-schedule and Plan my day. */
export function MagicCalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9.5h18M8 3v3.5M16 3v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 11.6l1.2 2.7 2.7 1.2-2.7 1.2-1.2 2.7-1.2-2.7-2.7-1.2 2.7-1.2z" fill="currentColor" />
      <circle cx="17.2" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}
