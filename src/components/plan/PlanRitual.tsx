"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completePlanAction, processSeedsAction, reviewQuestAction, saveLifeWheelAction, savePlanDraftAction, setBigRocksAction, type SeedFate } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { LifeWheel } from "@/components/insights/LifeWheel";
import { WeekView } from "@/components/calendar/WeekView";
import { SchedulingDrawer } from "@/components/calendar/SchedulingList";
import type { Task } from "@/lib/data/types";
import { FocusFollowUp, FocusPlanner, type Focus } from "./FocusPlanner";
import type { GoogleCalendarEvent } from "@/lib/google-calendar";

type Kind = "week" | "month";
type Seed = { id: string; text: string; fate: SeedFate | null; made?: string | null };
type Lite = { id: string; title: string; due: string | null; board: string | null };
type Draft = {
  step: number;
  wentWell: string;
  inTheWay: string;
  tryNext: string;
  seeds: Seed[];
  rocks: string[];
  focus: Focus[];
  outcomes: string[];
  reviewed: Record<string, string>;
};

const INK = "#3b2a14";
const SOFT = "#6b5631";
const newId = () => Math.random().toString(36).slice(2, 10);

/** GTD-style trigger list for the mind sweep: one nudge at a time. */
const TRIGGERS = [
  "Work: projects started but not finished?",
  "Work: anything you promised someone?",
  "Calls, emails or messages to send?",
  "People to see, thank or reconnect with?",
  "Home: repairs, cleaning, things to buy?",
  "Errands and appointments to make?",
  "Health: exercise, doctors, food, sleep?",
  "Money: bills, taxes, budgets, subscriptions?",
  "Waiting on someone else for something?",
  "Upcoming events, birthdays, trips?",
  "Learning: books, courses, skills?",
  "Fun and adventures you want to have?",
  "Creative projects or ideas?",
  "Anything nagging at you?",
];

const FATES: { k: SeedFate; icon: string; label: string; hint: string }[] = [
  { k: "schedule", icon: "📅", label: "Schedule", hint: "Onto your scheduling list, to place on the calendar" },
  { k: "quest", icon: "⚔", label: "Quest", hint: "Onto your Additional Quests" },
  { k: "waiting", icon: "⏳", label: "Waiting for", hint: "Someone else's move: kept on a Waiting For board" },
  { k: "someday", icon: "🌙", label: "Someday", hint: "Not now: kept on a Someday / Maybe board" },
  { k: "done", icon: "✓", label: "Did it", hint: "Took under two minutes? Do it now and tick it off" },
  { k: "drop", icon: "✕", label: "Drop", hint: "Let it go" },
];

const STEPS: Record<Kind, { key: string; title: string; blurb: string }[]> = {
  week: [
    { key: "look", title: "Look back", blurb: "What happened this past week, and what you learned." },
    { key: "sweep", title: "Empty your head", blurb: "Write down everything that's on your mind. One thing per line." },
    { key: "sort", title: "Sort the haul", blurb: "Decide what each thing is. Nothing has to be done yet — just put it where it belongs." },
    { key: "review", title: "Get current", blurb: "Quests that are overdue or have sat untouched. Keep, schedule, park or let go." },
    { key: "focus", title: "Lift one area", blurb: "Pick a part of your life to lift this week, where you'd like it by Sunday, and the quests that will get it there." },
    { key: "rocks", title: "Big rocks", blurb: "Pick up to three things that would make this week a good week. They go first." },
    { key: "place", title: "Place it on the calendar", blurb: "Tap a quest in the scheduling list, then tap a time. Big rocks first." },
    { key: "seal", title: "Seal the week", blurb: "" },
  ],
  month: [
    { key: "look", title: "Look back", blurb: "The month behind you: what you finished, what you learned." },
    { key: "wheel", title: "Life wheel", blurb: "How does each part of your life feel right now?" },
    { key: "focus", title: "This month's focus", blurb: "Which parts of your life get extra love this month? Then name up to three outcomes to aim for." },
    { key: "sweep", title: "Empty your head", blurb: "Everything on your mind for the month ahead. One thing per line." },
    { key: "sort", title: "Sort the haul", blurb: "Decide what each thing is." },
    { key: "someday", title: "Someday / Maybe", blurb: "Anything here ready to come alive this month?" },
    { key: "place", title: "Key dates", blurb: "Put the month's anchors on the calendar: appointments, deadlines, big rocks." },
    { key: "seal", title: "Seal the month", blurb: "" },
  ],
};

