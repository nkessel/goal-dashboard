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
  coachCheckInAction,
  coachUndoCheckInAction,
  coachLogNightAction,
  coachUndoNightAction,
  coachShipFeedbackAction,
  addCheckNoteAction,
  deleteCheckNoteAction,
  deleteTaskAction,
  coachPromiseAction,
  coachStateAction,
  courseworkAction,
  addJournalEntryAction,
  answerDeadlineGuessAction,
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
import { afternoonCheckAt, dueSoonList, dueWhen, neglected, type DeadlineGuess, type GuideTask, type Nudge } from "@/lib/toucan-guide";
import type { CoachAction, CoachNote, CoachPromise } from "@/lib/coach";
import { AHEAD_DAYS, catchUpOrder, catchUpPlan, looksLikeCourse, type CourseItem } from "@/lib/catch-up";
import { SCHEDULER_DEFAULTS, planSchedule, type Busy, type SchedulerSettings } from "@/lib/auto-schedule";
import { openFocusMode } from "@/lib/focus-timer";
import { GearIcon } from "@/components/ui/Icons";
import { ToucanArt } from "./ToucanArt";
import { useEscape } from "@/lib/use-escape";
import { ToucanQuiz } from "./ToucanQuiz";
import { dailyBudget, polish, voice, windowOf } from "@/lib/toucan-style";
import { storeStyle, useToucanStyle } from "@/lib/toucan-style-store";

type PlanTarget = { id: string; title: string; estimate: number | null; dueAt: string | null };
type Msg = { role: "user" | "assistant"; content: string; actions?: (CoachAction & { auto?: boolean })[]; remembered?: CoachNote[] };
type Mode = "talk" | "catchup";

/** An invitation put off with Snooze, and what it offers when it comes back. */
type SnoozeNote = { text: string; until: number; taskId?: string; plan?: PlanTarget; begin?: string; talk?: string; talkLabel?: string };
const SNOOZE_KEY = "toucan-snoozed";
function readSnoozed(): SnoozeNote[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) || "[]") as SnoozeNote[];
    // Anything snoozed more than a day ago has had its moment.
    return Array.isArray(v) ? v.filter((n) => n && typeof n.text === "string" && n.until > Date.now() - 86_400_000) : [];
  } catch {
    return [];
  }
}
function writeSnoozed(list: SnoozeNote[]) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(list.slice(-20)));
  } catch {}
}
/** Open a quest in focus mode for a short first stretch. */
async function beginQuest(id: string) {
  const q = await getQuestForEditAction(id).catch(() => null);
  if (q) openFocusMode({ ...q, estimate_minutes: 15 });
}

