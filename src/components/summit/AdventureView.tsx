"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { sampleCurve, segments, type Pt } from "@/lib/curves";
import { addToTopOfTodayAction, completeTaskAction, createQuestAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { TaskRow } from "@/components/tasks/TaskRow";
import type { TaskWithCategory } from "@/lib/data/tasks";
import { useEscape } from "@/lib/use-escape";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { MountainClouds, MountainScene, SCENE_H, SCENE_W, SUMMIT } from "./MountainScene";


/** A small wanderer with a cloak, a staff and a lantern. */
function Wanderer() {
  return (
    <svg width="30" height="46" viewBox="0 0 30 46" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id="wanderer-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#ffe9a8" stopOpacity=".9" />
          <stop offset="1" stopColor="#ffc96a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="15" cy="44" rx="10" ry="2.2" fill="#000" opacity=".35" />
      <circle className="wanderer-lantern" cx="25" cy="27" r="11" fill="url(#wanderer-glow)" />
      <path d="M22.5 6L25.5 44" stroke="#5a3e22" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 9c4 0 6 4 7 10l2 22c-6 2-12 2-18 0l2-22c1-6 3-10 7-10z" fill="#3b2d4f" />
      <path d="M15 9c4 0 6 4 7 10l2 22c-2 .7-4 1-6 1l-1-24c0-4-1-7-2-9z" fill="#55426e" />
      <path d="M9.5 10.5c1-4 3-6.5 5.5-6.5s4.5 2.5 5.5 6.5c-3-1.5-8-1.5-11 0z" fill="#2c2140" />
      <circle cx="15" cy="9" r="3.2" fill="#e8c9a6" />
      <path d="M11.5 8.5c1-3 6-3 7 0-2-1-5-1-7 0z" fill="#2c2140" />
      <path d="M23.5 24.5h3v4.5h-3z" fill="#f2c94c" stroke="#5a3e22" strokeWidth=".7" />
      <circle cx="25" cy="26.8" r="1.1" fill="#fff6c8" />
    </svg>
  );
}

type Quest = { id: string; title: string; xp: number; icon: string | null; done: boolean };
type Spot = { fx: number; fy: number };

export type WorldKey = "summit" | "voyage" | "stars" | "crossing";
type World = {
  key: WorldKey;
  name: string;
  glyph: string;
  goal: { x: number; y: number };
  goalName: string;
  /** How far above the goal its label sits, in scene units. */
  goalPad: number;
  /** Where the trail begins, in scene units. */
  head: { x: number; y: number };
  /** The band the quests can stand in (fractions of the screen height). */
  top: number;
  bottom: number;
  trail: "earth" | "wake" | "lines" | "stones";
  climb: { turns: number; amp: number; color: string };
  Scene: () => React.ReactElement;
  Veil: () => React.ReactElement;
  Guide: () => React.ReactElement;
  bg: string;
  vignette: string;
  sayings: string[];
  steps: string;
};

export const WORLDS: Partial<Record<WorldKey, World>> & { summit: World } = {
  summit: {
    key: "summit",
    name: "The Summit",
    glyph: "⛰",
    goal: SUMMIT,
    goalName: "summit",
    goalPad: 0,
    head: { x: 800, y: 830 },
    top: 0.62,
    bottom: 0.87,
    trail: "earth",
    climb: { turns: 7, amp: 150, color: "#ffe9b0" },
    Scene: MountainScene,
    Veil: MountainClouds,
    Guide: Wanderer,
    bg: "#141a2e",
    vignette: "rgba(8,6,20,.45)",
    steps: "on today's trail",
    sayings: [
      "Behold the compound interest of small, good things done consistently.",
      "Every summit is reached one step at a time.",
      "The mountain does not ask you to hurry — only to keep walking.",
      "Small steps, taken daily, move mountains.",
      "The view from the top is earned on the trail.",
      "You don't have to see the whole path. Just the next stone.",
      "What you do today is the trail you'll stand on tomorrow.",
    ],
  },
};

const MARK = 50;
/** How far the great peak's flanks spread per unit of drop (see MountainScene). */
const SLOPE_L = 0.64;
const SLOPE_R = 0.67;

function loadSpots(key: string): Record<string, Spot> {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, Spot>;
  } catch {
    return {};
  }
}
/** Where a quest stands by default: a meandering climb, left and right. */
function defaultSpot(i: number, n: number, top: number, bottom: number, wide: boolean): Spot {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const fy = bottom - 0.06 - t * (bottom - 0.06 - top - 0.03);
  const sw = wide ? 0.11 : 0.27;
  const fx = 0.5 + (i % 2 === 0 ? -1 : 1) * (sw - t * sw * 0.4) + Math.sin(i * 1.7) * 0.03;
  return { fx, fy };
}

