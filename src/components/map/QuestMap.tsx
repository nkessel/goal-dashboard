"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Task } from "@/lib/data/types";
import type { CampaignStop } from "@/lib/data/campaign";
import { getQuestForEditAction, saveMapPrefsAction } from "@/app/actions";
import { DONE_ICONS, DoneGlyph, GOAL_ICONS, GoalGlyph, MARKER_ICONS, MarkerGlyph, type DoneIcon, type GoalIcon, type MarkerIcon } from "./MapIcons";
import { segments, type Pt } from "@/lib/curves";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";

/** How the map looks, set per board from its gear. */
type MapPrefs = { clearAhead: number; fog: boolean; goal: GoalIcon; done: DoneIcon; marker: MarkerIcon; order: "done-first" | "as-planned"; labels: "all" | "near" };
const DEFAULT_PREFS: MapPrefs = { clearAhead: 3, fog: true, goal: "castle", done: "check", marker: "portrait", order: "done-first", labels: "all" };
const AHEAD = [1, 2, 3, 5, 10];
const STEP = 112;
const TOKEN = 56;
/** Past this many finished steps, the oldest fold into one milestone stone. */
const FOLD_PAST = 8;
const KEEP_PAST = 5;

type Node = { kind: "stop"; stop: CampaignStop; i: number } | { kind: "fold"; count: number } | { kind: "mist" };

function readPrefs(raw: Record<string, unknown> | null): MapPrefs {
  const p = { ...DEFAULT_PREFS, ...((raw ?? {}) as Partial<MapPrefs>) };
  // Older maps saved "All" as 99 steps ahead, which is the same as no mist.
  if (p.clearAhead >= 99) return { ...p, clearAhead: DEFAULT_PREFS.clearAhead, fog: false };
  if (!AHEAD.includes(p.clearAhead)) p.clearAhead = DEFAULT_PREFS.clearAhead;
  if (!GOAL_ICONS.some((g) => g.key === p.goal)) p.goal = DEFAULT_PREFS.goal;
  if (!DONE_ICONS.some((d) => d.key === p.done)) p.done = DEFAULT_PREFS.done;
  if (!MARKER_ICONS.some((m) => m.key === p.marker)) p.marker = DEFAULT_PREFS.marker;
  return p;
}

/**
 * A campaign as a map: one road through every quest inside a board. What's
 * done stands as lit landmarks, the next step glows, the next few are clear,
 * and the rest of the road waits in the mist until you get close. The
 * destination is always in view above it.
 */
