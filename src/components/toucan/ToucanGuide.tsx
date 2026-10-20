"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { askToucanAction, getQuestForEditAction, scheduleTaskAction, schedulerContextAction, setQuestEstimateAction, snoozeToucanAction, toucanWatchAction } from "@/app/actions";
import { neglected, type GuideTask, type Nudge } from "@/lib/toucan-guide";
import { SCHEDULER_DEFAULTS, planSchedule, type Busy, type SchedulerSettings } from "@/lib/auto-schedule";
import { openFocusMode } from "@/lib/focus-timer";
import { ToucanArt } from "./ToucanArt";

type PlanTarget = { id: string; title: string; estimate: number | null; dueAt: string | null };
type Msg = { role: "user" | "assistant"; content: string; quests?: { id: string; title: string }[] };

const NUDGE_DAY_KEY = "toucan-nudge-day";
const todayKey = () => new Date().toDateString();

/** Opens the toucan's guide sheet (optionally straight to planning one quest). */
export function talkToToucan(plan?: PlanTarget) {
  window.dispatchEvent(new CustomEvent("toucan-talk", { detail: plan ? { plan } : undefined }));
}

/**
 * The toucan as a guide. Once a day it raises the most important quest
 * that's slipping (due soon, not on the calendar, untouched), and you can
 * talk with it about your quests. Every suggestion leads down the same short
 * ladder: estimate it, give it a time, do it.
 */
