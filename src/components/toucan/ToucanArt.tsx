"use client";

import { useId } from "react";
import type { ToucanState } from "@/lib/toucan";

const AURAS: Record<string, [string, string]> = {
  default: ["#b9fff0", "#42d6c4"],
  "aura-gold": ["#fff3c0", "#f2b84b"],
  "aura-violet": ["#e7d4ff", "#9b6cf2"],
  "aura-rose": ["#ffe0e8", "#f27a9b"],
  "aura-cosmic": ["#fff6d8", "#7a6cf2"],
};
const BILLS: Record<string, string[]> = {
  default: ["#fff2a0", "#ffc23d", "#ff7a2a", "#c2182b"],
  "bill-rainbow": ["#7ee06a", "#ffd23d", "#ff7a2a", "#e0306b"],
  "bill-gilded": ["#fff1b8", "#f2c94c", "#d9a12e", "#8a6116"],
};

/**
 * The great toucan spirit, drawn in SVG: midnight plumage with an iridescent
 * sheen, gold-edged wings, a sunrise bill traced with filigree, a gentle
 * amber eye and a small smile, sage's brow plumes, a crown of light, a slowly
 * turning halo of runes and a sigil it hovers above. Wears whatever add-ons
 * are equipped. In flight its wings spread and beat.
 */