export function QuestMap({
  board,
  stops: allStops,
  initialPrefs = null,
  portrait = null,
  aspirations = 0,
}: {
  board: { id: string; title: string };
  stops: CampaignStop[];
  initialPrefs?: Record<string, unknown> | null;
  portrait?: string | null;
  aspirations?: number;
}) {
  const [prefs, setPrefs] = useState<MapPrefs>(() => readPrefs(initialPrefs));
  const [showSettings, setShowSettings] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  function setPref(patch: Partial<MapPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void saveMapPrefsAction(board.id, next).catch(() => {});
  }
  // Leaving the map (or opening the board over it) puts the settings away.
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setShowSettings(false);
  }

  // "As planned": finished steps keep their place in the road instead of gathering at the start.
  const stops = prefs.order === "done-first" ? allStops : [...allStops].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [opening, setOpening] = useState<Task | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [, start] = useTransition();

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = stops.length;
  const doneCount = stops.filter((s) => s.status === "completed").length;
  const nextIdx = stops.findIndex((s) => s.status !== "completed");
  const allDone = n > 0 && nextIdx < 0;
  const fogFrom = !prefs.fog || nextIdx < 0 ? n : Math.min(n, nextIdx + prefs.clearAhead);
  const hidden = n - fogFrom;
  const xpEarned = stops.filter((s) => s.status === "completed").reduce((a, s) => a + (s.xp_value ?? 0), 0);
  const xpAhead = stops.filter((s) => s.status !== "completed").reduce((a, s) => a + (s.xp_value ?? 0), 0);

  // What stands on the road, bottom to top: (a milestone for the long-ago
  // steps), the steps in view, then a couple of shapes in the mist — the
  // rest of the hidden road isn't drawn at all, so a long campaign stays short.
  const lead = prefs.order === "done-first" ? stops.findIndex((s) => s.status !== "completed") : -1;
  const pastRun = lead < 0 ? (allDone ? n : 0) : lead;
  const fold = !pastOpen && prefs.order === "done-first" && pastRun > FOLD_PAST ? pastRun - KEEP_PAST : 0;
  const nodes: Node[] = [];
  if (fold) nodes.push({ kind: "fold", count: fold });
  for (let i = fold; i < fogFrom; i++) nodes.push({ kind: "stop", stop: stops[i], i });
  for (let k = 0; k < Math.min(2, hidden); k++) nodes.push({ kind: "mist" });

  const count = nodes.length;
  const H = 250 + Math.max(1, count) * STEP;
  const amp = Math.min(w * 0.24, 150);
  const pt = (j: number): Pt => ({ x: w / 2 + amp * Math.sin(j * 1.15 + 0.6), y: H - 90 - j * STEP });
  const pts = nodes.map((_, j) => pt(j));
  const startPt: Pt = { x: w / 2 + amp * Math.sin(-1.15 + 0.6), y: H - 10 };
  const goal: Pt = { x: w / 2, y: 74 };
  const road = w && count ? [startPt, ...pts, goal] : [];
  const segs = road.length ? segments(road) : [];
  // Segment k runs from road[k] to road[k+1]; road[k+1] is node k (the last one reaches the goal).
  const nextNode = nodes.findIndex((nd) => nd.kind === "stop" && nd.i === nextIdx);
  const walked = allDone ? segs.length : nextNode < 0 ? 0 : nextNode;
  const firstMist = nodes.findIndex((nd) => nd.kind === "mist");
  const fogY = firstMist >= 0 ? pts[firstMist].y + STEP * 0.6 : null;

  const [hintKey, setHintKey] = useState(0);
  function say(text: string) {
    setHint(text);
    setHintKey((k) => k + 1);
  }
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 2400);
    return () => clearTimeout(t);
  }, [hint, hintKey]);
  function tap(s: CampaignStop) {
    start(async () => {
      const t = await getQuestForEditAction(s.id).catch(() => null);
      if (t) setOpening(t);
      else say("Couldn't open that quest just now.");
    });
  }

  // Start the view at the next step.
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    if (!w || scrolled.current) return;
    scrolled.current = true;
    const el = nextRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 120) window.scrollTo({ top: window.scrollY + r.top - window.innerHeight * 0.45 });
  }, [w]);

  const labelWidth = (p: Pt, right: boolean) => Math.max(90, Math.floor(right ? w - (p.x + TOKEN / 2 + 10) - 12 : p.x - TOKEN / 2 - 10 - 12));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-0.5 pr-14">
        <Link href={`/boards/${board.id}`} className="truncate text-[14px] underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
          ← {board.title}
        </Link>
        <span className="text-[13px] tabular-nums" style={{ color: "var(--t-cream)", opacity: 0.85 }}>
          {n === 0 ? "No steps yet" : `${doneCount} of ${n} ${n === 1 ? "step" : "steps"} · ${xpEarned} XP earned${xpAhead ? ` · ${xpAhead} ahead` : ""}`}
        </span>
      </div>

      <div ref={box} className="quest-map parchment parchment-framed relative overflow-hidden rounded-2xl" style={{ height: H }}>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          aria-expanded={showSettings}
          aria-haspopup="dialog"
          aria-label="Map settings"
          title="Map settings"
          className="hover-glow absolute left-3 top-3 z-[6] flex h-10 w-10 items-center justify-center rounded-full"
          style={{ background: "rgba(42,28,16,.88)", border: "1.5px solid rgba(242,210,126,.6)", color: "#f2d27e" }}
        >
          <CogIcon />
        </button>

        {w > 0 && segs.length > 0 && (
          <svg className="absolute inset-0 z-[1]" width={w} height={H} aria-hidden>
            <defs>
              <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {segs.map((d, k) => (
              <path key={`e${k}`} d={d} stroke="rgba(74,52,22,.35)" strokeWidth="11" strokeLinecap="round" fill="none" />
            ))}
            {segs.map((d, k) =>
              k < walked ? (
                <path key={`w${k}`} d={d} stroke="#d9a93f" strokeWidth="6" strokeLinecap="round" fill="none" filter="url(#map-glow)" />
              ) : (
                <path key={`r${k}`} d={d} stroke="#b8945a" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 11" fill="none" />
              )
            )}
          </svg>
        )}

        {/* The destination: always in view, high above the mist. */}
        {w > 0 && (
          <div className="absolute z-[4] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: goal.x, top: goal.y, width: Math.min(280, w - 120) }}>
            <GoalGlyph icon={prefs.goal} size={56} glow={allDone} />
            <span className="font-display mt-1 line-clamp-2 max-w-full rounded-2xl px-3 py-0.5 text-center text-[14px] leading-tight" style={{ background: "rgba(42,28,16,.85)", color: "#f2d27e", border: "1px solid rgba(242,210,126,.6)" }}>
              {board.title}
            </span>
            {allDone && (
              <span className="mt-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-[.14em]" style={{ color: "#8a6116", background: "rgba(243,231,203,.95)", border: "1px solid rgba(139,112,64,.4)" }}>
                ✦ Conquered ✦
              </span>
            )}
          </div>
        )}

        {/* The mist over the far road. */}
        {fogY !== null && (
          <div aria-hidden className="map-fog pointer-events-none absolute inset-x-0 top-0 z-[3]" style={{ height: fogY }}>
            <span className="map-fog-edge" />
          </div>
        )}

        {w > 0 &&
          nodes.map((nd, j) => {
            const p = pts[j];
            if (nd.kind === "mist")
              return (
                <button
                  key={`mist${j}`}
                  type="button"
                  onClick={() => say("Still in the mist. It clears as you get closer.")}
                  aria-label="Steps still in the mist"
                  className="absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{ left: p.x, top: p.y, width: TOKEN - 8, height: TOKEN - 8, background: "rgba(42,28,16,.55)", border: "3px solid rgba(233,220,184,.7)" }}
                >
                  <span className="text-[20px] font-bold" style={{ color: "rgba(233,220,184,.75)" }}>
                    ?
                  </span>
                </button>
              );
            if (nd.kind === "fold")
              return (
                <div key="fold">
                  <button
                    type="button"
                    onClick={() => setPastOpen(true)}
                    aria-label={`Show ${nd.count} earlier steps`}
                    className="absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[18px]"
                    style={{ left: p.x, top: p.y, width: TOKEN + 6, height: TOKEN - 2, background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "3px solid #f2d27e", boxShadow: "0 0 14px rgba(242,210,126,.6), 0 4px 10px rgba(0,0,0,.35)", color: "#3b2a10" }}
                  >
                    <span className="text-[16px] font-bold leading-none">+{nd.count}</span>
                    <span className="text-[9.5px] font-bold uppercase tracking-wider">steps</span>
                  </button>
                  <span className="absolute z-[2] -translate-y-1/2 text-[13px] italic" style={{ top: p.y, ...(p.x < w / 2 ? { left: p.x + TOKEN / 2 + 12 } : { right: w - p.x + TOKEN / 2 + 12, textAlign: "right" }), color: "#6b5631", maxWidth: labelWidth(p, p.x < w / 2) }}>
                    {nd.count} earlier steps behind you · tap to see them
                  </span>
                </div>
              );
            const { stop: s, i } = nd;
            const done = s.status === "completed";
            const isNext = i === nextIdx;
            const art = (s.icon_source === "ai" || s.icon_source === "library") && s.icon_key ? s.icon_key : null;
            const right = p.x <= w / 2;
            const prev = nodes[j - 1];
            const prevRegion = prev?.kind === "stop" ? prev.stop.region : null;
            const regionStart = s.region && s.region !== (prevRegion ?? "");
            const named = prefs.labels === "all" || isNext || Math.abs(i - nextIdx) <= 1 || (allDone && i >= n - 2);
            return (
              <div key={s.id}>
                {regionStart && (
                  <span
                    className="font-display absolute z-[2] max-w-[70%] -translate-x-1/2 -translate-y-1/2 truncate rounded-full px-2.5 py-0.5 text-[12.5px] italic"
                    style={{ top: p.y + STEP / 2, left: w / 2, color: "#6b4f1d", background: "rgba(243,231,203,.92)", border: "1px solid rgba(139,112,64,.35)" }}
                  >
                    ⟡ {s.region}
                  </span>
                )}
                <button
                  ref={isNext ? nextRef : undefined}
                  type="button"
                  onClick={() => tap(s)}
                  aria-label={`${s.title}${done ? " (done)" : isNext ? " — next step" : ""}`}
                  className="absolute z-[2] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: TOKEN,
                    height: TOKEN,
                    background: "#2a1c10",
                    border: `3px solid ${done ? "#f2d27e" : isNext ? "#f6dc8e" : "#e9dcb8"}`,
                    boxShadow: done ? "0 0 16px rgba(242,210,126,.75), 0 4px 10px rgba(0,0,0,.35)" : "0 4px 10px rgba(0,0,0,.35)",
                  }}
                >
                  <span className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full ${isNext ? "summit-next" : ""}`}>
                    {done && !art ? (
                      <span className="flex h-full w-full items-center justify-center" style={{ background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)" }}>
                        <DoneGlyph icon={prefs.done} size={26} />
                      </span>
                    ) : art ? (
                      // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                      <img src={art} alt="" draggable={false} className="h-full w-full object-cover" style={done ? { filter: "saturate(.7) brightness(.95)" } : undefined} />
                    ) : (
                      <QuestMonogram id={s.id} title={s.title} size={TOKEN - 6} />
                    )}
                    {done && art && (
                      <span className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(42,28,16,.35)" }}>
                        <DoneGlyph icon={prefs.done} size={24} />
                      </span>
                    )}
                  </span>
                </button>
                {isNext && prefs.marker !== "none" && (
                  <span aria-hidden className="map-marker pointer-events-none absolute z-[3]" style={{ left: p.x + (right ? -TOKEN / 2 - 8 : TOKEN / 2 - 22), top: p.y - TOKEN / 2 - 26 }}>
                    <MarkerGlyph icon={prefs.marker} size={30} portrait={portrait} />
                  </span>
                )}
                {named && (
                  <span
                    className="absolute z-[2] flex -translate-y-1/2 flex-col"
                    style={{ top: p.y, maxWidth: labelWidth(p, right), ...(right ? { left: p.x + TOKEN / 2 + 10 } : { right: w - p.x + TOKEN / 2 + 10, alignItems: "flex-end", textAlign: "right" }) }}
                  >
                    {isNext && (
                      <span className="text-[10.5px] font-bold uppercase tracking-[.14em]" style={{ color: "#8a6116" }}>
                        Next step
                      </span>
                    )}
                    <span title={s.title} className={`line-clamp-3 break-words text-[14px] font-semibold leading-snug ${done ? "line-through decoration-[rgba(80,60,20,.35)]" : ""}`} style={{ color: done ? "#6b5631" : "#2a1c10" }}>
                      {s.title}
                    </span>
                    <span className="text-[11.5px] tabular-nums" style={{ color: done ? "#3f6a2c" : "#6b5631" }}>
                      {done ? `+${s.xp_value ?? 0} XP` : `${s.xp_value ?? 0} XP`}
                    </span>
                  </span>
                )}
              </div>
            );
          })}

        {n === 0 && w > 0 && (
          <div className="absolute inset-x-0 z-[2] flex flex-col items-center gap-3 px-6 text-center" style={{ top: 170 }}>
            <p className="m-0 text-[15px] italic" style={{ color: "#6b5631" }}>
              No quests on this road yet. Each quest on this board, and on the boards inside it, becomes a step.
              {aspirations > 0 ? ` (${aspirations} ${aspirations === 1 ? "aspiration stays" : "aspirations stay"} off the road until ${aspirations === 1 ? "it becomes a quest" : "they become quests"}.)` : ""}
            </p>
            <Link href={`/boards/${board.id}`} className="hover-glow rounded-full px-4 py-2 text-[14px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}>
              Add a quest to the board
            </Link>
          </div>
        )}
        {hidden > 0 && fogY !== null && (
          <p className="pointer-events-none absolute inset-x-0 z-[4] m-0 text-center text-[13px] italic" style={{ top: Math.max(150, fogY - STEP * 1.6), color: "rgba(60,44,20,.85)" }}>
            {hidden} more {hidden === 1 ? "step" : "steps"} in the mist
          </p>
        )}
      </div>

      {hint && (
        <div role="status" className="card-pop-in fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-[14px]" style={{ background: "rgba(20,14,6,.92)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.5)" }}>
          {hint}
        </div>
      )}
      {showSettings && <MapSettings prefs={prefs} setPref={setPref} portrait={portrait} onClose={() => setShowSettings(false)} />}
      {opening && <EditTaskModal task={opening} theme="adventure" onClose={() => setOpening(null)} />}
    </div>
  );
}

/** The map's settings, as a sheet over the map so you can watch it change. */
function MapSettings({ prefs, setPref, portrait, onClose }: { prefs: MapPrefs; setPref: (p: Partial<MapPrefs>) => void; portrait: string | null; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      html.style.overflow = was;
    };
  }, [onClose]);
  const pick = (on: boolean) => ({ background: on ? "rgba(217,180,95,.4)" : "transparent", border: `1.5px solid ${on ? "#8a6116" : "transparent"}` });
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Map settings">
      <button type="button" aria-label="Close map settings" className="absolute inset-0 cursor-default" style={{ background: "rgba(10,8,4,.35)" }} onClick={onClose} />
      <section className="sheet-up parchment parchment-framed relative flex max-h-[78dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))]" style={{ color: "#2a1c10" }}>
        <div className="relative z-[1] flex items-center justify-between">
          <h2 className="font-display m-0 text-[19px]">Map settings</h2>
          <button type="button" onClick={onClose} className="h-9 rounded-full px-4 text-[14px] font-bold" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913" }}>
            Done
          </button>
        </div>
        <Row label="See ahead" hint="How many upcoming steps stand clear of the mist">
          {AHEAD.map((a) => (
            <Chip key={a} on={prefs.fog && prefs.clearAhead === a} onClick={() => setPref({ clearAhead: a, fog: true })}>
              {a}
            </Chip>
          ))}
          <Chip on={!prefs.fog} onClick={() => setPref({ fog: false })}>
            No mist
          </Chip>
        </Row>
        <Row label="Destination" hint="What waits at the end of the road">
          {GOAL_ICONS.map((g) => (
            <button key={g.key} type="button" onClick={() => setPref({ goal: g.key })} aria-pressed={prefs.goal === g.key} title={g.label} className="flex w-[62px] flex-col items-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5" style={pick(prefs.goal === g.key)}>
              <GoalGlyph icon={g.key} size={36} />
              <span className="text-[11px] font-semibold leading-tight">{g.label}</span>
            </button>
          ))}
        </Row>
        <Row label="Steps taken" hint="The mark on a finished step">
          {DONE_ICONS.map((d) => (
            <button key={d.key} type="button" onClick={() => setPref({ done: d.key })} aria-pressed={prefs.done === d.key} title={d.label} className="flex w-[62px] flex-col items-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5" style={pick(prefs.done === d.key)}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "2px solid #f2d27e" }}>
                <DoneGlyph icon={d.key} size={20} />
              </span>
              <span className="text-[11px] font-semibold leading-tight">{d.label}</span>
            </button>
          ))}
        </Row>
        <Row label="You are here" hint="What stands at your next step">
          {MARKER_ICONS.map((m) => (
            <button key={m.key} type="button" onClick={() => setPref({ marker: m.key })} aria-pressed={prefs.marker === m.key} title={m.label} className="flex w-[62px] flex-col items-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5" style={pick(prefs.marker === m.key)}>
              <span className="flex h-9 w-9 items-center justify-center">
                {m.key === "none" ? <span className="text-[20px] opacity-50">∅</span> : <MarkerGlyph icon={m.key} size={30} portrait={portrait} />}
              </span>
              <span className="text-[11px] font-semibold leading-tight">{m.label}</span>
            </button>
          ))}
        </Row>
        <Row label="Order" hint="Where finished steps sit on the road">
          <Chip on={prefs.order === "done-first"} onClick={() => setPref({ order: "done-first" })}>
            Done first
          </Chip>
          <Chip on={prefs.order === "as-planned"} onClick={() => setPref({ order: "as-planned" })}>
            As planned
          </Chip>
        </Row>
        <Row label="Names" hint="Which steps show their names">
          <Chip on={prefs.labels === "all"} onClick={() => setPref({ labels: "all" })}>
            Every step
          </Chip>
          <Chip on={prefs.labels === "near"} onClick={() => setPref({ labels: "near" })}>
            Only nearby
          </Chip>
        </Row>
      </section>
    </div>,
    document.body
  );
}

/** A proper toothed cog (not a sun). */
function CogIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.3 2.8h3.4l.5 2.6a7 7 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7 7 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a7 7 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7 7 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a7 7 0 0 1 1.9-1.1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex flex-col gap-1.5">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[16px]">{label}</span>
        <span className="text-[12px]" style={{ color: "#6b5631" }}>
          {hint}
        </span>
      </span>
      <div className="flex flex-wrap items-end gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="h-9 min-w-9 rounded-full px-3 text-[13.5px] font-semibold" style={on ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913" } : { border: "1px solid rgba(139,112,64,.45)" }}>
      {children}
    </button>
  );
}
