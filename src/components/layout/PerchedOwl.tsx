"use client";

import { FOUND, HIDING, SAY_FLYING, SAY_LANDING, WISDOM, retiredLines } from "@/lib/toucan-lines";
import { flourishClass, readFlourish, readTalkLook, subscribeTalkLook, type Flourish } from "@/lib/toucan-flourish";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { cleanToucan, type ToucanState } from "@/lib/toucan";
import { fromFeedback } from "@/lib/from-feedback";

/** What it says while you carry it, and when you set it down. */
// Only the toucan spirit speaks; the owl keeps its silence.
/**
 * A shuffled deck per list: every line comes up once before any repeats, and
 * the deck is remembered across visits so a fresh page doesn't start over.
 */
function picker() {
  const decks: Record<string, string[]> = {};
  const load = (name: string): string[] => {
    try {
      return JSON.parse(localStorage.getItem(`owl-deck-${name}`) ?? "[]");
    } catch {
      return [];
    }
  };
  return (name: string, all: string[]) => {
    // Lines switched off in Settings never come up (unless every one is).
    const off = retiredLines();
    const list = all.filter((x) => !off.has(x)).length ? all.filter((x) => !off.has(x)) : all;
    let deck = (decks[name] ??= load(name)).filter((x) => list.includes(x));
    if (!deck.length) {
      deck = [...list];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
    }
    const out = deck.shift()!;
    decks[name] = deck;
    try {
      localStorage.setItem(`owl-deck-${name}`, JSON.stringify(deck));
    } catch {}
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

/** Is this screen the one a tab leads to? */
function onScreen(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
/** The bottom-nav tab under a point, if any. */
function tabAt(x: number, y: number): HTMLAnchorElement | null {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-app-nav] a[href]")) {
    const r = a.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top - 4 && y <= r.bottom) return a;
  }
  return null;
}
/** Hiding places on a screen: tucked half out of sight at an edge. */
function hidingSpot(seed: number): { x: number; y: number; tilt: number } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const spots = [
    { x: 4, y: H * 0.55, tilt: 18 },
    { x: W - 4, y: H * 0.38, tilt: -18 },
    { x: W - 6, y: H * 0.72, tilt: -14 },
    { x: 6, y: H * 0.3, tilt: 14 },
  ];
  return spots[Math.abs(seed) % spots.length];
}

const OWL_W = 52;
const OWL_H = 56;
type Phase = "perched" | "takeoff" | "flying" | "gliding" | "landing";

