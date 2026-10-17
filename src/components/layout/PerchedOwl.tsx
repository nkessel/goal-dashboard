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

/** A spot the owl was dragged to, kept as a share of the screen. */
function spot(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(window.localStorage.getItem("owl-spot") ?? "null") as { fx: number; fy: number } | null;
    if (!v || !Number.isFinite(v.fx) || !Number.isFinite(v.fy)) return null;
    const W = window.innerWidth;
    const H = window.innerHeight;
    return { x: Math.max(OWL_W / 2, Math.min(W - OWL_W / 2, v.fx * W)), y: Math.max(OWL_H, Math.min(H - 4, v.fy * H)) };
  } catch {
    return null;
  }
}

const OWL_W = 52;
const OWL_H = 56;
type Phase = "perched" | "takeoff" | "flying" | "gliding" | "landing";

/** What the great toucan spirit says when tapped. */
const WISDOM = [
  "The longest quest begins with one small step. Take it.",
  "Rest is not retreat. Even spirits perch.",
  "A bright beak is no use unopened. Speak your need.",
  "Finish one thing, and the forest grows quieter.",
  "The river does not hurry, yet it reaches the sea.",
  "What you water, grows. Choose wisely.",
  "Courage is a feather: light, but it lifts you.",
  "Mistakes are maps. Read them, then fly on.",
  "The sun rises for those who show up again.",
  "Ask for help. Even the great toucan has a flock.",
];
const HOLD_MS = 650;

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
  // Hold the owl and it poofs into the great toucan spirit (and back).
  const [spirit, setSpirit] = useState(false);
  const [charging, setCharging] = useState(false);
  const [wisdom, setWisdom] = useState<{ text: string; x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const lastWisdom = useRef(-1);
  // Drag it anywhere: it stays where you set it down (remembered on this device).
  const drag = useRef<{ x0: number; y0: number; offX: number; offY: number; moving: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [taps, setTaps] = useState(0);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remembered form, readable only after hydration
      if (window.localStorage.getItem("owl-spirit") === "1") setSpirit(true);
    } catch {
      /* storage unavailable */
    }
    const home = () => {
      if (at.current < 0) {
        const sp = spot();
        if (sp) return sp;
        at.current = 0;
      }
      return perches()[at.current] ?? perches()[0];
    };
    const t = setTimeout(() => {
      put(home());
      box.current?.classList.add("owl-arrive");
    }, 80);
    const onResize = () => !busy.current && !drag.current && put(home());
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

  function poof() {
    const p = pos.current;
    const host = sparks.current;
    if (!p) return;
    const cx = p.x;
    const cy = p.y - OWL_H / 2;
    if (host && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
        const r = 26 + Math.random() * 26;
        const size = 18 + Math.random() * 22;
        const d = document.createElement("span");
        d.className = "poof-puff";
        d.style.left = `${cx}px`;
        d.style.top = `${cy}px`;
        d.style.width = `${size}px`;
        d.style.height = `${size}px`;
        d.style.setProperty("--px", `${Math.cos(a) * r}px`);
        d.style.setProperty("--py", `${Math.sin(a) * r - 8}px`);
        d.style.animationDelay = `${Math.random() * 60}ms`;
        host.appendChild(d);
        setTimeout(() => d.remove(), 1000);
      }
      // A ring of light bursts outward as the spirit arrives.
      const ring = document.createElement("span");
      ring.className = "poof-ring";
      ring.style.left = `${cx}px`;
      ring.style.top = `${cy}px`;
      host.appendChild(ring);
      setTimeout(() => ring.remove(), 900);
      for (let i = 0; i < 10; i++) spark(cx + (Math.random() - 0.5) * 60, cy + (Math.random() - 0.5) * 50);
    }
    setWisdom(null);
    setTimeout(() => {
      setSpirit((v) => {
        try {
          window.localStorage.setItem("owl-spirit", v ? "0" : "1");
        } catch {
          /* storage unavailable */
        }
        return !v;
      });
    }, 110);
  }

  function startHold() {
    if (busy.current) return;
    held.current = false;
    setCharging(true);
    hold.current = setTimeout(() => {
      held.current = true;
      setCharging(false);
      poof();
    }, HOLD_MS);
  }
  function endHold() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    setCharging(false);
  }

  function speak() {
    const p = pos.current;
    if (!p) return;
    // A wise flourish: it rises, spreads its glow and lets starlight fall from its bill.
    setTaps((n) => n + 1);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 9; i++) setTimeout(() => spark(p.x + facing * (10 + Math.random() * 26), p.y - OWL_H * 0.75 + (Math.random() - 0.5) * 30), 120 + i * 45);
    }
    let i = Math.floor(Math.random() * WISDOM.length);
    if (i === lastWisdom.current) i = (i + 1) % WISDOM.length;
    lastWisdom.current = i;
    const x = Math.max(130, Math.min(window.innerWidth - 130, p.x));
    setWisdom({ text: WISDOM[i], x, y: p.y - OWL_H - 14 });
  }
  useEffect(() => {
    if (!wisdom) return;
    const t = setTimeout(() => setWisdom(null), 5000);
    return () => clearTimeout(t);
  }, [wisdom]);

  function fly() {
    if (busy.current || !pos.current) return;
    const all = perches();
    let next = Math.floor(Math.random() * (at.current < 0 ? all.length : all.length - 1));
    if (at.current >= 0 && next >= at.current) next += 1;
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
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          if (spirit) speak();
          else fly();
        }}
        onPointerDown={(e) => {
          if (busy.current || !pos.current || e.button > 0) return;
          drag.current = { x0: e.clientX, y0: e.clientY, offX: e.clientX - pos.current.x, offY: e.clientY - pos.current.y, moving: false };
          e.currentTarget.setPointerCapture(e.pointerId);
          startHold();
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!d.moving) {
            if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
            d.moving = true;
            endHold();
            setWisdom(null);
            setDragging(true);
          }
          const W = window.innerWidth;
          const H = window.innerHeight;
          const x = Math.max(OWL_W / 2, Math.min(W - OWL_W / 2, e.clientX - d.offX));
          const y = Math.max(OWL_H, Math.min(H - 4, e.clientY - d.offY));
          const prevX = pos.current?.x ?? x;
          if (Math.abs(x - prevX) > 1.5) setFacing(x > prevX ? 1 : -1);
          put({ x, y }, Math.max(-12, Math.min(12, (x - prevX) * 0.8)));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          endHold();
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          if (d?.moving && pos.current) {
            held.current = true; // not a tap
            setDragging(false);
            put(pos.current);
            at.current = -1;
            try {
              window.localStorage.setItem("owl-perch", "-1");
              window.localStorage.setItem("owl-spot", JSON.stringify({ fx: pos.current.x / window.innerWidth, fy: pos.current.y / window.innerHeight }));
            } catch {
              /* storage unavailable */
            }
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
          endHold();
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Keyboard: Shift+Enter transforms.
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            poof();
          }
        }}
        aria-label={spirit ? "The great toucan spirit — tap for wisdom, hold to return to the owl" : "A snowy owl — tap and it flies to another perch; hold to summon the great toucan spirit"}
        title={spirit ? "The great toucan spirit" : "Hoo!"}
        className={`owl-perch fixed left-0 top-0 z-[45] touch-none select-none p-0 ${dragging ? "owl-dragging" : ""}`}
        style={{
          width: OWL_W,
          height: OWL_H,
          background: "transparent",
          border: 0,
          willChange: "transform",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45)) drop-shadow(0 0 10px rgba(255,236,170,.25))",
        }}
      >
        <div className={charging ? "owl-charging" : undefined}>
          <div ref={body} className={`owl-body owl-${phase}`} style={{ transform: `scaleX(${facing})` }}>
            {spirit ? (
              <div key={taps} className={taps ? "toucan-tap" : undefined}>
                <ToucanSpirit />
              </div>
            ) : phase === "perched" || phase === "takeoff" ? <SittingOwl /> : <FlyingOwl />}
          </div>
        </div>
      </button>
      {wisdom && (
        <div
          role="status"
          className="pointer-events-none fixed z-[46]"
          style={{ left: wisdom.x, top: wisdom.y, transform: "translate(-50%, -100%)" }}
        >
          <div
            className="toucan-wisdom max-w-[240px] rounded-2xl px-3.5 py-2.5 text-center text-[14.5px] italic leading-snug"
            style={{ background: "linear-gradient(180deg, rgba(14,38,40,.94), rgba(8,22,26,.96))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 0 18px rgba(120,230,210,.35), 0 6px 16px rgba(0,0,0,.5)", fontFamily: "var(--font-display, serif)" }}
          >
            “{wisdom.text}”
          </div>
        </div>
      )}
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

