/** A small leather adventurer's backpack: flap, buckle, side pocket and strap. */
export function BackpackIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id="bp-leather" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b07a45" />
          <stop offset="1" stopColor="#6e4423" />
        </linearGradient>
        <linearGradient id="bp-flap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c28b52" />
          <stop offset="1" stopColor="#8a5a30" />
        </linearGradient>
      </defs>
      {/* carry loop */}
      <path d="M9.2 5.6V4.4c0-1 .8-1.8 1.8-1.8h2c1 0 1.8.8 1.8 1.8v1.2" stroke="#3f2814" strokeWidth="1.5" strokeLinecap="round" />
      {/* body */}
      <path d="M5 9.2c0-2.2 1.8-3.9 4-3.9h6c2.2 0 4 1.7 4 3.9v9.3c0 1.4-1.1 2.5-2.5 2.5h-9C6.1 21 5 19.9 5 18.5z" fill="url(#bp-leather)" stroke="#3a2412" strokeWidth="1.2" />
      {/* flap */}
      <path d="M5.3 9.4c0-2.1 1.7-3.6 3.8-3.6h5.8c2.1 0 3.8 1.5 3.8 3.6v1.6c-2 1.3-4.3 1.9-6.7 1.9s-4.7-.6-6.7-1.9z" fill="url(#bp-flap)" stroke="#3a2412" strokeWidth="1.1" />
      <path d="M7.6 7.4c1.2-.6 2.6-.9 4.4-.9" stroke="#e8c48c" strokeOpacity=".6" strokeWidth=".9" strokeLinecap="round" />
      {/* buckle strap + gold buckle */}
      <path d="M12 12.4v2" stroke="#3a2412" strokeWidth="1.6" />
      <rect x="10.6" y="11.5" width="2.8" height="2.4" rx=".6" fill="#f2cf70" stroke="#6b4a12" strokeWidth=".8" />
      {/* front pocket with stitching */}
      <rect x="7.7" y="14.6" width="8.6" height="4.6" rx="1.5" fill="#7d4f28" stroke="#3a2412" strokeWidth="1" />
      <path d="M8.7 16.1h6.6" stroke="#d9b07a" strokeOpacity=".55" strokeWidth=".7" strokeDasharray="1 .9" />
    </svg>
  );
}
