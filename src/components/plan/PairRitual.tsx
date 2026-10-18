"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completePlanAction, processSeedsAction, savePlanDraftAction, setBigRocksAction, type SeedFate } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { WeekView } from "@/components/calendar/WeekView";
import { SchedulingDrawer } from "@/components/calendar/SchedulingList";
import type { Task } from "@/lib/data/types";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";

type Who = "me" | "them";
type Pair<T> = { me: T; them: T };
type Woop = { rock: string; wish: string; outcome: string; obstacle: string; plan: string };
type Item = { id: string; text: string; fate?: SeedFate | null; made?: string | null };
type Draft = {
  step: number;
  partner: string;
  good: Pair<string>;
  look: Pair<string>;
  sweep: Pair<Item[]>;
  subtract: Pair<string>;
  rocks: Pair<Item[]>;
  woop: Pair<Woop>;
  cal: { rocks: boolean; cowork: boolean; midweek: boolean; friends: boolean };
  menu: Pair<string>;
  bedtime: Pair<string>;
  light: string;
  /** Doing the talk-only steps on a walk; the rest (mind sweep, calendar) later. */
  walk?: boolean;
  walkedAt?: string | null;
  mid?: { win: Pair<string>; next: Pair<string>; help: Pair<string>; doneAt?: string | null };
};

const INK = "#3b2a14";
const SOFT = "#6b5631";
const GOLD = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" };
const FIELD = "w-full rounded-lg border px-3 py-2 text-[15.5px] leading-relaxed";
const FIELD_STYLE = { borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: INK };
const newId = () => Math.random().toString(36).slice(2, 10);
const emptyWoop: Woop = { rock: "", wish: "", outcome: "", obstacle: "", plan: "" };

/** From the plan: options to try for two weeks, then swap. */
const MENU = [
  "Daytime co-working, then a walk together, done or not",
  "A 10-minute midweek check-in call",
  "A “starting now” text before a dreaded task",
  "I take tasks off your plate; you're my thinking partner in return",
];
const LIGHT = [
  "What's something you're looking forward to this week?",
  "Best thing you ate lately?",
  "If you had a free afternoon, what would you do with it?",
  "What made you laugh this week?",
  "A place you'd love to visit together?",
  "What's a small thing that made your day better?",
  "Favourite song right now?",
  "What would Dad say about this week?",
];

const STEPS = [
  { key: "begin", title: "Before we start", blurb: "" },
  { key: "good", title: "New and good", blurb: "Each shares something good from the week." },
  { key: "look", title: "Look back", blurb: "Each thinks aloud about the week while the other just listens. The only prompt: “What more do you think?”" },
  { key: "sweep", title: "Mind sweep", blurb: "Side by side, each writes down everything on your minds." },
  { key: "subtract", title: "Subtract", blurb: "Each picks one thing to hand off, automate, or drop." },
  { key: "rocks", title: "Big rocks", blurb: "Each picks up to three, then runs WOOP on one: wish, best outcome, inner obstacle, if-then plan." },
  { key: "calendar", title: "Calendar", blurb: "Book the big rocks, a co-working slot with a walk after, the midweek check-in, and time with friends." },
  { key: "swap", title: "Every other week", blurb: "Each picks a fresh option from the accountability menu and confirms your pact bedtime." },
  { key: "light", title: "Attention out", blurb: "End on something light." },
] as const;
/** Steps that work while walking: all talk, nothing to write. */
const WALKABLE = new Set(["begin", "good", "look", "subtract", "rocks", "swap", "light"]);

/**
 * The weekly check-in with a partner (Mom, by default): equal time each,
 * built from a thinking pair, WOOP and a few co-counseling habits. Done
 * together on one screen; each step has a side for each of you. Progress is
 * kept, and a short midweek check-in follows.
 */
