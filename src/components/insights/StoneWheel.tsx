"use client";

import { useEffect, useId, useRef, useState } from "react";

/** One press turns the wheel by one hour mark on its rim. */
export const WHEEL_STEP = 15;

// Stone, gilt, lapis and cinnabar: a carved temple wheel.
const STONE = "#9a8f7b";
const STONE_DARK = "#5f574a";
const STONE_LIGHT = "#c4b89c";
const GILT = "#d9b45f";
const GILT_LIGHT = "#f2d27e";
const LAPIS = "#26406e";
const CINNABAR = "#8e3424";

const C = 200;
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const at = (r: number, deg: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))] as const;
const f = (n: number) => n.toFixed(2);

/** A ring segment from angle a0 to a1 (degrees, 0 at the top, clockwise). */
function arcBand(r0: number, r1: number, a0: number, a1: number) {
  const [x0, y0] = at(r1, a0);
  const [x1, y1] = at(r1, a1);
  const [x2, y2] = at(r0, a1);
  const [x3, y3] = at(r0, a0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${f(x0)},${f(y0)} A${r1},${r1} 0 ${big} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r0},${r0} 0 ${big} 0 ${f(x3)},${f(y3)}Z`;
}

/** The lit part of the moon at phase p (0 new, .5 full), radius r, centred on 0,0. */
function moonLit(p: number, r: number): { d: string; mirror: boolean } | null {
  if (p < 0.02 || p > 0.98) return null;
  if (Math.abs(p - 0.5) < 0.02) return { d: `M0,${-r} A${r},${r} 0 1,1 0,${r} A${r},${r} 0 1,1 0,${-r}Z`, mirror: false };
  const waxing = p < 0.5;
  const q = waxing ? p : 1 - p;
  const rx = Math.abs(Math.cos(2 * Math.PI * q)) * r;
  const sweep = q < 0.25 ? 0 : 1;
  const d = `M0,${-r} A${r},${r} 0 0,1 0,${r} A${f(rx)},${r} 0 0,${sweep} 0,${-r}Z`;
  return { d, mirror: !waxing };
}

// Eight carved emblems for the eight panels, drawn around 0,0 at about 22px.
const EMBLEMS: string[] = [
  // sun
  "M0,-5.5a5.5,5.5 0 1,0 0.01,0Z M0,-11v3 M0,8v3 M-11,0h3 M8,0h3 M-7.8,-7.8l2.1,2.1 M5.7,5.7l2.1,2.1 M-7.8,7.8l2.1,-2.1 M5.7,-5.7l2.1,-2.1",
  // mountain under a rising sun
  "M-11,8 L-3,-4 L1,2 L5,-3 L11,8Z M-2,-8a3,3 0 1,0 0.01,0",
  // lotus
  "M0,8 C-3,3 -3,-4 0,-10 C3,-4 3,3 0,8Z M0,8 C-6,6 -10,1 -11,-4 C-6,-3 -2,2 0,8Z M0,8 C6,6 10,1 11,-4 C6,-3 2,2 0,8Z M-11,9 H11",
  // flame
  "M0,10 C-7,9 -8,2 -4,-3 C-3,0 -1,1 0,1 C-1,-4 1,-8 4,-11 C3,-6 8,-3 7,3 C6,8 3,10 0,10Z",
  // crescent moon and star
  "M3,-9 A9.5,9.5 0 1,0 3,9 A7.5,7.5 0 1,1 3,-9Z M7,-6 l1,2.4 2.5,.2 -1.9,1.6 .6,2.5 -2.2,-1.3 -2.2,1.3 .6,-2.5 -1.9,-1.6 2.5,-.2Z",
  // waves
  "M-11,-4 c2.5,-3 5,-3 7.3,0 s5,3 7.3,0 s5,-3 7.4,0 M-11,2 c2.5,-3 5,-3 7.3,0 s5,3 7.3,0 s5,-3 7.4,0 M-11,8 c2.5,-3 5,-3 7.3,0 s5,3 7.3,0 s5,-3 7.4,0",
  // leaf / bodhi
  "M0,11 V3 M0,3 C-9,1 -10,-7 0,-11 C10,-7 9,1 0,3Z M0,3 V-8",
  // eight-point star
  "M0,-11 L2.5,-2.5 L11,0 L2.5,2.5 L0,11 L-2.5,2.5 L-11,0 L-2.5,-2.5Z",
];

/** The wheel's face: drawn once, then turned whole by the compositor. */
function Face({ uid }: { uid: string }) {
  const id = (s: string) => `${uid}-${s}`;
  const moons = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 400 400" className="block h-full w-full" aria-hidden>
      <defs>
        {/* Grainy, mottled stone. */}
        <filter id={id("stone")} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 .5  0 0 0 0 .48  0 0 0 0 .44  0 0 0 -1.6 1.25" result="grainA" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="3" result="mottle" />
          <feColorMatrix in="mottle" type="matrix" values="0 0 0 0 .22  0 0 0 0 .2  0 0 0 0 .17  0 0 0 -1.5 .95" result="mottleA" />
          <feComposite in="grainA" in2="SourceAlpha" operator="in" result="g1" />
          <feComposite in="mottleA" in2="SourceAlpha" operator="in" result="m1" />
          <feBlend in="g1" in2="SourceGraphic" mode="multiply" result="b1" />
          <feBlend in="m1" in2="b1" mode="multiply" />
        </filter>
        {/* Carved relief: light from the top left, cut into the stone. */}
        <filter id={id("carve")} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="blur" />
          <feSpecularLighting in="blur" surfaceScale="3" specularConstant=".7" specularExponent="18" lightingColor="#fff6dc" result="spec">
            <feDistantLight azimuth="225" elevation="42" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
          <feOffset in="SourceAlpha" dx="1.2" dy="1.2" result="off" />
          <feGaussianBlur in="off" stdDeviation=".8" result="offBlur" />
          <feComposite in="SourceAlpha" in2="offBlur" operator="out" result="rim" />
          <feFlood floodColor="#1c140a" floodOpacity=".55" />
          <feComposite in2="rim" operator="in" result="shade" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="shade" />
            <feMergeNode in="specIn" />
          </feMerge>
        </filter>
        {/* Gold leaf, a little worn. */}
        <linearGradient id={id("gilt")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={GILT_LIGHT} />
          <stop offset=".45" stopColor={GILT} />
          <stop offset="1" stopColor="#9b7a33" />
        </linearGradient>
        <radialGradient id={id("lapis")} cx=".5" cy=".5" r=".5">
          <stop offset=".6" stopColor="#1a2d52" />
          <stop offset="1" stopColor={LAPIS} />
        </radialGradient>
        <radialGradient id={id("hub")} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={STONE_LIGHT} />
          <stop offset="1" stopColor={STONE} />
        </radialGradient>
      </defs>

      {/* The stone itself. */}
      <g filter={`url(#${id("stone")})`}>
        <circle cx={C} cy={C} r={190} fill={STONE} />
        <circle cx={C} cy={C} r={156} fill={`url(#${id("lapis")})`} />
        <path d={arcBand(88, 101, 0, 180)} fill="#b8913f" />
        <path d={arcBand(88, 101, 180, 360)} fill={CINNABAR} />
        <circle cx={C} cy={C} r={88} fill={`url(#${id("hub")})`} />
      </g>

      {/* Carvings. */}
      <g filter={`url(#${id("carve")})`}>
        {/* Outer teeth: 24 hour marks. */}
        {Array.from({ length: 24 }, (_, i) => {
          const a = i * 15;
          const [x0, y0] = at(190, a);
          const [x1, y1] = at(181, a);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={STONE_DARK} strokeWidth={i % 2 ? 2 : 3.4} strokeLinecap="round" />;
        })}
        <circle cx={C} cy={C} r={180} fill="none" stroke={STONE_DARK} strokeWidth="1.4" />
        <circle cx={C} cy={C} r={163} fill="none" stroke={STONE_DARK} strokeWidth="1.4" />
        <circle cx={C} cy={C} r={158.5} fill="none" stroke={`url(#${id("gilt")})`} strokeWidth="3" />

        {/* Twelve moons around the rim, new to full and back. */}
        {moons.map((i) => {
          const a = i * 30;
          const [x, y] = at(171.5, a);
          const lit = moonLit(i / 12, 6.2);
          return (
            <g key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${a})`}>
              <circle r={7} fill="#2e2a24" stroke={STONE_DARK} strokeWidth="1" />
              {lit && <path d={lit.d} fill={`url(#${id("gilt")})`} transform={lit.mirror ? "scale(-1 1)" : undefined} />}
            </g>
          );
        })}
        {/* Rosettes between the moons. */}
        {moons.map((i) => {
          const a = i * 30 + 15;
          const [x, y] = at(171.5, a);
          return (
            <g key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${a})`}>
              <path d="M0,-4.5 L1.6,0 L0,4.5 L-1.6,0Z M-4.5,0 L0,-1.6 L4.5,0 L0,1.6Z" fill={STONE_DARK} />
            </g>
          );
        })}

        {/* Eight spokes of the dharma wheel, gilt-edged. */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = i * 45;
          const p = (r: number, w: number) => at(r, a + (w / r) * (180 / Math.PI));
          const [ax, ay] = p(100, -4.5);
          const [bx, by] = p(156, -8);
          const [cx, cy] = p(156, 8);
          const [dx, dy] = p(100, 4.5);
          const [ex, ey] = at(102, a);
          const [gx, gy] = at(150, a);
          const [kx, ky] = at(149, a);
          return (
            <g key={i}>
              <path d={`M${f(ax)},${f(ay)} L${f(bx)},${f(by)} L${f(cx)},${f(cy)} L${f(dx)},${f(dy)}Z`} fill={STONE} stroke={`url(#${id("gilt")})`} strokeWidth="1.6" />
              <line x1={ex} y1={ey} x2={gx} y2={gy} stroke={STONE_DARK} strokeWidth="1.2" />
              <circle cx={kx} cy={ky} r={4} fill={`url(#${id("gilt")})`} />
            </g>
          );
        })}

        {/* The eight panels between the spokes, each with its emblem. */}
        {EMBLEMS.map((d, i) => {
          const a = i * 45 + 22.5;
          const [x, y] = at(128, a);
          return (
            <g key={i} transform={`translate(${f(x)} ${f(y)}) rotate(${a}) scale(1.45)`}>
              <circle r={15} fill="none" stroke="rgba(242,210,126,.35)" strokeWidth=".7" />
              <path d={d} fill={i === 5 ? "none" : `url(#${id("gilt")})`} stroke={GILT_LIGHT} strokeWidth={i === 5 ? 1.6 : 0.5} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {/* The path ring: the bright half rises (clockwise), the dark half falls. */}
        {Array.from({ length: 18 }, (_, i) => {
          const a = i * 20 + 10;
          const [x, y] = at(94.5, a);
          const up = a < 180;
          return <path key={i} d={up ? "M-2,-3 L2,0 L-2,3" : "M2,-3 L-2,0 L2,3"} transform={`translate(${f(x)} ${f(y)}) rotate(${a + 90})`} fill="none" stroke={up ? "#3b2a10" : "#f3c7b4"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />;
        })}
        <circle cx={C} cy={C} r={101} fill="none" stroke={`url(#${id("gilt")})`} strokeWidth="2" />
        <circle cx={C} cy={C} r={88} fill="none" stroke={`url(#${id("gilt")})`} strokeWidth="2" />

        {/* Lotus around the hub. */}
        {Array.from({ length: 8 }, (_, i) => (
          <path
            key={i}
            d="M0,-40 C-12,-48 -13,-66 0,-80 C13,-66 12,-48 0,-40Z"
            transform={`translate(${C} ${C}) rotate(${i * 45 + 22.5})`}
            fill="#d8ccb0"
            stroke={`url(#${id("gilt")})`}
            strokeWidth="1.3"
          />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d="M0,-40 C-7,-47 -8,-58 0,-66 C8,-58 7,-47 0,-40Z" transform={`translate(${C} ${C}) rotate(${i * 45})`} fill="#e9dfc6" stroke={STONE_DARK} strokeWidth=".8" />
        ))}

        {/* Day and night, turning around each other at the centre. */}
        <g transform={`translate(${C} ${C})`}>
          <circle r={37} fill="#16244a" stroke={`url(#${id("gilt")})`} strokeWidth="2.4" />
          <path d="M0,-37 A37,37 0 0,1 0,37 A18.5,18.5 0 0,1 0,0 A18.5,18.5 0 0,0 0,-37Z" fill={`url(#${id("gilt")})`} />
          <circle cx={0} cy={-18.5} r={6} fill="#16244a" />
          <path d="M1.5,14 A5.5,5.5 0 1,0 1.5,23 A4.3,4.3 0 1,1 1.5,14Z" fill={GILT_LIGHT} />
          <circle r={5} fill={CINNABAR} stroke={GILT_LIGHT} strokeWidth="1.2" />
        </g>
      </g>
    </svg>
  );
}

type Audio = { ctx: AudioContext; grind: GainNode; rumble: GainNode };

/**
 * A great carved stone wheel. `angle` is where it should come to rest (in
 * degrees, clockwise); when it changes the wheel is pushed there like
 * something enormously heavy: it is slow to start, builds momentum, rolls a
 * little past and settles back. Presses in a row add up their momentum.
 */
export function StoneWheel({ angle, sound = true }: { angle: number; sound?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const faceRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dustRef = useRef<HTMLDivElement>(null);
  const sim = useRef({ theta: angle, omega: 0, target: angle, push: 1, raf: 0, last: 0 });
  const audio = useRef<Audio | null>(null);
  const soundOn = useRef(sound);
  const [startAngle] = useState(angle);
  const tickRef = useRef<(now: number) => void>(() => {});
  useEffect(() => {
    soundOn.current = sound;
  }, [sound]);

  const tick = (now: number) => {
    const s = sim.current;
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    // The push builds up slowly: a heavy thing takes a moment to answer.
    s.push = Math.min(1, s.push + dt / 0.9);
    const k = 3.2; // spring toward the resting place (deg/s² per deg)
    const c = 2.3; // friction and the stone's drag
    const maxA = 34; // no push can accelerate this much stone faster than this
    const ease = s.push * s.push * (3 - 2 * s.push);
    let a = ease * k * (s.target - s.theta) - c * s.omega;
    a = Math.max(-maxA, Math.min(maxA, a));
    s.omega += a * dt;
    s.theta += s.omega * dt;

    const speed = Math.abs(s.omega);
    if (faceRef.current) faceRef.current.style.transform = `rotate(${s.theta.toFixed(3)}deg)`;
    // The ground trembles a little while it rolls.
    if (frameRef.current) {
      const j = Math.min(1.2, speed / 18);
      frameRef.current.style.transform = j > 0.05 ? `translate(${((Math.random() - 0.5) * j).toFixed(2)}px, ${((Math.random() - 0.5) * j).toFixed(2)}px)` : "";
    }
    const au = audio.current;
    if (au) {
      const t = au.ctx.currentTime;
      const level = soundOn.current ? Math.min(1, speed / 22) : 0;
      au.grind.gain.setTargetAtTime(level * 0.5, t, 0.08);
      au.rumble.gain.setTargetAtTime(level * 0.35, t, 0.1);
    }

    if (Math.abs(s.target - s.theta) < 0.02 && speed < 0.03) {
      s.theta = s.target;
      s.omega = 0;
      if (faceRef.current) faceRef.current.style.transform = `rotate(${s.theta}deg)`;
      if (frameRef.current) frameRef.current.style.transform = "";
      if (au) {
        au.grind.gain.setTargetAtTime(0, au.ctx.currentTime, 0.15);
        au.rumble.gain.setTargetAtTime(0, au.ctx.currentTime, 0.2);
      }
      s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(tickRef.current);
  };

  useEffect(() => {
    tickRef.current = tick;
  });

  // Each new resting place starts a push.
  useEffect(() => {
    const s = sim.current;
    if (angle === s.target) return;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    s.target = angle;
    if (reduced) {
      s.theta = angle;
      s.omega = 0;
      if (faceRef.current) faceRef.current.style.transform = `rotate(${angle}deg)`;
      return;
    }
    s.push = 0;
    if (soundOn.current) startAudio(audio);
    thud(audio.current, soundOn.current);
    try {
      navigator.vibrate?.(18);
    } catch {}
    dust(dustRef.current, angle > s.theta ? 1 : -1);
    if (!s.raf) {
      s.last = performance.now();
      s.raf = requestAnimationFrame(tickRef.current);
    }
  }, [angle]);

  useEffect(() => {
    const s = sim.current;
    return () => {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      audio.current?.ctx.close().catch(() => {});
      audio.current = null;
    };
  }, []);

  const id = (s: string) => `${uid}-${s}`;
  return (
    <div ref={frameRef} className="relative mx-auto w-full max-w-[380px] select-none" style={{ aspectRatio: "400 / 440" }}>
      <style>{`@keyframes wot-dust{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:.75}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.6)}}`}</style>
      {/* Behind: the plinth, the wheel's thickness and its shadow. */}
      <svg viewBox="0 0 400 440" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={id("plinth")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a7f6b" />
            <stop offset="1" stopColor="#4e473c" />
          </linearGradient>
          <radialGradient id={id("shadow")} cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#000" stopOpacity=".6" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={200} cy={428} rx={170} ry={12} fill={`url(#${id("shadow")})`} />
        <path d="M70,372 L330,372 L352,424 L48,424Z" fill={`url(#${id("plinth")})`} stroke="#3a342b" strokeWidth="1.5" />
        <path d="M70,372 L330,372 L333,379 L67,379Z" fill="#b3a68b" opacity=".6" />
        <path d="M48,424 L352,424 L352,431 L48,431Z" fill="#3a342b" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${100 + i * 50},384 l8,6 -8,6 -8,-6Z`} fill="#d9b45f" opacity=".55" />
        ))}
        <circle cx={203} cy={207} r={191} fill="#2b261f" />
        <circle cx={201.5} cy={203.5} r={191} fill="#4a4338" />
      </svg>
      {/* The face, turning. */}
      <div ref={faceRef} className="absolute left-0 top-0 w-full" style={{ height: `${(400 / 440) * 100}%`, transform: `rotate(${startAngle}deg)`, willChange: "transform" }}>
        <Face uid={uid} />
      </div>
      {/* In front: light from the top left (it doesn't turn), and the marker. */}
      <svg viewBox="0 0 400 440" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id={id("light")} cx=".34" cy=".28" r=".75">
            <stop offset="0" stopColor="#fff6dc" stopOpacity=".26" />
            <stop offset=".45" stopColor="#fff6dc" stopOpacity="0" />
            <stop offset=".8" stopColor="#000" stopOpacity=".18" />
            <stop offset="1" stopColor="#000" stopOpacity=".5" />
          </radialGradient>
          <radialGradient id={id("rimShade")} cx=".5" cy=".5" r=".5">
            <stop offset=".93" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".45" />
          </radialGradient>
          <linearGradient id={id("finial")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9b7a33" />
            <stop offset=".5" stopColor="#f6dd94" />
            <stop offset="1" stopColor="#9b7a33" />
          </linearGradient>
        </defs>
        <circle cx={200} cy={200} r={190} fill={`url(#${id("light")})`} />
        <circle cx={200} cy={200} r={190} fill={`url(#${id("rimShade")})`} />
        {/* The marker the wheel turns past. */}
        <g transform="translate(200 4)">
          <path d="M-13,-2 L13,-2 L4,20 L0,27 L-4,20Z" fill={`url(#${id("finial")})`} stroke="#5b4518" strokeWidth="1.2" />
          <circle cx={0} cy={6} r={3.6} fill={CINNABAR} stroke="#f6dd94" strokeWidth="1" />
        </g>
      </svg>
      <div ref={dustRef} className="pointer-events-none absolute inset-0" />
    </div>
  );
}

function startAudio(ref: { current: Audio | null }) {
  if (ref.current || typeof window === "undefined") {
    ref.current?.ctx.resume().catch(() => {});
    return;
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Stone grinding on stone: brown noise, low and rough.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5 * (0.7 + 0.3 * Math.sin(i / 900) * Math.sin(i / 2300));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    const grind = ctx.createGain();
    grind.gain.value = 0;
    noise.connect(lp).connect(grind).connect(ctx.destination);
    noise.start();
    // And a deep rumble under it.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 41;
    const rumble = ctx.createGain();
    rumble.gain.value = 0;
    osc.connect(rumble).connect(ctx.destination);
    osc.start();
    ref.current = { ctx, grind, rumble };
  } catch {
    ref.current = null;
  }
}

/** The dull knock of the push meeting the stone. */
function thud(au: Audio | null, on: boolean) {
  if (!au || !on) return;
  try {
    const { ctx } = au;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.55);
  } catch {}
}

/** A few puffs of grit where the wheel meets the plinth. */
function dust(host: HTMLDivElement | null, dir: number) {
  if (!host) return;
  for (let i = 0; i < 7; i++) {
    const p = document.createElement("span");
    const size = 3 + Math.random() * 5;
    const x = 50 + dir * (-6 - Math.random() * 10);
    Object.assign(p.style, {
      position: "absolute",
      left: `${x}%`,
      top: `${84 + Math.random() * 2}%`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "50%",
      background: "rgba(196,184,156,.7)",
      filter: "blur(1px)",
      animation: `wot-dust ${1.4 + Math.random()}s ease-out ${0.5 + Math.random() * 0.6}s forwards`,
      opacity: "0",
    });
    p.style.setProperty("--dx", `${-dir * (8 + Math.random() * 26)}px`);
    p.style.setProperty("--dy", `${-4 - Math.random() * 14}px`);
    host.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
}