/** The check-ins the toucan started itself today: how many, and which (a part of the day, the gym…). */
function readCheckins(day: string): { count: number; slots: string[] } {
  try {
    const v = JSON.parse(window.localStorage.getItem("toucan-checkins") || "null") as { day?: string; count?: number; slots?: string[] } | null;
    if (v?.day === day) return { count: v.count ?? 0, slots: v.slots ?? [] };
  } catch {}
  return { count: 0, slots: [] };
}
function writeCheckins(day: string, v: { count: number; slots: string[] }) {
  try {
    window.localStorage.setItem("toucan-checkins", JSON.stringify({ day, ...v }));
  } catch {}
}
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
        storeStyle(p.style);
      })
      .catch(() => {});
  }, []);
  const [open, setOpen] = useState<{ plan: PlanTarget | null; mode: Mode; say?: string; n?: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [fallback, setFallback] = useState<{ text: string; actions: NoteAction[] } | null>(null);
  const router = useRouter();

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

  // Say something with buttons; if the toucan isn't on screen (caged, hiding), a small note instead.
  // The bird may still be settling onto the page: try again for a few seconds before leaving a note.
  const raise = (text: string, actions: NoteAction[], note = true) => {
    const send = () => !window.dispatchEvent(new CustomEvent("toucan-nudge", { cancelable: true, detail: { text, actions } }));
    if (send()) return true;
    let tries = 0;
    const retry = () => {
      if (send()) return;
      if (++tries < 8) setTimeout(retry, 800);
      else if (note) setFallback({ text, actions });
    };
    setTimeout(retry, 800);
    return false;
  };
  const raiseRef = useRef(raise);
  useEffect(() => {
    raiseRef.current = raise;
  });

  // Snooze: an invitation comes back in 1 hour, 2 hours or a time you choose.
  const actionsFor = (n: SnoozeNote): NoteAction[] => [
    ...(n.plan ? [{ label: n.plan.estimate ? "Plan it" : "Estimate & plan", run: () => talkToToucan(n.plan!) }] : []),
    ...(n.begin ? [{ label: "Begin · 15 min", run: () => void beginQuest(n.begin!) }] : []),
    ...(n.talk ? [{ label: n.talkLabel ?? "Let's go", run: () => talkToToucan(undefined, "talk", n.talk) }] : []),
    snoozeFor(n),
    { label: "Not now", run: () => {} },
  ];
  const snoozeFor = (n: SnoozeNote): NoteAction => ({
    label: "Snooze",
    run: () => {
      const until = (hours: number) => {
        const h = Math.max(0.25, Math.min(24, hours));
        writeSnoozed([...readSnoozed().filter((x) => x.text !== n.text), { ...n, until: Date.now() + h * 3_600_000 }]);
        if (n.taskId) void snoozeToucanAction(n.taskId, h / 24).catch(() => {});
      };
      raiseRef.current("Snooze it for…", [
        { label: "1 hour", run: () => until(1) },
        { label: "2 hours", run: () => until(2) },
        {
          label: "Custom…",
          run: () => {
            const v = window.prompt("Snooze for how many hours?", "3");
            const h = v ? Number(v.replace(",", ".")) : NaN;
            if (Number.isFinite(h) && h > 0) until(h);
          },
        },
      ]);
    },
  });
  const actionsRef = useRef(actionsFor);
  useEffect(() => {
    actionsRef.current = actionsFor;
  });
  useEffect(() => {
    const check = () => {
      const all = readSnoozed();
      const ready = all.find((n) => n.until <= Date.now());
      if (!ready) return;
      writeSnoozed(all.filter((n) => n !== ready));
      raiseRef.current(ready.text, actionsRef.current(ready));
    };
    const first = setTimeout(check, 2500);
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener("focus", check);
    };
  }, []);

  // How you like to be checked in (the check-in quiz): its words, timing and how often.
  const style = useToucanStyle();
  const styleRef = useRef(style);
  useEffect(() => {
    styleRef.current = style;
  });
  const [quiz, setQuiz] = useState(false);
  useEffect(() => {
    const h = () => setQuiz(true);
    window.addEventListener("toucan-quiz", h);
    return () => window.removeEventListener("toucan-quiz", h);
  }, []);

  // On Today, a moment after you arrive: a reminder you asked for first (each
  // once a day), then, as your check-in style allows, one check-in for this
  // part of the day: the gym, what's due soon, getting ready for tomorrow…
  useEffect(() => {
    if (pathname !== "/") return;
    const t = setTimeout(async () => {
      const watch = await toucanWatchAction({ guesses: mode !== "simple" }).catch(() => null);
      if (!watch) return;
      const st = styleRef.current;
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
      const say = (text: string, actions: NoteAction[]) => raiseRef.current(polish(st, text), actions);
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

      // Not yet asked how you like to be checked in? Offer the quiz, once a day, a few times at most.
      if (!st.done && !shown("quiz")) {
        let offers = 0;
        try {
          offers = Number(window.localStorage.getItem("toucan-quiz-offers") || 0);
        } catch {}
        if (offers < 3) {
          mark("quiz");
          try {
            window.localStorage.setItem("toucan-quiz-offers", String(offers + 1));
          } catch {}
          say("I'd love to learn how you like to be checked in, so I can do it your way. A few taps?", [
            { label: "Let's do it", run: () => setQuiz(true) },
            { label: "Not now", run: () => {} },
          ]);
          return;
        }
      }

      // Each day has a budget of check-ins the toucan starts itself, one per part of the day.
      const used = readCheckins(day);
      if (used.count >= dailyBudget(st)) return;
      const spend = (slot: string) => writeCheckins(day, { count: used.count + 1, slots: [...used.slots, slot] });
      const planDay = { label: "Plan my day", run: () => talkToToucan(undefined, "talk", PLAN_DAY) };
      const invite = (text: string, n: Omit<SnoozeNote, "text" | "until">) => say(text, actionsRef.current({ ...n, text: polish(st, text), until: 0 }));

      // A quest with no due date whose name matches something coming up on the calendar.
      const guess = (watch.guesses as DeadlineGuess[]).find((g) => !shown(`due:${g.taskId}`));
      if (guess) {
        mark(`due:${guess.taskId}`);
        spend(`due:${guess.taskId}`);
        const soon = dueSoonList([{ due_at: guess.start }]).length > 0;
        say(voice.deadlineGuess(st, guess.title, guess.event, eventWhen(new Date(guess.start))), [
          {
            label: "Yes, set it",
            run: () =>
              void answerDeadlineGuessAction(guess.taskId, guess.start)
                .then(() => {
                  router.refresh();
                  if (soon) say("Done. It's in Due soon at the top of Today. Shall we plan your day around it?", [planDay, later]);
                })
                .catch(() => {}),
          },
          { label: "No", run: () => void answerDeadlineGuessAction(guess.taskId, null).catch(() => {}) },
        ]);
        return;
      }

      // The gym, on the days you chose.
      const now = new Date();
      const gym = st.gym;
      const gymToday = gym.days.includes(now.getDay());
      const gymTomorrow = gym.days.includes((now.getDay() + 1) % 7);
      const gymAt = gym.time ? new Date(now) : null;
      if (gymAt && gym.time) gymAt.setHours(Number(gym.time.slice(0, 2)), Number(gym.time.slice(3, 5)), 0, 0);
      const mins = gymAt ? (now.getTime() - gymAt.getTime()) / 60_000 : null;
      if (gymToday && gym.help.includes("before") && mins !== null && mins >= -90 && mins < 0 && !used.slots.includes("gym-before")) {
        spend("gym-before");
        const text = voice.gymBefore(st, gym.time);
        say(text, [
          { label: "On my way ✓", run: () => {} },
          { label: "Help me get going", run: () => talkToToucan(undefined, "talk", "I'm supposed to go to the gym soon and I need help getting out the door.") },
          snoozeFor({ text, until: 0, talk: "I'm supposed to go to the gym soon and I need help getting out the door.", talkLabel: "Help me get going" }),
        ]);
        return;
      }
      const afterGym = mins !== null ? mins >= 60 && mins <= 6 * 60 : windowOf(now) === "evening";
      if (gymToday && gym.help.includes("after") && afterGym && !used.slots.includes("gym-after")) {
        spend("gym-after");
        say(voice.gymAfter(st), [
          { label: "I went ✓", run: () => (gym.help.includes("cheer") ? say(voice.gymCheer(st), []) : undefined) },
          { label: "Not today", run: () => say(voice.gymMissed(st), [{ label: "Talk it through", run: () => talkToToucan(undefined, "talk", "I didn't make it to the gym today.") }, { label: "Okay", run: () => {} }]) },
        ]);
        return;
      }
      const w = windowOf(now);
      if (gymTomorrow && gym.help.includes("pack") && w === "evening" && !used.slots.includes("gym-pack")) {
        spend("gym-pack");
        const text = voice.gymPack(st, gym.time);
        say(text, [{ label: "Packed ✓", run: () => {} }, snoozeFor({ text, until: 0 })]);
        return;
      }

      // One check-in for this part of the day, if it's one you welcome.
      if (!w || !st.times.includes(w) || used.slots.includes(w)) return;
      spend(w);
      // A promise whose time has passed comes first: how did it go?
      const owed = watch.due[0] as CoachPromise | undefined;
      if (owed) {
        say(`Earlier you promised: “${owed.text}”. How did it go?`, [
          { label: "I did it ✓", run: () => void coachPromiseAction({ settle: { id: owed.id, status: "kept" } }).catch(() => {}) },
          { label: "Not yet", run: () => talkToToucan(undefined, "talk", `I didn't get to my promise: "${owed.text}".`) },
        ]);
        return;
      }
      if (w === "evening") {
        const text = voice.eveningPrep(st);
        const talk = "Help me prepare for tomorrow: what's coming up, and what I can get ready tonight.";
        say(text, [{ label: "Yes, help me", run: () => talkToToucan(undefined, "talk", talk) }, { label: "All set ✓", run: () => {} }, snoozeFor({ text, until: 0, talk, talkLabel: "Yes, help me" })]);
        return;
      }
      const dueSoon = dueSoonList(watch.tasks as GuideTask[]);
      if (dueSoon.length) {
        invite(voice.dueSoon(st, w, dueSoon.map((d) => ({ title: d.title, when: dueWhen(d.due_at!) }))), { talk: PLAN_DAY, talkLabel: "Plan my day" });
        return;
      }
      if (w === "morning") {
        say(voice.openDay(st, w), [{ label: "Tell the toucan", run: () => talkToToucan(undefined, "talk") }, planDay]);
        return;
      }
      const top = neglected(watch.tasks as GuideTask[], now, watch.snoozed, 1)[0];
      if (!top) return;
      const plan = { id: top.id, title: top.title, estimate: top.estimate, dueAt: top.dueAt };
      // A date is worth saying; how long it has waited only if you're fine hearing it.
      const text = top.dueAt ? `“${top.title}” ${dueWhen(top.dueAt)}. ${st.form === "question" ? "Shall we give it a time?" : "Let's give it a time."}` : voice.important(st, top.title);
      say(text, [
        { label: top.step === "estimate" ? "Estimate & plan" : "Plan it", run: () => talkToToucan(plan) },
        snoozeFor({ text: polish(st, text), until: 0, taskId: top.id, plan }),
        { label: "Not now", run: () => void snoozeToucanAction(top.id, 1).catch(() => {}) },
      ]);
    }, 1200);
    return () => clearTimeout(t);
  }, [pathname, mode, router]);

  // Something due today and still open: about three hours before (or by 3 pm),
  // the toucan offers to start on it now (unless you'd rather it spoke up only once a day).
  useEffect(() => {
    if (mode === "simple" || style.often === "rare") return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let live = true;
    const arm = async () => {
      const w = await toucanWatchAction().catch(() => null);
      if (!live || !w) return;
      timers.forEach(clearTimeout);
      timers = [];
      const day = todayKey();
      const key = (id: string) => `toucan-duecheck:${id}`;
      let delay = 20_000;
      for (const t of w.tasks as GuideTask[]) {
        if (!t.due_at) continue;
        const until = w.snoozed[t.id];
        if (until && Date.parse(until) > Date.now()) continue;
        const at = afternoonCheckAt(t.due_at);
        if (!at) continue;
        try {
          if (window.localStorage.getItem(key(t.id)) === day) continue;
        } catch {
          continue;
        }
        const ms = at.getTime() - Date.now();
        if (ms > 12 * 3_600_000) continue;
        // Already time? Not all at once: one now, the next a little later.
        const wait = ms > 0 ? ms : delay;
        if (ms <= 0) delay += 90_000;
        timers.push(
          setTimeout(() => {
            const st = styleRef.current;
            const time = new Date(t.due_at!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            const text = voice.dueToday(st, t.title, time);
            const seen = raiseRef.current(text, actionsRef.current({ text, until: 0, taskId: t.id, begin: t.id }));
            if (seen) {
              try {
                window.localStorage.setItem(key(t.id), day);
              } catch {}
            }
          }, wait)
        );
      }
    };
    void arm();
    const rearm = () => void arm();
    window.addEventListener("focus", rearm);
    return () => {
      live = false;
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", rearm);
    };
  }, [mode, style.often]);

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
      {fallback && <NudgeNote text={fallback.text} actions={fallback.actions} onClose={() => setFallback(null)} />}
      {quiz && <ToucanQuiz onClose={() => setQuiz(false)} />}
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

type NoteAction = { label: string; run: () => void };

function NudgeNote({ text, actions, onClose }: { text: string; actions: NoteAction[]; onClose: () => void }) {
  useEscape(onClose);
  // Drag it anywhere by its body; it remembers where you put it.
  const [at, setAt] = useState<{ x: number; y: number } | null>(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem("toucan-note-at") || "null") as { fx: number; fy: number } | null;
      return v ? { x: v.fx * window.innerWidth, y: v.fy * window.innerHeight } : null;
    } catch {
      return null;
    }
  });
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const place = at
    ? { left: Math.max(8, Math.min(window.innerWidth - 200, at.x)), top: Math.max(8, Math.min(window.innerHeight - 80, at.y)) }
    : null;
  return createPortal(
    <div
      role="status"
      className={`card-pop-in fixed z-[58] flex w-[min(360px,calc(100vw-24px))] cursor-grab touch-none items-start gap-2.5 rounded-2xl p-3 pr-8 ${place ? "" : "bottom-24 left-1/2 -translate-x-1/2"}`}
      style={{ ...(place ?? {}), background: "linear-gradient(180deg, rgba(14,38,40,.96), rgba(8,22,26,.98))", border: "1.5px solid rgba(140,240,220,.55)", color: "#e8fff8", boxShadow: "0 10px 28px rgba(0,0,0,.5)" }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.moved = true;
        setAt({ x: e.clientX - d.dx, y: e.clientY - d.dy });
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        if (d?.moved && at) {
          try {
            window.localStorage.setItem("toucan-note-at", JSON.stringify({ fx: at.x / window.innerWidth, fy: at.y / window.innerHeight }));
          } catch {}
        }
      }}
    >
      <button type="button" onClick={onClose} aria-label="Close" title="Close" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[18px] leading-none" style={{ color: "rgba(232,255,248,.75)" }}>
        ×
      </button>
      <span className="shrink-0">
        <ToucanArt size={40} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="m-0 text-[14px] leading-snug">{text}</p>
        <span className="flex flex-wrap gap-1.5">
          {(actions.length ? actions : [{ label: "OK", run: () => {} }]).map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                onClose();
                a.run();
              }}
              className="h-8 rounded-full px-3 text-[12.5px]"
              style={i === 0 ? { background: "rgba(140,240,220,.2)", border: "1px solid rgba(140,240,220,.6)", fontWeight: 700 } : { color: "rgba(232,255,248,.8)" }}
            >
              {a.label}
            </button>
          ))}
        </span>
      </div>
    </div>,
    document.body
  );
}

