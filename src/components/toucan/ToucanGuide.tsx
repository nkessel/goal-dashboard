"use client";

import { useEffect, useRef, useState } from "react";
import { FLOURISHES, readFlourish, saveFlourish, type Flourish } from "@/lib/toucan-flourish";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  applyAutoScheduleAction,
  applyCatchUpAction,
  coachAction,
  coachAddStepsAction,
  coachClearAction,
  coachForgetAction,
  coachNewQuestAction,
  coachPromiseAction,
  coachStateAction,
  courseworkAction,
  addJournalEntryAction,
  getQuestForEditAction,
  scheduleTaskAction,
  schedulerContextAction,
  setQuestEstimateAction,
  snoozeToucanAction,
  toucanWatchAction,
  toucanPrefsAction,
} from "@/app/actions";
import { setRetiredLines } from "@/lib/toucan-lines";
import { useSyncExternalStore } from "react";
import { neglected, type GuideTask, type Nudge } from "@/lib/toucan-guide";
import type { CoachAction, CoachNote, CoachPromise } from "@/lib/coach";
import { AHEAD_DAYS, catchUpOrder, catchUpPlan, looksLikeCourse, type CourseItem } from "@/lib/catch-up";
import { SCHEDULER_DEFAULTS, planSchedule, type Busy, type SchedulerSettings } from "@/lib/auto-schedule";
import { openFocusMode } from "@/lib/focus-timer";
import { GearIcon } from "@/components/ui/Icons";
import { ToucanArt } from "./ToucanArt";

type PlanTarget = { id: string; title: string; estimate: number | null; dueAt: string | null };
type Msg = { role: "user" | "assistant"; content: string; actions?: CoachAction[]; remembered?: CoachNote[] };
type Mode = "talk" | "catchup";

const NUDGE_DAY_KEY = "toucan-nudge-day";
const todayKey = () => new Date().toDateString();

type GuideMode = "simple" | "lite" | "full";
const readMode = (): GuideMode => {
  try {
    const v = window.localStorage.getItem("toucan-mode");
    return v === "simple" || v === "lite" ? v : "full";
  } catch {
    return "full";
  }
};
const subscribeMode = (cb: () => void) => {
  window.addEventListener("toucan-mode", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("toucan-mode", cb);
    window.removeEventListener("storage", cb);
  };
};
/** How much the toucan does: simple, a light guide, or the full guide (Settings › Toucan Spirit). */
export function useToucanMode(): GuideMode {
  return useSyncExternalStore(subscribeMode, readMode, () => "full" as const);
}

/** Opens the toucan's guide sheet (optionally straight to planning one quest, or to the coursework catch-up). */
export function talkToToucan(plan?: PlanTarget, mode: Mode = "talk", say?: string) {
  window.dispatchEvent(new CustomEvent("toucan-talk", { detail: { plan, mode, say } }));
}

/**
 * The toucan as a guide. Once a day it raises the most important quest
 * that's slipping (due soon, not on the calendar, untouched), and you can
 * talk with it about your quests. Every suggestion leads down the same short
 * ladder: estimate it, give it a time, do it.
 */