/** What the great toucan spirit says when tapped. */

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
  // How "Talk with me" shows on the bubble (Settings → Toucan Spirit → His look).
  const talkLook = useSyncExternalStore(subscribeTalkLook, readTalkLook, () => "glow" as const);
  // Buttons under the words (for the line they belong to).
  const [sayActions, setSayActions] = useState<{ for: string; list: { label: string; run: () => void; secret?: boolean }[] } | null>(null);
  const sayRef = useRef<HTMLDivElement>(null);
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname() ?? "/";
  // Dropped onto a tab in the bottom bar, it hides on that screen until found.
  const [hiding, setHiding] = useState<{ href: string; seed: number } | null>(() => {
    try {
      return typeof window !== "undefined" ? (JSON.parse(window.localStorage.getItem("owl-hiding") ?? "null") as { href: string; seed: number } | null) : null;
    } catch {
      return null;
    }
  });
  const hidingHere = !!hiding && onScreen(hiding.href, pathname);
  const hoverTab = useRef<HTMLAnchorElement | null>(null);
  const markTab = (a: HTMLAnchorElement | null) => {
    if (hoverTab.current === a) return;
    if (hoverTab.current) hoverTab.current.classList.remove("owl-hide-target");
    hoverTab.current = a;
    if (a) a.classList.add("owl-hide-target");
  };
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
  const [spirit, setSpirit] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("owl-spirit") === "1";
    } catch {
      return false;
    }
  });
  const [charging, setCharging] = useState(false);
  const [wisdom, setWisdom] = useState<{ text: string; x: number; y: number } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  // Drag it anywhere: it stays where you set it down (remembered on this device).
  const drag = useRef<{ x0: number; y0: number; offX: number; offY: number; moving: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [taps, setTaps] = useState(0);
  const [flourish, setFlourish] = useState<Flourish>("glow");
  const flewWise = useRef(false);
  // Dropped onto the menu button, it goes into its cage (Settings sets it free).
  const [caged, setCaged] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem("owl-caged") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const free = (e: Event) => {
      const at0 = (e as CustomEvent<{ x: number; y: number }>).detail;
      try {
        window.localStorage.removeItem("owl-caged");
      } catch {
        /* storage unavailable */
      }
      setCaged(false);
      // Out of the cage, then off to a perch.
      setTimeout(() => {
        if (at0) put(at0);
        setTimeout(() => fly(), 60);
      }, 60);
    };
    window.addEventListener("owl-free", free);
    return () => window.removeEventListener("owl-free", free);
  });
  function intoCage(r: DOMRect) {
    const el = box.current;
    if (!el) return;
    setSay(null);
    el.style.transition = "transform .45s cubic-bezier(.5,0,.9,.4), opacity .45s ease-in";
    el.style.transform = `translate3d(${(r.left + r.width / 2 - OWL_W / 2).toFixed(1)}px, ${(r.top + r.height / 2 - OWL_H / 2).toFixed(1)}px, 0) scale(.15)`;
    el.style.opacity = "0";
    setTimeout(() => {
      el.style.transition = "";
      el.style.opacity = "";
      try {
        window.localStorage.setItem("owl-caged", "1");
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new Event("owl-caged"));
      setCaged(true);
    }, 470);
  }

  function intoTab(a: HTMLAnchorElement) {
    const el = box.current;
    if (!el) return;
    const r = a.getBoundingClientRect();
    const href = a.getAttribute("href") ?? "/";
    if (spirit) speakBrief(pick("hide", HIDING), 900);
    el.style.transition = "transform .5s cubic-bezier(.5,0,.9,.4), opacity .5s ease-in";
    el.style.transform = `translate3d(${(r.left + r.width / 2 - OWL_W / 2).toFixed(1)}px, ${(r.top + r.height / 2 - OWL_H / 2).toFixed(1)}px, 0) scale(.2)`;
    el.style.opacity = "0";
    setTimeout(() => {
      el.style.transition = "";
      el.style.opacity = "";
      setSay(null);
      const h = { href, seed: Math.floor(Math.random() * 1000) };
      try {
        window.localStorage.setItem("owl-hiding", JSON.stringify(h));
      } catch {
        /* storage unavailable */
      }
      setHiding(h);
    }, 520);
  }
  /** Found it: out it pops, and off to a perch. */
  function found() {
    try {
      window.localStorage.removeItem("owl-hiding");
    } catch {
      /* storage unavailable */
    }
    setHiding(null);
    if (spirit) speakBrief(pick("found", FOUND), 2600);
    const p = pos.current;
    if (p && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) for (let i = 0; i < 12; i++) setTimeout(() => spark(p.x + (Math.random() - 0.5) * 50, p.y - OWL_H / 2 + (Math.random() - 0.5) * 40), i * 30);
    at.current = -1;
    setTimeout(() => fly(), 500);
  }

  const put = useCallback((p: { x: number; y: number }, tilt = 0, lift = 0) => {
    pos.current = p;
    const el = box.current;
    if (!el) return;
    el.style.transform = `translate3d(${(p.x - OWL_W / 2).toFixed(1)}px, ${(p.y - OWL_H - lift).toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;
    el.style.visibility = "visible";
    placeSay();
  }, []);
  /** Keep the speech bubble just above its head. */
  function placeSay() {
    const b = sayRef.current;
    const p = pos.current;
    if (!b || !p) return;
    // Keep the whole bubble on screen.
    const half = Math.min(b.offsetWidth || 240, window.innerWidth - 24) / 2 + 10;
    const x = Math.max(half, Math.min(window.innerWidth - half, p.x));
    // Above its head, unless that would run off the top: then just below its feet.
    const above = p.y - OWL_H - 22;
    const fits = above - (b.offsetHeight || 80) >= 8;
    b.style.transform = fits
      ? `translate3d(${x.toFixed(1)}px, ${above.toFixed(1)}px, 0) translate(-50%, -100%)`
      : `translate3d(${x.toFixed(1)}px, ${(p.y + 10).toFixed(1)}px, 0) translate(-50%, 0)`;
  }
  function speakBrief(text: string, ms: number | null, actions: { label: string; run: () => void; secret?: boolean }[] | null = null) {
    if (sayTimer.current) clearTimeout(sayTimer.current);
    setSayActions(actions ? { for: text, list: actions } : null);
    setSay(text);
    if (ms) sayTimer.current = setTimeout(() => setSay(null), ms);
  }
  useEffect(placeSay, [say]);
  useEffect(() => {
    if (!say) return;
    // A tap anywhere else puts the words away (not while carrying it).
    const away = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
      if (drag.current) return;
      if (box.current && e.target instanceof Node && box.current.contains(e.target)) return;
      if (sayRef.current && e.target instanceof Node && sayRef.current.contains(e.target)) return;
      if (sayTimer.current) clearTimeout(sayTimer.current);
      setSay(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [say]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the page has to exist before we can perch on it
    setMounted(true);
    try {
      at.current = Number(window.localStorage.getItem("owl-perch") ?? 0) || 0;
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
    // Place it the moment the page is laid out — no fade, so changing
    // screens never makes it flicker.
    let tries = 0;
    let t = 0;
    const place = () => {
      if (!box.current && tries++ < 10) {
        t = requestAnimationFrame(place);
        return;
      }
      put(home());
    };
    t = requestAnimationFrame(place);
    const onResize = () => !busy.current && !drag.current && put(home());
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("resize", onResize);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [put]);

  // In its hiding place on this screen (and back to its perch elsewhere).
  useEffect(() => {
    if (!mounted || caged) return;
    let t = 0;
    let tries = 0;
    const place = () => {
      if (!box.current && tries++ < 10) {
        t = requestAnimationFrame(place);
        return;
      }
      if (hidingHere && hiding) {
        const h = hidingSpot(hiding.seed);
        put({ x: h.x, y: h.y }, h.tilt);
        setFacing(h.x < window.innerWidth / 2 ? 1 : -1);
      } else if (!busy.current && !drag.current) {
        const sp = at.current < 0 ? spot() : null;
        put(sp ?? perches()[Math.max(0, at.current)] ?? perches()[0]);
      }
    };
    t = requestAnimationFrame(place);
    return () => cancelAnimationFrame(t);
  }, [hidingHere, hiding, mounted, caged, put, pathname]);

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
    // A wise flourish (chosen in the toucan's chat), and starlight falls from its bill.
    setFlourish(readFlourish());
    setTaps((n) => n + 1);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 9; i++) setTimeout(() => spark(p.x + facing * (10 + Math.random() * 26), p.y - OWL_H * 0.75 + (Math.random() - 0.5) * 30), 120 + i * 45);
    }
    const simple = (() => {
      try {
        return window.localStorage.getItem("toucan-mode") === "simple";
      } catch {
        return false;
      }
    })();
    speakBrief(pick("wise", WISDOM).replaceAll("{name}", addressOf(name)), simple ? 5000 : 6500, simple ? null : [{ label: "Talk with me", secret: true, run: () => window.dispatchEvent(new CustomEvent("toucan-talk")) }]);
  }
  // The guide asks it to raise something (a quest slipping): it says so, with buttons.
  const speakRef = useRef(speakBrief);
  const shownRef = useRef(false);
  useEffect(() => {
    speakRef.current = speakBrief;
    shownRef.current = mounted && !caged && !(hiding && !hidingHere);
  });
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; actions: { label: string; run: () => void }[] }>).detail;
      if (!d || !pos.current || !shownRef.current) return;
      e.preventDefault();
      speakRef.current(d.text, 16000, d.actions);
    };
    window.addEventListener("toucan-nudge", h);
    return () => window.removeEventListener("toucan-nudge", h);
  }, []);
  useEffect(() => {
    if (!wisdom) return;
    const t = setTimeout(() => setWisdom(null), 5000);
    // A tap anywhere else puts the wisdom away.
    const away = (e: PointerEvent) => {
      if (fromFeedback(e)) return;
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

  if (!mounted || caged || (hiding && !hidingHere)) return null;
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
          if (hidingHere) found();
          else if (spirit) speak();
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
            if (spirit) {
              flewWise.current = Math.random() < 0.35;
              speakBrief(flewWise.current ? pick("wise", WISDOM).replaceAll("{name}", addressOf(name)) : pick("fly", SAY_FLYING), null);
            }
          }
          const W = window.innerWidth;
          const H = window.innerHeight;
          const x = Math.max(OWL_W / 2, Math.min(W - OWL_W / 2, e.clientX - d.offX));
          const y = Math.max(OWL_H, Math.min(H - 4, e.clientY - d.offY));
          const prevX = pos.current?.x ?? x;
          if (Math.abs(x - prevX) > 1.5) setFacing(x > prevX ? 1 : -1);
          put({ x, y }, Math.max(-12, Math.min(12, (x - prevX) * 0.8)));
          markTab(tabAt(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          endHold();
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          const cage = document.querySelector<HTMLElement>("[data-owl-cage]")?.getBoundingClientRect();
          markTab(null);
          const tab = d?.moving ? tabAt(e.clientX, e.clientY) : null;
          if (d?.moving && hidingHere) {
            // Carried out of its hiding place: found.
            try {
              window.localStorage.removeItem("owl-hiding");
            } catch {
              /* storage unavailable */
            }
            setHiding(null);
          }
          if (tab && !(cage && e.clientX >= cage.left - 6 && e.clientX <= cage.right + 6 && e.clientY >= cage.top - 6 && e.clientY <= cage.bottom + 6)) {
            held.current = true;
            setDragging(false);
            setPhase("perched");
            intoTab(tab);
            return;
          }
          if (d?.moving && cage && e.clientX >= cage.left - 6 && e.clientX <= cage.right + 6 && e.clientY >= cage.top - 6 && e.clientY <= cage.bottom + 6) {
            held.current = true;
            setDragging(false);
            setPhase("perched");
            intoCage(cage);
            return;
          }
          if (d?.moving && pos.current) {
            held.current = true; // not a tap
            setDragging(false);
            put(pos.current);
            setPhase("landing");
            setTimeout(() => setPhase("perched"), 260);
            if (spirit) {
              // Wisdom shared in flight stays a moment; otherwise a landing line.
              if (flewWise.current && say) speakBrief(say, 4000);
              else speakBrief(pick("land", SAY_LANDING), 2200);
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
          markTab(null);
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
        className={`owl-perch fixed left-0 top-0 z-[45] touch-none select-none p-0 ${dragging ? "owl-dragging" : ""} ${hidingHere && !dragging ? "owl-hidden-here" : ""}`}
        style={{
          width: OWL_W,
          height: OWL_H,
          background: "transparent",
          border: 0,
          willChange: "transform",
          visibility: "hidden",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,.45)) drop-shadow(0 0 10px rgba(255,236,170,.25))",
        }}
      >
        <div className={charging ? "owl-charging" : undefined}>
          <div ref={body} className={`owl-body owl-${phase}`} style={{ transform: `scaleX(${facing})` }}>
            {spirit ? (
              <div key={taps} className={taps ? flourishClass(flourish) : undefined}>
                <div style={{ transform: "scale(1.3)", transformOrigin: "50% 92%" }}>
                  <ToucanArt equipped={wardrobe.equipped} flying={phase === "flying" || phase === "gliding"} />
                </div>
              </div>
            ) : phase === "perched" || phase === "takeoff" ? <SittingOwl /> : <FlyingOwl />}
          </div>
        </div>
      </button>
      {say && (
        <div ref={sayRef} role="status" className={`fixed left-0 top-0 z-[46] ${sayActions?.for === say ? "" : "pointer-events-none"}`}>
          <div
            key={say}
            className="owl-say relative w-max max-w-[260px] rounded-2xl px-3 py-1.5 text-center text-[14.5px] font-medium italic leading-snug"
            style={
              spirit
                ? { background: "linear-gradient(180deg, rgba(14,38,40,.94), rgba(8,22,26,.96))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 0 14px rgba(120,230,210,.35), 0 4px 12px rgba(0,0,0,.45)" }
                : { background: "rgba(251,245,230,.97)", border: "1.5px solid #b39a6a", color: "#2a1c10", boxShadow: "0 4px 12px rgba(0,0,0,.35)" }
            }
          >
            {say}
            {/* "Talk with me": a shining star on the bubble's corner, a few words, or a secret glint. */}
            {sayActions?.for === say &&
              talkLook !== "words" &&
              sayActions.list
                .filter((a) => a.secret)
                .map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => {
                      setSay(null);
                      a.run();
                    }}
                    aria-label={a.label}
                    title={a.label}
                    className={`absolute -bottom-2 -right-2 flex items-center justify-center rounded-full ${talkLook === "glint" ? "owl-secret h-6 w-6" : "owl-talk h-8 w-8"}`}
                  >
                    <svg width={talkLook === "glint" ? 12 : 16} height={talkLook === "glint" ? 12 : 16} viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 1.5l2.2 7.3 7.3 2.2-7.3 2.2L12 20.5l-2.2-7.3L2.5 11l7.3-2.2z" fill="currentColor" />
                    </svg>
                  </button>
                ))}
            {sayActions?.for === say && sayActions.list.some((a) => !a.secret || talkLook === "words") && (
              <span className="mt-1.5 flex flex-wrap justify-center gap-1.5">
                {sayActions.list.filter((a) => !a.secret || talkLook === "words").map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => {
                      setSay(null);
                      a.run();
                    }}
                    className="h-8 rounded-full px-3 text-[12.5px] font-bold"
                    style={spirit ? { background: "rgba(140,240,220,.18)", border: "1px solid rgba(140,240,220,.6)", color: "#e8fff8" } : { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            )}
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
