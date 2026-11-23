"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { coachPromiseAction, snoozeToucanAction, toucanPrefsAction } from "@/app/actions";
import { setRetiredLines } from "@/lib/toucan-lines";
import { ToucanArt } from "./ToucanArt";
import { ToucanQuiz } from "./ToucanQuiz";
import { storeStyle, useToucanStyle } from "@/lib/toucan-style-store";
import { fromStartup } from "@/lib/startup";
import { type Mode, type PlanTarget, talkToToucan, useToucanMode } from "./talk";
import { NoteAction, PickTime, NudgeNote } from "./NudgeNote";
import { type SnoozeNote, readSnoozed, writeSnoozed, tomorrowMorning } from "./snooze-store";
import { beginQuest, whenFree, stillDueToday, stillOpen } from "./watch";
import { completeQuestFromNote } from "./ActionCards";
import { GuideSheet } from "./GuideSheet";
import { useArrivalNudges, useDueTodayNudges, usePromiseNudges } from "./nudges";

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

  // The timed nudges (toucan/nudges.ts): arriving on Today, a quest due today, promises with a time. Kept after the
  // refs' effects above, so they read fresh values in the same order as before.
  useArrivalNudges({ pathname, mode, router, raiseRef, actionsRef, styleRef, snoozeFor, setQuiz });
  useDueTodayNudges({ mode, often: style.often, raiseRef, actionsRef, styleRef });
  usePromiseNudges({ mode, raiseRef, snoozeForRef, setPickTime });

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