export function PairRitual(props: {
  xp: number;
  theme: "calm" | "adventure";
  draft: Record<string, unknown> | null;
  sealedAt: string | null;
  last: { periodKey: string; data: Record<string, unknown>; completedAt: string } | null;
  finished: { id: string; title: string }[];
  open: { id: string; title: string; board: string | null }[];
  midweek: boolean;
  calendar: { dayKeys: string[]; tasks: Task[]; events: GoogleCalendarEvent[]; toSchedule: Task[]; folders: { name: string; open: boolean }[] };
}) {
  const router = useRouter();
  const prev = (props.last?.data ?? {}) as Partial<Draft>;
  const [d, setD] = useState<Draft>(() => ({
    step: 0,
    partner: prev.partner || "Mom",
    good: { me: "", them: "" },
    look: { me: "", them: "" },
    sweep: { me: [], them: [] },
    subtract: { me: "", them: "" },
    rocks: { me: [], them: [] },
    woop: { me: { ...emptyWoop }, them: { ...emptyWoop } },
    cal: { rocks: false, cowork: false, midweek: false, friends: false },
    menu: { me: prev.menu?.me ?? "", them: prev.menu?.them ?? "" },
    bedtime: { me: prev.bedtime?.me ?? "", them: prev.bedtime?.them ?? "" },
    light: "",
    ...((props.draft ?? {}) as Partial<Draft>),
  }));
  const [sealed, setSealed] = useState(props.sealedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const P = d.partner.trim() || "Mom";
  const names: Pair<string> = { me: "Me", them: P };

  // Every other week: due when nothing was picked in the last fortnight.
  const lastSwap = (prev as { swappedAt?: string }).swappedAt ?? null;
  const swapDue = !lastSwap || Date.now() - Date.parse(lastSwap) > 12 * 86_400_000;

  // Kept as you go, a moment after you stop typing.
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void savePlanDraftAction("pair", d).catch(() => {}), 900);
  }, [d]);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setSide = <K extends "good" | "look" | "subtract" | "menu" | "bedtime">(k: K, who: Who, v: string) => setD((x) => ({ ...x, [k]: { ...x[k], [who]: v } }));
  const shown = d.walk ? STEPS.filter((s) => WALKABLE.has(s.key)) : STEPS;
  const go = (n: number) => {
    set({ step: Math.max(0, Math.min(shown.length - 1, n)) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const step = shown[Math.min(d.step, shown.length - 1)];
  const talked = (key: string) => !!d.walkedAt && WALKABLE.has(key) && key !== "begin" && key !== "light";
  function finishWalk() {
    set({ walk: false, walkedAt: new Date().toISOString(), step: STEPS.findIndex((s) => s.key === "sweep") });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Midweek check-in: its own short page.
  if (props.midweek) return <Midweek d={d} setD={setD} names={names} />;

  function close() {
    setError(null);
    start(async () => {
      try {
        // My big rocks that are quests go to the top of my scheduling list.
        const ids = d.rocks.me.map((r) => r.made).filter((x): x is string => !!x && x !== "dropped");
        if (ids.length) await setBigRocksAction(ids);
        const data = { ...d, swappedAt: swapDue && (d.menu.me || d.menu.them) ? new Date().toISOString() : lastSwap };
        const res = await completePlanAction("pair", data);
        setSealed(new Date().toISOString());
        if (res.xp > 0) celebrateProgress({ title: `Check-in with ${P}`, xp: res.xp, fromPct: 0, toPct: 100, heading: "Well met!", barCaption: "See you at the midweek check-in" });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  /** Two sides of a step, side by side on a wide screen. */
  const sides = (render: (who: Who) => React.ReactNode) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["them", "me"] as const).map((who) => (
        <div key={who} className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: who === "them" ? "rgba(214,160,170,.16)" : "rgba(217,180,95,.16)", border: "1px solid rgba(139,112,64,.3)" }}>
          <span className="font-display text-[17px]" style={{ color: INK }}>
            {names[who]}
          </span>
          {render(who)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Link href="/calendar" className="text-[14px] underline-offset-2 hover:underline" style={{ color: "var(--t-cream, #f6ecd2)" }}>
            ← Calendar
          </Link>
          <span className="flex-1" />
          <Link href="/plan" className="rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: "rgba(20,14,30,.45)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.4)" }}>
            My weekly ritual →
          </Link>
        </div>
        <h1 className="font-display m-0 text-center text-[30px] leading-tight" style={{ color: "#f6ecd2", textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
          {P} &amp; Me
        </h1>
        <p className="m-0 text-center text-[14px]" style={{ color: "rgba(246,236,210,.85)" }}>
          Weekly check-in · about 45 minutes · equal time each
        </p>
        <ol className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0" aria-label="Steps">
          {shown.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === d.step ? "step" : undefined}
                className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold"
                style={i === d.step ? GOLD : { background: i < d.step ? "rgba(242,210,126,.25)" : "rgba(20,14,30,.4)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.35)" }}
              >
                <span className="tabular-nums">{talked(s.key) && !d.walk ? "✓" : i}</span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl px-4 py-4 parchment parchment-framed" aria-label={step.title}>
        <div className="relative z-[1] flex flex-col gap-1">
          <h2 className="font-display m-0 text-[24px]" style={{ color: INK }}>
            {step.title}
          </h2>
          {step.blurb && (
            <p className="m-0 text-[14.5px]" style={{ color: SOFT }}>
              {step.blurb}
            </p>
          )}
        </div>

        <div className="relative z-[1] flex flex-col gap-3">
          {d.walk && step.key !== "begin" && (
            <p className="m-0 rounded-lg px-3 py-1.5 text-[13.5px]" style={{ background: "rgba(42,28,16,.08)", color: SOFT }}>
              🚶 Just talk. Jotting a word is optional; you can fill things in later.
            </p>
          )}
          {step.key === "begin" && (
            <>
              <label className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: INK }}>
                Checking in with
                <input value={d.partner} onChange={(e) => set({ partner: e.target.value.slice(0, 24) })} className="h-10 w-40 rounded-lg border px-3 text-[15.5px]" style={FIELD_STYLE} aria-label="Partner's name" />
              </label>
              <ul className="m-0 flex flex-col gap-1.5 pl-5 text-[15px]" style={{ color: INK }}>
                <li>Mutual support, not managing: each of you works on your own goals and backs the other up as an equal.</li>
                <li>{P} writes {P === "Mom" ? "her" : "their"} own rules; you only do what {P === "Mom" ? "she asks" : "they ask"} for.</li>
                <li>Ground rule: neither of you raises the other&apos;s material outside the session unless invited.</li>
                <li>Bedtime itself is never the topic.</li>
              </ul>
              <button
                type="button"
                role="switch"
                aria-checked={!!d.walk}
                onClick={() => set({ walk: !d.walk, step: 0 })}
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-left"
                style={d.walk ? { ...GOLD } : { border: "1px solid #a58c66", color: INK }}
              >
                <span aria-hidden className="text-[24px]">🚶</span>
                <span className="flex flex-col">
                  <span className="text-[15.5px] font-bold">We&apos;re on a walk</span>
                  <span className="text-[13px]">Just the talking steps, big and simple. The mind sweep and calendar wait for later.</span>
                </span>
              </button>
              {d.walkedAt && !d.walk && (
                <p className="m-0 rounded-lg px-3 py-2 text-[14px]" style={{ background: "rgba(90,138,58,.12)", color: INK }}>
                  ✓ Talked through on your walk {new Date(d.walkedAt).toLocaleDateString(undefined, { weekday: "long" })}. Still to do: mind sweep, calendar, and closing.
                </p>
              )}
              {props.last && (
                <p className="m-0 text-[13.5px]" style={{ color: SOFT }}>
                  Last check-in: {new Date(props.last.completedAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.
                </p>
              )}
            </>
          )}

          {step.key === "good" &&
            sides((who) => (
              <>
                {who === "me" && props.finished.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {props.finished.slice(0, 6).map((t) => (
                      <button key={t.id} type="button" onClick={() => setSide("good", "me", d.good.me ? `${d.good.me}; ${t.title}` : t.title)} className="h-7 max-w-full truncate rounded-full px-2.5 text-[12.5px]" style={{ border: "1px solid rgba(139,112,64,.4)", color: INK }} title="Finished this week">
                        ✓ {t.title}
                      </button>
                    ))}
                  </div>
                )}
                <textarea value={d.good[who]} onChange={(e) => setSide("good", who, e.target.value)} rows={2} placeholder="Something good from the week" className={FIELD} style={FIELD_STYLE} aria-label={`${names[who]}: new and good`} />
              </>
            ))}

          {step.key === "look" && <Turns names={names} notes={d.look} onNotes={(who, v) => setSide("look", who, v)} />}

          {step.key === "sweep" &&
            sides((who) => (
              <Sweep
                items={d.sweep[who]}
                onChange={(items) => setD((x) => ({ ...x, sweep: { ...x.sweep, [who]: items } }))}
                mine={who === "me"}
                label={names[who]}
              />
            ))}

          {step.key === "subtract" &&
            sides((who) => (
              <>
                {d.sweep[who].length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {d.sweep[who].slice(0, 10).map((s) => (
                      <button key={s.id} type="button" onClick={() => setSide("subtract", who, s.text)} className="h-7 max-w-full truncate rounded-full px-2.5 text-[12.5px]" style={d.subtract[who] === s.text ? GOLD : { border: "1px solid rgba(139,112,64,.4)", color: INK }}>
                        {s.text}
                      </button>
                    ))}
                  </div>
                )}
                <input value={d.subtract[who]} onChange={(e) => setSide("subtract", who, e.target.value)} placeholder="Hand off, automate, or drop…" className={`${FIELD} h-10`} style={FIELD_STYLE} aria-label={`${names[who]}: one thing to subtract`} maxLength={140} />
              </>
            ))}

          {step.key === "rocks" &&
            sides((who) => (
              <Rocks
                who={who}
                rocks={d.rocks[who]}
                woop={d.woop[who]}
                sweep={d.sweep[who]}
                open={who === "me" ? props.open : []}
                onRocks={(rocks) => setD((x) => ({ ...x, rocks: { ...x.rocks, [who]: rocks } }))}
                onWoop={(woop) => setD((x) => ({ ...x, woop: { ...x.woop, [who]: woop } }))}
              />
            ))}

          {step.key === "calendar" && (
            <>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(
                  [
                    ["rocks", "The big rocks"],
                    ["cowork", "A co-working slot, with a walk after"],
                    ["midweek", "The midweek check-in (10 minutes)"],
                    ["friends", "Time with friends"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-[15px]" style={{ color: INK, background: d.cal[k] ? "rgba(90,138,58,.12)" : undefined }}>
                    <input type="checkbox" checked={d.cal[k]} onChange={(e) => set({ cal: { ...d.cal, [k]: e.target.checked } })} className="h-5 w-5" />
                    {label}
                  </label>
                ))}
              </div>
              <p className="m-0 text-[13.5px]" style={{ color: SOFT }}>
                Your quests to place are in the scheduling list beside the calendar (on a phone, the tab on the right edge).
              </p>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <WeekView dayKeys={props.calendar.dayKeys} tasks={props.calendar.tasks} events={props.calendar.events} theme={props.theme} />
                </div>
                <SchedulingDrawer tasks={props.calendar.toSchedule} folders={props.calendar.folders} theme={props.theme} />
              </div>
            </>
          )}

          {step.key === "swap" && (
            <>
              {!swapDue && (
                <p className="m-0 rounded-lg px-3 py-2 text-[14px]" style={{ background: "rgba(42,28,16,.08)", color: INK }}>
                  Not a swap week: you picked {lastSwap ? new Date(lastSwap).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "recently"}. Keep going with what you chose, or change it anyway.
                </p>
              )}
              <p className="m-0 text-[13.5px]" style={{ color: SOFT }}>
                The fun part never depends on finishing anything. Options that fade can come back later.
              </p>
              {sides((who) => (
                <>
                  <div className="flex flex-col gap-1" role="radiogroup" aria-label={`${names[who]}: accountability option`}>
                    {MENU.map((m) => (
                      <button key={m} type="button" role="radio" aria-checked={d.menu[who] === m} onClick={() => setSide("menu", who, d.menu[who] === m ? "" : m)} className="min-h-9 rounded-lg px-2.5 py-1.5 text-left text-[14px]" style={d.menu[who] === m ? GOLD : { border: "1px solid rgba(139,112,64,.4)", color: INK }}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: INK }}>
                    Bedtime
                    <input type="time" value={d.bedtime[who]} onChange={(e) => setSide("bedtime", who, e.target.value)} className="h-9 rounded-lg border px-2 text-[15px]" style={FIELD_STYLE} aria-label={`${names[who]}: bedtime`} />
                  </label>
                </>
              ))}
              <p className="m-0 text-[13.5px]" style={{ color: SOFT }}>
                The pact: you each text the other “lights out.”
              </p>
            </>
          )}

          {step.key === "light" && (
            <div className="flex flex-col items-center gap-3 py-1 text-center">
              <p className="font-display m-0 text-[21px]" style={{ color: INK }}>
                {d.light || LIGHT[0]}
              </p>
              <button type="button" onClick={() => set({ light: LIGHT[(LIGHT.indexOf(d.light || LIGHT[0]) + 1) % LIGHT.length] })} className="h-9 rounded-full px-4 text-[14px] font-semibold" style={{ border: "1px solid #a58c66", color: INK }}>
                Another one
              </button>
              {d.walk ? (
                <button type="button" onClick={finishWalk} className="hover-glow h-12 rounded-full px-6 text-[15.5px] font-bold" style={GOLD}>
                  Done walking · finish the rest later
                </button>
              ) : !sealed ? (
                <button type="button" onClick={close} disabled={pending} className="hover-glow h-12 rounded-full px-7 text-[16px] font-bold disabled:opacity-60" style={GOLD}>
                  {pending ? "Saving…" : `Close the check-in · +${props.xp} XP`}
                </button>
              ) : (
                <p className="m-0 text-[15px] font-semibold" style={{ color: "#5a7a2a" }}>
                  ✓ Done for this week. The midweek check-in is in a few days.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>

        {step.key !== "light" && (
          <div className="relative z-[1] flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => go(d.step - 1)} disabled={d.step === 0} className="h-10 rounded-full px-4 text-[14.5px] disabled:opacity-40" style={{ border: "1px solid #a58c66", color: INK }}>
              ← Back
            </button>
            <button type="button" onClick={() => go(d.step + 1)} className="hover-glow h-10 rounded-full px-5 text-[14.5px] font-bold" style={GOLD}>
              {d.step === 0 ? "Begin →" : "Next →"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Thinking aloud in turns: a timer for each, the listener's one prompt shown large. */
function Turns({ names, notes, onNotes }: { names: Pair<string>; notes: Pair<string>; onNotes: (who: Who, v: string) => void }) {
  const [mins, setMins] = useState(5);
  const [turn, setTurn] = useState<Who | null>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!turn) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [turn]);
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const begin = (who: Who) => {
    setTurn(who);
    setLeft(mins * 60);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-[14px]" style={{ color: INK }}>
        Each turn
        {[3, 5, 8].map((m) => (
          <button key={m} type="button" onClick={() => setMins(m)} aria-pressed={mins === m} className="h-8 rounded-full px-3 font-semibold" style={mins === m ? GOLD : { border: "1px solid rgba(139,112,64,.45)", color: INK }}>
            {m} min
          </button>
        ))}
      </div>
      {turn ? (
        <div className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 text-center" style={{ background: "rgba(42,28,16,.08)" }}>
          <span className="text-[14px] font-semibold" style={{ color: SOFT }}>
            {turn === "them" ? `${names.them} is thinking aloud · you listen` : `Your turn to think aloud · ${names.them} listens`}
          </span>
          <span className="font-display text-[44px] leading-none tabular-nums" style={{ color: left === 0 ? "#8a6116" : INK }}>
            {left === 0 ? "Time" : clock}
          </span>
          <span className="font-display text-[22px] italic" style={{ color: INK }}>
            “What more do you think?”
          </span>
          <div className="flex gap-2">
            {turn === "them" ? (
              <button type="button" onClick={() => begin("me")} className="h-10 rounded-full px-4 text-[14px] font-bold" style={GOLD}>
                Swap: my turn
              </button>
            ) : (
              <button type="button" onClick={() => begin("them")} className="h-10 rounded-full px-4 text-[14px] font-bold" style={GOLD}>
                Swap: {names.them}&apos;s turn
              </button>
            )}
            <button type="button" onClick={() => setTurn(null)} className="h-10 rounded-full px-4 text-[14px]" style={{ border: "1px solid #a58c66", color: INK }}>
              Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => begin("them")} className="h-10 rounded-full px-4 text-[14px] font-bold" style={GOLD}>
            Start {names.them}&apos;s turn
          </button>
          <button type="button" onClick={() => begin("me")} className="h-10 rounded-full px-4 text-[14px] font-semibold" style={{ border: "1px solid #a58c66", color: INK }}>
            Start my turn
          </button>
        </div>
      )}
      <details className="text-[14px]" style={{ color: SOFT }}>
        <summary className="cursor-pointer">Notes (optional, only if you each want them)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["them", "me"] as const).map((who) => (
            <textarea key={who} value={notes[who]} onChange={(e) => onNotes(who, e.target.value)} rows={2} placeholder={`${names[who]}'s notes`} className={FIELD} style={FIELD_STYLE} aria-label={`${names[who]}'s notes`} />
          ))}
        </div>
      </details>
    </div>
  );
}

/** Each person's mind sweep. Mine can go straight into my quests. */
function Sweep({ items, onChange, mine, label }: { items: Item[]; onChange: (i: Item[]) => void; mine: boolean; label: string }) {
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();
  const add = () => {
    const lines = text.split(/\n+/).map((l) => l.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
    if (!lines.length) return;
    onChange([...items, ...lines.map((l) => ({ id: newId(), text: l.slice(0, 140), fate: null }))]);
    setText("");
  };
  const fates: { k: SeedFate; icon: string; label: string }[] = [
    { k: "schedule", icon: "📅", label: "Schedule" },
    { k: "quest", icon: "⚔", label: "Quest" },
    { k: "someday", icon: "🌙", label: "Someday" },
    { k: "drop", icon: "✕", label: "Drop" },
  ];
  const ready = items.filter((i) => i.fate && !i.made);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          rows={2}
          placeholder="Anything on your mind… (Enter adds it)"
          aria-label={`${label}: add to the mind sweep`}
          className={FIELD}
          style={FIELD_STYLE}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="h-10 shrink-0 self-end rounded-full px-3 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
          Add
        </button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((it) => (
          <li key={it.id} className="flex flex-col gap-1 rounded-lg px-2 py-1.5" style={{ background: it.made ? "rgba(90,138,58,.12)" : "rgba(255,250,235,.6)" }}>
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 text-[14.5px]" style={{ color: INK, textDecoration: it.fate === "drop" ? "line-through" : undefined }}>
                {it.text}
              </span>
              {!it.made && (
                <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label={`Remove “${it.text}”`} className="h-7 w-7 shrink-0 rounded-full text-[15px] hover:bg-black/10" style={{ color: SOFT }}>
                  ×
                </button>
              )}
            </div>
            {mine && !it.made && (
              <div className="flex flex-wrap gap-1">
                {fates.map((f) => (
                  <button key={f.k} type="button" aria-pressed={it.fate === f.k} onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, fate: x.fate === f.k ? null : f.k } : x)))} className="h-7 rounded-full px-2 text-[12px] font-semibold" style={it.fate === f.k ? GOLD : { border: "1px solid rgba(139,112,64,.4)", color: INK }}>
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            )}
            {mine && it.made && (
              <span className="text-[12px]" style={{ color: SOFT }}>
                {it.made === "dropped" ? "Let go" : "Saved to your quests"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {mine && ready.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            start(async () => {
              const made = await processSeedsAction(ready.map((r) => ({ text: r.text, fate: r.fate! }))).catch(() => []);
              onChange(items.map((x) => (x.fate && !x.made ? { ...x, made: made.find((m) => m.text === x.text.replace(/\s+/g, " ").trim() && m.fate === x.fate)?.id ?? (x.fate === "drop" ? "dropped" : null) } : x)));
              router.refresh();
            })
          }
          className="h-9 self-start rounded-full px-4 text-[13.5px] font-bold disabled:opacity-60"
          style={GOLD}
        >
          {busy ? "Saving…" : `Save ${ready.length} to my quests`}
        </button>
      )}
    </div>
  );
}

/** Up to three big rocks each, and WOOP on one. */
function Rocks({ who, rocks, woop, sweep, open, onRocks, onWoop }: { who: Who; rocks: Item[]; woop: Woop; sweep: Item[]; open: { id: string; title: string; board: string | null }[]; onRocks: (r: Item[]) => void; onWoop: (w: Woop) => void }) {
  const [text, setText] = useState("");
  const have = new Set(rocks.map((r) => r.text));
  // Mine: things just swept (saved as quests) first, then any open quest that matches.
  const suggestions = [
    ...sweep.filter((s) => s.fate !== "drop" && !have.has(s.text)).map((s) => ({ id: s.made && s.made !== "dropped" ? s.made : null, text: s.text })),
    ...(text.trim() ? open.filter((o) => o.title.toLowerCase().includes(text.trim().toLowerCase()) && !have.has(o.title)).slice(0, 5).map((o) => ({ id: o.id, text: o.title })) : []),
  ].slice(0, 8);
  const add = (t: string, id: string | null) => {
    if (!t.trim() || rocks.length >= 3) return;
    onRocks([...rocks, { id: newId(), text: t.trim().slice(0, 140), made: who === "me" ? id : null }]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-2">
      {rocks.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {rocks.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: "rgba(217,180,95,.25)" }}>
              <span className="font-display text-[17px]" style={{ color: "#8a6116" }}>{i + 1}</span>
              <span className="min-w-0 flex-1 text-[14.5px] font-semibold" style={{ color: INK }}>{r.text}</span>
              <button type="button" onClick={() => onRocks(rocks.filter((x) => x.id !== r.id))} aria-label={`Remove “${r.text}”`} className="h-7 w-7 rounded-full text-[15px] hover:bg-black/10" style={{ color: SOFT }}>×</button>
            </li>
          ))}
        </ol>
      )}
      {rocks.length < 3 && (
        <>
          <div className="flex gap-1.5">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(text, null)} placeholder={who === "me" ? "A big rock (type, or find a quest)" : "A big rock"} className={`${FIELD} h-10`} style={FIELD_STYLE} aria-label="Add a big rock" maxLength={140} />
            <button type="button" onClick={() => add(text, null)} disabled={!text.trim()} className="h-10 shrink-0 rounded-full px-3 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>Add</button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <button key={`${s.id}-${s.text}`} type="button" onClick={() => add(s.text, s.id)} className="h-7 max-w-full truncate rounded-full px-2.5 text-[12.5px]" style={{ border: "1px solid rgba(139,112,64,.4)", color: INK }}>
                  + {s.text}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {rocks.length > 0 && (
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold uppercase tracking-[.12em]" style={{ color: SOFT }}>WOOP on one</span>
          <div className="flex flex-wrap gap-1">
            {rocks.map((r) => (
              <button key={r.id} type="button" onClick={() => onWoop({ ...woop, rock: r.text })} className="h-7 max-w-full truncate rounded-full px-2.5 text-[12.5px] font-semibold" style={woop.rock === r.text ? GOLD : { border: "1px solid rgba(139,112,64,.4)", color: INK }}>
                {r.text}
              </button>
            ))}
          </div>
          {woop.rock &&
            (
              [
                ["wish", "What's your wish?"],
                ["outcome", "What's the best outcome, and how would it feel?"],
                ["obstacle", "What in you might get in the way?"],
                ["plan", "If that happens, what will you do?"],
              ] as const
            ).map(([k, q]) => (
              <label key={k} className="flex flex-col gap-0.5 text-[13.5px] font-semibold" style={{ color: INK }}>
                {q}
                <input value={woop[k]} onChange={(e) => onWoop({ ...woop, [k]: e.target.value })} className={`${FIELD} h-10`} style={FIELD_STYLE} maxLength={200} />
              </label>
            ))}
        </div>
      )}
    </div>
  );
}

/** The 10-minute midweek check-in. Only what's next, never “Did you do it?” */
function Midweek({ d, setD, names }: { d: Draft; setD: React.Dispatch<React.SetStateAction<Draft>>; names: Pair<string> }) {
  const mid = d.mid ?? { win: { me: "", them: "" }, next: { me: "", them: "" }, help: { me: "", them: "" }, doneAt: null };
  const setMid = (k: "win" | "next" | "help", who: Who, v: string) => setD((x) => ({ ...x, mid: { ...mid, [k]: { ...mid[k], [who]: v } } }));
  const qs = [
    ["win", "One win since Tuesday"],
    ["next", "What's next on your big rocks, and when will you do it?"],
    ["help", "What help could you use before Tuesday?"],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="text-[14px] underline-offset-2 hover:underline" style={{ color: "var(--t-cream, #f6ecd2)" }}>
        ← Today
      </Link>
      <h1 className="font-display m-0 text-center text-[28px] leading-tight" style={{ color: "#f6ecd2", textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
        Midweek check-in with {names.them}
      </h1>
      <section className="flex flex-col gap-3 rounded-2xl px-4 py-4 parchment parchment-framed">
        <p className="relative z-[1] m-0 text-[14.5px]" style={{ color: SOFT }}>
          Ten minutes. Only what&apos;s next, never “Did you do it?”
        </p>
        {qs.map(([k, q]) => (
          <div key={k} className="relative z-[1] flex flex-col gap-1.5">
            <span className="font-display text-[19px]" style={{ color: INK }}>{q}</span>
            {k === "next" && (
              <div className="grid gap-1 text-[13px] sm:grid-cols-2" style={{ color: SOFT }}>
                {(["them", "me"] as const).map((who) => (
                  <span key={who}>{names[who]}&apos;s rocks: {d.rocks[who].map((r) => r.text).join(" · ") || "none set"}</span>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {(["them", "me"] as const).map((who) => (
                <input key={who} value={mid[k][who]} onChange={(e) => setMid(k, who, e.target.value)} placeholder={names[who]} aria-label={`${names[who]}: ${q}`} className={`${FIELD} h-10`} style={FIELD_STYLE} maxLength={200} />
              ))}
            </div>
          </div>
        ))}
        <div className="relative z-[1] flex justify-end">
          {mid.doneAt ? (
            <span className="text-[14.5px] font-semibold" style={{ color: "#5a7a2a" }}>✓ Done. See you Tuesday.</span>
          ) : (
            <button type="button" onClick={() => setD((x) => ({ ...x, mid: { ...mid, doneAt: new Date().toISOString() } }))} className="hover-glow h-11 rounded-full px-6 text-[15px] font-bold" style={GOLD}>
              Done for midweek
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
