"use client";

import { useState } from "react";

/**
 * The welcome screen's backdrop: a valley of layered mountains at the hour's
 * light (dawn, day, dusk or night), with mist drifting between the ridges. A
 * thick veil of mist covers it all as the screen opens, then parts, and the
 * ridges and the card rise out of it.
 */
export type MistTime = "dawn" | "day" | "dusk" | "night";

type Palette = { sky: [string, string, string]; sun: string; glow: string; ridges: string[]; tops: string[]; mist: string; mote: string; rays: boolean };

const PALETTES: Record<MistTime, Palette> = {
  dawn: {
    sky: ["#b9c6e4", "#f1cdc4", "#fde3c3"],
    sun: "#fff4dc",
    glow: "255,214,160",
    ridges: ["#c7b6cf", "#a898b6", "#85799c", "#625d7f", "#403f5c"],
    tops: ["#f6dccf", "#e3c3c4", "#b9a3b8", "#8a7d9b", "#5b5776"],
    mist: "255,243,236",
    mote: "255,226,170",
    rays: true,
  },
  day: {
    sky: ["#8fbbe0", "#cfe2ee", "#f4efdc"],
    sun: "#fffdf0",
    glow: "255,244,200",
    ridges: ["#b7cad8", "#93afc2", "#6f93a6", "#4f7884", "#355a58"],
    tops: ["#eef3f6", "#d3e1ea", "#a9c3cf", "#7aa1a6", "#4f7a6c"],
    mist: "250,252,255",
    mote: "255,246,200",
    rays: true,
  },
  dusk: {
    sky: ["#55548f", "#c98ba0", "#f6b98a"],
    sun: "#ffe0a8",
    glow: "255,184,120",
    ridges: ["#b48ea6", "#906f92", "#6b5479", "#4a3c5e", "#2c2640"],
    tops: ["#f2c2a8", "#cf9fa6", "#9a7896", "#6a5579", "#3f3556"],
    mist: "255,230,220",
    mote: "255,200,140",
    rays: true,
  },
  night: {
    sky: ["#0d1330", "#1f2850", "#3a4474"],
    sun: "#f6f2de",
    glow: "200,210,255",
    ridges: ["#3d4772", "#2f3961", "#242c4d", "#1a213b", "#10152a"],
    tops: ["#6f7aa8", "#4f5a88", "#38416a", "#272f4e", "#1a2038"],
    mist: "196,206,240",
    mote: "255,236,160",
    rays: false,
  },
};

export function mistTimeOf(h = new Date().getHours()): MistTime {
  if (h < 5 || h >= 21) return "night";
  if (h < 9) return "dawn";
  if (h < 17) return "day";
  return "dusk";
}

// A small seeded random, so the art is the same on every visit.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const W = 1200;
const H = 800;

/** A ridge line: peaks (sharp for the far range, rolling for the near hills) as points along the width. */
function ridgePoints(seed: number, base: number, amp: number, sharp: number) {
  const r = rng(seed);
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: (i + 1) * (0.004 + r() * 0.004), p: r() * Math.PI * 2, a: amp / (i + 1.3) }));
  const pts: [number, number][] = [];
  for (let x = -20; x <= W + 20; x += 12) {
    let y = 0;
    for (const w of waves) {
      const s = Math.sin(x * w.f + w.p);
      // Sharper ranges fold the wave into peaks.
      y += w.a * ((1 - sharp) * s + sharp * (1 - 2 * Math.abs(s)));
    }
    pts.push([x, base - y]);
  }
  return pts;
}

const pathOf = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x},${y.toFixed(1)}`).join(" L")} L${W + 20},${H} L-20,${H} Z`;

/** A pine: three tiers of boughs on a short trunk, standing at (x, y). */
function pine(x: number, y: number, h: number) {
  const w = h * 0.42;
  const t = (top: number, bottom: number, half: number) => `M${x},${y - top} L${x + half},${y - bottom} L${x - half},${y - bottom} Z`;
  return t(h, h * 0.45, w * 0.55) + t(h * 0.78, h * 0.22, w * 0.78) + t(h * 0.55, h * 0.04, w) + `M${x - h * 0.03},${y} v${-h * 0.08} h${h * 0.06} v${h * 0.08} Z`;
}

/** Pines along a ridge, thinning out at random. */
function forest(pts: [number, number][], seed: number, size: number, every: number) {
  const r = rng(seed);
  let d = "";
  for (let i = 0; i < pts.length; i += every) {
    if (r() < 0.35) continue;
    const [x, y] = pts[i];
    d += pine(x + r() * 8, y + 4 + r() * 6, size * (0.6 + r() * 0.6));
  }
  return d;
}