/**
 * The weekly (or monthly) planning ritual: a calm, guided walk from looking
 * back, through a mind sweep and sorting, to a calendar with your priorities
 * in it — drawn from GTD's Weekly Review, Covey's big rocks, the Bullet
 * Journal's migration and a retro's "what to try next". Progress is kept, so
 * it can be finished later.
 */
export function PlanRitual(props: {
  kind: Kind;
  xp: number;
  theme: "calm" | "adventure";
  draft: Record<string, unknown> | null;
  sealedAt: string | null;
  followUp: { periodKey: string; items: (Omit<Focus, "quests"> & { quests: { id: string; title: string; done: boolean }[] })[] } | null;
  back: { days: number; completed: { id: string; title: string; xp_value: number; completed_at: string }[]; xpTotal: number; energyAvg: number | null };
  open: { id: string; title: string; xp: number; board: string | null; due: string | null }[];
  review: { overdue: Lite[]; stale: Lite[] };
  someday: Lite[];
  boards: { id: string; title: string; open: number }[];
  wheel: { topics: string[]; last: Record<string, { level: number; at: string }> };
  calendar: { dayKeys: string[]; tasks: Task[]; events: GoogleCalendarEvent[]; toSchedule: Task[]; folders: { name: string; open: boolean }[] };
}) {
  const { kind, theme } = props;
  const router = useRouter();
  const steps = STEPS[kind];
  const [d, setD] = useState<Draft>(() => ({
    step: 0,
    wentWell: "",
    inTheWay: "",
    tryNext: "",
    seeds: [],
    rocks: [],
    focus: [],
    outcomes: ["", "", ""],
    reviewed: {},
    ...((props.draft ?? {}) as Partial<Draft>),
  }));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sealed, setSealed] = useState<string | null>(props.sealedAt);
  const step = steps[Math.min(d.step, steps.length - 1)];

  // Progress is saved as you go (quietly, a moment after you stop typing).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void savePlanDraftAction(kind, d).catch(() => {}), 900);
  }, [d, kind]);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const go = (n: number) => {
    set({ step: Math.max(0, Math.min(steps.length - 1, n)) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const card = "flex flex-col gap-3 rounded-2xl px-4 py-4 parchment parchment-framed";
  const gold = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" };
  const field = "w-full rounded-lg border px-3 py-2 text-[15.5px] leading-relaxed";
  const fieldStyle = { borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: INK };

  const unsorted = d.seeds.filter((s) => !s.made && !s.fate).length;
  const toMake = d.seeds.filter((s) => !s.made && s.fate);

  function processSeeds(next?: number) {
    if (!toMake.length) {
      if (next !== undefined) go(next);
      return;
    }
    setError(null);
    start(async () => {
      try {
        const made = await processSeedsAction(toMake.map((s) => ({ text: s.text, fate: s.fate! })));
        setD((x) => ({
          ...x,
          seeds: x.seeds.map((s) => {
            if (s.made || !s.fate) return s;
            const m = made.find((mm) => mm.text === s.text.replace(/\s+/g, " ").trim().slice(0, 140) && mm.fate === s.fate);
            return { ...s, made: m?.id ?? (s.fate === "drop" ? "dropped" : null) };
          }),
          step: next ?? x.step,
        }));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save those.");
      }
    });
  }

  function seal() {
    setError(null);
    start(async () => {
      try {
        if (d.rocks.length) await setBigRocksAction(d.rocks);
        // Where each focus area is now goes onto the life wheel too.
        const moved = (d.focus ?? []).filter((f) => f.from !== null && f.from !== props.wheel.last[f.area]?.level).map((f) => ({ topic: f.area, level: f.from! }));
        if (moved.length) await saveLifeWheelAction(moved).catch(() => null);
        const res = await completePlanAction(kind, d);
        setSealed(new Date().toISOString());
        if (res.xp > 0) celebrateProgress({ title: kind === "week" ? "The week is planned" : "The month is planned", xp: res.xp, fromPct: 0, toPct: 100, heading: "Ritual complete!", barCaption: kind === "week" ? "See you next week, adventurer" : "A new month, well begun" });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't seal it.");
      }
    });
  }

  const rockChoices = useMemo(() => {
    const focusQ = (d.focus ?? []).flatMap((f) => f.quests.map((q) => ({ id: q.id, title: q.title, board: f.area as string | null })));
    const made0 = d.seeds.filter((s) => s.made && s.made !== "dropped" && (s.fate === "schedule" || s.fate === "quest")).map((s) => ({ id: s.made!, title: s.text, board: null as string | null }));
    const made = [...focusQ, ...made0.filter((m) => !focusQ.some((f) => f.id === m.id))];
    const seen = new Set(made.map((m) => m.id));
    return [...made, ...props.open.filter((o) => !seen.has(o.id)).map((o) => ({ id: o.id, title: o.title, board: o.board }))];
  }, [d.seeds, d.focus, props.open]);
  const [rockFilter, setRockFilter] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {/* Title and progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Link href="/calendar" className="text-[14px] underline-offset-2 hover:underline" style={{ color: "var(--t-cream, #f6ecd2)" }}>
            ← Calendar
          </Link>
          <span className="flex-1" />
          <Link href={kind === "week" ? "/plan?mode=month" : "/plan"} className="rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: "rgba(20,14,30,.45)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.4)" }}>
            {kind === "week" ? "Monthly ritual →" : "← Weekly ritual"}
          </Link>
        </div>
        <h1 className="font-display m-0 text-center text-[30px] leading-tight" style={{ color: "#f6ecd2", textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
          {kind === "week" ? "The Weekly Ritual" : "The Monthly Ritual"}
        </h1>
        <ol className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === d.step ? "step" : undefined}
                className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold"
                style={i === d.step ? gold : { background: i < d.step ? "rgba(242,210,126,.25)" : "rgba(20,14,30,.4)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.35)" }}
              >
                <span className="tabular-nums">{i + 1}</span>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <section className={card} aria-label={step.title}>
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
          {step.key === "look" && (
            <>
              {props.followUp && <FocusFollowUp kind={kind} items={props.followUp.items} last={props.wheel.last} />}
              <div className="flex flex-wrap gap-2">
                <Stat label="Quests finished" value={String(props.back.completed.length)} />
                <Stat label="XP earned" value={props.back.xpTotal.toLocaleString()} />
                {props.back.energyAvg !== null && <Stat label="Average energy" value={String(props.back.energyAvg)} />}
              </div>
              {props.back.completed.length > 0 && (
                <ul className="m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-y-auto p-0">
                  {props.back.completed.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[14.5px]" style={{ color: INK }}>
                      <span aria-hidden style={{ color: "#5a8a3a" }}>✓</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="shrink-0 text-[12px]" style={{ color: SOFT }}>
                        {new Date(t.completed_at).toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Prompt label="What went well?" value={d.wentWell} onChange={(v) => set({ wentWell: v })} cls={field} style={fieldStyle} />
              <Prompt label="What got in the way?" value={d.inTheWay} onChange={(v) => set({ inTheWay: v })} cls={field} style={fieldStyle} />
              <Prompt label={`One thing to try next ${kind}`} value={d.tryNext} onChange={(v) => set({ tryNext: v })} cls={field} style={fieldStyle} />
            </>
          )}

          {step.key === "wheel" && <LifeWheel topics={props.wheel.topics} last={props.wheel.last} />}

          {step.key === "focus" && (
            <>
              <FocusPlanner kind={kind} topics={props.wheel.topics} last={props.wheel.last} focus={d.focus ?? []} onChange={(focus) => set({ focus })} open={props.open} max={kind === "week" ? 2 : 3} />
              {kind === "month" && (
              <>
              <p className="m-0 mt-1 text-[13px] font-bold uppercase tracking-[.12em]" style={{ color: SOFT }}>
                Up to three outcomes for the month
              </p>
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  value={d.outcomes[i] ?? ""}
                  onChange={(e) => set({ outcomes: d.outcomes.map((o, j) => (j === i ? e.target.value : o)) })}
                  placeholder={["e.g. Run three times a week", "e.g. Finish the AR proposal", "e.g. One evening a week with friends"][i]}
                  className={`${field} h-11`}
                  style={fieldStyle}
                  aria-label={`Outcome ${i + 1}`}
                  maxLength={140}
                />
              ))}
              </>
              )}
            </>
          )}

          {step.key === "sweep" && <MindSweep seeds={d.seeds} onChange={(seeds) => set({ seeds })} cls={field} style={fieldStyle} />}

          {step.key === "sort" && (
            <>
              {d.seeds.length === 0 ? (
                <p className="m-0 text-[15px] italic" style={{ color: SOFT }}>
                  Nothing to sort yet — go back and empty your head first.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {d.seeds.map((s) => (
                    <li key={s.id} className="flex flex-col gap-1.5 rounded-xl px-3 py-2" style={{ background: s.made ? "rgba(90,138,58,.12)" : "rgba(255,250,235,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
                      <span className="text-[15px] font-semibold" style={{ color: INK, textDecoration: s.made === "dropped" || s.fate === "drop" ? "line-through" : undefined }}>
                        {s.text}
                      </span>
                      {s.made ? (
                        <span className="text-[12.5px]" style={{ color: SOFT }}>
                          {FATES.find((f) => f.k === s.fate)?.icon} {s.made === "dropped" ? "Let go" : `Saved — ${FATES.find((f) => f.k === s.fate)?.label}`}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`What is “${s.text}”?`}>
                          {FATES.map((f) => (
                            <button
                              key={f.k}
                              type="button"
                              role="radio"
                              aria-checked={s.fate === f.k}
                              title={f.hint}
                              onClick={() => set({ seeds: d.seeds.map((x) => (x.id === s.id ? { ...x, fate: x.fate === f.k ? null : f.k } : x)) })}
                              className="flex h-8 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold"
                              style={s.fate === f.k ? gold : { border: "1px solid rgba(139,112,64,.45)", color: INK }}
                            >
                              <span aria-hidden>{f.icon}</span>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {unsorted > 0 && (
                <p className="m-0 text-[13px]" style={{ color: SOFT }}>
                  {unsorted} still to sort.
                </p>
              )}
            </>
          )}

          {step.key === "review" && (
            <ReviewList
              groups={[
                { title: "Overdue", items: props.review.overdue },
                { title: "Untouched for 3+ weeks", items: props.review.stale },
              ]}
              reviewed={d.reviewed}
              onDone={(id, choice) => set({ reviewed: { ...d.reviewed, [id]: choice } })}
              gold={gold}
            />
          )}

          {step.key === "someday" && (
            <ReviewList
              groups={[{ title: "Someday / Maybe", items: props.someday }]}
              reviewed={d.reviewed}
              onDone={(id, choice) => set({ reviewed: { ...d.reviewed, [id]: choice } })}
              gold={gold}
              someday
            />
          )}

          {step.key === "rocks" && (
            <>
              {d.rocks.length > 0 && (
                <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {d.rocks.map((id, i) => {
                    const r = rockChoices.find((c) => c.id === id);
                    return (
                      <li key={id} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(217,180,95,.28)", border: "1px solid #a58c66" }}>
                        <span className="font-display text-[20px]" style={{ color: "#8a6116" }}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color: INK }}>
                          {r?.title ?? "A quest"}
                        </span>
                        <button type="button" onClick={() => set({ rocks: d.rocks.filter((x) => x !== id) })} aria-label="Remove" className="h-8 w-8 rounded-full text-[18px]" style={{ color: SOFT }}>
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              {d.rocks.length < 3 && (
                <>
                  <input value={rockFilter} onChange={(e) => setRockFilter(e.target.value)} placeholder="Find a quest…" aria-label="Find a quest" className={`${field} h-10`} style={fieldStyle} />
                  <ul className="m-0 flex max-h-[300px] list-none flex-col overflow-y-auto p-0">
                    {rockChoices
                      .filter((c) => !d.rocks.includes(c.id) && (!rockFilter.trim() || c.title.toLowerCase().includes(rockFilter.trim().toLowerCase())))
                      .slice(0, 40)
                      .map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => set({ rocks: [...d.rocks, c.id].slice(0, 3) })} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[15px] hover:bg-black/[.05]" style={{ color: INK }}>
                            <span aria-hidden style={{ color: "#8a6116" }}>◆</span>
                            <span className="min-w-0 flex-1 truncate">{c.title}</span>
                            {c.board && <span className="shrink-0 text-[12px]" style={{ color: SOFT }}>{c.board}</span>}
                          </button>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </>
          )}

          {step.key === "place" && (
            <>
              <p className="m-0 text-[13.5px]" style={{ color: SOFT }}>
                Your scheduling list is beside the calendar{d.rocks.length ? " — your big rocks are at the top" : ""}. On a phone, open it from the tab on the right edge.
              </p>
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <WeekView dayKeys={props.calendar.dayKeys} tasks={props.calendar.tasks} events={props.calendar.events} theme={theme} />
                </div>
                <SchedulingDrawer tasks={props.calendar.toSchedule} folders={props.calendar.folders} theme={theme} />
              </div>
            </>
          )}

          {step.key === "seal" && (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="font-display m-0 text-[22px]" style={{ color: INK }}>
                {sealed ? (kind === "week" ? "This week is sealed." : "This month is sealed.") : "Ready to seal it?"}
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14.5px]" style={{ color: INK }}>
                <li>
                  {d.seeds.filter((s) => s.made && s.made !== "dropped").length} things captured and sorted
                </li>
                {d.rocks.length > 0 && <li>{d.rocks.length} big rock{d.rocks.length === 1 ? "" : "s"} at the top of your scheduling list</li>}
                {(d.focus ?? []).map((f) => (
                  <li key={f.area}>
                    {f.area}: {f.from !== null ? `${f.from} → ` : "aim for "}
                    {f.target}
                    {f.quests.length ? ` · ${f.quests.length} quest${f.quests.length === 1 ? "" : "s"}` : ""}
                  </li>
                ))}
                {kind === "month" && d.outcomes.some((o) => o.trim()) && (
                  <li>Aiming for: {d.outcomes.filter((o) => o.trim()).join(" · ")}</li>
                )}
                {d.tryNext.trim() && <li>Trying next: {d.tryNext.trim()}</li>}
              </ul>
              {!sealed && (
                <button type="button" onClick={seal} disabled={pending} className="hover-glow h-12 rounded-full px-7 text-[16px] font-bold disabled:opacity-60" style={gold}>
                  {pending ? "Sealing…" : `Seal it · +${props.xp} XP`}
                </button>
              )}
              {sealed && (
                <Link href="/" className="h-11 rounded-full px-6 pt-[11px] text-[15px] font-bold" style={gold}>
                  On to today →
                </Link>
              )}
            </div>
          )}

          {error && (
            <p className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Back / next */}
        {step.key !== "seal" && (
          <div className="relative z-[1] flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={() => go(d.step - 1)} disabled={d.step === 0} className="h-10 rounded-full px-4 text-[14.5px] disabled:opacity-40" style={{ border: "1px solid #a58c66", color: INK }}>
              ← Back
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => (step.key === "sort" ? processSeeds(d.step + 1) : go(d.step + 1))}
              className="hover-glow h-10 rounded-full px-5 text-[14.5px] font-bold disabled:opacity-60"
              style={gold}
            >
              {pending ? "Saving…" : step.key === "sort" && toMake.length ? `Save ${toMake.length} & continue →` : "Next →"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-[110px] flex-col rounded-xl px-3 py-2" style={{ background: "rgba(255,250,235,.6)", border: "1px solid rgba(139,112,64,.35)" }}>
      <span className="font-display text-[24px] leading-none tabular-nums" style={{ color: INK }}>
        {value}
      </span>
      <span className="text-[12px]" style={{ color: SOFT }}>
        {label}
      </span>
    </span>
  );
}

function Prompt({ label, value, onChange, cls, style }: { label: string; value: string; onChange: (v: string) => void; cls: string; style: React.CSSProperties }) {
  return (
    <label className="flex flex-col gap-1 text-[14px] font-semibold" style={{ color: INK }}>
      {label}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} maxLength={1000} className={cls} style={style} />
    </label>
  );
}

/** The mind sweep: type, Enter, repeat — with a gentle nudge from the trigger list. */
function MindSweep({ seeds, onChange, cls, style }: { seeds: Seed[]; onChange: (s: Seed[]) => void; cls: string; style: React.CSSProperties }) {
  const [text, setText] = useState("");
  const [t, setT] = useState(0);
  function add() {
    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/^[\s•\-*]+/, "").trim())
      .filter(Boolean);
    if (!lines.length) return;
    onChange([...seeds, ...lines.map((l) => ({ id: newId(), text: l.slice(0, 140), fate: null }))]);
    setText("");
  }
  return (
    <>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(42,28,16,.08)" }}>
        <span aria-hidden className="text-[18px]">💭</span>
        <span className="min-w-0 flex-1 text-[14.5px] italic" style={{ color: INK }}>
          {TRIGGERS[t % TRIGGERS.length]}
        </span>
        <button type="button" onClick={() => setT((n) => n + 1)} className="h-8 shrink-0 rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid #a58c66", color: INK }}>
          Next nudge
        </button>
      </div>
      <div className="flex gap-2">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          rows={2}
          placeholder="Anything at all… (Enter adds it; paste a list to add many)"
          aria-label="Add to the mind sweep"
          className={cls}
          style={style}
        />
        <button type="button" onClick={add} disabled={!text.trim()} className="h-11 shrink-0 self-end rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
          Add
        </button>
      </div>
      {seeds.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {seeds.map((s) => (
            <li key={s.id} className="flex h-8 max-w-full items-center gap-1 rounded-full pl-3 pr-1 text-[13.5px]" style={{ background: "rgba(255,250,235,.75)", border: "1px solid rgba(139,112,64,.4)", color: INK, opacity: s.made ? 0.6 : 1 }}>
              <span className="truncate">{s.text}</span>
              {!s.made && (
                <button type="button" onClick={() => onChange(seeds.filter((x) => x.id !== s.id))} aria-label={`Remove “${s.text}”`} className="flex h-6 w-6 items-center justify-center rounded-full text-[15px] leading-none hover:bg-black/10" style={{ color: SOFT }}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 text-[13px]" style={{ color: SOFT }}>
        {seeds.length} captured. Don&apos;t judge or plan yet — just get it out of your head.
      </p>
    </>
  );
}

/** Stale, overdue or someday quests: decide on each, one tap. */
function ReviewList({ groups, reviewed, onDone, gold, someday = false }: { groups: { title: string; items: Lite[] }[]; reviewed: Record<string, string>; onDone: (id: string, choice: string) => void; gold: React.CSSProperties; someday?: boolean }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const choices: { k: "keep" | "schedule" | "someday" | "drop"; label: string }[] = someday
    ? [
        { k: "schedule", label: "📅 Bring it to life" },
        { k: "keep", label: "Keep dreaming" },
        { k: "drop", label: "Let it go" },
      ]
    : [
        { k: "keep", label: "Keep" },
        { k: "schedule", label: "📅 Schedule" },
        { k: "someday", label: "🌙 Someday" },
        { k: "drop", label: "Let it go" },
      ];
  const total = groups.reduce((n, g) => n + g.items.filter((i) => !reviewed[i.id]).length, 0);
  if (!total)
    return (
      <p className="m-0 text-[15px] italic" style={{ color: SOFT }}>
        All clear — nothing here needs a decision.
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      {groups.map(
        (g) =>
          g.items.some((i) => !reviewed[i.id]) && (
            <div key={g.title} className="flex flex-col gap-1.5">
              <p className="m-0 text-[13px] font-bold uppercase tracking-[.12em]" style={{ color: SOFT }}>
                {g.title}
              </p>
              {g.items
                .filter((i) => !reviewed[i.id])
                .map((i) => (
                  <div key={i.id} className="flex flex-col gap-1.5 rounded-xl px-3 py-2" style={{ background: "rgba(255,250,235,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
                    <span className="text-[15px] font-semibold" style={{ color: INK }}>
                      {i.title}
                      {i.board && <span className="ml-1.5 text-[12px] font-normal" style={{ color: SOFT }}>{i.board}</span>}
                      {i.due && <span className="ml-1.5 text-[12px] font-normal" style={{ color: "var(--t-warn)" }}>due {new Date(i.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {choices.map((c) => (
                        <button
                          key={c.k}
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            onDone(i.id, c.k);
                            start(async () => {
                              await reviewQuestAction(i.id, c.k).catch(() => null);
                              router.refresh();
                            });
                          }}
                          className="h-8 rounded-full px-3 text-[12.5px] font-semibold disabled:opacity-60"
                          style={c.k === "keep" ? { border: "1px solid rgba(139,112,64,.45)", color: INK } : c.k === "drop" ? { color: SOFT, textDecoration: "underline" } : gold}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )
      )}
    </div>
  );
}
