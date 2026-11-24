"use client";

// The toucan's three timed nudges, moved whole out of ToucanGuide (split plan T7): arriving on Today, a quest due
// today, promises with a time. They read the guide's freshest `raise`, note actions, snooze and check-in style
// through refs the guide keeps up to date; the guide calls them in the same order as before, after those refs' effects.
import { useEffect, type RefObject } from "react";
import type { useRouter } from "next/navigation";
import { openPlanMyDay } from "@/components/calendar/PlanMyDay";
import { coachPromiseAction, answerDeadlineGuessAction, leafPendingAction } from "@/app/actions";
import { clock, toucanAsks } from "@/lib/leaf";
import { afternoonCheckAt, dueSoonList, dueWhen, neglected, type DeadlineGuess, type GuideTask } from "@/lib/toucan-guide";
import type { CoachPromise } from "@/lib/coach";
import { dailyBudget, polish, voice, windowOf, type ToucanStyle } from "@/lib/toucan-style";
import { type GuideMode, PLAN_DAY, talkToToucan } from "./talk";
import type { NoteAction } from "./NudgeNote";
import { type SnoozeNote, readCheckins, writeCheckins, todayKey } from "./snooze-store";
import { whenFree, whenNoWelcome, sharedWatch, stillDueToday } from "./watch";
import { eventWhen, beginPromise } from "./ActionCards";

type Ref<T> = RefObject<T>;
/** The guide's `raise`: has the toucan say something with buttons (see ToucanGuide). */
export type Raise = (text: string, actions: NoteAction[], note?: boolean, opts?: { instant?: boolean; onClose?: () => void; quiet?: boolean; urgent?: boolean }) => boolean;

// On Today, a moment after you arrive: a reminder you asked for first (each
// once a day), then, as your check-in style allows, one check-in for this
// part of the day: the gym, what's due soon, getting ready for tomorrow…
export function useArrivalNudges({ pathname, mode, router, raiseRef, actionsRef, styleRef, snoozeFor, setQuiz }: { pathname: string; mode: GuideMode; router: ReturnType<typeof useRouter>; raiseRef: Ref<Raise>; actionsRef: Ref<(n: SnoozeNote) => NoteAction[]>; styleRef: Ref<ToucanStyle>; snoozeFor: (n: SnoozeNote) => NoteAction; setQuiz: (v: boolean) => void }) {
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

      // A leaf log with no follow-up yet, once its time has come (owner, Nov 24: WR-1 A, WR-2 B): once per log.
      try {
        const asked = (id: string) => {
          try {
            return window.localStorage.getItem(`toucan-leaf-asked:${id}`) === "1";
          } catch {
            return true;
          }
        };
        const nowAt = new Date();
        const ripe = (await leafPendingAction()).find((l) => !asked(l.id) && toucanAsks(new Date(l.at), nowAt));
        if (ripe) {
          try {
            window.localStorage.setItem(`toucan-leaf-asked:${ripe.id}`, "1");
          } catch {}
          spend(`leaf:${ripe.id}`);
          say(`Earlier, at ${clock(new Date(ripe.at))}, you smoked.${ripe.reason ? ` Why: “${ripe.reason}”.` : ""} How did it actually go?`, [
            { label: "How was it?", run: () => router.push("/insights?leaf=follow") },
            { label: "Later", run: () => {} },
          ]);
          return;
        }
      } catch {}

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
  // `snoozeFor` is left out on purpose, as it was in the guide: it is a new function every render (it only reads refs),
  // and listing it would run the arrival check again on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, mode, router, raiseRef, actionsRef, styleRef, setQuiz]);
}

// Something due today and still open: about three hours before (or by 3 pm),
// the toucan offers to start on it now (unless you'd rather it spoke up only once a day).
export function useDueTodayNudges({ mode, often, raiseRef, actionsRef, styleRef }: { mode: GuideMode; often: ToucanStyle["often"]; raiseRef: Ref<Raise>; actionsRef: Ref<(n: SnoozeNote) => NoteAction[]>; styleRef: Ref<ToucanStyle> }) {
  useEffect(() => {
    if (mode === "simple" || often === "rare") return;
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
  }, [mode, often, raiseRef, actionsRef, styleRef]);
}

// Promises with a time: when it comes, the toucan says so.
export function usePromiseNudges({ mode, raiseRef, snoozeForRef, setPickTime }: { mode: GuideMode; raiseRef: Ref<Raise>; snoozeForRef: Ref<(n: SnoozeNote) => NoteAction>; setPickTime: (v: { at: (when: number) => void; back?: () => void } | null) => void }) {
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
  }, [mode, raiseRef, snoozeForRef, setPickTime]);
}
