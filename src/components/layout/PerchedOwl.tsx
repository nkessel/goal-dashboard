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
const FLIGHT_MS = 1250;

/**
 * A snowy owl that keeps watch in the Adventure theme. It perches on the
 * navigation bar, blinks now and then, and — when you tap it — spreads its
 * wings and flies to another perch, trailing a little starlight.
 */
export function PerchedOwl() {
  const [mounted, setMounted] = useState(false);
  const [at, setAt] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState(false);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number }[]>([]);
  const sparkId = useRef(0);
  const raf = useRef<number | null>(null);

  const place = useCallback((i: number) => {
    const p = perches()[i];
    if (p) setPos(p);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page has to exist before we can perch on it
    setMounted(true);
    let i = 0;
    try {
      i = Number(window.localStorage.getItem("owl-perch") ?? 0) || 0;
    } catch {
      /* storage unavailable */
    }
    setAt(i);
    const settle = () => place(i);
    const t = setTimeout(settle, 60);
    return () => clearTimeout(t);
  }, [place]);

  useEffect(() => {
    const onResize = () => !flying && place(at);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [at, flying, place]);

  useEffect(() => () => void (raf.current && cancelAnimationFrame(raf.current)), []);

  function fly() {
    if (flying || !pos) return;
    const all = perches();
    let next = Math.floor(Math.random() * (all.length - 1));
    if (next >= at) next += 1;
    const to = all[next];
    const from = pos;
    try {
      window.localStorage.setItem("owl-perch", String(next));
    } catch {
      /* storage unavailable */
    }
    setFacing(to.x >= from.x ? 1 : -1);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAt(next);
      setPos(to);
      return;
    }
    setFlying(true);
    // An arc: up and over, higher for longer flights.
    const lift = Math.min(260, 90 + Math.hypot(to.x - from.x, to.y - from.y) * 0.35);
    const cx = (from.x + to.x) / 2;
    const cy = Math.min(from.y, to.y) - lift;
    const start = performance.now();
    let lastSpark = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / FLIGHT_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * to.x;
      const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * to.y;
      setPos({ x, y });
      if (now - lastSpark > 45 && t < 0.95) {
        lastSpark = now;
        const id = ++sparkId.current;
        setSparks((s) => [...s.slice(-24), { id, x: x - facing * 14 + (Math.random() - 0.5) * 12, y: y - OWL_H * 0.45 + (Math.random() - 0.5) * 12 }]);
        setTimeout(() => setSparks((s) => s.filter((k) => k.id !== id)), 900);
      }
      if (t < 1) raf.current = requestAnimationFrame(step);
      else {
        setFlying(false);
        setAt(next);
      }
    };
    raf.current = requestAnimationFrame(step);
  }

  if (!mounted || !pos) return null;
  return createPortal(
    <>
      {sparks.map((s) => (
        <span key={s.id} aria-hidden className="owl-spark pointer-events-none fixed z-[44]" style={{ left: s.x, top: s.y }} />
      ))}
      <button
        type="button"
        onClick={fly}
        aria-label="A snowy owl — tap and it flies to another perch"
        title="Hoo!"
        className="owl-perch fixed z-[45] p-0"
        style={{
          left: pos.x - OWL_W / 2,
          top: pos.y - OWL_H,
          width: OWL_W,
          height: OWL_H,
          background: "transparent",
          border: 0,
          transform: `scaleX(${facing})`,
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45)) drop-shadow(0 0 10px rgba(255,236,170,.25))",
        }}
      >
        {flying ? <FlyingOwl /> : <SittingOwl />}
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
    <svg viewBox="0 0 52 56" width="52" height="56" aria-hidden>
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
