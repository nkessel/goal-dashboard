"use client";

import { openPlanMyDay } from "@/components/calendar/PlanMyDay";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { coachPromiseAction, answerDeadlineGuessAction, snoozeToucanAction, toucanPrefsAction } from "@/app/actions";
import { setRetiredLines } from "@/lib/toucan-lines";
import { afternoonCheckAt, dueSoonList, dueWhen, neglected, type DeadlineGuess, type GuideTask } from "@/lib/toucan-guide";
import type { CoachPromise } from "@/lib/coach";
import { ToucanArt } from "./ToucanArt";
import { ToucanQuiz } from "./ToucanQuiz";
import { dailyBudget, polish, voice, windowOf } from "@/lib/toucan-style";
import { storeStyle, useToucanStyle } from "@/lib/toucan-style-store";
import { fromStartup } from "@/lib/startup";
import { type Mode, type PlanTarget, PLAN_DAY, talkToToucan, useToucanMode } from "./talk";
import { NoteAction, PickTime, NudgeNote } from "./NudgeNote";
import { type SnoozeNote, readSnoozed, writeSnoozed, readCheckins, writeCheckins, todayKey, tomorrowMorning } from "./snooze-store";
import { beginQuest, whenFree, whenNoWelcome, sharedWatch, stillDueToday, stillOpen } from "./watch";
import { eventWhen, completeQuestFromNote, beginPromise } from "./ActionCards";
import { GuideSheet } from "./GuideSheet";

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
    fromStartup("toucanPrefs", toucanPrefsAction)
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
  const [fallback, setFallback] = useState<{ text: string; actions: NoteAction[]; instant?: boolean; onClose?: () => void } | null>(null);
  // Pick a time: where the time goes, and the choices to come back to if you close it.
  const [pickTime, setPickTime] = useState<{ at: (when: number) => void; back?: () => void } | null>(null);
  const router = useRouter();
  // A quest done from his note: show it done.
  useEffect(() => {
    const h = () => router.refresh();
    window.addEventListener("toucan-refresh", h);
    return () => window.removeEventListener("toucan-refresh", h);
  }, [router]);

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
  /**
   * Has the toucan say something with buttons. `instant`: a follow-up to what he just said
   * (the snooze choices): it shows at once, no flight and no waiting for the perched bird.
   * `onClose`: closing it (× or Esc) goes back there instead of dropping the choice.
   */
  const raise = (text: string, actions: NoteAction[], note = true, opts: { instant?: boolean; onClose?: () => void; quiet?: boolean; urgent?: boolean } = {}) => {
    // Not urgent: he keeps it until you tap him (a glow on him), never flies in. If he isn't on the page, it waits for another day.
    if (opts.quiet) {
      window.dispatchEvent(new CustomEvent("toucan-waiting", { cancelable: true, detail: { text, actions } }));
      return true;
    }
    // Urgent: still only once you're free (no popup, not typing, a pause in what you're doing).
    if (opts.urgent) {
      whenFree(() => raiseRef.current(text, actions, note, { ...opts, urgent: false }));
      return note;
    }
    const send = () => !window.dispatchEvent(new CustomEvent("toucan-nudge", { cancelable: true, detail: { text, actions, onClose: opts.onClose } }));
    // One toucan at a time: while the welcome screen (with its own toucan) is open, wait for it to close.
    const welcomeOpen = () => document.documentElement.hasAttribute("data-welcome-open");
    if (welcomeOpen()) {
      const wait = setInterval(() => {
        if (welcomeOpen()) return;
        clearInterval(wait);
        // Not straight after logging in: he waits a while before bringing it up (owner, Nov 6: "the toucan is still bothering me when I log in").
        setTimeout(() => raiseRef.current(text, actions, note, opts), 10 * 60_000);
      }, 1000);
      // It will be said once the welcome screen closes: count it as said, or callers raise it again and again.
      return note;
    }
    // Just past the welcome screen: no notes for ten minutes (instant follow-ups to a choice still show).
    const closedAt = Number(document.documentElement.dataset.welcomeClosedAt ?? 0);
    const quietLeft = closedAt + 10 * 60_000 - Date.now();
    if (!opts.instant && closedAt && quietLeft > 0) {
      setTimeout(() => raiseRef.current(text, actions, note, opts), quietLeft + 500);
      return note;
    }
    if (send()) return true;
    if (opts.instant) {
      setFallback({ text, actions, instant: true, onClose: opts.onClose });
      return true;
    }
    let tries = 0;
    const retry = () => {
      if (send()) return;
      if (++tries < 8) setTimeout(retry, 800);
      else if (note) setFallback({ text, actions });
    };
    setTimeout(retry, 800);
    // Said by the bird or, failing that, as a note: either way it's said (returning false here made a due
    // quest's note come back on every refresh, so its buttons and × seemed not to work; owner, Nov 2).
    return note;
  };
  const raiseRef = useRef(raise);
  useEffect(() => {
    raiseRef.current = raise;
  });

  // Not now: an invitation comes back when you say (30 minutes, 1 or 2 hours, tomorrow or a time you pick), or not at all.
  const actionsFor = (n: SnoozeNote): NoteAction[] => [
    ...(n.promiseId ? [{ label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: n.promiseId!, status: "kept" } }).then(() => window.dispatchEvent(new Event("toucan-promises"))).catch(() => {}) }] : []),
    ...(n.quiz ? [{ label: "Let's do it", run: () => window.dispatchEvent(new Event("toucan-quiz")) }] : []),
    ...(n.plan ? [{ label: n.plan.estimate ? "Plan it" : "Estimate & plan", run: () => talkToToucan(n.plan!) }] : []),
    ...(n.begin ? [{ label: "Begin · 15 min", run: () => void beginQuest(n.begin!) }] : []),
    // "I already did this task" (owner, Nov 2): one tap marks the quest done.
    ...(n.begin ? [{ label: "Already done ✓", run: () => void completeQuestFromNote(n.begin!) }] : []),
    ...(n.talk ? [{ label: n.talkLabel ?? "Let's go", run: () => talkToToucan(undefined, "talk", n.talk) }] : []),
    snoozeFor(n),
  ];
  const snoozeFor = (n: SnoozeNote): NoteAction => ({
    label: "Snooze…",
    run: () => {
      const at = (when: number) => {
        writeSnoozed([...readSnoozed().filter((x) => x.text !== n.text), { ...n, until: when }]);
        if (n.taskId) void snoozeToucanAction(n.taskId, Math.max(0.01, (when - Date.now()) / 86_400_000)).catch(() => {});
      };
      const inHours = (h: number) => at(Date.now() + h * 3_600_000);
      // Closing the choices goes back to what he said, with its buttons.
      const back = () => raiseRef.current(n.text, actionsRef.current(n), true, { instant: true });
      const ask = () =>
        raiseRef.current(
          "When should I bring it back?",
          [
            { label: "Tomorrow", run: () => at(tomorrowMorning()) },
            { label: "15 min", run: () => inHours(0.25) },
            { label: "1 hour", run: () => inHours(1) },
            { label: "Other…", run: () => setPickTime({ at, back: ask }) },
            { label: "Skip it", run: () => void (n.taskId && snoozeToucanAction(n.taskId, 1).catch(() => {})) },
            // A way back to what he said (owner, Nov 4: "a back button to the main toucan chat from the snooze options").
            { label: "‹ Back", run: back },
          ],
          true,
          { instant: true, onClose: back }
        );
      ask();
    },
  });
  const actionsRef = useRef(actionsFor);
  const snoozeForRef = useRef(snoozeFor);
  useEffect(() => {
    actionsRef.current = actionsFor;
    snoozeForRef.current = snoozeFor;
  });
  useEffect(() => {
    const check = () => {
      const all = readSnoozed();
      const ready = all.find((n) => n.until <= Date.now());
      if (!ready) return;
      writeSnoozed(all.filter((n) => n !== ready));
      // You asked for it back; it comes once you're free, and only if it's still true (a "due today" note
      // about a quest since moved to Monday stays quiet).
      const quest = ready.begin ?? ready.taskId;
      void (async () => {
        if (quest && !(ready.begin ? await stillDueToday(quest) : await stillOpen(quest))) return;
        raiseRef.current(ready.text, actionsRef.current(ready), true, { urgent: true });
      })();
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
      const watch = await sharedWatch({ guesses: mode !== "simple" });
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
      const later = (p: CoachPromise, text: string) => snoozeFor({ text, until: 0, promiseId: p.id });
      // His check-ins wait on him quietly until you tap him (owner, Nov 6); answers to your taps come at once.
      const say = (text: string, actions: NoteAction[]) => raiseRef.current(polish(st, text), actions, true, { quiet: true });
      const reply = (text: string, actions: NoteAction[]) => raiseRef.current(polish(st, text), actions, true, { instant: true });
      // "Next time" reminders whose calendar event is near.
      const near = (watch.nextNear as { promise: CoachPromise; event: { title: string; start: string } }[]).find((n) => !shown(n.promise.id));
      if (near) {
        mark(near.promise.id);
        const start = Date.parse(near.event.start);
        const whenText = start <= Date.now() ? "now" : `at ${new Date(start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${new Date(start).toDateString() === new Date().toDateString() ? "" : " tomorrow"}`;
        const text = `“${near.event.title}” is ${whenText}. Remember: ${near.promise.text}`;
        // Time-bound (the event is near): he says it, once you're free.
        raiseRef.current(polish(st, text), [done(near.promise), later(near.promise, polish(st, text))], true, { urgent: true });
        return;
      }
      // Reminders with no time: kept in mind, brought up once a day.
      const standing = (watch.standing as CoachPromise[]).filter((p) => !shown(p.id));
      if (standing.length) {
        standing.forEach((p) => mark(p.id));
        const [first, ...rest] = standing;
        const text = `Don't forget: ${first.text}${rest.length ? ` (and ${rest.length} more: ${rest.map((p) => p.text).join("; ")})` : ""}`;
        say(text, [done(first), later(first, polish(st, text))]);
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
          const text = "I'd love to learn how you like to be checked in, so I can do it your way. A few taps?";
          say(text, [{ label: "Let's do it", run: () => setQuiz(true) }, snoozeFor({ text: polish(st, text), until: 0, quiz: true })]);
          return;
        }
      }

      // Each day has a budget of check-ins the toucan starts itself, one per part of the day.
      const used = readCheckins(day);
      if (used.count >= dailyBudget(st)) return;
      const spend = (slot: string) => writeCheckins(day, { count: used.count + 1, slots: [...used.slots, slot] });
      const planDay = { label: "Plan my day", run: openPlanMyDay };
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
                  if (soon) reply("Done. It's in Due soon at the top of Today. Shall we plan your day around it?", [planDay, { label: "Not now", run: () => {} }]);
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
          { label: "I went ✓", run: () => (gym.help.includes("cheer") ? reply(voice.gymCheer(st), []) : undefined) },
          { label: "Not today", run: () => reply(voice.gymMissed(st), [{ label: "Talk it through", run: () => talkToToucan(undefined, "talk", "I didn't make it to the gym today.") }, { label: "Okay", run: () => {} }]) },
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
        // The evening routine is the way to be ready for tomorrow (owner, Nov 3): offered first when it's on the page.
        const routine = typeof document !== "undefined" && document.querySelector(".evening-cta");
        say(text, [
          ...(routine ? [{ label: "🌙 Evening routine", run: () => document.querySelector<HTMLButtonElement>("button.evening-cta, .evening-cta button")?.click() }] : []),
          { label: "Yes, help me", run: () => talkToToucan(undefined, "talk", talk) },
          { label: "All set ✓", run: () => {} },
          snoozeFor({ text, until: 0, talk, talkLabel: "Yes, help me" }),
        ]);
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
      const w = await sharedWatch();
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
          setTimeout(async () => {
            // Moved to another day, or done, since he last looked? Then there's nothing to say.
            if (!(await stillDueToday(t.id))) return;
            const st = styleRef.current;
            const due = new Date(t.due_at!);
            const time = due.getHours() === 23 && due.getMinutes() >= 59 ? "" : due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            const text = voice.dueToday(st, t.title, time);
            const seen = raiseRef.current(text, actionsRef.current({ text, until: 0, taskId: t.id, begin: t.id }), true, { urgent: true });
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
    window.addEventListener("toucan-tasks-changed", rearm);
    return () => {
      live = false;
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", rearm);
      window.removeEventListener("toucan-tasks-changed", rearm);
    };
  }, [mode, style.often]);

  // Promises with a time: when it comes, the toucan says so.
  useEffect(() => {
    if (mode !== "full") return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let live = true;
    const arm = async () => {
      const w = await sharedWatch();
      if (!live || !w) return;
      timers.forEach(clearTimeout);
      timers = [];
      for (const p of w.promises as CoachPromise[]) {
        if (!p.due) continue;
        const ms = Date.parse(p.due) - Date.now();
        if (ms < -5 * 60_000 || ms > 12 * 3_600_000) continue;
        timers.push(
          setTimeout(() => whenFree(() => {
            const unseen = window.dispatchEvent(
              new CustomEvent("toucan-nudge", {
                cancelable: true,
                detail: {
                  text: `It's time: “${p.text}”. Shall we begin together?`,
                  actions: [
                    { label: "Begin", run: () => void beginPromise(p) },
                    {
                      label: "Snooze…",
                      run: () => {
                        const push = (minutes: number) => void coachPromiseAction({ push: { id: p.id, minutes } }).then(arm).catch(() => {});
                        // Closing the choices goes back to the reminder itself.
                        const back = () =>
                          raiseRef.current(`It's time: “${p.text}”. Shall we begin together?`, [
                            { label: "Begin", run: () => void beginPromise(p) },
                            { label: "Snooze…", run: () => ask() },
                            { label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: p.id, status: "kept" } }).catch(() => {}) },
                          ], true, { instant: true });
                        const ask = (): boolean =>
                          raiseRef.current(
                            "When should I bring it back?",
                            [
                              { label: "15 min", run: () => push(15) },
                              { label: "30 min", run: () => push(30) },
                              { label: "1 hour", run: () => push(60) },
                              { label: "Other…", run: () => setPickTime({ at: (when: number) => push(Math.max(1, Math.round((when - Date.now()) / 60_000))), back: ask }) },
                              { label: "‹ Back", run: () => void back() },
                            ],
                            true,
                            { instant: true, onClose: back }
                          );
                        ask();
                      },
                    },
                    { label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: p.id, status: "kept" } }).catch(() => {}) },
                  ],
                },
              })
            );
            if (unseen) talkToToucan(undefined, "talk");
          }), Math.max(0, ms))
        );
      }
      // "Next time": when the event starts, the toucan says so.
      for (const n of (w.nextNear ?? []) as { promise: CoachPromise; event: { title: string; start: string } }[]) {
        const ms = Date.parse(n.event.start) - Date.now();
        if (ms <= 0 || ms > 12 * 3_600_000) continue;
        timers.push(
          setTimeout(() => whenNoWelcome(() => {
            const unseen = window.dispatchEvent(
              new CustomEvent("toucan-nudge", {
                cancelable: true,
                detail: {
                  text: `“${n.event.title}” is starting. Remember: ${n.promise.text}`,
                  actions: [
                    { label: "Done ✓", run: () => void coachPromiseAction({ settle: { id: n.promise.id, status: "kept" } }).then(arm).catch(() => {}) },
                    snoozeForRef.current({ text: `“${n.event.title}” is starting. Remember: ${n.promise.text}`, until: 0, promiseId: n.promise.id }),
                  ],
                },
              })
            );
            if (unseen) talkToToucan(undefined, "talk");
          }), ms)
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
      {pickTime && (
        <PickTime
          onPick={(when) => {
            pickTime.at(when);
            setPickTime(null);
          }}
          onClose={() => {
            // Closing goes back to the snooze choices, not off the screen.
            const back = pickTime.back;
            setPickTime(null);
            back?.();
          }}
        />
      )}
      {fallback && (
        <NudgeNote
          key={fallback.text}
          text={fallback.text}
          actions={fallback.actions}
          instant={fallback.instant}
          onClose={() => {
            const back = fallback.onClose;
            setFallback(null);
            back?.();
          }}
        />
      )}
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