export function ToucanGuide() {
  const pathname = usePathname();
  const [open, setOpen] = useState<{ plan: PlanTarget | null } | null>(null);
  const [fallback, setFallback] = useState<{ nudge: Nudge } | null>(null);

  useEffect(() => {
    const h = (e: Event) => setOpen({ plan: (e as CustomEvent<{ plan?: PlanTarget } | undefined>).detail?.plan ?? null });
    window.addEventListener("toucan-talk", h);
    return () => window.removeEventListener("toucan-talk", h);
  }, []);

  // Once a day, on Today, a little while after you arrive.
  useEffect(() => {
    if (pathname !== "/") return;
    try {
      if (window.localStorage.getItem(NUDGE_DAY_KEY) === todayKey()) return;
    } catch {
      return;
    }
    const t = setTimeout(async () => {
      const watch = await toucanWatchAction().catch(() => null);
      if (!watch) return;
      const top = neglected(watch.tasks as GuideTask[], new Date(), watch.snoozed, 1)[0];
      try {
        window.localStorage.setItem(NUDGE_DAY_KEY, todayKey());
      } catch {}
      if (!top) return;
      const plan = { id: top.id, title: top.title, estimate: top.estimate, dueAt: top.dueAt };
      const ev = new CustomEvent("toucan-nudge", {
        cancelable: true,
        detail: {
          text: `Psst… “${top.title}” ${top.why}. Shall we give it a time?`,
          actions: [
            { label: top.step === "estimate" ? "Estimate & plan" : "Plan it", run: () => talkToToucan(plan) },
            { label: "Not now", run: () => void snoozeToucanAction(top.id, 1).catch(() => {}) },
          ],
        },
      });
      // Not on screen (in its cage, or hiding)? Then a small note instead.
      if (window.dispatchEvent(ev)) setFallback({ nudge: top });
    }, 7000);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <>
      {fallback && (
        <NudgeNote
          nudge={fallback.nudge}
          onPlan={() => {
            const n = fallback.nudge;
            setFallback(null);
            setOpen({ plan: { id: n.id, title: n.title, estimate: n.estimate, dueAt: n.dueAt } });
          }}
          onLater={() => {
            void snoozeToucanAction(fallback.nudge.id, 1).catch(() => {});
            setFallback(null);
          }}
        />
      )}
      {open && <GuideSheet initialPlan={open.plan} onClose={() => setOpen(null)} />}
    </>
  );
}

function NudgeNote({ nudge, onPlan, onLater }: { nudge: Nudge; onPlan: () => void; onLater: () => void }) {
  return createPortal(
    <div role="status" className="card-pop-in fixed bottom-24 left-1/2 z-[58] flex w-[min(360px,calc(100vw-24px))] -translate-x-1/2 items-start gap-2.5 rounded-2xl p-3" style={{ background: "linear-gradient(180deg, rgba(14,38,40,.96), rgba(8,22,26,.98))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}>
      <span className="shrink-0">
        <ToucanArt size={40} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="m-0 text-[14px] leading-snug">
          Psst… “{nudge.title}” {nudge.why}. Shall we give it a time?
        </p>
        <span className="flex gap-1.5">
          <button type="button" onClick={onPlan} className="h-8 rounded-full px-3 text-[12.5px] font-bold" style={{ background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.6)" }}>
            Plan it
          </button>
          <button type="button" onClick={onLater} className="h-8 rounded-full px-3 text-[12.5px]" style={{ color: "rgba(232,255,248,.8)" }}>
            Not now
          </button>
        </span>
      </div>
    </div>,
    document.body
  );
}

const PROMPTS = ["What should I do next?", "What am I letting slip?", "Help me plan my homework this week", "What can I finish in 15 minutes?"];

function GuideSheet({ initialPlan, onClose }: { initialPlan: PlanTarget | null; onClose: () => void }) {
  const [plan, setPlan] = useState<PlanTarget | null>(initialPlan);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    toucanWatchAction()
      .then((w) => live && setNudges(neglected(w.tasks as GuideTask[], new Date(), w.snoozed, 3)))
      .catch(() => live && setNudges([]));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking, plan]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || thinking) return;
    setError(null);
    setText("");
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setThinking(true);
    try {
      const r = await askToucanAction(next.map(({ role, content }) => ({ role, content })));
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, quests: r.quests }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The toucan is lost in thought.");
    } finally {
      setThinking(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Talk with the toucan">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" style={{ background: "rgba(6,12,14,.45)" }} onClick={onClose} />
      {/* Sized to what's visible, so the keyboard never hides the box you type in. */}
      <section
        className="sheet-up absolute left-1/2 flex w-[min(460px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-3xl"
        style={{ top: "calc(var(--vv-top, 0px) + 8px)", height: "min(620px, calc(var(--vvh, 100dvh) - 16px))", background: "linear-gradient(180deg, #10302f, #0a1f22 60%, #081a1d)", border: "1.5px solid rgba(140,240,220,.45)", color: "#e8fff8", boxShadow: "0 18px 40px rgba(0,0,0,.55)" }}
      >
        <header className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-3">
          <ToucanArt size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display m-0 text-[18px]" style={{ color: "#bff7ea" }}>
              The Toucan
            </h2>
            <p className="m-0 text-[12px]" style={{ color: "rgba(232,255,248,.65)" }}>
              Estimate it · give it a time · do it
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-3">
          {plan ? (
            <PlanIt key={plan.id} quest={plan} onDone={() => setPlan(null)} />
          ) : (
            <>
              {nudges === null ? (
                <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
                  Looking over your quests…
                </p>
              ) : nudges.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="m-0 text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                    I&rsquo;ve been watching these
                  </p>
                  {nudges.map((n) => (
                    <div key={n.id} className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.25)" }}>
                      <span className="text-[14.5px] font-semibold leading-snug">{n.title}</span>
                      <span className="text-[12.5px]" style={{ color: "rgba(232,255,248,.7)" }}>
                        {n.why[0].toUpperCase() + n.why.slice(1).replace(/^is /, "Is ")}
                      </span>
                      <span className="flex gap-1.5">
                        <Pill onClick={() => setPlan({ id: n.id, title: n.title, estimate: n.estimate, dueAt: n.dueAt })} strong>
                          {n.step === "estimate" ? "Estimate & plan" : "Plan it"}
                        </Pill>
                        <Pill
                          onClick={() => {
                            void snoozeToucanAction(n.id, 2).catch(() => {});
                            setNudges((ns) => ns?.filter((x) => x.id !== n.id) ?? null);
                          }}
                        >
                          Not now
                        </Pill>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-[14px]" style={{ color: "rgba(232,255,248,.75)" }}>
                  Nothing important is slipping right now. A fine state of affairs.
                </p>
              )}

              {msgs.map((m, i) => (
                <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <p className="m-0 max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug" style={m.role === "user" ? { background: "rgba(242,210,126,.92)", color: "#2a1c10" } : { background: "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.25)" }}>
                    {m.content}
                  </p>
                  {m.quests?.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {m.quests.map((q) => (
                        <Pill key={q.id} strong onClick={() => setPlan({ id: q.id, title: q.title, estimate: null, dueAt: null })}>
                          Plan “{q.title.length > 26 ? `${q.title.slice(0, 25)}…` : q.title}”
                        </Pill>
                      ))}
                    </span>
                  ) : null}
                </div>
              ))}
              {thinking && (
                <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
                  The toucan ponders…
                </p>
              )}
              {error && (
                <p className="m-0 text-[13px] font-semibold" style={{ color: "#ffb4a8" }}>
                  {error}
                </p>
              )}
              {msgs.length === 0 && (
                <span className="flex flex-wrap gap-1.5">
                  {PROMPTS.map((p) => (
                    <Pill key={p} onClick={() => void ask(p)}>
                      {p}
                    </Pill>
                  ))}
                </span>
              )}
            </>
          )}
        </div>

        {!plan && (
          <form
            className="flex shrink-0 items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2"
            style={{ borderTop: "1px solid rgba(140,240,220,.2)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about your quests…"
              aria-label="Ask the toucan"
              className="bare-input h-11 min-w-0 flex-1 rounded-full px-4 text-[16px]"
              style={{ background: "rgba(232,255,248,.08)", border: "1px solid rgba(140,240,220,.35)", color: "#e8fff8" }}
            />
            <button type="submit" disabled={!text.trim() || thinking} className="h-11 shrink-0 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1.5px solid #4a3913" }}>
              Ask
            </button>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}

function Pill({ children, onClick, strong = false }: { children: React.ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="min-h-8 rounded-full px-3 py-1 text-left text-[12.5px] font-semibold leading-tight" style={strong ? { background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.6)", color: "#e8fff8" } : { border: "1px solid rgba(140,240,220,.3)", color: "rgba(232,255,248,.85)" }}>
      {children}
    </button>
  );
}

const MINUTES = [15, 30, 45, 60, 90, 120, 180];
const slotLabel = (d: Date, e: Date) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === tomorrow.toDateString() ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (x: Date) => x.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(d)}–${t(e)}`;
};
function hiddenCalendars(): string[] {
  try {
    const raw = window.localStorage.getItem("calendar-layers");
    return raw ? ((JSON.parse(raw) as { hidden?: string[] }).hidden ?? []) : [];
  } catch {
    return [];
  }
}

/** The ladder for one quest: how long → when → (now, or later). */
function PlanIt({ quest, onDone }: { quest: PlanTarget; onDone: () => void }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<number | null>(quest.estimate);
  const [stage, setStage] = useState<"estimate" | "when" | "placed">(quest.estimate ? "when" : "estimate");
  const [slots, setSlots] = useState<{ start: Date; end: Date }[] | null>(null);
  const [placed, setPlaced] = useState<{ start: Date; end: Date } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== "when" || !minutes) return;
    let live = true;
    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 15);
    schedulerContextAction(now.toISOString(), to.toISOString(), hiddenCalendars())
      .then((ctx) => {
        if (!live) return;
        const settings: SchedulerSettings = { ...SCHEDULER_DEFAULTS, ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) };
        const blocking: Busy[] = [...ctx.busy];
        const found: { start: Date; end: Date }[] = [];
        // The first three free stretches that suit it, each after the last.
        for (let k = 0; k < 3; k++) {
          const r = planSchedule([{ id: quest.id, title: quest.title, minutes, dueAt: quest.dueAt }], blocking, settings, now);
          const p = r.placed[0];
          if (!p) break;
          found.push({ start: p.start, end: p.end });
          // Block that stretch plus the rest of its half-day, so the next option is a real alternative.
          blocking.push({ start: p.start.getTime(), end: p.end.getTime() + 3 * 3_600_000 });
        }
        setSlots(found);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read your calendar."));
    return () => {
      live = false;
    };
  }, [stage, minutes, quest.id, quest.title, quest.dueAt]);

  async function choose(m: number) {
    setMinutes(m);
    setError(null);
    setStage("when");
    setSlots(null);
    if (m !== quest.estimate) void setQuestEstimateAction(quest.id, m).catch(() => {});
  }
  async function place(s: { start: Date; end: Date }) {
    setBusy(true);
    setError(null);
    try {
      await scheduleTaskAction(quest.id, s.start.toISOString(), s.end.toISOString());
      setPlaced(s);
      setStage("placed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't put it on the calendar.");
    } finally {
      setBusy(false);
    }
  }
  async function startNow() {
    const t = await getQuestForEditAction(quest.id).catch(() => null);
    if (t) openFocusMode(minutes ? { ...t, estimate_minutes: minutes } : t);
    onDone();
  }

  const rung = (n: number, label: string, on: boolean, done: boolean) => (
    <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: on ? "#bff7ea" : done ? "rgba(140,240,220,.75)" : "rgba(232,255,248,.4)" }}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]" style={{ background: done ? "rgba(140,240,220,.85)" : on ? "rgba(140,240,220,.25)" : "transparent", color: done ? "#08241f" : undefined, border: "1px solid rgba(140,240,220,.5)" }}>
        {done ? "✓" : n}
      </span>
      {label}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onDone} className="self-start text-[13px] underline underline-offset-2" style={{ color: "rgba(232,255,248,.7)" }}>
        ← Back
      </button>
      <h3 className="font-display m-0 text-[19px] leading-snug" style={{ color: "#e8fff8" }}>
        {quest.title}
      </h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {rung(1, "Estimate", stage === "estimate", stage !== "estimate")}
        {rung(2, "Give it a time", stage === "when", stage === "placed")}
        {rung(3, "Do it", stage === "placed", false)}
      </div>

      {stage === "estimate" && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14.5px]">How long will it take, roughly? A guess is fine.</p>
          <span className="flex flex-wrap gap-1.5">
            {MINUTES.map((m) => (
              <Pill key={m} strong={minutes === m} onClick={() => void choose(m)}>
                {m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? "hour" : "hours"}`}
              </Pill>
            ))}
          </span>
        </div>
      )}

      {stage === "when" && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14.5px]">
            {minutes} minutes.{" "}
            <button type="button" onClick={() => setStage("estimate")} className="underline underline-offset-2" style={{ color: "rgba(232,255,248,.7)" }}>
              Change
            </button>{" "}
            Here&rsquo;s free time that fits:
          </p>
          {slots === null && !error && (
            <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
              Looking at your calendar…
            </p>
          )}
          {slots?.length === 0 && <p className="m-0 text-[14px]">I couldn&rsquo;t find a free stretch in the next two weeks. Try a shorter estimate, or start a piece of it now.</p>}
          {slots?.map((s) => (
            <button key={s.start.toISOString()} type="button" disabled={busy} onClick={() => void place(s)} className="flex min-h-11 items-center justify-between rounded-2xl px-3.5 text-left text-[14.5px] font-semibold disabled:opacity-60" style={{ background: "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.4)" }}>
              {slotLabel(s.start, s.end)}
              <span className="text-[12.5px] font-bold" style={{ color: "#bff7ea" }}>
                Put it here →
              </span>
            </button>
          ))}
          <Pill onClick={() => void startNow()}>Or just start now</Pill>
        </div>
      )}

      {stage === "placed" && placed && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[15px] leading-snug">
            On your calendar: <b>{slotLabel(placed.start, placed.end)}</b>. When the time comes, open it and begin; I&rsquo;ll be perched nearby.
          </p>
          <span className="flex flex-wrap gap-1.5">
            <Pill strong onClick={() => void startNow()}>
              Start it now instead
            </Pill>
            <Pill onClick={onDone}>Done</Pill>
          </span>
        </div>
      )}

      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "#ffb4a8" }}>
          {error}
        </p>
      )}
    </div>
  );
}