const RIDGES = [
  ridgePoints(11, 470, 120, 0.85),
  ridgePoints(23, 530, 80, 0.6),
  ridgePoints(37, 590, 55, 0.35),
  ridgePoints(41, 660, 40, 0.15),
  ridgePoints(53, 735, 30, 0.1),
];
const RIDGE_PATHS = RIDGES.map(pathOf);
const FORESTS = [null, null, forest(RIDGES[2], 7, 16, 2), forest(RIDGES[3], 9, 26, 2), forest(RIDGES[4], 13, 40, 2)];

const STARS = (() => {
  const r = rng(99);
  return Array.from({ length: 46 }, () => ({ x: r() * 100, y: r() * 52, s: 1 + r() * 1.8, d: r() * 4 }));
})();
const MOTES = (() => {
  const r = rng(5);
  return Array.from({ length: 16 }, () => ({ x: 4 + r() * 92, y: 45 + r() * 50, s: 2 + r() * 3, d: r() * 8, t: 9 + r() * 8 }));
})();
/** The veil: big soft billows that part to either side as the screen opens. */
const VEIL = (() => {
  const r = rng(3);
  return Array.from({ length: 12 }, (_, i) => {
    const left = i % 2 === 0;
    return { x: (left ? 20 : 80) + (r() - 0.5) * 50, y: 8 + (i / 12) * 84 + (r() - 0.5) * 10, size: 70 + r() * 50, dx: (left ? -1 : 1) * (45 + r() * 35), delay: 120 + r() * 500 };
  });
})();

/** The foreground pines, drawn once and set at each side of the screen. */
const SIDE_PINES = (() => {
  const r = rng(71);
  let d = "";
  for (let i = 0; i < 6; i++) {
    const x = 10 + i * 34 + r() * 14;
    d += pine(x, 392, 190 + r() * 170 - i * 22);
  }
  // The ground they stand on.
  return d + "M-120,384 Q100,372 340,386 V400 H-120 Z";
})();