export function ToucanArt({ equipped = {}, flying = false, size = 52 }: { equipped?: ToucanState["equipped"]; flying?: boolean; size?: number }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (n: string) => `${u}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const aura = AURAS[equipped.aura ?? "default"] ?? AURAS.default;
  const bill = BILLS[equipped.bill ?? "default"] ?? BILLS.default;
  const head = equipped.head;
  const hatHidesPlumes = head === "wizard";

  return (
    <svg viewBox="0 0 52 56" width={size} height={(size * 56) / 52} aria-hidden className="toucan-spirit" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={id("aura")} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={aura[0]} stopOpacity=".6" />
          <stop offset=".45" stopColor={aura[1]} stopOpacity=".24" />
          <stop offset="1" stopColor={aura[1]} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("bill")} x1="0" y1="0" x2="1" y2=".6">
          <stop offset="0" stopColor={bill[0]} />
          <stop offset=".35" stopColor={bill[1]} />
          <stop offset=".7" stopColor={bill[2]} />
          <stop offset="1" stopColor={bill[3]} />
        </linearGradient>
        <linearGradient id={id("body")} x1="0" y1="0" x2=".4" y2="1">
          <stop offset="0" stopColor="#2c2f58" />
          <stop offset=".55" stopColor="#14162c" />
          <stop offset="1" stopColor="#07080f" />
        </linearGradient>
        <linearGradient id={id("wing")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#262a50" />
          <stop offset="1" stopColor="#0b0d1a" />
        </linearGradient>
        <linearGradient id={id("bib")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf0" />
          <stop offset=".6" stopColor="#ffe7a0" />
          <stop offset="1" stopColor="#f0a83a" />
        </linearGradient>
        <linearGradient id={id("wisp")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={aura[1]} stopOpacity=".8" />
          <stop offset="1" stopColor={aura[1]} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("plume")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2c2f58" />
          <stop offset=".6" stopColor="#3fd2c0" />
          <stop offset="1" stopColor="#fff6c8" />
        </linearGradient>
        <linearGradient id={id("hat")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b3fb0" />
          <stop offset="1" stopColor="#24164f" />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset=".5" stopColor="#e2bb5c" />
          <stop offset="1" stopColor="#a8761c" />
        </linearGradient>
        <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* aura */}
      <circle className="toucan-aura" cx="26" cy="20" r="40" fill={url("aura")} />
      {equipped.aura === "aura-cosmic" && (
        <g className="toucan-stars">
          {[[-8, 6, "#ffb3c7"], [52, 2, "#b3e5ff"], [-4, 40, "#c9ffb3"], [56, 40, "#ffe6a3"], [6, -20, "#e0c7ff"], [44, -24, "#ffd1a3"], [62, 20, "#a3fff0"], [-14, 22, "#fff"]].map(([x, y, c], i) => (
            <path key={i} d={`M${x} ${Number(y) - 2}l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z`} fill={String(c)} />
          ))}
        </g>
      )}
      {/* rune halo */}
      <g className="toucan-halo" opacity=".85">
        <circle cx="22" cy="12" r="19" fill="none" stroke="#f2d27e" strokeWidth=".7" strokeDasharray="2 2.6" opacity=".7" />
        <circle cx="22" cy="12" r="21.5" fill="none" stroke={aura[1]} strokeWidth=".45" opacity=".6" />
        <g fill="none" stroke="#fff1b8" strokeWidth=".8" strokeLinecap="round" strokeLinejoin="round" filter={url("glow")}>
          <path d="M22 -10.5v3M20.6 -9.4l2.8 1.6" />
          <path d="M41.5 10l2.4 2-2.4 2" />
          <path d="M2.5 10.5l-2 1.5 2 1.5M1 12h3" />
          <path d="M35.5 -3.5l1.5 2.6-3 0z" />
          <path d="M8 -4l2.6 1.4M9.3 -4.7v2.8" />
          <path d="M36 27.5a1.5 1.5 0 1 0 .1 0" />
          <path d="M7.5 27l1.5 2.4 1.5-2.4" />
        </g>
      </g>

      {/* ethereal tail (streams out behind in flight) */}
      <g transform={flying ? "rotate(28 18 40)" : undefined}>
        <path d="M15 40c-4 8-4 16 0 24 2-8 4-14 8-19z" fill={url("wisp")} />
        <path d="M20 42c-1 7 1 13 6 18-1-6 0-11 2-15z" fill={url("wisp")} opacity=".8" />
        <path d="M16 38l-4 13 5-2 3 4 2-12z" fill="#10132a" stroke="#6ee7d6" strokeWidth=".5" strokeOpacity=".6" />
      </g>

      {flying ? (
        /* far wing, spread and beating */
        <g className="tc-wing-far">
          <path d="M24 18C22 6 14-3 2-8c3 4 4 7 4 9-3-2-7-3-10-3 4 3 6 6 7 9-3-1-6-1-9 0 5 3 9 7 12 11 5 4 12 4 18 0z" fill={url("wing")} stroke="#f2d27e" strokeWidth=".55" strokeOpacity=".8" strokeLinejoin="round" />
        </g>
      ) : (
        /* far wing, half-mantled */
        <path d="M30 22c7-5 15-6 20-3-4 1-6 3-7 5 3 0 5 1 6 3-4 0-7 1-9 3 2 1 3 2 3 4-6-1-10-3-13-6z" fill={url("wing")} stroke="#f2d27e" strokeWidth=".55" strokeOpacity=".8" strokeLinejoin="round" />
      )}

      {/* body */}
      <path d="M22 6c9 0 14 7 14 17 0 11-6 20-14 20S8 36 8 25C8 14 13 6 22 6z" fill={url("body")} stroke="#7ef0dc" strokeWidth=".8" strokeOpacity=".75" />
      <path d="M12 16c2-5 6-8 10-8" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity=".55" />

      {/* golden bib */}
      <path d="M23 13c6 1 10 6 10 12 0 4-2 7-6 8-4-2-6-7-6-12 0-4 1-6 2-8z" fill={url("bib")} />
      <path d="M24.5 31.5q3.5 1.2 6-1.8" stroke="#d63a2a" strokeWidth="1.7" strokeLinecap="round" fill="none" />

      {/* pendant */}
      {equipped.neck && (
        <g className="toucan-amulet" filter={url("glow")}>
          <path d="M24.6 19.4q2.9 2.4 5.8 0" stroke="#c99a2e" strokeWidth=".5" fill="none" />
          {equipped.neck === "gem" && (
            <>
              <path d="M27.5 21.2c1.6 1.6 2.4 3.1 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.7 2.4-4.3z" fill="#2dd4bf" stroke="#d9b45f" strokeWidth=".7" />
              <path d="M26.6 24.4q.4-1.3 1.3-2" stroke="#e9fffb" strokeWidth=".55" strokeLinecap="round" fill="none" />
            </>
          )}
          {equipped.neck === "feather" && (
            <>
              <path d="M27.5 21c2.4 1.5 2.8 5 0 7.6-2.8-2.6-2.4-6.1 0-7.6z" fill="#f6dc8e" stroke="#a8761c" strokeWidth=".5" />
              <path d="M27.5 21.5v7.5M27.5 23.8l1.4-.9M27.5 25.5l1.5-.9M27.5 23.8l-1.4-.9M27.5 25.5l-1.5-.9" stroke="#a8761c" strokeWidth=".4" />
            </>
          )}
          {equipped.neck === "moon" && (
            <>
              <path d="M28.7 21.4a3 3 0 1 0 1.6 5.2 2.4 2.4 0 1 1-1.6-5.2z" fill="#fff1b8" stroke="#c99a2e" strokeWidth=".4" />
              <path d="M30.3 21.8l.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35z" fill="#7ef0dc" />
            </>
          )}
          {equipped.neck === "heart" && <path d="M27.5 26.6c-2.6-1.8-3.4-3.2-3.4-4.3a1.7 1.7 0 0 1 3.4-.6 1.7 1.7 0 0 1 3.4.6c0 1.1-.8 2.5-3.4 4.3z" fill="#ff7a8a" stroke="#ffd6a0" strokeWidth=".5" />}
        </g>
      )}

      {flying ? (
        /* near wing, spread and beating */
        <g className="tc-wing-near">
          <path d="M20 20C14 10 4 6-8 6c4 2 6 4 7 6-4-1-8-1-11 0 4 2 7 4 8 7-3 0-6 1-8 2 6 2 12 4 17 6 6 1 12 0 15-4z" fill={url("wing")} stroke="#f2d27e" strokeWidth=".6" strokeOpacity=".9" strokeLinejoin="round" />
          <path d="M16 18Q6 12-6 11M15 21Q5 18-6 19" stroke="#f2d27e" strokeWidth=".45" fill="none" opacity=".6" />
        </g>
      ) : (
        <>
          {/* near wing with gold-edged primaries */}
          <path d="M10 20c-5 6-6 14-3 21 2 3 5 5 9 5 1-3 2-7 2-11 0-6-3-11-8-15z" fill={url("wing")} stroke="#f2d27e" strokeWidth=".6" strokeOpacity=".85" />
          <path d="M9 27q2 6 6 11M8.5 32q2 5 5 8M11 23q2 5 4.5 9" stroke="#f2d27e" strokeWidth=".45" fill="none" opacity=".6" />
          <path d="M12 26q1 1 2 0M11 31q1 1 2 0M13 35q1 1 2 0" stroke="#7ef0dc" strokeWidth=".5" fill="none" opacity=".7" />
        </>
      )}

      {/* sage brow plumes, raised kindly */}
      <path d="M27.5 7.6c-3-2.6-8-3.6-14-2.4 4 .4 6.6 1.4 8.4 2.8-3.6-.6-7 0-10 1.6 5.6-.4 10.4.2 15.6-2z" fill="#e8f7ff" opacity=".9" />
      {/* crown of light: three plumes with star tips */}
      {!hatHidesPlumes && (
        <>
          <path d="M19 6c-2-6-1-11 2-15-1 5 0 10 1 15z" fill={url("plume")} />
          <path d="M16 7c-4-4-5-9-4-14 1 5 3 9 6 13z" fill={url("plume")} opacity=".85" />
          <path d="M22 6c1-5 4-9 8-11-3 4-4 8-5 12z" fill={url("plume")} opacity=".85" />
          <g className="toucan-stars" fill="#fff6c8" filter={url("glow")}>
            <path d="M21 -11.5l.8-2.3.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8z" />
            <path d="M11.8 -8l.5-1.4.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5z" />
            <path d="M30.6 -6.4l.5-1.4.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5z" />
          </g>
        </>
      )}

      {/* headwear */}
      {head === "hibiscus" && (
        <g transform="translate(13.5 7.5)">
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} cx="0" cy="-2.6" rx="1.9" ry="2.8" fill="#ff5a7a" stroke="#c22a4f" strokeWidth=".3" transform={`rotate(${r})`} />
          ))}
          <circle r="1" fill="#ffd23d" />
          <path d="M0 0l2.4-2.8" stroke="#ffd23d" strokeWidth=".5" />
        </g>
      )}
      {head === "laurel" && (
        <g fill="#7fbf4d" stroke="#3f7a26" strokeWidth=".3">
          {[[12, 9, -60], [13.5, 6, -40], [16, 4, -20], [19, 3, 0], [22.5, 3.4, 20], [25.5, 5, 40], [27.5, 7.6, 60]].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx=".95" ry="2" transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <path d="M12 9.5Q19 .5 28 8.5" fill="none" stroke="#c99a2e" strokeWidth=".5" />
        </g>
      )}
      {head === "wizard" && (
        <g>
          <path d="M11 6.8L22.5 -17 30 6.4z" fill={url("hat")} stroke="#f2d27e" strokeWidth=".55" strokeLinejoin="round" />
          <path d="M22.5 -17q4 1 5.5 4.5" stroke="#5b3fb0" strokeWidth="2" strokeLinecap="round" fill="none" />
          <ellipse cx="20.5" cy="6.6" rx="12" ry="2" fill="#3a2780" stroke="#f2d27e" strokeWidth=".55" />
          <g fill="#fff1b8" filter={url("glow")}>
            <path d="M20 -4l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" />
            <path d="M24 -9l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" />
            <circle cx="17.5" cy="2" r=".6" />
            <path d="M25.5 1.4a1.4 1.4 0 1 0 .9 2.4 1.1 1.1 0 1 1-.9-2.4z" />
          </g>
          <circle cx="28" cy="-12.6" r="1.1" fill="#fff6c8" filter={url("glow")} />
        </g>
      )}
      {head === "crown" && (
        <g filter={url("glow")} transform="translate(19.5 6.5) scale(1.3) translate(-19.5 -6.5)">
          <path d="M13 6.5l-.8-7 3.6 3.4 3.4-5.6 3.4 5.6 3.6-3.4-.8 7z" fill={url("gold")} stroke="#8a6116" strokeWidth=".5" strokeLinejoin="round" />
          <rect x="12.6" y="5.2" width="13.8" height="2" rx=".6" fill={url("gold")} stroke="#8a6116" strokeWidth=".4" />
          <circle cx="19.2" cy="6.2" r=".85" fill="#e0304b" />
          <circle cx="15.4" cy="6.2" r=".55" fill="#2dd4bf" />
          <circle cx="23" cy="6.2" r=".55" fill="#2dd4bf" />
          <circle cx="12.2" cy="-.6" r=".6" fill="#fff6c8" />
          <circle cx="19.2" cy="-2.4" r=".7" fill="#fff6c8" />
          <circle cx="26.2" cy="-.6" r=".6" fill="#fff6c8" />
        </g>
      )}

      {/* the great bill, with gold filigree */}
      <path d="M28 10c9-5 22-4 30 4 1 1.2.2 2.6-1.2 2.4-8-1.5-17-.5-26 3.4-2.4.6-4-.6-4-3 0-3 .2-5.6 1.2-6.8z" fill={url("bill")} stroke="#5a1a10" strokeWidth=".7" strokeLinejoin="round" />
      <path d="M29.5 16.8c8-3 17-3.6 26-2.2" stroke="#7a2412" strokeWidth=".7" fill="none" />
      <path d="M52 11.5c2.4 1 4.4 2.3 6 3.6" stroke="#160a06" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M32 11.2c4-1.6 8.5-2 13-1.2" stroke="#fffbe0" strokeWidth="1" strokeLinecap="round" opacity=".85" fill="none" />
      <path d="M38 13.6c1.2-1.4 3.2-1.2 3.6.2.4 1.4-1.4 2.2-2.2 1.2M44 12.8c1-1 2.6-.8 2.8.3" stroke="#a8461a" strokeWidth=".55" fill="none" opacity=".75" />

      {/* soft gentle eye, warm amber */}
      <circle cx="24.5" cy="12.8" r="3.7" fill="#2bb5c4" stroke="#0b4d58" strokeWidth=".5" />
      <circle cx="24.5" cy="12.9" r="2.4" fill="#f2b84b" />
      <circle cx="24.6" cy="13" r="1.25" fill="#2a1608" />
      <circle cx="23.8" cy="12.1" r=".7" fill="#fff" />
      <path d="M20.8 13.9q3.7 3 7.4 0q-3.7 1.2-7.4 0z" fill="#1b1e3a" opacity=".85" />
      <ellipse cx="29.8" cy="17.2" rx="1.7" ry="1" fill="#ff9aa8" opacity=".55" />
      <path d="M28.4 17.4q1.8 2 4.2 1.2" stroke="#5a1a10" strokeWidth=".85" strokeLinecap="round" fill="none" />

      {/* eyewear */}
      {equipped.eyes === "spectacles" && (
        <g fill="none" stroke="#e9c25f" strokeWidth="1.05">
          <circle cx="24.5" cy="12.8" r="4.6" fill="rgba(200,240,255,.15)" />
          <circle cx="24.5" cy="12.8" r="5.2" stroke="#6b4a10" strokeWidth=".35" />
          <path d="M29 12.2q1.4-.8 2.4-.4" />
          <path d="M19.9 12.2L12 10.6" />
        </g>
      )}
      {equipped.eyes === "monocle" && (
        <g fill="none">
          <circle cx="24.5" cy="12.8" r="4.7" stroke="#e9c25f" strokeWidth="1.25" fill="rgba(200,240,255,.15)" />
          <circle cx="24.5" cy="12.8" r="5.4" stroke="#6b4a10" strokeWidth=".35" />
          <path d="M22.3 16.8q-1.2 6 2 11.5" stroke="#e2bb5c" strokeWidth=".45" strokeDasharray=".9 .5" />
          <path d="M22.5 10.4q1-1 2.2-1.2" stroke="#fff" strokeWidth=".5" strokeLinecap="round" opacity=".8" />
        </g>
      )}

      {/* floating sigil beneath */}
      <ellipse cx="22" cy="50" rx="15" ry="3.2" fill="none" stroke={aura[1]} strokeWidth=".7" opacity={flying ? 0.25 : 0.75} filter={url("glow")} />
      <ellipse cx="22" cy="50" rx="10" ry="2" fill="none" stroke="#f2d27e" strokeWidth=".5" strokeDasharray="1.5 1.5" opacity={flying ? 0.25 : 0.8} />
      {/* feet (tucked in flight) */}
      {flying ? (
        <path d="M18 42.5l3 2.4M21 42.5l3 2.2" stroke="#20304a" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M19 43v3.4M21.6 43v3.6M24.2 43v3.4" stroke="#20304a" strokeWidth="1.4" strokeLinecap="round" />
      )}

      {/* motes */}
      <circle className="toucan-mote" cx="-2" cy="28" r="1.2" fill="#c9fff3" style={{ animationDelay: "0s" }} />
      <circle className="toucan-mote" cx="50" cy="34" r="1" fill="#fff1b8" style={{ animationDelay: "0.75s" }} />
      <circle className="toucan-mote" cx="44" cy="-14" r="1.1" fill="#c9fff3" style={{ animationDelay: "1.5s" }} />
      <circle className="toucan-mote" cx="-6" cy="0" r=".9" fill="#fff1b8" style={{ animationDelay: "2.25s" }} />
    </svg>
  );
}