/** "today at 6:00 PM", "tomorrow at 9:30 AM" or "Tuesday at 6:00 PM". */
function eventWhen(d: Date) {
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString("en-US", { weekday: "long" })} at ${time}`;
}

export const PLAN_DAY = "Help me plan my day so nothing slips: what's due soonest first, then what matters most. Suggest an order and times that fit around my calendar.";

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
  { label: "🗓 Plan my day", say: PLAN_DAY },
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
  const router = useRouter();
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
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" data-kb-self aria-label="Talk with the Great Toucan Spirit" hidden={hidden}>
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
              {/* The rest of how he talks and looks lives in Settings; the chat waits, minimized. */}
              <button
                type="button"
                onClick={() => {
                  onMinimize();
                  router.push("/settings?open=toucan-spirit");
                }}
                className="settings-gear mt-0.5 flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[12.5px] font-semibold hover:bg-white/10"
                style={{ color: "rgba(140,240,220,.9)", border: "1px solid rgba(140,240,220,.3)" }}
              >
                <GearIcon size={14} />
                All my settings
              </button>
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
function ActionCard({ action: a, onPlan, onPromise }: { action: CoachAction & { auto?: boolean }; onPlan: (p: PlanTarget) => void; onPromise: (p: CoachPromise) => void }) {
  if (a.type === "newquest" || a.type === "event" || a.type === "checkin" || a.type === "wheel") return <MadeCard action={a} />;
  if (a.type === "ship") return <ShipCard action={a} />;
  return <OfferCard action={a} onPlan={onPlan} onPromise={onPromise} />;
}

type Made = Extract<CoachAction, { type: "newquest" | "event" | "checkin" | "wheel" }>;
/** Local wall time from the toucan ("2026-10-30" = end of that day) as an ISO stamp. */
const stampISO = (v: string) => new Date(v.length === 10 ? `${v}T23:59` : v).toISOString();
const clock12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
};

/**
 * An entry the toucan makes: a quest, an event, a check-in or a night on the
 * Wheel of Time. Made straight away when you asked for it (with an undo),
 * otherwise offered with one button.
 */
function MadeCard({ action: a }: { action: Made & { auto?: boolean } }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error" | "undone">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const undo = useRef<(() => Promise<unknown>) | null>(null);
  const started = useRef(false);
  const short = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const when = (v: string) =>
    new Date(v.length === 10 ? `${v}T12:00` : v).toLocaleString(undefined, v.length === 10 ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const label =
    a.type === "newquest"
      ? { icon: "⚔️", kind: "Quest", what: `“${short(a.title)}”${a.due ? ` · due ${when(a.due)}` : ""}${a.minutes ? ` · ${a.minutes} min` : ""}` }
      : a.type === "event"
        ? { icon: "🏷", kind: "Event", what: `“${short(a.text, 60)}”${a.at ? ` · ${when(a.at)}` : ""}` }
        : a.type === "checkin"
          ? { icon: "💠", kind: "Check-in", what: [...(a.energy !== null ? [`Energy ${a.energy}`] : []), ...a.metrics.map((m) => `${m.metric} ${m.level}`)].join(" · ") }
          : {
              icon: "🌀",
              kind: "Wheel of Time",
              what: [a.day ? `night before ${when(a.day)}` : "last night", a.bed && `bed ${clock12(a.bed)}`, a.wake && `woke ${clock12(a.wake)}`, ...a.effort.map((e) => `✦ ${e}`), ...a.hindrances.map((h) => `↺ ${h}`)].filter(Boolean).join(" · "),
            };
  async function make() {
    setState("busy");
    try {
      if (a.type === "newquest") {
        const id = await coachNewQuestAction(a.title, a.minutes, a.due ? stampISO(a.due) : null);
        undo.current = () => deleteTaskAction(id);
      } else if (a.type === "event") {
        const note = await addCheckNoteAction(a.text, a.at ? stampISO(a.at) : null);
        undo.current = () => deleteCheckNoteAction(note.id);
      } else if (a.type === "checkin") {
        const ref = await coachCheckInAction(a.energy, a.metrics);
        undo.current = () => coachUndoCheckInAction(ref);
      } else {
        const r = await coachLogNightAction({ day: a.day, bed: a.bed, wake: a.wake, effort: a.effort, hindrances: a.hindrances });
        undo.current = () => coachUndoNightAction(r.day, r.was);
      }
      setState("done");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
  }
  async function takeBack() {
    if (!undo.current) return;
    setState("busy");
    try {
      await undo.current();
      undo.current = null;
      setState("undone");
      router.refresh();
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Couldn't undo that.");
    }
  }
  useEffect(() => {
    if (a.auto && !started.current) {
      started.current = true;
      void make();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the reply arrives
  }, []);
  const verb = a.type === "newquest" ? "Add" : "Log";
  return (
    <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(140,240,220,.3)" }}>
      <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(140,240,220,.85)" }}>
        {label.icon} {label.kind}
      </span>
      <span className="text-[14px] leading-snug" style={{ textDecoration: state === "undone" ? "line-through" : undefined, opacity: state === "undone" ? 0.6 : 1 }}>
        {label.what}
      </span>
      {state === "done" ? (
        <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "#bff7ea" }}>
          {a.type === "newquest" ? "Added ✓" : "Logged ✓"}
          <button type="button" className="underline" onClick={() => void takeBack()}>
            Undo
          </button>
        </span>
      ) : state === "undone" ? (
        <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "rgba(232,255,248,.6)" }}>
          Taken back.
          <button type="button" className="underline" onClick={() => void make()}>
            {verb} it again
          </button>
        </span>
      ) : state === "error" ? (
        <span className="text-[12.5px]" style={{ color: "#ffb4a8" }}>
          {msg}
        </span>
      ) : (
        <Pill strong onClick={() => void make()}>
          {state === "busy" ? (a.type === "newquest" ? "Adding…" : "Logging…") : a.type === "newquest" ? "＋ Add this quest" : "Log this"}
        </Pill>
      )}
    </div>
  );
}

/**
 * The owner asked the toucan to build their app feedback: it starts the
 * build straight away (or with one button) and links to it.
 */
function ShipCard({ action: a }: { action: Extract<CoachAction, { type: "ship" }> & { auto?: boolean } }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const started = useRef(false);
  async function start() {
    setState("busy");
    try {
      const r = await coachShipFeedbackAction();
      setUrl(r.url);
      setMsg(
        !r.pending
          ? "Nothing new is waiting: every note you've sent is built."
          : r.already
            ? "A build started a few minutes ago and is still at work on your notes."
            : `Started ✓ Your ${r.pending === 1 ? "note is" : `${r.pending} notes are`} being built. The changes go live on their own when it's done.`,
      );
      setState("done");
    } catch (e) {
      setState("error");
      setMsg(e instanceof Error ? e.message : "Couldn't start the build.");
    }
  }
  useEffect(() => {
    if (a.auto && !started.current) {
      started.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the reply arrives
  }, []);
  return (
    <div className="flex w-[88%] flex-col gap-1.5 rounded-2xl p-3" style={{ background: "rgba(140,240,220,.07)", border: "1px solid rgba(242,210,126,.45)" }}>
      <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "rgba(140,240,220,.85)" }}>
        🛠 App update
      </span>
      <span className="text-[14px] leading-snug">{a.pending ? `${a.pending} feedback note${a.pending === 1 ? "" : "s"} waiting to be built` : "No new feedback waiting"}</span>
      {state === "done" || state === "error" ? (
        <span className="flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: state === "done" ? "#bff7ea" : "#ffb4a8" }}>
          {msg}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="underline">
              Watch it
            </a>
          )}
          {state === "error" && /feedback page|App feedback/.test(msg ?? "") && (
            <a href="/feedback-review" className="underline">
              Open App feedback
            </a>
          )}
        </span>
      ) : a.pending ? (
        <Pill strong onClick={() => void start()}>
          {state === "busy" ? "Starting…" : "Build them now"}
        </Pill>
      ) : null}
    </div>
  );
}

function OfferCard({ action: a, onPlan, onPromise }: { action: CoachAction; onPlan: (p: PlanTarget) => void; onPromise: (p: CoachPromise) => void }) {
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
