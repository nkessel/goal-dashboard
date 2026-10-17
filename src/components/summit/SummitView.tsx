"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { MountainClouds, MountainScene, SCENE_H, SCENE_W, SUMMIT } from "./MountainScene";

type Quest = { id: string; title: string; xp: number; icon: string | null; done: boolean };
type Spot = { fx: number; fy: number };

const POS_KEY = "summit-path";
/** The trail lives in the forest: between the mist and the bottom edge. */
const TOP = 0.62;
const BOTTOM = 0.87; // clear of the bottom navigation
const MARK = 50;

function loadSpots(): Record<string, Spot> {
  try {
    return JSON.parse(window.localStorage.getItem(POS_KEY) ?? "{}") as Record<string, Spot>;
  } catch {
    return {};
  }
}
/** Where a quest stands by default: a meandering climb, left and right. */
function defaultSpot(i: number, n: number): Spot {
  const t = n <= 1 ? 0.5 : i / (n - 1);
  const fy = BOTTOM - 0.06 - t * (BOTTOM - 0.06 - TOP - 0.03);
  const fx = 0.5 + (i % 2 === 0 ? -1 : 1) * (0.2 - t * 0.08) + Math.sin(i * 1.7) * 0.03;
  return { fx, fy };
}

/** A smooth curve through points (Catmull-Rom as cubic Béziers), split per segment. */
function segments(pts: { x: number; y: number }[]) {
  const out: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    out.push(`M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  return out;
}

/**
 * The secret summit view of today. The mountain's peak is the level boss;
 * today's quests line a winding trail through the forest below. Drag any
 * quest and the trail bends to follow (remembered on this device). Past the
 * last quest, a dotted line climbs into the mist — the way to the top isn't
 * visible yet, but one day the path will get there.
 */
export function SummitView({ quests, boss, level }: { quests: Quest[]; boss: { title: string; level: number; target: number; progress: number } | null; level: number }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const [open, setOpen] = useState<Quest | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; x0: number; y0: number; moved: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [doneNow, setDoneNow] = useState<Set<string>>(new Set());

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- saved spots live in this browser only
    setSpots(loadSpots());
  }, []);

  const list = quests.map((q) => (doneNow.has(q.id) ? { ...q, done: true } : q));
  const spotOf = (q: Quest, i: number) => spots[q.id] ?? defaultSpot(i, list.length);
  const { w, h } = size;
  const pts = list.map((q, i) => {
    const s = spotOf(q, i);
    return { x: s.fx * w, y: s.fy * h };
  });
  // The trailhead, at the bottom of the screen.
  const head = { x: w * 0.5, y: h + 20 };
  const trail = [head, ...pts];
  const segs = w ? segments(trail) : [];
  // Width falls away with distance, so the trail recedes into the forest.
  const widthAt = (y: number) => 10 + Math.max(0, Math.min(1, (y / h - TOP) / (1 - TOP))) * 30;

  // Where the summit sits on screen (the scene is drawn to cover the box).
  const s = Math.max(w / SCENE_W, h / SCENE_H);
  const ox = (w - SCENE_W * s) / 2;
  const oy = h - SCENE_H * s; // anchored to the bottom
  const peak = { x: ox + SUMMIT.x * s, y: oy + SUMMIT.y * s };
  const last = trail[trail.length - 1] ?? head;
  // The dotted way onward: from the last quest, up through the mist, to the peak.
  const mistY = h * (TOP - 0.06);
  const ctrl = { x: (last.x + peak.x) / 2 + w * 0.18, y: mistY };
  const dots: { x: number; y: number; o: number; r: number }[] = [];
  if (w) {
    const N = 46;
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      const x = (1 - t) * (1 - t) * last.x + 2 * (1 - t) * t * ctrl.x + t * t * peak.x;
      const y = (1 - t) * (1 - t) * last.y + 2 * (1 - t) * t * ctrl.y + t * t * peak.y;
      // Clear near the forest, lost in the mist, a faint glimmer near the top.
      const o = y > mistY + 30 ? 0.9 : y > mistY - h * 0.12 ? 0.45 : 0.3 + 0.4 * t;
      dots.push({ x, y, o, r: 1.4 + Math.max(0, Math.min(1, (y / h - 0.1) / 0.8)) * 2.4 });
    }
  }
  const nextId = list.find((q) => !q.done)?.id ?? null;

  function save(next: Record<string, Spot>) {
    setSpots(next);
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }
  function onDown(e: React.PointerEvent, q: Quest) {
    drag.current = { id: q.id, x0: e.clientX, y0: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
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
    const fx = Math.max(0.06, Math.min(0.94, (e.clientX - r.left) / r.width));
    const fy = Math.max(TOP, Math.min(BOTTOM, (e.clientY - r.top) / r.height));
    setSpots((sp) => ({ ...sp, [d.id]: { fx, fy } }));
  }
  function onUp(q: Quest) {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (!d) return;
    if (d.moved) save({ ...spots });
    else setOpen((o) => (o?.id === q.id ? null : q));
  }
  function complete(q: Quest) {
    start(async () => {
      const fd = new FormData();
      fd.set("taskId", q.id);
      const res = await completeTaskAction(fd);
      setDoneNow((s) => new Set(s).add(q.id));
      setOpen(null);
      celebrateQuest({ taskId: q.id, title: q.title, xp: q.xp, iconSrc: q.icon, totalXp: res?.totalXp ?? null, coinsEarned: res?.coinsEarned ?? 0 });
      router.refresh();
    });
  }
  const openIdx = open ? list.findIndex((q) => q.id === open.id) : -1;
  const openPt = openIdx >= 0 ? pts[openIdx] : null;
  const remaining = list.filter((q) => !q.done).length;

  return (
    <div ref={box} className="summit fixed inset-0 z-[30] select-none overflow-hidden" style={{ background: "#141a2e", touchAction: "none" }}>
      <MountainScene />

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
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#f6dc8e" opacity={d.o} filter={d.y < mistY - h * 0.12 ? "url(#summit-glow)" : undefined} />
          ))}
        </svg>
      )}
      {/* clouds drift over the way up: glimpsed, never quite seen */}
      <MountainClouds />
      {w > 0 && (
        <svg className="pointer-events-none absolute inset-0" width={w} height={h} aria-hidden>
          {segs.map((d, i) => (
            <path key={`e${i}`} d={d} stroke="#3b2a17" strokeWidth={widthAt(trail[i + 1].y) + 6} strokeLinecap="round" fill="none" opacity=".75" />
          ))}
          {segs.map((d, i) => (
            <path key={`p${i}`} d={d} stroke="#b8956a" strokeWidth={widthAt(trail[i + 1].y)} strokeLinecap="round" fill="none" />
          ))}
          {segs.map((d, i) => (
            <path key={`c${i}`} d={d} stroke="#d9bd8c" strokeWidth={Math.max(2, widthAt(trail[i + 1].y) * 0.22)} strokeLinecap="round" strokeDasharray="2 9" fill="none" opacity=".7" />
          ))}
        </svg>
      )}

      {/* the boss at the peak */}
      {w > 0 && (
        <div className="summit-boss pointer-events-none absolute" style={{ left: peak.x, top: peak.y - 14, transform: "translate(-50%, -100%)" }}>
          <div className="flex flex-col items-center">
            <div className="max-w-[230px] rounded-xl px-3 py-1.5 text-center" style={{ background: "rgba(20,14,30,.78)", border: "1.5px solid rgba(242,210,126,.7)", boxShadow: "0 0 18px rgba(255,200,120,.35)" }}>
              <div className="font-display text-[12px] font-bold uppercase tracking-[.18em]" style={{ color: "#f2d27e" }}>
                ⚔ Level {boss?.level ?? level} boss
              </div>
              <div className="text-[14px] italic leading-snug" style={{ color: "#fbf3df" }}>
                {boss ? boss.title : `The summit of level ${level + 1}`}
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

      {/* today's quests along the trail */}
      {w > 0 &&
        list.map((q, i) => {
          const p = pts[i];
          const isNext = q.id === nextId;
          return (
            <button
              key={q.id}
              type="button"
              onPointerDown={(e) => onDown(e, q)}
              onPointerMove={onMove}
              onPointerUp={() => onUp(q)}
              onPointerCancel={() => {
                drag.current = null;
                setDragId(null);
              }}
              aria-label={`${q.title}${q.done ? " (done)" : ""} — tap for details, drag to move`}
              className={`summit-mark absolute flex flex-col items-center ${dragId === q.id ? "is-dragging" : ""}`}
              style={{ left: p.x, top: p.y, transform: "translate(-50%, -78%)", zIndex: dragId === q.id ? 5 : Math.round(p.y), cursor: dragId === q.id ? "grabbing" : "grab" }}
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
                className="mt-1 max-w-[120px] truncate rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold"
                style={{ background: "rgba(246,236,210,.92)", color: "#2a1c10", border: "1px solid #a58c66", textDecoration: q.done ? "line-through" : undefined, opacity: q.done ? 0.8 : 1 }}
              >
                {q.title}
              </span>
            </button>
          );
        })}

      {/* a quest's card */}
      {open && openPt && (
        <div
          className="fade-in absolute z-[60] w-[230px] rounded-2xl p-3"
          style={{ left: Math.max(12, Math.min(w - 242, openPt.x - 115)), top: Math.max(70, openPt.y - MARK - 150), background: "linear-gradient(180deg,#f6ecd2,#ead9b0)", border: "1.5px solid #8b7040", boxShadow: "0 10px 28px rgba(0,0,0,.5)", color: "#2a1c10" }}
        >
          <p className="m-0 text-[15px] font-semibold leading-snug">{open.title}</p>
          <p className="m-0 mt-0.5 text-[13px]" style={{ color: "#6b5631" }}>
            {open.done ? "Done today ✓" : `+${open.xp} XP`}
          </p>
          <div className="mt-2 flex gap-2">
            {!open.done && (
              <button type="button" disabled={pending} onClick={() => complete(open)} className="h-9 flex-1 rounded-full text-[14px] font-bold disabled:opacity-60" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116" }}>
                {pending ? "…" : "Complete ✓"}
              </button>
            )}
            <button type="button" onClick={() => setOpen(null)} className="h-9 rounded-full px-3 text-[14px]" style={{ border: "1px solid #a58c66" }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* way back, and a quiet caption */}
      <div className="absolute left-3 right-3 top-3 z-[50] flex items-start justify-between gap-3" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href="/" className="flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold" style={{ background: "rgba(20,14,30,.6)", border: "1px solid rgba(242,210,126,.5)", color: "#f6ecd2", backdropFilter: "blur(4px)" }}>
          ← Today
        </Link>
        <span className="rounded-full px-3 py-2 text-right text-[12.5px]" style={{ background: "rgba(20,14,30,.45)", color: "rgba(246,236,210,.85)" }}>
          {list.length === 0 ? "No quests on today's trail yet" : remaining === 0 ? "Every step of today's trail walked ✓" : `${remaining} step${remaining === 1 ? "" : "s"} on today's trail · drag to reshape`}
        </span>
      </div>
    </div>
  );
}
