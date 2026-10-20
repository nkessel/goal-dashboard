import { useId } from "react";

/**
 * A worn leather adventurer's pack, lit from the upper left: rolled bedroll on
 * top, a stitched flap with a brass buckle, a front pocket and side straps.
 */
export function BackpackIcon({ size = 20 }: { size?: number }) {
  const u = useId().replace(/:/g, "");
  const id = (k: string) => `bp-${k}-${u}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <radialGradient id={id("body")} cx="0.32" cy="0.28" r="0.95">
          <stop offset="0" stopColor="#c48a52" />
          <stop offset="0.45" stopColor="#94602f" />
          <stop offset="1" stopColor="#4f2f16" />
        </radialGradient>
        <linearGradient id={id("flap")} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#d49c60" />
          <stop offset="0.6" stopColor="#a46b37" />
          <stop offset="1" stopColor="#7a4a22" />
        </linearGradient>
        <linearGradient id={id("roll")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fa36a" />
          <stop offset="0.55" stopColor="#5f7444" />
          <stop offset="1" stopColor="#3c4a2a" />
        </linearGradient>
        <linearGradient id={id("brass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#e2b650" />
          <stop offset="1" stopColor="#8a6418" />
        </linearGradient>
        <linearGradient id={id("pocket")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a6634" />
          <stop offset="1" stopColor="#5e3a1b" />
        </linearGradient>
      </defs>
      {/* soft ground shadow */}
      <ellipse cx="16" cy="29.6" rx="9.5" ry="1.4" fill="#000" opacity=".28" />
      {/* carry handle */}
      <path d="M12.6 7.4V6.2a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.2" stroke="#3a2210" strokeWidth="1.9" strokeLinecap="round" />
      {/* body */}
      <path d="M7 12.6c0-3 2.4-5.3 5.4-5.3h7.2c3 0 5.4 2.3 5.4 5.3v12.2c0 1.9-1.5 3.4-3.4 3.4H10.4C8.5 28.2 7 26.7 7 24.8z" fill={`url(#${id("body")})`} stroke="#2e1a0b" strokeWidth="1.1" />
      {/* side straps */}
      <path d="M8.6 14v12.4M23.4 14v12.4" stroke="#3a2210" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" />
      {/* rolled bedroll on top */}
      <rect x="8.2" y="5.6" width="15.6" height="4.4" rx="2.2" fill={`url(#${id("roll")})`} stroke="#28331a" strokeWidth="1" />
      <path d="M11.4 5.8v4M20.6 5.8v4" stroke="#3a2210" strokeWidth="1.2" />
      <path d="M10 7c2-.5 4.4-.7 6-.7" stroke="#d8e6b4" strokeOpacity=".5" strokeWidth=".7" strokeLinecap="round" />
      {/* flap, with stitched hem */}
      <path d="M7.5 12.9c0-2.6 2.1-4.6 4.8-4.6h7.4c2.7 0 4.8 2 4.8 4.6v2.4c-2.6 1.7-5.5 2.5-8.5 2.5s-5.9-.8-8.5-2.5z" fill={`url(#${id("flap")})`} stroke="#2e1a0b" strokeWidth="1" />
      <path d="M8.9 14.5c2.2 1.3 4.6 1.9 7.1 1.9s4.9-.6 7.1-1.9" stroke="#f0cf98" strokeOpacity=".55" strokeWidth=".6" strokeDasharray="1 .8" />
      <path d="M10 10.2c1.6-.8 3.6-1.1 5.6-1.1" stroke="#ffe2b0" strokeOpacity=".6" strokeWidth=".9" strokeLinecap="round" />
      {/* buckle strap + brass buckle */}
      <path d="M16 16.8v3.2" stroke="#3a2210" strokeWidth="2" />
      <rect x="14.1" y="15.4" width="3.8" height="3.2" rx=".8" fill={`url(#${id("brass")})`} stroke="#5a3e0e" strokeWidth=".8" />
      <rect x="15.2" y="16.3" width="1.6" height="1.4" rx=".3" fill="#5a3e0e" opacity=".55" />
      {/* front pocket */}
      <rect x="10.4" y="20.2" width="11.2" height="6" rx="2" fill={`url(#${id("pocket")})`} stroke="#2e1a0b" strokeWidth=".9" />
      <path d="M11.8 21.7h8.4" stroke="#e2bd86" strokeOpacity=".5" strokeWidth=".6" strokeDasharray="1 .8" />
      {/* a glint of light along the left edge */}
      <path d="M8.4 17.5v5.5" stroke="#ffd9a6" strokeOpacity=".28" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