export function MistScene({ time }: { time?: MistTime }) {
  const [when] = useState<MistTime>(() => time ?? mistTimeOf());
  const p = PALETTES[when];
  const mist = (a: number) => `rgba(${p.mist},${a})`;
  const night = when === "night";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(180deg, ${p.sky[0]} 0%, ${p.sky[1]} 45%, ${p.sky[2]} 75%)` }}>
      {/* Stars at night, twinkling. */}
      {night &&
        STARS.map((s, i) => (
          <span key={i} className="mist-star absolute rounded-full" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, background: "#fff", animationDelay: `${s.d}s` }} />
        ))}

      {/* The sun (or moon), its glow, and slow light rays. */}
      <div className="absolute left-1/2 top-[22%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, rgba(${p.glow},.55) 0%, rgba(${p.glow},.18) 18%, rgba(${p.glow},0) 42%)` }} />
        {p.rays && (
          <div
            className="mist-rays absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] rounded-full"
            style={{
              background: `repeating-conic-gradient(from 0deg, rgba(${p.glow},.22) 0deg 4deg, rgba(${p.glow},0) 4deg 13deg)`,
              WebkitMaskImage: "radial-gradient(circle, #000 0%, rgba(0,0,0,.5) 18%, transparent 46%)",
              maskImage: "radial-gradient(circle, #000 0%, rgba(0,0,0,.5) 18%, transparent 46%)",
            }}
          />
        )}
        <div className="relative h-[13vmin] max-h-24 w-[13vmin] max-w-24 rounded-full" style={{ background: night ? `radial-gradient(circle at 38% 36%, #fffef6, ${p.sun} 60%, #d9d6c4)` : `radial-gradient(circle, #fff, ${p.sun} 65%)`, boxShadow: `0 0 40px 12px rgba(${p.glow},.7)` }}>
          {night && <span className="absolute right-[18%] top-[30%] h-[22%] w-[22%] rounded-full" style={{ background: "rgba(190,186,165,.35)" }} />}
        </div>
      </div>

      {/* A few birds crossing the sky by day. */}
      {!night && (
        <svg className="mist-birds absolute left-0 top-[14%] h-10 w-28" viewBox="0 0 112 40" fill="none">
          {[
            [8, 22, 1],
            [30, 12, 0.8],
            [46, 26, 0.7],
          ].map(([x, y, s], i) => (
            <path key={i} d={`M${x},${y} q${6 * s},${-6 * s} ${12 * s},0 q${6 * s},${-6 * s} ${12 * s},0`} stroke={when === "dusk" ? "#3a2b45" : "#4a5468"} strokeWidth="1.6" strokeLinecap="round" opacity=".6" />
          ))}
        </svg>
      )}

      {/* The ridges, far to near, each rising out of the mist in turn, with mist lying between them. */}
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          {p.ridges.map((c, i) => (
            <linearGradient key={i} id={`mist-ridge-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={p.tops[i]} />
              <stop offset={i === 0 ? ".28" : ".4"} stopColor={c} />
              <stop offset="1" stopColor={c} />
            </linearGradient>
          ))}
          <linearGradient id="mist-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mist(0)} />
            <stop offset=".5" stopColor={mist(0.55)} />
            <stop offset="1" stopColor={mist(0)} />
          </linearGradient>
        </defs>
        {RIDGE_PATHS.map((d, i) => (
          <g key={i} className="mist-rise" style={{ animationDelay: `${300 + i * 260}ms` }}>
            <path d={d} fill={`url(#mist-ridge-${i})`} />
            {FORESTS[i] && <path d={FORESTS[i]!} fill={p.ridges[i]} />}
            {/* Haze pooled in the valley at this ridge's foot. */}
            {i < 4 && <rect x="-20" y={RIDGES[i + 1][50][1] - 70} width={W + 40} height="110" fill="url(#mist-haze)" />}
          </g>
        ))}
      </svg>

      {/* Drifting bands of mist between the ridges. */}
      {[
        { bottom: "34%", h: "16%", a: 0.5, t: 90, rev: false },
        { bottom: "22%", h: "14%", a: 0.6, t: 70, rev: true },
        { bottom: "8%", h: "18%", a: 0.55, t: 55, rev: false },
        { bottom: "-4%", h: "16%", a: 0.75, t: 45, rev: true },
      ].map((b, i) => (
        <div
          key={i}
          className={b.rev ? "mist-drift-rev absolute left-0 w-[200%]" : "mist-drift absolute left-0 w-[200%]"}
          style={{
            bottom: b.bottom,
            height: b.h,
            animationDuration: `${b.t}s`,
            backgroundImage: `radial-gradient(ellipse 50% 50% at 50% 50%, ${mist(b.a)}, ${mist(0)} 70%), radial-gradient(ellipse 50% 50% at 50% 50%, ${mist(b.a * 0.8)}, ${mist(0)} 70%)`,
            backgroundSize: "760px 100%, 480px 80%",
            backgroundPosition: "0 0, 240px 60%",
            backgroundRepeat: "repeat-x",
          }}
        />
      ))}

      {/* Foreground pines framing the screen. */}
      <svg className="mist-rise-side absolute bottom-0 left-0 h-[42vh] max-h-[380px]" viewBox="0 0 220 400" overflow="visible" style={{ marginLeft: "-3%" }}>
        <path d={SIDE_PINES} fill={p.ridges[4]} />
      </svg>
      <svg className="mist-rise-side absolute bottom-0 right-0 h-[36vh] max-h-[330px]" viewBox="0 0 220 400" overflow="visible" style={{ transform: "scaleX(-1)", marginRight: "-3%" }}>
        <path d={SIDE_PINES} fill={p.ridges[4]} />
      </svg>

      {/* Little lights drifting up: dust in the sun by day, fireflies after dark. */}
      {MOTES.map((m, i) => (
        <span key={i} className="mist-mote absolute rounded-full" style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.s, height: m.s, background: `rgb(${p.mote})`, boxShadow: `0 0 ${m.s * 3}px rgba(${p.mote},.9)`, animationDelay: `${m.d}s`, animationDuration: `${m.t}s` }} />
      ))}

      {/* A low soft wash, so the card reads clearly against the art. */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 60% 55% at 50% 52%, ${mist(night ? 0.12 : 0.28)}, ${mist(0)} 75%)` }} />

      {/* The veil: thick mist at first, parting to reveal the valley. */}
      <div className="mist-veil-wash absolute inset-0" style={{ background: mist(1) }} />
      {VEIL.map((v, i) => (
        <span
          key={i}
          className="mist-veil absolute rounded-full"
          style={{ left: `${v.x}%`, top: `${v.y}%`, width: `${v.size}vmax`, height: `${v.size * 0.7}vmax`, marginLeft: `${-v.size / 2}vmax`, marginTop: `${-v.size * 0.35}vmax`, background: `radial-gradient(ellipse, ${mist(1)} 30%, ${mist(0.85)} 50%, ${mist(0)} 70%)`, "--dx": `${v.dx}vw`, animationDelay: `${v.delay}ms` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
