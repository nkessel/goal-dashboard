"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { cleanToucan, type ToucanState } from "@/lib/toucan";

/** What it says while you carry it, and when you set it down. */
// Only the toucan spirit speaks; the owl keeps its silence.
const SAY_FLYING = ["Wheee!", "To the skies!", "The winds obey me.", "Onward, to wisdom!", "Behold my majestic flight!", "Higher, friend, higher!", "I have soared over many forests."];
const SAY_LANDING = ["Here I shall dispense wisdom.", "I approve of this spot.", "Ah. The view is excellent.", "This perch will do nicely.", "Rest a moment. Then onward."];
/** How often each landing line comes up (the view one is a rare treat). */
const LANDING_WEIGHT: Record<string, number> = { "Ah. The view is excellent.": 0.2 };
/** Never the same line twice in a row (per list), with optional weights. */
function picker() {
  const last: Record<string, string> = {};
  return (name: string, list: string[], weights: Record<string, number> = {}) => {
    const pool = list.filter((x) => x !== last[name]);
    const total = pool.reduce((n, x) => n + (weights[x] ?? 1), 0);
    let r = Math.random() * total;
    let out = pool[0];
    for (const x of pool) {
      r -= weights[x] ?? 1;
      if (r <= 0) {
        out = x;
        break;
      }
    }
    last[name] = out;
    return out;
  };
}
const pick = picker();

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
  "Behold the compound interest of small good things done consistently.",
  "Make future {name} proud.",
  "I am the Great Toucan Spirit.",
  "I bless you with productivity, and flow, and great insight.",
  "Today's small quest is tomorrow's legend.",
  "The forest remembers every step you take. Keep walking.",
  "Your future self is watching — and cheering.",
  "One quest at a time, {name}. That is the whole secret.",
];

/** How the spirit addresses you: a first name, or the whole title if it starts with one. */
function addressOf(name: string | null) {
  const n = (name ?? "").trim();
  if (!n) return "you";
  const first = n.split(/\s+/)[0];
  return /^(lord|lady|sir|dame|king|queen|el|la|the|dr\.?|captain|master)$/i.test(first) ? n : first;
}
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
export function PerchedOwl({ name = null, toucan = null }: { name?: string | null; toucan?: unknown }) {
  const [wardrobe, setWardrobe] = useState<ToucanState>(() => cleanToucan(toucan));
  useEffect(() => {
    const h = (e: Event) => setWardrobe(cleanToucan((e as CustomEvent).detail));
    window.addEventListener("toucan-change", h);
    return () => window.removeEventListener("toucan-change", h);
  }, []);
  const [say, setSay] = useState<string | null>(null);
  const sayRef = useRef<HTMLDivElement>(null);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    placeSay();
  }, []);
  /** Keep the speech bubble just above its head. */
  function placeSay() {
    const b = sayRef.current;
    const p = pos.current;
    if (!b || !p) return;
    const x = Math.max(90, Math.min(window.innerWidth - 90, p.x));
    b.style.transform = `translate3d(${x.toFixed(1)}px, ${(p.y - OWL_H - 22).toFixed(1)}px, 0) translate(-50%, -100%)`;
  }
  function speakBrief(text: string, ms: number | null) {
    if (sayTimer.current) clearTimeout(sayTimer.current);
    setSay(text);
    if (ms) sayTimer.current = setTimeout(() => setSay(null), ms);
  }
  useEffect(placeSay, [say]);

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
    setSay(null);
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
    setWisdom({ text: WISDOM[i].replaceAll("{name}", addressOf(name)), x, y: p.y - OWL_H - 14 });
  }
  useEffect(() => {
    if (!wisdom) return;
    const t = setTimeout(() => setWisdom(null), 5000);
    // A tap anywhere else puts the wisdom away.
    const away = (e: PointerEvent) => {
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      setWisdom(null);
    };
    document.addEventListener("pointerdown", away);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", away);
    };
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
            setPhase("flying");
            if (spirit) speakBrief(Math.random() < 0.35 ? pick("wise", WISDOM).replaceAll("{name}", addressOf(name)) : pick("fly", SAY_FLYING), null);
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
            setPhase("landing");
            setTimeout(() => setPhase("perched"), 260);
            if (spirit) {
              const wise = Math.random() < 0.35;
              speakBrief(wise ? pick("wise", WISDOM).replaceAll("{name}", addressOf(name)) : pick("land", SAY_LANDING, LANDING_WEIGHT), wise ? 4200 : 2200);
            }
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
          setPhase("perched");
          setSay(null);
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
                <div style={{ transform: "scale(1.3)", transformOrigin: "50% 92%" }}>
                  <ToucanArt equipped={wardrobe.equipped} flying={phase === "flying" || phase === "gliding"} />
                </div>
              </div>
            ) : phase === "perched" || phase === "takeoff" ? <SittingOwl /> : <FlyingOwl />}
          </div>
        </div>
      </button>
      {say && (
        <div ref={sayRef} role="status" className="pointer-events-none fixed left-0 top-0 z-[46]">
          <div
            key={say}
            className="owl-say w-max max-w-[240px] rounded-2xl px-3 py-1.5 text-center text-[14px] font-semibold leading-snug"
            style={
              spirit
                ? { background: "linear-gradient(180deg, rgba(14,38,40,.94), rgba(8,22,26,.96))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 0 14px rgba(120,230,210,.35), 0 4px 12px rgba(0,0,0,.45)" }
                : { background: "rgba(251,245,230,.97)", border: "1.5px solid #b39a6a", color: "#2a1c10", boxShadow: "0 4px 12px rgba(0,0,0,.35)" }
            }
          >
            {say}
          </div>
        </div>
      )}
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