/**
 * The great toucan spirit: an ancient, wise and powerful toucan. Midnight
 * plumage with an iridescent sheen, gold-edged wings half-mantled, a sunrise
 * bill traced with filigree, a heavy-lidded knowing eye with sage's brow
 * plumes, a crown of light, a glowing amulet on its golden breast, a slowly
 * turning halo of runes, and a sigil it hovers above.
 */
function ToucanSpirit() {
  return (
    <div style={{ transform: "scale(1.3)", transformOrigin: "50% 92%" }}>
      <svg viewBox="0 0 52 56" width="52" height="56" aria-hidden className="toucan-spirit" style={{ overflow: "visible" }}>

  <defs>
    <radialGradient id="tc-aura" cx=".5" cy=".5" r=".5">
      <stop offset="0" stopColor="#b9fff0" stopOpacity=".6"/>
      <stop offset=".45" stopColor="#42d6c4" stopOpacity=".22"/>
      <stop offset="1" stopColor="#42d6c4" stopOpacity="0"/>
    </radialGradient>
    <linearGradient id="tc-bill" x1="0" y1="0" x2="1" y2=".6">
      <stop offset="0" stopColor="#fff2a0"/>
      <stop offset=".35" stopColor="#ffc23d"/>
      <stop offset=".7" stopColor="#ff7a2a"/>
      <stop offset="1" stopColor="#c2182b"/>
    </linearGradient>
    <linearGradient id="tc-body" x1="0" y1="0" x2=".4" y2="1">
      <stop offset="0" stopColor="#2c2f58"/>
      <stop offset=".55" stopColor="#14162c"/>
      <stop offset="1" stopColor="#07080f"/>
    </linearGradient>
    <linearGradient id="tc-wing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#262a50"/>
      <stop offset="1" stopColor="#0b0d1a"/>
    </linearGradient>
    <linearGradient id="tc-bib" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fffdf0"/>
      <stop offset=".6" stopColor="#ffe7a0"/>
      <stop offset="1" stopColor="#f0a83a"/>
    </linearGradient>
    <linearGradient id="tc-wisp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#7ef0dc" stopOpacity=".8"/>
      <stop offset="1" stopColor="#7ef0dc" stopOpacity="0"/>
    </linearGradient>
    <linearGradient id="tc-plume" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stopColor="#2c2f58"/>
      <stop offset=".6" stopColor="#3fd2c0"/>
      <stop offset="1" stopColor="#fff6c8"/>
    </linearGradient>
    <radialGradient id="tc-iris" cx=".45" cy=".4" r=".6">
      <stop offset="0" stopColor="#e9fffb"/>
      <stop offset=".45" stopColor="#5fe6d4"/>
      <stop offset="1" stopColor="#0e7f86"/>
    </radialGradient>
    <filter id="tc-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="1.1" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  {/* aura */}
  <circle className="toucan-aura" cx="26" cy="20" r="40" fill="url(#tc-aura)"/>
  {/* rune halo */}
  <g className="toucan-halo" opacity=".85">
    <circle cx="22" cy="12" r="19" fill="none" stroke="#f2d27e" strokeWidth=".7" strokeDasharray="2 2.6" opacity=".7"/>
    <circle cx="22" cy="12" r="21.5" fill="none" stroke="#7ef0dc" strokeWidth=".45" opacity=".6"/>
    <g fill="none" stroke="#fff1b8" strokeWidth=".8" strokeLinecap="round" strokeLinejoin="round" filter="url(#tc-glow)">
      <path d="M22 -10.5v3M20.6 -9.4l2.8 1.6"/>
      <path d="M41.5 10l2.4 2-2.4 2"/>
      <path d="M2.5 10.5l-2 1.5 2 1.5M1 12h3"/>
      <path d="M35.5 -3.5l1.5 2.6-3 0z"/>
      <path d="M8 -4l2.6 1.4M9.3 -4.7v2.8"/>
      <path d="M36 27.5a1.5 1.5 0 1 0 .1 0"/>
      <path d="M7.5 27l1.5 2.4 1.5-2.4"/>
    </g>
  </g>

  {/* ethereal tail */}
  <path d="M15 40c-4 8-4 16 0 24 2-8 4-14 8-19z" fill="url(#tc-wisp)"/>
  <path d="M20 42c-1 7 1 13 6 18-1-6 0-11 2-15z" fill="url(#tc-wisp)" opacity=".8"/>
  <path d="M16 38l-4 13 5-2 3 4 2-12z" fill="#10132a" stroke="#6ee7d6" strokeWidth=".5" strokeOpacity=".6"/>

  {/* far wing, half-mantled */}
  <path d="M30 22c7-5 15-6 20-3-4 1-6 3-7 5 3 0 5 1 6 3-4 0-7 1-9 3 2 1 3 2 3 4-6-1-10-3-13-6z" fill="url(#tc-wing)" stroke="#f2d27e" strokeWidth=".55" strokeOpacity=".8" strokeLinejoin="round"/>

  {/* body */}
  <path d="M22 6c9 0 14 7 14 17 0 11-6 20-14 20S8 36 8 25C8 14 13 6 22 6z" fill="url(#tc-body)" stroke="#7ef0dc" strokeWidth=".8" strokeOpacity=".75"/>
  {/* iridescent sheen */}
  <path d="M12 16c2-5 6-8 10-8" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity=".55"/>

  {/* near wing with gold-edged primaries */}
  <path d="M10 20c-5 6-6 14-3 21 2 3 5 5 9 5 1-3 2-7 2-11 0-6-3-11-8-15z" fill="url(#tc-wing)" stroke="#f2d27e" strokeWidth=".6" strokeOpacity=".85"/>
  <path d="M9 27q2 6 6 11M8.5 32q2 5 5 8M11 23q2 5 4.5 9" stroke="#f2d27e" strokeWidth=".45" fill="none" opacity=".6"/>
  <path d="M12 26q1 1 2 0M11 31q1 1 2 0M13 35q1 1 2 0" stroke="#7ef0dc" strokeWidth=".5" fill="none" opacity=".7"/>

  {/* golden bib with amulet sigil */}
  <path d="M23 13c6 1 10 6 10 12 0 4-2 7-6 8-4-2-6-7-6-12 0-4 1-6 2-8z" fill="url(#tc-bib)"/>
  <path d="M24.5 31.5q3.5 1.2 6-1.8" stroke="#d63a2a" strokeWidth="1.7" strokeLinecap="round" fill="none"/>
  <g className="toucan-amulet" filter="url(#tc-glow)">
    <circle cx="27.5" cy="23.5" r="2.6" fill="none" stroke="#0e7f86" strokeWidth=".7"/>
    <path d="M27.5 21.2v4.6M25.2 23.5h4.6" stroke="#0e7f86" strokeWidth=".6"/>
    <circle cx="27.5" cy="23.5" r=".9" fill="#2dd4bf"/>
  </g>

  {/* sage brow plumes sweeping back */}
  <path d="M27 9c-4-3-10-4-16-2 4 0 7 1 9 3-4-1-8 0-11 2 6 0 11 0 15 1z" fill="#e8f7ff" opacity=".9"/>
  <path d="M27 9c-4-3-10-4-16-2" stroke="#7ef0dc" strokeWidth=".5" fill="none" opacity=".7"/>

  {/* crown of light: three plumes with star tips */}
  <path d="M19 6c-2-6-1-11 2-15-1 5 0 10 1 15z" fill="url(#tc-plume)"/>
  <path d="M16 7c-4-4-5-9-4-14 1 5 3 9 6 13z" fill="url(#tc-plume)" opacity=".85"/>
  <path d="M22 6c1-5 4-9 8-11-3 4-4 8-5 12z" fill="url(#tc-plume)" opacity=".85"/>
  <g className="toucan-stars" fill="#fff6c8" filter="url(#tc-glow)">
    <path d="M21 -11.5l.8-2.3.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8z"/>
    <path d="M11.8 -8l.5-1.4.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5z"/>
    <path d="M30.6 -6.4l.5-1.4.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5z"/>
  </g>

  {/* the great bill, with gold filigree */}
  <path d="M28 10c9-5 22-4 30 4 1 1.2.2 2.6-1.2 2.4-8-1.5-17-.5-26 3.4-2.4.6-4-.6-4-3 0-3 .2-5.6 1.2-6.8z" fill="url(#tc-bill)" stroke="#5a1a10" strokeWidth=".7" strokeLinejoin="round"/>
  <path d="M29.5 16.8c8-3 17-3.6 26-2.2" stroke="#7a2412" strokeWidth=".7" fill="none"/>
  <path d="M52 11.5c2.4 1 4.4 2.3 6 3.6" stroke="#160a06" strokeWidth="2" strokeLinecap="round" fill="none"/>
  <path d="M32 11.2c4-1.6 8.5-2 13-1.2" stroke="#fffbe0" strokeWidth="1" strokeLinecap="round" opacity=".85" fill="none"/>
  <path d="M38 13.6c1.2-1.4 3.2-1.2 3.6.2.4 1.4-1.4 2.2-2.2 1.2M44 12.8c1-1 2.6-.8 2.8.3" stroke="#a8461a" strokeWidth=".55" fill="none" opacity=".75"/>

  {/* wise, half-lidded eye */}
  <circle cx="24.5" cy="12.8" r="4.1" fill="#1aa3b8" stroke="#0b4d58" strokeWidth=".6"/>
  <circle cx="24.8" cy="13" r="2.7" fill="url(#tc-iris)" filter="url(#tc-glow)"/>
  <circle cx="24.9" cy="13.1" r="1.25" fill="#06090f"/>
  <circle cx="24" cy="12.3" r=".55" fill="#fff"/>
  <path d="M20.2 12.2q4.3-4.4 8.6 0q-4.3-1.6-8.6 0z" fill="#1b1e3a"/>
  <path d="M20.2 12.2q4.3-1.6 8.6 0" stroke="#7ef0dc" strokeWidth=".5" fill="none"/>

  {/* floating sigil beneath */}
  <ellipse cx="22" cy="50" rx="15" ry="3.2" fill="none" stroke="#7ef0dc" strokeWidth=".7" opacity=".75" filter="url(#tc-glow)"/>
  <ellipse cx="22" cy="50" rx="10" ry="2" fill="none" stroke="#f2d27e" strokeWidth=".5" strokeDasharray="1.5 1.5" opacity=".8"/>
  {/* feet */}
  <path d="M19 43v3.4M21.6 43v3.6M24.2 43v3.4" stroke="#20304a" strokeWidth="1.4" strokeLinecap="round"/>

  {/* motes */}
  <circle className="toucan-mote" cx="-2" cy="28" r="1.2" fill="#c9fff3" style={{ animationDelay: "0.0s" }}/>
  <circle className="toucan-mote" cx="50" cy="34" r="1" fill="#fff1b8" style={{ animationDelay: "0.75s" }}/>
  <circle className="toucan-mote" cx="44" cy="-14" r="1.1" fill="#c9fff3" style={{ animationDelay: "1.5s" }}/>
  <circle className="toucan-mote" cx="-6" cy="0" r=".9" fill="#fff1b8" style={{ animationDelay: "2.25s" }}/>

      </svg>
    </div>
  );
}
