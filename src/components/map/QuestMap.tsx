"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Task } from "@/lib/data/types";
import type { CampaignStop } from "@/lib/data/campaign";
import { getQuestForEditAction, saveMapPrefsAction } from "@/app/actions";
import { DONE_ICONS, DoneGlyph, GOAL_ICONS, GoalGlyph, type DoneIcon, type GoalIcon } from "./MapIcons";
import { segments, type Pt } from "@/lib/curves";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";

/** How the map looks, set per board from its gear. */
type MapPrefs = { clearAhead: number; fog: boolean; goal: GoalIcon; done: DoneIcon; order: "done-first" | "as-planned"; labels: "all" | "near" };
const DEFAULT_PREFS: MapPrefs = { clearAhead: 3, fog: true, goal: "castle", done: "check", order: "done-first", labels: "all" };
const AHEAD = [1, 2, 3, 5, 99];
const STEP = 112;
const TOKEN = 56;

/**
 * A campaign as a map: one road through every quest inside a board. What's
 * done stands as lit landmarks, the next step glows, the next few are clear,
 * and the rest of the road waits in the mist until you get close. The
 * destination is always in view above it.
 */
export function QuestMap({ board, stops: allStops, initialPrefs = null }: { board: { id: string; title: string }; stops: CampaignStop[]; initialPrefs?: Record<string, unknown> | null }) {
  const [prefs, setPrefs] = useState<MapPrefs>({ ...DEFAULT_PREFS, ...((initialPrefs ?? {}) as Partial<MapPrefs>) });
  const [showSettings, setShowSettings] = useState(false);
  function setPref(patch: Partial<MapPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void saveMapPrefsAction(board.id, next).catch(() => {});
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
  const fogFrom = !prefs.fog || nextIdx < 0 ? n : nextIdx + prefs.clearAhead;
  const xpEarned = stops.filter((s) => s.status === "completed").reduce((a, s) => a + (s.xp_value ?? 0), 0);
  const xpAhead = stops.filter((s) => s.status !== "completed").reduce((a, s) => a + (s.xp_value ?? 0), 0);

  const H = 230 + Math.max(1, n) * STEP;
  const amp = Math.min(w * 0.27, 150);
  const pt = (i: number): Pt => ({ x: w / 2 + amp * Math.sin(i * 1.15 + 0.6), y: H - 90 - i * STEP });
  const pts = stops.map((_, i) => pt(i));
  const startPt: Pt = { x: w / 2 + amp * Math.sin(-1.15 + 0.6), y: H - 10 };
  const goal: Pt = { x: w / 2, y: 70 };
  const road = w ? [startPt, ...pts, goal] : [];
  const segs = w ? segments(road) : [];
  // Segment k runs from road[k] to road[k+1]; road[k+1] is stop k (the last one reaches the goal).
  const walked = nextIdx < 0 ? segs.length : nextIdx;
  const fogY = fogFrom < n ? pts[fogFrom].y + STEP * 0.55 : null;

  function tap(s: CampaignStop, i: number) {
    if (i >= fogFrom) {
      setHint("Still in the mist. It clears as you get closer.");
      setTimeout(() => setHint(null), 2200);
      return;
    }
    start(async () => {
      const t = await getQuestForEditAction(s.id).catch(() => null);
      if (t) setOpening(t);
    });
  }

  // Start the view at the next step.
  const nextRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    if (w) nextRef.current?.scrollIntoView({ block: "center" });
  }, [w]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <Link href={`/boards/${board.id}`} className="text-[14px] underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
          ← {board.title}
        </Link>
        <span className="ml-auto text-[13px] tabular-nums" style={{ color: "var(--t-cream)", opacity: 0.8 }}>
          {doneCount} of {n} steps · {xpEarned} XP earned · {xpAhead} ahead
        </span>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-label="Map settings"
          title="Map settings"
          className="hover-glow flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(10,12,32,.6)", border: "1.5px solid rgba(217,180,95,.45)", color: "var(--t-gold)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.9" />
            <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {showSettings && (
        <section aria-label="Map settings" className="reveal parchment parchment-framed flex flex-col gap-3 rounded-2xl p-4" style={{ color: "#2a1c10" }}>
          <Row label="See ahead" hint="How many upcoming steps stand clear of the mist">
            {AHEAD.map((a) => (
              <Chip key={a} on={prefs.clearAhead === a} onClick={() => setPref({ clearAhead: a, fog: true })}>
                {a === 99 ? "All" : a}
              </Chip>
            ))}
            <Chip on={!prefs.fog} onClick={() => setPref({ fog: !prefs.fog })}>
              No mist
            </Chip>
          </Row>
          <Row label="Destination" hint="What waits at the end of the road">
            {GOAL_ICONS.map((g) => (
              <button key={g.key} type="button" onClick={() => setPref({ goal: g.key })} aria-pressed={prefs.goal === g.key} title={g.label} className="flex flex-col items-center gap-0.5 rounded-xl px-1.5 pb-1 pt-1.5" style={{ background: prefs.goal === g.key ? "rgba(217,180,95,.4)" : "transparent", border: `1.5px solid ${prefs.goal === g.key ? "#8a6116" : "transparent"}` }}>
                <GoalGlyph icon={g.key} size={38} />
                <span className="text-[11px] font-semibold">{g.label}</span>
              </button>
            ))}
          </Row>
          <Row label="Steps taken" hint="The mark on a finished step">
            {DONE_ICONS.map((d) => (
              <button key={d.key} type="button" onClick={() => setPref({ done: d.key })} aria-pressed={prefs.done === d.key} title={d.label} className="flex flex-col items-center gap-0.5 rounded-xl px-1.5 pb-1 pt-1.5" style={{ background: prefs.done === d.key ? "rgba(217,180,95,.4)" : "transparent", border: `1.5px solid ${prefs.done === d.key ? "#8a6116" : "transparent"}` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", border: "2px solid #f2d27e" }}>
                  <DoneGlyph icon={d.key} size={20} />
                </span>
                <span className="text-[11px] font-semibold">{d.label}</span>
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
      )}

      <div ref={box} className="quest-map parchment parchment-framed relative overflow-hidden rounded-2xl" style={{ height: H }}>
        {w > 0 && (
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
          <div className="absolute z-[4] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: goal.x, top: goal.y }}>
            <GoalGlyph icon={prefs.goal} size={58} glow={nextIdx < 0} />
            <span className="font-display mt-1 max-w-[240px] rounded-full px-3 py-0.5 text-center text-[15px]" style={{ background: "rgba(42,28,16,.85)", color: "#f2d27e", border: "1px solid rgba(242,210,126,.6)" }}>
              {nextIdx < 0 ? `${board.title} — conquered!` : board.title}
            </span>
          </div>
        )}

        {/* The mist over the far road. */}
        {fogY !== null && (
          <div aria-hidden className="map-fog pointer-events-none absolute inset-x-0 top-0 z-[3]" style={{ height: fogY }}>
            <span className="map-fog-edge" />
          </div>
        )}

        {w > 0 &&
          stops.map((s, i) => {
            const p = pts[i];
            const done = s.status === "completed";
            const isNext = i === nextIdx;
            const fogged = i >= fogFrom;
            const art = (s.icon_source === "ai" || s.icon_source === "library") && s.icon_key ? s.icon_key : null;
            const right = p.x < w / 2;
            const regionStart = s.region && s.region !== (stops[i - 1]?.region ?? "");
            return (
              <div key={s.id}>
                {regionStart && !fogged && (
                  <span
                    className="font-display absolute z-[2] -translate-y-1/2 whitespace-nowrap text-[13px] italic"
                    style={{ top: p.y - STEP / 2, [right ? "right" : "left"]: 14, color: "#6b4f1d", opacity: 0.85 }}
                  >
                    ⟡ {s.region}
                  </span>
                )}
                <button
                  ref={isNext ? nextRef : undefined}
                  type="button"
                  onClick={() => tap(s, i)}
                  aria-label={fogged ? "A step still in the mist" : `${s.title}${done ? " (done)" : isNext ? " — next step" : ""}`}
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
                    {fogged ? (
                      <span className="text-[22px] font-bold" style={{ color: "rgba(233,220,184,.6)" }}>
                        ?
                      </span>
                    ) : done && !art ? (
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
                      <span className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(42,28,16,.3)" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#f6dc8e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </span>
                </button>
                {!fogged && (prefs.labels === "all" || done ? prefs.labels === "all" || i >= nextIdx - 1 : true) && (
                  <span
                    className="absolute z-[2] flex max-w-[42%] -translate-y-1/2 flex-col"
                    style={{ top: p.y, ...(right ? { left: p.x + TOKEN / 2 + 10 } : { right: w - p.x + TOKEN / 2 + 10, alignItems: "flex-end", textAlign: "right" }) }}
                  >
                    {isNext && (
                      <span className="text-[10.5px] font-bold uppercase tracking-[.14em]" style={{ color: "#8a6116" }}>
                        Next step
                      </span>
                    )}
                    <span className={`text-[14px] font-semibold leading-snug ${done ? "line-through decoration-[rgba(80,60,20,.35)]" : ""}`} style={{ color: done ? "#6b5631" : "#2a1c10" }}>
                      {s.title}
                    </span>
                    <span className="text-[11.5px] tabular-nums" style={{ color: done ? "#3f6a2c" : "#6b5631" }}>
                      {done ? `+${s.xp_value} XP` : `${s.xp_value} XP`}
                    </span>
                  </span>
                )}
              </div>
            );
          })}

        {n === 0 && (
          <p className="absolute inset-x-0 top-1/2 z-[2] m-0 -translate-y-1/2 px-6 text-center text-[15px] italic" style={{ color: "#6b5631" }}>
            No quests on this road yet. Add some to the board and they&rsquo;ll appear as steps.
          </p>
        )}
        {fogFrom < n && (
          <p className="absolute inset-x-0 z-[4] m-0 text-center text-[13px] italic" style={{ top: Math.max(130, (fogY ?? 0) - 60), color: "rgba(60,44,20,.8)" }}>
            {n - fogFrom} more {n - fogFrom === 1 ? "step" : "steps"} in the mist
          </p>
        )}
      </div>

      {hint && (
        <div role="status" className="card-pop-in fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-[14px]" style={{ background: "rgba(20,14,6,.92)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.5)" }}>
          {hint}
        </div>
      )}
      {opening && <EditTaskModal task={opening} theme="adventure" onClose={() => setOpening(null)} />}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2">
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