export function ToucanGuide() {
  const pathname = usePathname();
  const mode = useToucanMode();
  // Your choices (mode, switched-off lines) come along from your account.
  useEffect(() => {
    toucanPrefsAction()
      .then((p) => {
        try {
          if (window.localStorage.getItem("toucan-mode") !== p.mode) {
            window.localStorage.setItem("toucan-mode", p.mode);
            window.dispatchEvent(new Event("toucan-mode"));
          }
        } catch {}
        setRetiredLines(p.retired);
      })
      .catch(() => {});
  }, []);
  const [open, setOpen] = useState<{ plan: PlanTarget | null; mode: Mode; say?: string; n?: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [fallback, setFallback] = useState<{ nudge: Nudge } | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ plan?: PlanTarget; mode?: Mode; say?: string } | undefined>).detail;
      setMinimized(false);
      // A plain "talk" while minimized just brings the same conversation back.
      setOpen((cur) => (cur && !d?.plan && !d?.say && (d?.mode ?? "talk") === "talk" ? cur : { plan: d?.plan ?? null, mode: d?.mode ?? "talk", say: d?.say, n: Date.now() }));
    };
    window.addEventListener("toucan-talk", h);
    return () => window.removeEventListener("toucan-talk", h);
  }, []);

  // On Today, a little while after you arrive: a reminder first (each one once a
  // day), otherwise, once a day, a quest that's been waiting.
  useEffect(() => {
    // Reminders you asked for come up in every mode; the daily nudge stays out of the simple one.
    if (pathname !== "/") return;
    const t = setTimeout(async () => {
      const watch = await toucanWatchAction().catch(() => null);
      if (!watch) return;
      const day = todayKey();
      const shown = (id: string) => {
        try {
          return window.localStorage.getItem(`toucan-reminded:${id}`) === day;
        } catch {
          return true;
        }
      };
      const mark = (id: string) => {
        try {
          window.localStorage.setItem(`toucan-reminded:${id}`, day);
        } catch {}
      };
      const done = (p: CoachPromise) => ({ label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: p.id, status: "kept" } }).then(() => window.dispatchEvent(new Event("toucan-promises"))).catch(() => {}) });
      const later = { label: "Later", run: () => {} };
      const say = (text: string, actions: { label: string; run: () => void }[]) => window.dispatchEvent(new CustomEvent("toucan-nudge", { cancelable: true, detail: { text, actions } }));
      // "Next time" reminders whose calendar event is near.
      const near = (watch.nextNear as { promise: CoachPromise; event: { title: string; start: string } }[]).find((n) => !shown(n.promise.id));
      if (near) {
        mark(near.promise.id);
        const start = Date.parse(near.event.start);
        const whenText = start <= Date.now() ? "now" : `at ${new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${new Date(start).toDateString() === new Date().toDateString() ? "" : " tomorrow"}`;
        say(`“${near.event.title}” is ${whenText}. Remember: ${near.promise.text}`, [done(near.promise), later]);
        return;
      }
      // Reminders with no time: kept in mind, brought up once a day.
      const standing = (watch.standing as CoachPromise[]).filter((p) => !shown(p.id));
      if (standing.length) {
        standing.forEach((p) => mark(p.id));
        const [first, ...rest] = standing;
        say(`Don't forget: ${first.text}${rest.length ? ` (and ${rest.length} more: ${rest.map((p) => p.text).join("; ")})` : ""}`, [done(first), later]);
        return;
      }
      if (mode === "simple") return;
      try {
        if (window.localStorage.getItem(NUDGE_DAY_KEY) === day) return;
        window.localStorage.setItem(NUDGE_DAY_KEY, day);
      } catch {
        return;
      }
      // A promise whose time has passed comes first: how did it go?
      const owed = watch.due[0] as CoachPromise | undefined;
      if (owed) {
        window.dispatchEvent(
          new CustomEvent("toucan-nudge", {
            cancelable: true,
            detail: {
              text: `Earlier you promised: “${owed.text}”. How did it go?`,
              actions: [
                { label: "I did it ✓", run: () => void coachPromiseAction({ settle: { id: owed.id, status: "kept" } }).catch(() => {}) },
                { label: "Not yet", run: () => talkToToucan(undefined, "talk", `I didn't get to my promise: "${owed.text}".`) },
              ],
            },
          })
        );
        return;
      }
      const top = neglected(watch.tasks as GuideTask[], new Date(), watch.snoozed, 1)[0];
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
  }, [pathname, mode]);

  // Promises with a time: when it comes, the toucan says so.
  useEffect(() => {
    if (mode !== "full") return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let live = true;
    const arm = async () => {
      const w = await toucanWatchAction().catch(() => null);
      if (!live || !w) return;
      timers.forEach(clearTimeout);
      timers = [];
      for (const p of w.promises as CoachPromise[]) {
        if (!p.due) continue;
        const ms = Date.parse(p.due) - Date.now();
        if (ms < -5 * 60_000 || ms > 12 * 3_600_000) continue;
        timers.push(
          setTimeout(() => {
            const unseen = window.dispatchEvent(
              new CustomEvent("toucan-nudge", {
                cancelable: true,
                detail: {
                  text: `It's time: “${p.text}”. Shall we begin together?`,
                  actions: [
                    { label: "Begin", run: () => void beginPromise(p) },
                    { label: "In 15 min", run: () => void coachPromiseAction({ push: { id: p.id, minutes: 15 } }).then(arm).catch(() => {}) },
                    { label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: p.id, status: "kept" } }).catch(() => {}) },
                  ],
                },
              })
            );
            if (unseen) talkToToucan(undefined, "talk");
          }, Math.max(0, ms))
        );
      }
      // "Next time": when the event starts, the toucan says so.
      for (const n of (w.nextNear ?? []) as { promise: CoachPromise; event: { title: string; start: string } }[]) {
        const ms = Date.parse(n.event.start) - Date.now();
        if (ms <= 0 || ms > 12 * 3_600_000) continue;
        timers.push(
          setTimeout(() => {
            const unseen = window.dispatchEvent(
              new CustomEvent("toucan-nudge", {
                cancelable: true,
                detail: {
                  text: `“${n.event.title}” is starting. Remember: ${n.promise.text}`,
                  actions: [
                    { label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: n.promise.id, status: "kept" } }).then(arm).catch(() => {}) },
                    { label: "Later", run: () => {} },
                  ],
                },
              })
            );
            if (unseen) talkToToucan(undefined, "talk");
          }, ms)
        );
      }
    };
    void arm();
    const rearm = () => void arm();
    window.addEventListener("toucan-promises", rearm);
    return () => {
      live = false;
      timers.forEach(clearTimeout);
      window.removeEventListener("toucan-promises", rearm);
    };
  }, [mode]);

  return (
    <>
      {fallback && (
        <NudgeNote
          nudge={fallback.nudge}
          onPlan={() => {
            const n = fallback.nudge;
            setFallback(null);
            setOpen({ plan: { id: n.id, title: n.title, estimate: n.estimate, dueAt: n.dueAt }, mode: "talk" });
          }}
          onLater={() => {
            void snoozeToucanAction(fallback.nudge.id, 1).catch(() => {});
            setFallback(null);
          }}
        />
      )}
      {open && (mode !== "simple" || open.mode === "catchup" || open.plan) && (
        <GuideSheet
          key={open.n}
          lite={mode !== "full"}
          initialPlan={open.plan}
          initialMode={open.mode}
          initialSay={open.say}
          hidden={minimized}
          onMinimize={() => setMinimized(true)}
          onClose={() => {
            setOpen(null);
            setMinimized(false);
          }}
        />
      )}
      {open && minimized && (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="card-pop-in fixed bottom-[88px] left-3 z-[58] flex h-11 items-center gap-1.5 rounded-full pl-1.5 pr-3.5 text-[13.5px] font-semibold"
          style={{ background: "linear-gradient(180deg, #10302f, #0a1f22)", border: "1.5px solid rgba(140,240,220,.5)", color: "#bff7ea", boxShadow: "0 6px 16px rgba(0,0,0,.45)" }}
        >
          <ToucanArt size={30} />
          Continue talking
        </button>
      )}
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

/** Begin a promise: its quest in focus mode if it has one, otherwise a word with the toucan. */
async function beginPromise(p: CoachPromise) {
  void coachPromiseAction({ settle: { id: p.id, status: "kept" } }).catch(() => {});
  if (p.questId) {
    const t = await getQuestForEditAction(p.questId).catch(() => null);
    if (t) return openFocusMode(t);
  }
  talkToToucan(undefined, "talk", `I'm beginning: "${p.text}". Help me take the first step.`);
}

const PROMPTS: { label: string; say?: string; mode?: Mode }[] = [
  { label: "📚 Get me up to date on my courses", mode: "catchup" },
  { label: "What matters most today?" },
  { label: "I'm overwhelmed", say: "I'm feeling overwhelmed. Everything feels like too much." },
  { label: "Help me start something", say: "I want to get started on something but I can't seem to begin." },
  { label: "I keep avoiding something", say: "There's something I keep avoiding." },
  { label: "Evening reflection", say: "Let's reflect on my day." },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

function GuideSheet({
  initialPlan,
  initialMode,
  initialSay,
  onClose,
  onMinimize,
  hidden = false,
  lite = false,
}: {
  initialPlan: PlanTarget | null;
  initialMode: Mode;
  initialSay?: string;
  onClose: () => void;
  onMinimize: () => void;
  /** Minimized: kept (with the conversation) but out of sight. */
  hidden?: boolean;
  lite?: boolean;
}) {
  const [plan, setPlan] = useState<PlanTarget | null>(initialPlan);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [nudges, setNudges] = useState<Nudge[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [promises, setPromises] = useState<CoachPromise[]>([]);
  const [due, setDue] = useState<CoachPromise[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [showLook, setShowLook] = useState(false);
  const [flourish, setFl] = useState<Flourish>(() => (typeof window === "undefined" ? "glow" : readFlourish()));
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const said = useRef(false);

  useEffect(() => {
    let live = true;
    toucanWatchAction()
      .then((w) => live && setNudges(neglected(w.tasks as GuideTask[], new Date(), w.snoozed, 3)))
      .catch(() => live && setNudges([]));
    if (!lite) coachStateAction()
      .then((c) => {
        if (!live) return;
        setMsgs(c.history.slice(-12).map((m) => ({ role: m.role, content: m.content })));
        setNotes(c.notes);
        setPromises(c.promises);
        setDue(c.due);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (hidden) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose, hidden]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking, plan]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || thinking) return;
    setError(null);
    setText("");
    setMode("talk");
    setPlan(null);
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setThinking(true);
    try {
      const r = await coachAction(question, lite, lite ? msgs.map(({ role, content }) => ({ role, content })) : []);
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, actions: r.actions, remembered: r.remembered }]);
      if (r.remembered.length) setNotes((n) => [...n, ...r.remembered]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The toucan is lost in thought.");
    } finally {
      setThinking(false);
    }
  }
  // Opened with something to say (e.g. "Not yet" on a promise).
  useEffect(() => {
    if (initialSay && !said.current) {
      said.current = true;
      void ask(initialSay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  async function settle(p: CoachPromise, status: "kept" | "missed" | "released") {
    setDue((d) => d.filter((x) => x.id !== p.id));
    setPromises((ps) => ps.filter((x) => x.id !== p.id));
    await coachPromiseAction({ settle: { id: p.id, status } }).catch(() => {});
    window.dispatchEvent(new Event("toucan-promises"));
    if (status === "kept") setMsgs((m) => [...m, { role: "assistant", content: `You kept your word: “${p.text}”. That is how a path is made, one honest step at a time. ✦` }]);
    if (status === "missed") void ask(`I didn't keep my promise: "${p.text}".`);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Talk with the Great Toucan Spirit" hidden={hidden}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" style={{ background: "rgba(6,12,14,.45)" }} onClick={onClose} />
      {/* Sized to what's visible, so the keyboard never hides the box you type in. */}
      <section
        className="sheet-up absolute left-1/2 flex w-[min(460px,calc(100vw-16px))] -translate-x-1/2 flex-col overflow-hidden rounded-3xl"
        style={{ top: "calc(var(--vv-top, 0px) + max(8px, (var(--vvh, 100dvh) - 640px) / 2))", height: "min(640px, calc(var(--vvh, 100dvh) - 28px))", background: "linear-gradient(180deg, #10302f, #0a1f22 60%, #081a1d)", border: "1.5px solid rgba(140,240,220,.45)", color: "#e8fff8", boxShadow: "0 18px 40px rgba(0,0,0,.55)" }}
      >
        <header className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-3">
          <ToucanArt size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display m-0 text-[18px] leading-tight" style={{ color: "#bff7ea" }}>
              The Great Toucan Spirit
            </h2>
            <p className="m-0 truncate text-[12px]" style={{ color: "rgba(232,255,248,.65)" }}>
              {mode === "catchup" ? "Coming up first, then catching up from the beginning" : "Here for the whole of you, and the next small step"}
            </p>
          </div>
          {!lite && (
            <button type="button" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes} title="What I remember" className="flex h-9 w-9 items-center justify-center rounded-full text-[16px] hover:bg-white/10">
              🪶
            </button>
          )}
          <button type="button" onClick={() => setShowLook((v) => !v)} aria-expanded={showLook} title="How I move" aria-label="How the toucan moves" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" style={{ color: "rgba(232,255,248,.75)" }}>
            <GearIcon size={17} />
          </button>
          {/* Minimize keeps the conversation; the small toucan pill brings it back. */}
          <button type="button" onClick={onMinimize} aria-label="Minimize" title="Minimize" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" style={{ color: "rgba(232,255,248,.75)" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 18h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-3">
          {showLook && (
            <div className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.25)" }}>
              <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                When I share wisdom, I…
              </span>
              <div role="radiogroup" aria-label="How the toucan moves" className="grid grid-cols-2 gap-1.5">
                {FLOURISHES.map((f) => {
                  const on = flourish === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setFl(f.key);
                        saveFlourish(f.key);
                      }}
                      className="flex flex-col items-start rounded-xl px-2.5 py-1.5 text-left"
                      style={on ? { background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.7)" } : { border: "1px solid rgba(140,240,220,.2)" }}
                    >
                      <span className="text-[13.5px] font-bold">{f.label}</span>
                      <span className="text-[11.5px] leading-snug" style={{ color: "rgba(232,255,248,.65)" }}>
                        {f.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[12px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
                Tap me on my perch to see it.
              </span>
            </div>
          )}
          {showNotes && (
            <div className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.25)" }}>
              <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                What I remember about you
              </span>
              {notes.length === 0 && <span className="text-[13px] italic" style={{ color: "rgba(232,255,248,.6)" }}>Nothing yet. I&rsquo;ll keep what you tell me matters (you can remove anything).</span>}
              {notes.map((n) => (
                <span key={n.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                  <span className="flex-1">{n.text}</span>
                  <button type="button" aria-label="Forget this" title="Forget this" onClick={() => (setNotes((x) => x.filter((y) => y.id !== n.id)), void coachForgetAction(n.id).catch(() => {}))} className="shrink-0 px-1 opacity-70 hover:opacity-100">
                    ×
                  </button>
                </span>
              ))}
              {promises.length > 0 && (
                <>
                  <span className="mt-1 text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.8)" }}>
                    Reminders &amp; promises
                  </span>
                  {promises.map((p) => (
                    <span key={p.id} className="flex items-start gap-2 text-[13.5px] leading-snug">
                      <span className="flex-1">
                        {p.text}
                        {(p.due || p.next) && <span style={{ color: "rgba(232,255,248,.6)" }}> · {p.due ? when(p.due) : `next time: ${p.next}`}</span>}
                      </span>
                      <button type="button" onClick={() => void settle(p, "kept")} className="shrink-0 text-[12px] underline">
                        Done
                      </button>
                      <button type="button" onClick={() => void settle(p, "released")} className="shrink-0 text-[12px] underline opacity-70">
                        Let go
                      </button>
                    </span>
                  ))}
                </>
              )}
              {msgs.length > 0 && (
                <button type="button" onClick={() => (setMsgs([]), void coachClearAction().catch(() => {}))} className="mt-1 self-start text-[12.5px] underline" style={{ color: "rgba(232,255,248,.7)" }}>
                  Start our conversation fresh
                </button>
              )}
            </div>
          )}

          {plan ? (
            <PlanIt key={plan.id} quest={plan} onDone={() => setPlan(null)} />
          ) : mode === "catchup" ? (
            <CatchUpPlanner onBack={() => setMode("talk")} onAsk={(q) => void ask(q)} />
          ) : (
            <>
              {due.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(242,210,126,.1)", border: "1px solid rgba(242,210,126,.45)" }}>
                  <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "#f2d27e" }}>
                    You promised
                  </span>
                  <span className="text-[14.5px] leading-snug">
                    {p.text}
                    {p.due && <span style={{ color: "rgba(232,255,248,.6)" }}> · {when(p.due)}</span>}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Pill strong onClick={() => void settle(p, "kept")}>
                      I did it ✓
                    </Pill>
                    <Pill onClick={() => void settle(p, "missed")}>Not yet</Pill>
                    <Pill onClick={() => void settle(p, "released")}>Let it go</Pill>
                  </span>
                </div>
              ))}

              {msgs.length === 0 &&
                (nudges === null ? (
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
                          {n.why[0].toUpperCase() + n.why.slice(1)}
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
                    Nothing important is slipping right now. A fine state of affairs. What&rsquo;s alive in you?
                  </p>
                ))}

              {msgs.map((m, i) => (
                <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <p className="m-0 max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug" style={m.role === "user" ? { background: "rgba(242,210,126,.92)", color: "#2a1c10" } : { background: "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.25)" }}>
                    {m.content}
                  </p>
                  {m.remembered?.map((n) => (
                    <span key={n.id} className="text-[12px] italic" style={{ color: "rgba(140,240,220,.8)" }}>
                      🪶 I&rsquo;ll remember: {n.text}{" "}
                      <button type="button" className="underline" onClick={() => (setNotes((x) => x.filter((y) => y.id !== n.id)), void coachForgetAction(n.id).catch(() => {}), setMsgs((ms) => ms.map((mm) => (mm === m ? { ...mm, remembered: mm.remembered?.filter((r) => r.id !== n.id) } : mm))))}>
                        Forget
                      </button>
                    </span>
                  ))}
                  {m.actions?.map((a, k) => <ActionCard key={k} action={a} onPlan={setPlan} onPromise={(p) => setPromises((ps) => [...ps, p])} />)}
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
              {!thinking && (
                <span className="flex flex-wrap gap-1.5">
                  {PROMPTS.filter((p) => msgs.length === 0 || p.mode === "catchup").map((p) => (
                    <Pill key={p.label} onClick={() => (p.mode ? setMode(p.mode) : void ask(p.say ?? p.label))}>
                      {p.label}
                    </Pill>
                  ))}
                </span>
              )}
            </>
          )}
        </div>

        {!plan && mode === "talk" && (
          <form
            className="flex shrink-0 items-center gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5"
            style={{ borderTop: "1px solid rgba(140,240,220,.2)" }}
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell me what's on your mind…"
              aria-label="Talk with the toucan"
              className="bare-input h-11 min-w-0 flex-1 rounded-full px-4 text-[16px]"
              style={{ background: "rgba(232,255,248,.08)", border: "1px solid rgba(140,240,220,.35)", color: "#e8fff8" }}
            />
            <button type="submit" disabled={!text.trim() || thinking} className="h-11 shrink-0 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1.5px solid #4a3913" }}>
              Send
            </button>
          </form>
        )}
      </section>
    </div>,
    document.body
  );
}

/** One thing the toucan offers to do: nothing happens until you tap it. */
function ActionCard({ action: a, onPlan, onPromise }: { action: CoachAction; onPlan: (p: PlanTarget) => void; onPromise: (p: CoachPromise) => void }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, done: string) {
    setState("busy");
    try {
      await fn();
      setState("done");
      setMsg(done);
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  const box = { background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.3)" };
  const doneLine = state === "done" || state === "error" ? (
    <span className="text-[12.5px]" style={{ color: state === "done" ? "#bff7ea" : "#ffb4a8" }}>
      {msg}
    </span>
  ) : null;
  if (a.type === "plan")
    return (
      <Pill strong onClick={() => onPlan({ id: a.questId, title: a.quest, estimate: null, dueAt: null })}>
        Plan “{a.quest.length > 30 ? `${a.quest.slice(0, 29)}…` : a.quest}”
      </Pill>
    );
  if (a.type === "start")
    return (
      <Pill
        strong
        onClick={async () => {
          const t = await getQuestForEditAction(a.questId).catch(() => null);
          if (t) openFocusMode({ ...t, estimate_minutes: a.minutes });
        }}
      >
        ▶ Begin “{a.quest.length > 24 ? `${a.quest.slice(0, 23)}…` : a.quest}” together · {a.minutes} min
      </Pill>
    );
  if (a.type === "steps")
    return (
      <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={box}>
        <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(140,240,220,.85)" }}>
          Steps for “{a.quest}”
        </span>
        <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-5 text-[13.5px] leading-snug">
          {a.steps.map((st) => (
            <li key={st}>{st}</li>
          ))}
        </ol>
        {state === "idle" || state === "busy" ? (
          <Pill strong onClick={() => void run(() => coachAddStepsAction(a.questId, a.steps), "Added to the quest ✓")}>
            {state === "busy" ? "Adding…" : "Add these steps"}
          </Pill>
        ) : (
          doneLine
        )}
      </div>
    );
  if (a.type === "promise")
    return (
      <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={{ ...box, border: "1px solid rgba(242,210,126,.45)" }}>
        <span className="text-[14px] leading-snug">
          “{a.text}”
          <span style={{ color: "rgba(232,255,248,.6)" }}> · {a.when ? when(a.when) : a.next ? `next time: ${a.next}` : "I'll bring it up when you open the app"}</span>
        </span>
        {state === "idle" || state === "busy" ? (
          <Pill
            strong
            onClick={() =>
              void run(async () => {
                const list = await coachPromiseAction({ add: { text: a.text, when: a.when ? new Date(a.when).toISOString() : null, next: a.next, questId: a.questId } });
                const added = list[list.length - 1];
                if (added) onPromise(added);
                window.dispatchEvent(new Event("toucan-promises"));
              }, a.when ? "Saved. I'll remind you when it's time ✓" : a.next ? `Saved. I'll remind you next time you see ${a.next} ✓` : "Saved. I'll keep it in mind ✓")
            }
          >
            {/^when\b/i.test(a.text) ? "Make this promise" : "🔔 Remind me"}
          </Pill>
        ) : (
          doneLine
        )}
      </div>
    );
  if (a.type === "newquest")
    return state === "done" || state === "error" ? (
      doneLine
    ) : (
      <Pill strong onClick={() => void run(() => coachNewQuestAction(a.title, a.minutes), `Added “${a.title}” to your quests ✓`)}>
        ＋ Add quest “{a.title.length > 28 ? `${a.title.slice(0, 27)}…` : a.title}”
      </Pill>
    );
  if (a.type === "journal")
    return state === "done" || state === "error" ? (
      doneLine
    ) : (
      <Pill onClick={() => void run(() => addJournalEntryAction(a.text, null, "expression"), "Saved to your journal ✓")}>📖 Save this to my journal</Pill>
    );
  return null;
}

/**
 * Getting up to date: pick the course boards, and the plan lays them out:
 * what's coming up first (get ahead), then what was missed, from the
 * beginning. Use it to put that order on your scheduling list, then find time.
 */
function CatchUpPlanner({ onBack, onAsk }: { onBack: () => void; onAsk: (q: string) => void }) {
  const router = useRouter();
  type Item = CourseItem & { scheduled_start: string | null };
  const [data, setData] = useState<{ boards: { id: string; title: string; dated: number }[]; items: Item[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [est, setEst] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<"plan" | "applied" | "placed">("plan");
  const [proposal, setProposal] = useState<{ id: string; title: string; start: Date; end: Date }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    courseworkAction()
      .then((d) => {
        setData({ boards: d.boards, items: d.items as Item[] });
        setChosen(new Set(d.chosen?.length ? d.chosen : d.boards.filter((b) => looksLikeCourse(b.dated)).map((b) => b.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't read your quests."));
  }, []);

  const items = (data?.items ?? []).filter((i) => i.board_id && chosen.has(i.board_id));
  const plan = catchUpPlan(items, now);
  const order = catchUpOrder(plan);
  const minutes = (i: Item) => est[i.id] ?? i.estimate_minutes ?? 60;
  const total = (list: Item[]) => list.reduce((n, i) => n + minutes(i), 0);
  const hrs = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);
  const cycle = (i: Item) => {
    const steps = [30, 45, 60, 90, 120, 180];
    const cur = minutes(i);
    setEst((e) => ({ ...e, [i.id]: steps[(steps.indexOf(cur) + 1) % steps.length] ?? 60 }));
  };
  const fmtDue = (iso: string) => {
    const d = new Date(iso);
    const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
    const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return days < 0 ? `was due ${day}` : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due ${day}`;
  };

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await applyCatchUpAction([...chosen], order.map((i) => i.id), Object.fromEntries(order.map((i) => [i.id, minutes(i)])));
      setStage("applied");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the plan.");
    } finally {
      setBusy(false);
    }
  }
  async function findTime() {
    setBusy(true);
    setError(null);
    try {
      const to = new Date(now);
      to.setDate(to.getDate() + SCHEDULER_DEFAULTS.horizon + 1);
      const ctx = await schedulerContextAction(now.toISOString(), to.toISOString(), hiddenCalendars());
      const settings: SchedulerSettings = { ...SCHEDULER_DEFAULTS, ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) };
      // Coming up first, then the oldest missed ones; already-scheduled ones keep their time.
      const want = order.filter((i) => !(i.scheduled_start && Date.parse(i.scheduled_start) > now.getTime())).slice(0, 10);
      const r = planSchedule(want.map((i) => ({ id: i.id, title: i.title, minutes: minutes(i), dueAt: Date.parse(i.due_at ?? "") > now.getTime() ? i.due_at : null })), ctx.busy, settings, now);
      setProposal(r.placed.map((p) => ({ id: p.id, title: p.title, start: p.start, end: p.end })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read your calendar.");
    } finally {
      setBusy(false);
    }
  }
  async function place() {
    if (!proposal?.length) return;
    setBusy(true);
    try {
      await applyAutoScheduleAction(proposal.map((p) => ({ taskId: p.id, startISO: p.start.toISOString(), endISO: p.end.toISOString() })));
      setStage("placed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't put them on the calendar.");
    } finally {
      setBusy(false);
    }
  }

  const section = (title: string, hint: string, list: Item[], start: number) =>
    list.length > 0 && (
      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.85)" }}>
            {title}
          </span>
          <span className="text-[11.5px] tabular-nums" style={{ color: "rgba(232,255,248,.6)" }}>
            {list.length} · {hrs(total(list))}
          </span>
        </span>
        <span className="text-[12px]" style={{ color: "rgba(232,255,248,.6)" }}>
          {hint}
        </span>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {list.map((i, k) => (
            <li key={i.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: "rgba(140,240,220,.06)", border: "1px solid rgba(140,240,220,.18)" }}>
              <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color: "rgba(140,240,220,.8)" }}>
                {start + k + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{i.title}</span>
                <span className="block truncate text-[11.5px]" style={{ color: "rgba(232,255,248,.6)" }}>
                  {i.board} · {i.due_at ? fmtDue(i.due_at) : "no date"}
                  {i.scheduled_start && Date.parse(i.scheduled_start) > now.getTime() ? ` · on your calendar ${when(i.scheduled_start)}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => cycle(i)} title="Tap to change how long it takes" className="h-7 shrink-0 rounded-full px-2 text-[11.5px] font-bold tabular-nums" style={{ border: "1px solid rgba(140,240,220,.4)" }}>
                {hrs(minutes(i))}
              </button>
            </li>
          ))}
        </ol>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-[13px] underline underline-offset-2" style={{ color: "rgba(232,255,248,.7)" }}>
        ← Back
      </button>
      <h3 className="font-display m-0 text-[19px] leading-snug">Getting up to date</h3>
      {!data && !error && (
        <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
          Gathering your coursework…
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {data.boards.map((b) => (
              <Pill key={b.id} strong={chosen.has(b.id)} onClick={() => setChosen((c) => (c.has(b.id) ? new Set([...c].filter((x) => x !== b.id)) : new Set([...c, b.id])))}>
                {chosen.has(b.id) ? "✓ " : ""}
                {b.title}
              </Pill>
            ))}
          </div>
          {order.length === 0 ? (
            <p className="m-0 text-[14px]">Pick the boards that hold your coursework.</p>
          ) : (
            <>
              <p className="m-0 text-[14px] leading-snug">
                The way through: first get ahead of what&rsquo;s coming up in the next {AHEAD_DAYS} days, then catch up on what was missed, from the very beginning. One at a time is plenty.
              </p>
              {section("Coming up: get ahead", "Soonest first. These keep you current.", plan.ahead, 0)}
              {section("Catching up, from the beginning", "Oldest first, so each one builds on the last.", plan.behind, plan.ahead.length)}
              {section("Further ahead", "They'll move up as their dates come near.", plan.later, plan.ahead.length + plan.behind.length)}
              {section("No date", "", plan.undated, plan.ahead.length + plan.behind.length + plan.later.length)}

              {stage === "plan" && (
                <Pill strong onClick={() => void apply()}>
                  {busy ? "Saving…" : "Use this order"}
                </Pill>
              )}
              {stage === "applied" && !proposal && (
                <div className="flex flex-col gap-1.5">
                  <p className="m-0 text-[13.5px]" style={{ color: "#bff7ea" }}>
                    Done: these are real quests now, in this order at the top of your scheduling list. Today and I will follow it too.
                  </p>
                  <span className="flex flex-wrap gap-1.5">
                    <Pill strong onClick={() => void findTime()}>
                      {busy ? "Looking at your calendar…" : "Find time for the next ten"}
                    </Pill>
                    <Pill onClick={() => onAsk("Help me begin the first assignment on my catch-up plan.")}>Help me begin the first</Pill>
                  </span>
                </div>
              )}
              {proposal && stage !== "placed" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.85)" }}>
                    Free time that fits
                  </span>
                  {proposal.length === 0 && <span className="text-[13.5px]">I couldn&rsquo;t find free time in the next two weeks. Shorter estimates may help.</span>}
                  {proposal.map((p) => (
                    <span key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate">{p.title}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: "rgba(232,255,248,.7)" }}>
                        {when(p.start.toISOString())}
                      </span>
                    </span>
                  ))}
                  {proposal.length > 0 && (
                    <Pill strong onClick={() => void place()}>
                      {busy ? "Placing…" : "Put these on my calendar"}
                    </Pill>
                  )}
                </div>
              )}
              {stage === "placed" && (
                <p className="m-0 text-[14px] leading-snug" style={{ color: "#bff7ea" }}>
                  On your calendar. When each time comes, just open it and begin. I&rsquo;ll be perched nearby. ✦
                </p>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "#ffb4a8" }}>
          {error}
        </p>
      )}
    </div>
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
