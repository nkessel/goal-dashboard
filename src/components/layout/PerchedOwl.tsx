"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Where the owl can land, worked out from the page each time. */
function perches(): { x: number; y: number }[] {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const nav = document.querySelector("[data-app-nav]")?.getBoundingClientRect();
  const navTop = nav ? nav.top + 2 : H - 70;
  const bell = document.querySelector("[data-bell]")?.getBoundingClientRect();
  return [
    { x: Math.max(40, W * 0.14), y: navTop }, // on the nav, left
    { x: Math.min(W - 40, W * 0.86), y: navTop }, // on the nav, right
    { x: bell ? Math.max(40, bell.left - 30) : W - 120, y: bell ? bell.bottom + 34 : 96 }, // up by the bell
    { x: 30, y: Math.round(H * 0.42) }, // the left edge
    { x: W - 30, y: Math.round(H * 0.3) }, // the right edge
  ];
}

const OWL_W = 52;
const OWL_H = 56;
type Phase = "perched" | "takeoff" | "flying" | "gliding" | "landing";

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

/**
 * A snowy owl that keeps watch in the Adventure theme. It perches on the
 * navigation bar, breathes, blinks and glances about. Tap it and it crouches,
 * springs up, beats its wings into a smooth banking arc (gliding on the long
 * middle stretch), then flares its wings to land on another perch — trailing
 * a little starlight. Motion runs on the compositor, not React renders.
 */