/**
 * The secret summit view of today. The mountain's peak is the level boss;
 * today's quests line a winding trail through the forest below. Drag any
 * quest and the trail bends to follow (remembered on this device). Past the
 * last quest, a dotted line climbs into the mist — the way to the top isn't
 * visible yet, but one day the path will get there.
 */
export function AdventureView({
  world: worldKey,
  quests,
  cards = {},
  others = [],
  boss,
  level,
}: {
  world: WorldKey;
  quests: Quest[];
  /** Open quests not on today's trail, offered when adding a stop to the path. */
  others?: { id: string; title: string; xp: number }[];
  /** The full quests, so tapping one opens its usual card with every action. */
  cards?: Record<string, TaskWithCategory>;
  boss: { title: string; level: number; target: number; progress: number } | null;
  level: number;
}) {
  const world = WORLDS[worldKey] ?? WORLDS.summit;
  const { top: TOP, bottom: BOTTOM } = world;
  const posKey = world.key === "summit" ? "summit-path" : `adventure-path:${world.key}`;
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const [open, setOpen] = useState<Quest | null>(null);
  const cardDragged = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; x0: number; y0: number; moved: boolean; offX: number; offY: number } | null>(null);
  useEscape(() => setOpen(null), !!open);
  // Quests shown as little preview cards on the map (tap a token to toggle).
  const [cardsOn, setCardsOn] = useState<Set<string>>(new Set());
  const [doneNow, setDoneNow] = useState<Set<string>>(new Set());
  // The order of stops along the trail (stops added mid-path keep their place).
  const orderKey = `${posKey}:order`;
  const [order, setOrder] = useState<string[]>([]);
  // Adding a stop where the path was tapped.
  const [adding, setAdding] = useState<{ x: number; y: number; at: number } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, startBusy] = useTransition();
  const [navH, setNavH] = useState(0);
  useEscape(() => setAdding(null), !!adding);

  // The map is sized once to the screen it opens on, then stays that size —
  // a keyboard sliding up (or any squeeze) never shrinks the mountain. Only a
  // change of width (turning the phone) re-fits it.
  const viewRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    let lastW = 0;
    const measure = () => {
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
      setSize({ w: el.clientWidth, h: Math.max(el.clientHeight, 420) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Pan and zoom like a map.
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // While a finger is moving the map, the camera follows without easing.
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x0: number; y0: number; cx: number; cy: number; moved: boolean; pinch?: { d: number; z: number; mx: number; my: number } } | null>(null);
  const clampCam = (c: { x: number; y: number; z: number }) => {
    const z = Math.max(1, Math.min(3, c.z));
    const vw = viewRef.current?.clientWidth ?? size.w;
    const vh = viewRef.current?.clientHeight ?? size.h;
    return { z, x: Math.min(0, Math.max(vw - size.w * z, c.x)), y: Math.min(0, Math.max(Math.min(0, vh - size.h * z), c.y)) };
  };
  const isMapBackground = (t: EventTarget | null) => t instanceof Element && !t.closest("button, a, input, textarea, select, [role=group], [data-no-pan], .summit-hit");
  function onViewDown(e: React.PointerEvent) {
    if (!isMapBackground(e.target)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setPanning(true);
      pan.current = { x0: 0, y0: 0, cx: cam.x, cy: cam.y, moved: true, pinch: { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 } };
    } else pan.current = { x0: e.clientX, y0: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  }
  function onViewMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !pan.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pan.current;
    if (p.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const z = Math.max(1, Math.min(3, p.pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / p.pinch.d)));
      const r = viewRef.current!.getBoundingClientRect();
      const mx = p.pinch.mx - r.left;
      const my = p.pinch.my - r.top;
      // Keep the point between the fingers still while zooming.
      setCam(clampCam({ z, x: mx - ((mx - p.cx) / p.pinch.z) * z, y: my - ((my - p.cy) / p.pinch.z) * z }));
      return;
    }
    if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6) return;
    if (!p.moved) setPanning(true);
    p.moved = true;
    setCam((c) => clampCam({ ...c, x: p.cx + e.clientX - p.x0, y: p.cy + e.clientY - p.y0 }));
  }
  function onViewUp(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const p = pan.current;
    if (pointers.current.size === 0) {
      pan.current = null;
      setPanning(false);
      // A tap on the open map tucks any cards back into tokens.
      if (p && !p.moved) {
        setCardsOn(new Set());
        setAdding(null);
      }
    }
  }
  function onWheel(e: React.WheelEvent) {
    const r = viewRef.current?.getBoundingClientRect();
    if (!r) return;
    const z = Math.max(1, Math.min(3, cam.z * Math.exp(-e.deltaY * 0.0015)));
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setCam(clampCam({ z, x: mx - ((mx - cam.x) / cam.z) * z, y: my - ((my - cam.y) / cam.z) * z }));
  }
  // The way in: a short, magical ascent onto the map.
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setArriving(false), reduce ? 0 : 2600);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saved spots live in this browser only
    setSpots(loadSpots(posKey));
    try {
      setOrder(JSON.parse(window.localStorage.getItem(orderKey) ?? "[]") as string[]);
    } catch {
      /* storage unavailable */
    }
    // Sit above the bottom navigation, so nothing is hidden behind it.
    setNavH((document.querySelector("[data-app-nav]") as HTMLElement | null)?.offsetHeight ?? 0);
  }, [posKey, orderKey]);

  const rank = (id: string) => {
    const k = order.indexOf(id);
    return k < 0 ? 1e6 : k;
  };
  const list = quests
    .map((q, i) => ({ q: doneNow.has(q.id) ? { ...q, done: true } : q, i }))
    .sort((a, b) => rank(a.q.id) - rank(b.q.id) || a.i - b.i)
    .map((x) => x.q);
  const { w, h } = size;
  const spotOf = (q: Quest, i: number) => spots[q.id] ?? defaultSpot(i, list.length, TOP, BOTTOM, w > 760);
  const pts = list.map((q, i) => {
    const s = spotOf(q, i);
    return { x: s.fx * w, y: s.fy * h };
  });
  // Where the scene sits on screen (it's drawn to cover the box, anchored to the bottom).
  const s = Math.max(w / SCENE_W, h / SCENE_H);
  const ox = (w - SCENE_W * s) / 2;
  const oy = h - SCENE_H * s;
  const toScreen = (p: { x: number; y: number }) => ({ x: ox + p.x * s, y: oy + p.y * s });
  // The trailhead.
  const head = toScreen(world.head);
  // With nothing on the list yet, a short stretch of trail to tap and add to.
  const trail = list.length ? [head, ...pts] : w ? [head, { x: w * 0.5, y: h * 0.72 }] : [head];
  // The trail sweeps between stops like the switchbacks above: one long, even
  // curve. Where two stops sit almost straight above each other, the trail
  // swings out once to the side it's already heading, so it never runs
  // straight and never wiggles (one bend per stretch at most).
  const wind: Pt[] = [];
  let heading = 1; // which way the trail last swung (+1 right, -1 left)
  trail.forEach((p, i) => {
    wind.push(p);
    const q = trail[i + 1];
    if (!q) return;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const slant = Math.abs(dx) / len;
    if (slant > 0.55) {
      heading = dx > 0 ? 1 : -1;
      return; // already a wide sweep: the spline curves it on its own
    }
    // Swing to the opposite side from the last sweep, as a switchback would,
    // more the straighter the stretch is.
    heading = -heading;
    const depth = Math.max(0, Math.min(1, (p.y / h - TOP) / (1 - TOP)));
    const amp = Math.min(len * 0.3, 18 + 34 * depth) * (1 - slant / 0.55) ** 0.7;
    wind.push({ x: p.x + dx / 2 + heading * amp, y: p.y + dy / 2 });
  });
  const segs = w ? (world.trail === "lines" ? trail.slice(0, -1).map((p, i) => `M${p.x} ${p.y}L${trail[i + 1].x} ${trail[i + 1].y}`) : segments(wind)) : [];
  const stones = w && world.trail === "stones" ? sampleCurve(wind, (y) => 10 + Math.max(0, Math.min(1, (y / h - TOP) / (1 - TOP))) * 18) : [];
  // Width falls away with distance, so the trail recedes into the forest.
  const widthAt = (y: number) => 3 + Math.max(0, Math.min(1, (y / h - TOP) / (1 - TOP))) * 9;

  const peak = toScreen(world.goal);
  const last = trail[trail.length - 1] ?? head;
  // The dotted way onward: switchbacks from the last quest, up through the
  // clouds, narrowing toward the peak.
  let climb = "";
  if (w) {
    const turns = world.climb.turns;
    const up: Pt[] = [last];
    // Switchbacks sweep from one flank of the mountain to the other,
    // narrowing toward the peak — always on the mountain's face. The first
    // sweep always heads the same way, so moving a quest never flips the climb.
    const startSide = -1;
    for (let k = 1; k < turns; k++) {
      const t = k / turns;
      const y = last.y + (peak.y - last.y) * (1 - Math.pow(1 - t, 1.25));
      const below = Math.max(0, y - peak.y);
      const side = k % 2 === 1 ? startSide : -startSide;
      const half = Math.min(w * 0.42, below * (side < 0 ? SLOPE_L : SLOPE_R) * 0.72);
      up.push({ x: peak.x + side * half * (0.75 + 0.25 * (1 - t)), y });
    }
    up.push(peak);
    climb = segments(up).join("");
  }
  const nextId = list.find((q) => !q.done)?.id ?? null;

  function save(next: Record<string, Spot>) {
    setSpots(next);
    try {
      window.localStorage.setItem(posKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  function onDown(e: React.PointerEvent, q: Quest, anchor: { x: number; y: number }) {
    const r = box.current?.getBoundingClientRect();
    const k = r && w ? r.width / w : 1;
    drag.current = { id: q.id, x0: e.clientX, y0: e.clientY, moved: false, offX: e.clientX - (r?.left ?? 0) - anchor.x * k, offY: e.clientY - (r?.top ?? 0) - anchor.y * k };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function saveOrder(next: string[]) {
    setOrder(next);
    try {
      window.localStorage.setItem(orderKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  function complete(q: Quest) {
    setDoneNow((d) => new Set(d).add(q.id));
    startBusy(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", q.id);
        const res = await completeTaskAction(fd);
        celebrateQuest({ taskId: q.id, title: q.title, xp: q.xp, iconSrc: q.icon, totalXp: res?.totalXp ?? null, coinsEarned: res?.coinsEarned ?? 0 });
        router.refresh();
      } catch {
        setDoneNow((d) => {
          const x = new Set(d);
          x.delete(q.id);
          return x;
        });
      }
    });
  }
  /** A stop added where the path was tapped: it joins the trail right there. */
  function placeNew(id: string) {
    if (!adding) return;
    const ids = list.map((q) => q.id);
    ids.splice(adding.at, 0, id);
    saveOrder(ids);
    save({ ...spots, [id]: { fx: adding.x / w, fy: adding.y / h } });
    setAdding(null);
    setNewTitle("");
    router.refresh();
  }
  function addNew() {
    const t = newTitle.trim();
    if (!t) return;
    startBusy(async () => {
      const id = await createQuestAction({ title: t, importance: 2.5, urgency: 2.5, xpValue: 20, pinToBattle: true });
      if (typeof id === "string") placeNew(id);
    });
  }
  function addExisting(id: string) {
    startBusy(async () => {
      await addToTopOfTodayAction(id);
      placeNew(id);
    });
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !box.current) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.moved = true;
      setDragId(d.id);
      setOpen(null);
    }
    const r = box.current.getBoundingClientRect();
    // Anywhere on the map — even up the mountain.
    const fx = Math.max(0.06, Math.min(0.94, (e.clientX - r.left - d.offX) / r.width));
    const fy = Math.max(0.12, Math.min(0.97, (e.clientY - r.top - d.offY) / r.height));
    // Up on the mountain, a quest stays on its face — never out in the sky.
    const y = fy * h;
    const base = oy + 500 * s;
    let x = fx * w;
    if (y < base) {
      const below = Math.max(0, y - peak.y);
      x = Math.max(peak.x - below * SLOPE_L * 0.8, Math.min(peak.x + below * SLOPE_R * 0.8, x));
    }
    setSpots((sp) => ({ ...sp, [d.id]: { fx: w ? x / w : fx, fy } }));
  }
  function onUp(q: Quest) {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d) return;
    if (d.moved) save({ ...spots });
    else
      setCardsOn((c) => {
        const x = new Set(c);
        if (x.has(q.id)) x.delete(q.id);
        else x.add(q.id);
        return x;
      });
  }
  const remaining = list.filter((q) => !q.done).length;

  return (
    <div
      ref={viewRef}
      className="summit fixed inset-x-0 top-0 z-[30] select-none overflow-hidden"
      style={{ background: world.bg, touchAction: "none", bottom: navH }}
      onPointerDown={onViewDown}
      onPointerMove={onViewMove}
      onPointerUp={onViewUp}
      onPointerCancel={onViewUp}
      onWheel={onWheel}
    >
      <div
        ref={box}
        className="absolute left-0 top-0"
        style={{
          width: w || "100%",
          height: h || "100%",
          transformOrigin: "0 0",
          // Its own layer: typing, keyboards or a resize elsewhere don't make the painted world redraw.
          willChange: "transform",
          transform: arriving ? "translate(0, 6%) scale(1.18)" : `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`,
          filter: arriving ? "blur(6px) brightness(.6)" : undefined,
          transition: arriving ? "none" : panning ? "none" : "transform 1.6s cubic-bezier(.2,.7,.2,1), filter 1.4s ease-out",
        }}
      >
      <world.Scene />

      {/* the trail and the dotted way onward */}
      {w > 0 && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h} aria-hidden>
          <defs>
            <filter id="summit-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <linearGradient id="summit-climb" gradientUnits="userSpaceOnUse" x1="0" y1={last.y} x2="0" y2={peak.y}>
            <stop offset="0" stopColor={world.climb.color} stopOpacity=".95" />
            <stop offset=".3" stopColor={world.climb.color} stopOpacity=".6" />
            <stop offset=".75" stopColor="#fff3cf" stopOpacity=".35" />
            <stop offset="1" stopColor="#fffbe8" stopOpacity=".9" />
          </linearGradient>
          <path d={climb} stroke="url(#summit-climb)" strokeWidth="3" strokeLinecap="round" strokeDasharray="0 8" fill="none" filter="url(#summit-glow)" />
        </svg>
      )}
      {/* clouds drift over the way up: glimpsed, never quite seen */}
      <world.Veil />
      {w > 0 && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h} aria-hidden>
          <defs>
            <linearGradient id="adv-stone" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#efe8d8" />
              <stop offset="1" stopColor="#a99d84" />
            </linearGradient>
            <radialGradient id="adv-star" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
              <stop offset=".4" stopColor="#c9d0ff" stopOpacity=".2" />
              <stop offset="1" stopColor="#a8b4ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* what each quest stands on */}
          {pts.map((p, i) => {
            const by = p.y + MARK / 2 - 3;
            if (world.trail === "wake")
              return (
                <g key={`base${i}`}>
                  <ellipse cx={p.x} cy={by + 3} rx="40" ry="9" fill="none" stroke="#c9d6ff" strokeWidth="1" opacity=".35" />
                  <ellipse cx={p.x} cy={by} rx="33" ry="8" fill="#d8c38e" />
                  <ellipse cx={p.x} cy={by - 1.5} rx="26" ry="5.5" fill="#5f8a46" />
                  <path d={`M${p.x + 22} ${by - 2}q-2 -16 -8 -22M${p.x + 14} ${by - 24}q6 -4 14 0M${p.x + 14} ${by - 24}q-6 -4 -12 2M${p.x + 14} ${by - 24}q4 -8 12 -6`} stroke="#3f6a34" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                </g>
              );
            if (world.trail === "lines") return <circle key={`base${i}`} cx={p.x} cy={p.y} r="46" fill="url(#adv-star)" />;
            if (world.trail === "stones")
              return (
                <g key={`base${i}`}>
                  <ellipse cx={p.x} cy={by + 4} rx="40" ry="10" fill="none" stroke="#ffffff" strokeWidth="1" opacity=".4" />
                  <ellipse cx={p.x} cy={by + 2} rx="31" ry="9" fill="#5d5544" />
                  <ellipse cx={p.x} cy={by} rx="30" ry="8" fill="url(#adv-stone)" />
                </g>
              );
            return null;
          })}
          {world.trail === "earth" && (
            <>
              {/* a warm glow along the way, then the worn earth of the trail */}
              {segs.map((d, i) => (
                <path key={`g${i}`} d={d} stroke="#ffcf7a" strokeWidth={widthAt(wind[i + 1].y) * 3.2} strokeLinecap="round" fill="none" opacity=".12" />
              ))}
              {segs.map((d, i) => (
                <path key={`e${i}`} d={d} stroke="#2e2011" strokeWidth={widthAt(wind[i + 1].y) + 2.5} strokeLinecap="round" fill="none" opacity=".7" />
              ))}
              {segs.map((d, i) => (
                <path key={`p${i}`} d={d} stroke="#d2ad78" strokeWidth={widthAt(wind[i + 1].y)} strokeLinecap="round" fill="none" />
              ))}
            </>
          )}
          {world.trail === "wake" && (
            <>
              {/* the ship's wake: a soft silver line on dark water */}
              {segs.map((d, i) => (
                <path key={`g${i}`} d={d} stroke="#bcd0ff" strokeWidth={widthAt(wind[i + 1].y) * 2.6} strokeLinecap="round" fill="none" opacity=".12" />
              ))}
              {segs.map((d, i) => (
                <path key={`p${i}`} d={d} stroke="#e6eeff" strokeWidth={Math.max(1.2, widthAt(wind[i + 1].y) * 0.32)} strokeLinecap="round" fill="none" opacity=".85" />
              ))}
            </>
          )}
          {world.trail === "lines" && (
            <>
              {/* constellation lines */}
              {segs.map((d, i) => (
                <path key={`g${i}`} d={d} stroke="#c9d0ff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".12" />
              ))}
              {segs.map((d, i) => (
                <path key={`p${i}`} d={d} stroke="#e8ecff" strokeWidth="1.3" strokeLinecap="round" fill="none" opacity=".8" filter="url(#summit-glow)" />
              ))}
            </>
          )}
          {world.trail === "stones" &&
            stones.map((p, i) => {
              const k = Math.max(0, Math.min(1, (p.y / h - TOP) / (1 - TOP)));
              const rx = 4 + k * 9;
              return (
                <g key={i}>
                  <ellipse cx={p.x} cy={p.y + rx * 0.25} rx={rx * 1.5} ry={rx * 0.42} fill="none" stroke="#ffffff" strokeWidth=".8" opacity=".35" />
                  <ellipse cx={p.x} cy={p.y + rx * 0.12} rx={rx} ry={rx * 0.5} fill="#5d5544" />
                  <ellipse cx={p.x} cy={p.y} rx={rx} ry={rx * 0.46} fill="url(#adv-stone)" />
                </g>
              );
            })}
        </svg>
      )}

      {/* tap the path to add a stop right there */}
      {w > 0 && (
        <svg className="absolute inset-0" width={w} height={h} style={{ pointerEvents: "none" }} aria-hidden>
          {segs.map((d, i) => (
            <path
              key={`hit${i}`}
              d={d}
              className="summit-hit"
              stroke="transparent"
              strokeWidth="26"
              fill="none"
              style={{ pointerEvents: "stroke", cursor: 'url("/design/cursor-hand.svg") 11 3, copy' }}
              onClick={(e) => {
                const r = box.current?.getBoundingClientRect();
                if (!r) return;
                const k = w / r.width;
                setAdding({ x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, at: Math.min(list.length, Math.floor(i / 3)) });
              }}
            />
          ))}
        </svg>
      )}

      {/* a soft vignette, like an old painting */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, ${world.vignette} 100%)` }} />

      {/* a line for the climb */}
      {w > 0 && (
        <p
          className="summit-saying pointer-events-none absolute left-1/2 m-0 w-[min(88vw,520px)] -translate-x-1/2 text-center font-display italic"
          style={{ top: world.key === "stars" ? peak.y + 64 * s + 10 : Math.max(peak.y + 70, h * 0.3), fontSize: w < 500 ? 19 : 24, lineHeight: 1.3, color: "#fff7e6", textShadow: "0 2px 12px rgba(40,20,60,.75), 0 0 2px rgba(40,20,60,.6)" }}
        >
          {world.sayings[0]}
        </p>
      )}

      {/* the wanderer waits beside the next quest */}
      {w > 0 && nextId && (() => {
        const i = list.findIndex((q) => q.id === nextId);
        const p = pts[i];
        return p && dragId !== nextId ? (
          <div className="summit-wanderer pointer-events-none absolute" style={{ left: p.x - MARK / 2 - 28, top: p.y - MARK / 2 - 12, zIndex: Math.round(p.y) + 1 }}>
            <world.Guide />
          </div>
        ) : null;
      })()}

      {/* the boss at the peak */}
      {w > 0 && (
        <div className="summit-boss pointer-events-none absolute" style={{ left: peak.x, top: Math.max(130, peak.y - 14 - world.goalPad * s), transform: "translate(-50%, -100%)" }}>
          <div className="flex flex-col items-center">
            <div className="max-w-[230px] rounded-xl px-3 py-1.5 text-center" style={{ background: "rgba(20,14,30,.78)", border: "1.5px solid rgba(242,210,126,.7)", boxShadow: "0 0 18px rgba(255,200,120,.35)" }}>
              <div className="font-display text-[12px] font-bold uppercase tracking-[.18em]" style={{ color: "#f2d27e" }}>
                ⚔ Level {boss?.level ?? level} boss
              </div>
              <div className="text-[14px] italic leading-snug" style={{ color: "#fbf3df" }}>
                {boss ? boss.title : `The ${world.goalName} of level ${level + 1}`}
              </div>
              {boss && boss.target > 1 && (
                <div className="mt-1 flex justify-center gap-1">
                  {Array.from({ length: boss.target }, (_, i) => (
                    <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < boss.progress ? "#f2d27e" : "rgba(242,210,126,.25)" }} />
                  ))}
                </div>
              )}
            </div>
            <span className="h-3 w-px" style={{ background: "rgba(242,210,126,.7)" }} />
          </div>
        </div>
      )}

      {/* today's quests along the trail: a token, or (tapped) a little preview card */}
      {w > 0 &&
        list.map((q, i) => {
          const p = pts[i];
          const isNext = q.id === nextId;
          const asCard = cardsOn.has(q.id);
          const handlers = {
            onPointerDown: (e: React.PointerEvent) => onDown(e, q, p),
            onPointerMove: onMove,
            onPointerUp: () => onUp(q),
            onPointerCancel: () => {
              drag.current = null;
              setDragId(null);
            },
          };
          if (asCard) {
            // The quest's own card, a little smaller. It stays on screen; if it has to shift,
            // the path still runs to the quest's spot beneath it. Drag it by its grip.
            const CW = 272;
            const left = Math.max(8, Math.min(w - CW * 0.86 - 8, p.x - (CW * 0.86) / 2));
            const top = Math.max(64, Math.min(h - 160, p.y - 40));
            const card = cards[q.id];
            return (
              <div
                key={q.id}
                role="group"
                aria-label={`${q.title} — drag to move`}
                className={`summit-card fade-in absolute ${dragId === q.id ? "is-dragging" : ""}`}
                style={{ left, top, width: CW, transform: "scale(.86)", transformOrigin: "0 0", zIndex: dragId === q.id ? 999 : 400 + Math.round(p.y), cursor: dragId === q.id ? "grabbing" : "grab", touchAction: "none" }}
                onPointerDown={(e) => {
                  if (e.button > 0) return;
                  const r = box.current?.getBoundingClientRect();
                  const k = r && w ? r.width / w : 1;
                  drag.current = { id: q.id, x0: e.clientX, y0: e.clientY, moved: false, offX: e.clientX - (r?.left ?? 0) - p.x * k, offY: e.clientY - (r?.top ?? 0) - p.y * k };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.id !== q.id) return;
                  // Only once it really moves does it become a drag (taps still reach the card).
                  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) >= 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
                  onMove(e);
                }}
                onPointerUp={() => {
                  const d = drag.current;
                  drag.current = null;
                  setDragId(null);
                  if (d?.moved) {
                    save({ ...spots });
                    cardDragged.current = true;
                    window.setTimeout(() => (cardDragged.current = false), 0);
                  }
                }}
                onClickCapture={(e) => {
                  // A tap on the card folds it back into its token; only its menus
                  // (the ⋯ button and the portrait) open anything.
                  const t = e.target as HTMLElement;
                  if (!e.currentTarget.contains(t)) return; // a click inside a menu it opened
                  if (t.closest('[aria-haspopup="menu"], [role="menu"]')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (cardDragged.current) return;
                  setCardsOn((c) => { const x = new Set(c); x.delete(q.id); return x; });
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragId(null);
                }}
              >
                <button
                  type="button"
                  onClick={() => setCardsOn((c) => { const x = new Set(c); x.delete(q.id); return x; })}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Fold back into its token"
                  title="Fold back into its token"
                  className="absolute -right-2 -top-2 z-[5] flex h-7 w-7 items-center justify-center rounded-full text-[16px] leading-none"
                  style={{ background: "rgba(42,28,16,.88)", color: "#f2d27e", border: "1.5px solid rgba(242,210,126,.7)" }}
                >
                  ×
                </button>
                {card ? (
                  <ul className="m-0 list-none p-0">
                    <TaskRow task={card} theme="adventure" categoryLabel={card.categoryLabel} onEditorClose={() => router.refresh()} compact />
                  </ul>
                ) : (
                  <p className="m-0 rounded-xl p-3 text-[15px] font-semibold" style={{ background: "#f6ecd2", color: "#2a1c10" }}>
                    {q.title}
                  </p>
                )}
              </div>
            );
          }
          return (
            <button
              key={q.id}
              type="button"
              {...handlers}
              aria-label={`${q.title}${q.done ? " (done)" : ""} — tap for its card, drag to move`}
              className={`summit-mark absolute flex flex-col items-center ${dragId === q.id ? "is-dragging" : ""}`}
              style={{ left: p.x, top: p.y, transform: `translate(-50%, ${-MARK / 2}px)`, zIndex: dragId === q.id ? 999 : Math.round(p.y), cursor: dragId === q.id ? "grabbing" : "grab" }}
            >
              <span
                className={`relative flex items-center justify-center overflow-hidden rounded-full ${isNext ? "summit-next" : ""}`}
                style={{
                  width: MARK,
                  height: MARK,
                  border: `2.5px solid ${q.done ? "#f2d27e" : "#e9dcb8"}`,
                  boxShadow: q.done ? "0 0 14px rgba(242,210,126,.7), 0 4px 8px rgba(0,0,0,.5)" : "0 4px 10px rgba(0,0,0,.55)",
                  filter: q.done ? "saturate(.55) brightness(.9)" : undefined,
                  background: "#2a1c10",
                }}
              >
                {q.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                  <img src={q.icon} alt="" draggable={false} className="h-full w-full object-cover" />
                ) : (
                  <QuestMonogram id={q.id} title={q.title} size={MARK} />
                )}
                {q.done && (
                  <span className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(20,14,6,.35)" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#f6dc8e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
              </span>
              <span
                className="mt-1 w-max max-w-[150px] rounded-md px-1.5 py-0.5 text-center text-[11.5px] font-semibold leading-tight"
                style={{ background: "rgba(246,236,210,.92)", color: "#2a1c10", border: "1px solid #a58c66", textDecoration: q.done ? "line-through" : undefined, opacity: q.done ? 0.8 : 1 }}
              >
                {q.title}
              </span>
            </button>
          );
        })}

      {/* adding a stop where the path was tapped */}
      {adding && (
        <div
          className="fade-in absolute z-[1000] w-[260px] rounded-2xl p-3"
          style={{ left: Math.max(8, Math.min(w - 268, adding.x - 130)), top: Math.max(64, Math.min(h - 300, adding.y + 14)), background: "linear-gradient(180deg,#f6ecd2,#e9d8ae)", border: "1.5px solid #8b7040", boxShadow: "0 10px 26px rgba(0,0,0,.5)", color: "#2a1c10" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-[16px]">A new stop here</span>
            <button type="button" onClick={() => setAdding(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none hover:bg-black/[.06]">
              ×
            </button>
          </div>
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNew()}
              maxLength={140}
              placeholder="New quest…"
              aria-label="New quest"
              className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[15px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)" }}
            />
            <button type="button" disabled={busy || !newTitle.trim()} onClick={addNew} className="h-9 rounded-full px-3 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
              Add
            </button>
          </div>
          {others.length > 0 && (
            <>
              <p className="m-0 mt-2.5 text-[12px] font-semibold uppercase tracking-[.12em]" style={{ color: "#6b5631" }}>
                Or one you already have
              </p>
              <ul className="m-0 mt-1 flex max-h-[180px] list-none flex-col overflow-y-auto p-0">
                {others
                  .filter((o) => !newTitle.trim() || o.title.toLowerCase().includes(newTitle.trim().toLowerCase()))
                  .slice(0, 30)
                  .map((o) => (
                    <li key={o.id}>
                      <button type="button" disabled={busy} onClick={() => addExisting(o.id)} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[14px] hover:bg-black/[.05] disabled:opacity-60">
                        <span className="min-w-0 flex-1 truncate">{o.title}</span>
                        <span className="shrink-0 text-[11.5px]" style={{ color: "#6b5631" }}>
                          +{o.xp}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* tapping a quest opens its usual card: complete, edit, schedule, everything */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" onClick={() => setOpen(null)}>
            <div className="overlay-fade-in absolute inset-0" style={{ background: "rgba(8,6,20,.55)" }} />
            <div className="card-pop-in relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="absolute -top-11 right-0 flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none"
                style={{ background: "rgba(20,14,30,.7)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.5)" }}
              >
                ×
              </button>
              {cards[open.id] ? (
                <ul className="m-0 list-none p-0">
                  <TaskRow task={cards[open.id]} theme="adventure" categoryLabel={cards[open.id].categoryLabel} onEditorClose={() => router.refresh()} />
                </ul>
              ) : (
                <p className="m-0 rounded-2xl p-4 text-[15px]" style={{ background: "#f6ecd2", color: "#2a1c10" }}>
                  {open.title}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}

      </div>

      {/* way back, and a quiet caption */}
      <div className="absolute left-3 right-3 top-3 z-[50] flex items-start justify-between gap-3" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Link href="/" className="flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold" style={{ background: "rgba(20,14,30,.6)", border: "1px solid rgba(242,210,126,.5)", color: "#f6ecd2", backdropFilter: "blur(4px)" }}>
          ← Today
        </Link>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="hidden rounded-full px-3 py-1.5 text-right text-[12.5px] sm:block" style={{ background: "rgba(20,14,30,.45)", color: "rgba(246,236,210,.85)" }}>
            {list.length === 0 ? "Tap the path to add a quest" : remaining === 0 ? "every step taken today ✓" : `${remaining} ${world.steps} · drag to reshape · tap the path to add`}
          </span>
        </div>
      </div>
      {arriving && typeof document !== "undefined" && createPortal(<Ascent />, document.body)}
    </div>
  );
}

/**
 * The way into the summit: the screen falls dark, a ring of golden runes
 * kindles and turns, starlight rises past like an ascent, a line of words
 * glows and fades — and the veil lifts onto the map.
 */
function Ascent() {
  return (
    <div className="ascent pointer-events-none fixed inset-0 z-[70]" aria-hidden>
      <div className="ascent-veil" />
      {Array.from({ length: 36 }, (_, i) => (
        <span key={i} className="ascent-mote" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 9) * 0.12}s`, animationDuration: `${1.4 + (i % 5) * 0.25}s`, width: 2 + (i % 3), height: 10 + (i % 4) * 8 }} />
      ))}
      <svg className="ascent-ring" viewBox="-110 -110 220 220" width="260" height="260">
        <circle r="96" fill="none" stroke="#f2d27e" strokeWidth="1.2" strokeDasharray="3 5" opacity=".8" />
        <circle r="80" fill="none" stroke="#9ff5e4" strokeWidth=".8" opacity=".6" />
        <circle r="62" fill="none" stroke="#f2d27e" strokeWidth="1.6" opacity=".9" />
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i} transform={`rotate(${i * 30}) translate(0 -88)`}>
            <path d={["M-3 -4l3 8 3-8", "M-3 0h6M0 -4v8", "M-3 4l3-8 3 8z", "M-3 -3l6 6M3 -3l-6 6"][i % 4]} stroke="#fff1b8" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </g>
        ))}
        <path d="M0 -40L9 -9 40 0 9 9 0 40 -9 9 -40 0 -9 -9Z" fill="#fff6d8" opacity=".9" />
      </svg>
      <p className="ascent-words font-display">The hidden path reveals itself…</p>
    </div>
  );
}
