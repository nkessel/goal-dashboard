"use client";

import { useState } from "react";

/**
 * A small owl perched on the edge of the navigation bar in the Adventure
 * theme. It blinks now and then; tap it and it hoots.
 */
export function PerchedOwl() {
  const [hoot, setHoot] = useState(0);
  return (
    <button
      type="button"
      aria-label="An owl. Hoo!"
      title="Hoo!"
      onClick={() => setHoot((h) => h + 1)}
      className="owl-perch pointer-events-auto absolute -top-[38px] left-[12%] z-[2] h-[44px] w-[40px] p-0"
      style={{ background: "transparent", border: 0 }}
    >
      <svg key={hoot} viewBox="0 0 40 44" width="40" height="44" aria-hidden className={hoot ? "owl-hop" : undefined}>
        <defs>
          <linearGradient id="owl-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9a7448" />
            <stop offset="1" stopColor="#5e4127" />
          </linearGradient>
          <radialGradient id="owl-belly" cx=".5" cy=".35" r=".7">
            <stop offset="0" stopColor="#f1dfb6" />
            <stop offset="1" stopColor="#c9a874" />
          </radialGradient>
        </defs>
        {/* ear tufts */}
        <path d="M9 9l3 6h-5zM31 9l-3 6h5z" fill="#5e4127" />
        {/* body */}
        <path d="M20 8c8 0 13 6 13 14 0 9-5 16-13 16S7 31 7 22C7 14 12 8 20 8z" fill="url(#owl-body)" stroke="#3b2a14" strokeWidth="1.2" />
        <ellipse cx="20" cy="28" rx="7.5" ry="8" fill="url(#owl-belly)" />
        <path d="M16 26q2 1.4 4 0 2 1.4 4 0M15.5 30q2.2 1.4 4.5 0 2.3 1.4 4.5 0M17 34q1.5 1 3 0 1.5 1 3 0" fill="none" stroke="#a5824f" strokeWidth=".9" strokeLinecap="round" />
        {/* wings */}
        <path d="M8 21c-2 6 0 12 4 15 1-5 1-10-1-15z" fill="#4e3520" />
        <path d="M32 21c2 6 0 12-4 15-1-5-1-10 1-15z" fill="#4e3520" />
        {/* face */}
        <circle cx="14.5" cy="18" r="5.2" fill="#f4e7c6" stroke="#3b2a14" strokeWidth=".8" />
        <circle cx="25.5" cy="18" r="5.2" fill="#f4e7c6" stroke="#3b2a14" strokeWidth=".8" />
        <g className="owl-eyes">
          <circle cx="14.5" cy="18" r="2.9" fill="#e6a93a" />
          <circle cx="25.5" cy="18" r="2.9" fill="#e6a93a" />
          <circle cx="14.8" cy="18.2" r="1.6" fill="#1b130a" />
          <circle cx="25.8" cy="18.2" r="1.6" fill="#1b130a" />
          <circle cx="14" cy="17.2" r=".6" fill="#fff" />
          <circle cx="25" cy="17.2" r=".6" fill="#fff" />
        </g>
        <path d="M20 20.5l-1.6 2.6h3.2z" fill="#d79b2e" stroke="#7a4f12" strokeWidth=".6" strokeLinejoin="round" />
        {/* feet on the bar */}
        <path d="M15 38.5v3M17 38.5v3M23 38.5v3M25 38.5v3" stroke="#d79b2e" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {hoot > 0 && (
        <span key={`h${hoot}`} aria-hidden className="owl-hoot font-display pointer-events-none absolute -top-5 left-8 whitespace-nowrap text-[13px] font-bold" style={{ color: "#f6dc8e", textShadow: "0 1px 2px rgba(0,0,0,.7)" }}>
          Hoo!
        </span>
      )}
    </button>
  );
}