export function PerchedOwl() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("perched");
  const [facing, setFacing] = useState<1 | -1>(1);
  const at = useRef(0);
  const pos = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const sparks = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const busy = useRef(false);

  const put = useCallback((p: { x: number; y: number }, tilt = 0, lift = 0) => {
    pos.current = p;
    const el = box.current;
    if (!el) return;
    el.style.transform = `translate3d(${(p.x - OWL_W / 2).toFixed(1)}px, ${(p.y - OWL_H - lift).toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page has to exist before we can perch on it
    setMounted(true);
    try {
      at.current = Number(window.localStorage.getItem("owl-perch") ?? 0) || 0;
    } catch {
      /* storage unavailable */
    }
    const t = setTimeout(() => {
      const p = perches()[at.current] ?? perches()[0];
      put(p);
      box.current?.classList.add("owl-arrive");
    }, 80);
    const onResize = () => !busy.current && put(perches()[at.current] ?? perches()[0]);
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [put]);

  function spark(x: number, y: number) {
    const host = sparks.current;
    if (!host) return;
    const s = document.createElement("span");
    s.className = "owl-spark";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 950);
  }

  function fly() {
    if (busy.current || !pos.current) return;
    const all = perches();
    let next = Math.floor(Math.random() * (all.length - 1));
    if (next >= at.current) next += 1;
    const to = all[next];
    const from = pos.current;
    try {
      window.localStorage.setItem("owl-perch", String(next));
    } catch {
      /* storage unavailable */
    }
    const dir: 1 | -1 = to.x >= from.x ? 1 : -1;
    setFacing(dir);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      at.current = next;
      put(to);
      return;
    }
    busy.current = true;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.max(900, Math.min(1700, 600 + dist * 1.1));
    const lift = Math.min(220, 70 + dist * 0.3);
    // Two control points: a steep climb out, a gentle descent in.
    const c1 = { x: from.x + (to.x - from.x) * 0.15, y: Math.min(from.y, to.y) - lift };
    const c2 = { x: from.x + (to.x - from.x) * 0.75, y: Math.min(from.y, to.y) - lift * 0.8 };

    // 1) Crouch and spring.
    setPhase("takeoff");
    setTimeout(() => {
      setPhase("flying");
      const start = performance.now();
      let last = { x: from.x, y: from.y };
      let lastSpark = 0;
      let gliding = false;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const e = easeInOutSine(t);
        const x = bez(from.x, c1.x, c2.x, to.x, e);
        const y = bez(from.y, c1.y, c2.y, to.y, e);
        // Bank into the turn: tilt with the path's slope.
        const vx = x - last.x;
        const vy = y - last.y;
        const tilt = Math.max(-22, Math.min(22, (Math.atan2(vy, Math.abs(vx) + 0.001) * 180) / Math.PI * 0.45)) * dir;
        last = { x, y };
        put({ x, y }, tilt);
        // Glide through the middle of a long flight.
        const glideNow = dur > 1100 && t > 0.38 && t < 0.68;
        if (glideNow !== gliding) {
          gliding = glideNow;
          setPhase(glideNow ? "gliding" : "flying");
        }
        if (now - lastSpark > 38 && t > 0.05 && t < 0.92) {
          lastSpark = now;
          spark(x - dir * 16 + (Math.random() - 0.5) * 10, y - OWL_H * 0.42 + (Math.random() - 0.5) * 10);
        }
        if (t < 1) raf.current = requestAnimationFrame(step);
        else {
          // 3) Flare and settle.
          setPhase("landing");
          put(to);
          setTimeout(() => {
            setPhase("perched");
            at.current = next;
            busy.current = false;
          }, 260);
        }
      };
      raf.current = requestAnimationFrame(step);
    }, 170);
  }

  if (!mounted) return null;
  return createPortal(
    <>
      <div ref={sparks} aria-hidden className="pointer-events-none fixed inset-0 z-[44]" />
      <button
        ref={box}
        type="button"
        onClick={fly}
        aria-label="A snowy owl — tap and it flies to another perch"
        title="Hoo!"
        className="owl-perch fixed left-0 top-0 z-[45] p-0"
        style={{
          width: OWL_W,
          height: OWL_H,
          background: "transparent",
          border: 0,
          willChange: "transform",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45)) drop-shadow(0 0 10px rgba(255,236,170,.25))",
        }}
      >
        <div ref={body} className={`owl-body owl-${phase}`} style={{ transform: `scaleX(${facing})` }}>
          {phase === "perched" || phase === "takeoff" ? <SittingOwl /> : <FlyingOwl />}
        </div>
      </button>
    </>,
    document.body
  );
}

/** Shared paint: snow-white feathers with cool shadows, dark flecks, amber eyes. */
function Defs() {
  return (
    <defs>
      <radialGradient id="owl-snow" cx=".42" cy=".3" r=".8">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".55" stopColor="#f2efe6" />
        <stop offset="1" stopColor="#c9ccd6" />
      </radialGradient>
      <linearGradient id="owl-wing" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6f3ea" />
        <stop offset="1" stopColor="#b9bdca" />
      </linearGradient>
      <radialGradient id="owl-iris" cx=".45" cy=".4" r=".6">
        <stop offset="0" stopColor="#ffe28a" />
        <stop offset=".7" stopColor="#e9a92a" />
        <stop offset="1" stopColor="#a8661a" />
      </radialGradient>
    </defs>
  );
}

function Flecks({ d }: { d: string }) {
  return <path d={d} fill="none" stroke="#3b3a46" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />;
}

function Eyes({ y = 19 }: { y?: number }) {
  return (
    <g className="owl-eyes">
      {[19.5, 32.5].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={y} r="4.3" fill="url(#owl-iris)" stroke="#2c2416" strokeWidth=".7" />
          <circle cx={cx + 0.3} cy={y + 0.4} r="2.1" fill="#120d06" />
          <circle cx={cx - 1.2} cy={y - 1.1} r=".9" fill="#fff" />
          {/* a soft, wise upper lid */}
          <path d={`M${cx - 4.8} ${y - 1.2}Q${cx} ${y - 5.6} ${cx + 4.8} ${y - 1.2}Q${cx} ${y - 3.2} ${cx - 4.8} ${y - 1.2}Z`} fill="#eceae3" />
        </g>
      ))}
    </g>
  );
}

function SittingOwl() {
  return (
    <svg viewBox="0 0 52 56" width="52" height="56" aria-hidden className="owl-idle">
      <Defs />
      {/* tail and wings folded behind */}
      <path d="M17 46l9 8 9-8z" fill="#c9ccd6" />
      <path d="M9 24c-4 9-2 19 7 25 3-7 3-15 0-24z" fill="url(#owl-wing)" stroke="#9fa3b2" strokeWidth=".6" />
      <path d="M43 24c4 9 2 19-7 25-3-7-3-15 0-24z" fill="url(#owl-wing)" stroke="#9fa3b2" strokeWidth=".6" />
      {/* round body and head */}
      <path d="M26 5c11 0 18 8 18 19 0 13-8 24-18 24S8 37 8 24C8 13 15 5 26 5z" fill="url(#owl-snow)" stroke="#a5a9b8" strokeWidth=".7" />
      {/* soft facial disc */}
      <ellipse cx="26" cy="20" rx="14" ry="10.5" fill="#fbfaf6" opacity=".9" />
      <Flecks d="M13 31q2 1 4 0M19 35q2 1 4 0M29 35q2 1 4 0M35 31q2 1 4 0M24 40q2 1 4 0M15 38q1.6.8 3 0M34 38q1.6.8 3 0M11 26q1.5.6 2.6 0M38.4 26q1.5.6 2.6 0" />
      <Eyes />
      {/* beak tucked in feathers */}
      <path d="M26 22.5l-2 3.4q2 1.4 4 0z" fill="#3b3226" />
      {/* talons on the perch */}
      <path d="M19 47.5v4M21.5 47.5v4.4M30.5 47.5v4.4M33 47.5v4" stroke="#2c2416" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FlyingOwl() {
  return (
    <svg viewBox="0 0 52 56" width="52" height="56" aria-hidden style={{ overflow: "visible" }}>
      <Defs />
      {/* wings spread, beating */}
      <g className="owl-wing-l">
        <path d="M17 22C9 12-3 8-20 11L-11 14.5L-21 18L-11.5 20L-19.5 24.5L-10 25L-16 30.5L-7 29L-9.5 34C1 33 10 31 18 30Z" fill="url(#owl-wing)" stroke="#9fa3b2" strokeWidth=".7" strokeLinejoin="round" />
        <path d="M14 23C6 16-3 14-12 15" fill="none" stroke="#a9adbb" strokeWidth=".7" />
        <Flecks d="M-2 19q2 1 4 0M6 22q2 1 4 0M-4 25q2 1 4 0M4 28q2 1 4 0" />
      </g>
      <g className="owl-wing-r">
        <path d="M35 22C43 12 55 8 72 11L63 14.5L73 18L63.5 20L71.5 24.5L62 25L68 30.5L59 29L61.5 34C51 33 42 31 34 30Z" fill="url(#owl-wing)" stroke="#9fa3b2" strokeWidth=".7" strokeLinejoin="round" />
        <path d="M38 23C46 16 55 14 64 15" fill="none" stroke="#a9adbb" strokeWidth=".7" />
        <Flecks d="M50 19q2 1 4 0M42 22q2 1 4 0M52 25q2 1 4 0M44 28q2 1 4 0" />
      </g>
      {/* body leaning into the flight */}
      <path d="M26 9c9 0 15 6 15 15 0 10-6 18-15 21-9-3-15-11-15-21 0-9 6-15 15-15z" fill="url(#owl-snow)" stroke="#a5a9b8" strokeWidth=".7" />
      <ellipse cx="26" cy="22" rx="12" ry="9" fill="#fbfaf6" opacity=".9" />
      <Flecks d="M18 33q2 1 4 0M30 33q2 1 4 0M24 38q2 1 4 0" />
      <Eyes y={21} />
      <path d="M26 24.5l-2 3.4q2 1.4 4 0z" fill="#3b3226" />
      {/* talons tucked */}
      <path d="M22 44l1.5 3M30 44l-1.5 3" stroke="#2c2416" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
