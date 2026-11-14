"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourState } from "@/app/actions";
import { tourAction, tourCompletePracticeAction, tourNewQuestAction, tourPracticeQuestAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { readTour, subscribeTour, writeTour } from "@/lib/tour-store";

/**
 * The new-adventurer walkthrough (owner, Nov 13; every account goes through it once). Each step points at
 * the real control and waits until you're ready: a first quest whose task is to make a quest, then a real
 * one with an ETA and an XP value, done in Engage Quest; a tour of the screens, the Treasure Chest and the
 * feedback button. "Later" folds it to a chip; Settings › Help starts it again.
 */

type Step = {
  /** Where it points (a CSS selector); none = the card sits on its own. */
  target?: string;
  title: string;
  text: string;
  /** Shown as the card's main button; without it the step waits for what you do. */
  next?: string;
  /** Needs Today on screen (offers to go there). */
  today?: boolean;
};

const PLUS = '[aria-label="Create something new"]';
const EDITOR = '[role="dialog"][data-save-keys]';
const NAV = (href: string) => `nav[data-app-nav] a[href="${href}"]`;

const STEPS: Record<string, Step> = {
  intro: { title: "Welcome, adventurer", text: "This is your quest log. A short walk through it, at your own pace: each step waits for you.", next: "Begin" },
  practice: { target: PLUS, today: true, title: "Your first quest", text: "It's on Today: “Make your first quest”. To do it, tap + and choose New quest." },
  "practice-name": { target: `${EDITOR} [aria-label="Title"]`, title: "Name it", text: "Anything easy works, like “Drink a glass of water”. Then press Create quest." },
  choice: { title: "First quest done ✦", text: "That's the whole loop: make a quest, do it, get the reward. Next, make a real one, or look around first?" },
  real: { target: PLUS, today: true, title: "A real quest", text: "Something you'd like to do today. Tap + and choose New quest." },
  "real-name": { target: `${EDITOR} [aria-label="Title"]`, title: "Name it", text: "Short and clear: what you'll actually do.", next: "Next" },
  "real-eta": { target: `${EDITOR} [data-tour="fact-time"]`, title: "Add an ETA", text: "How long do you think it takes? Tap the clock. It helps the planner find room for it on your calendar.", next: "Next" },
  "real-xp": { target: `${EDITOR} [data-tour="fact-xp"]`, title: "What's it worth?", text: "XP grows your level and character stats; coins buy rewards you set yourself. Small is about 15 XP, medium 30, hard 50 or more. The guide stays in the XP panel until you hide it.", next: "Next" },
  "real-save": { target: `${EDITOR} [data-submit]`, title: "Create it", text: "Press Create quest. It lands on Today's Quests." },
  "real-engage": { today: true, title: "Engage Quest", text: "Open its menu (⋯, or hold it / right-click) and choose Engage Quest: focus mode, just this one quest." },
  "real-focus": { title: "Focus mode", text: "Do it now. If you already did, say how long it took. Then Complete." },
  "tour-calendar": { target: NAV("/calendar"), title: "Calendar", text: "When things happen: your quests and your Google calendars, side by side. Drag quests onto a time.", next: "Next" },
  "tour-boards": { target: NAV("/boards"), title: "All Quests", text: "Every quest, on boards you shape: projects, areas of life, courses.", next: "Next" },
  "tour-today": { target: NAV("/"), title: "Today's Quest", text: "Now: today's quests, your habits and what's due soon.", next: "Next" },
  "tour-insights": { target: NAV("/insights"), title: "Insights", text: "How you're doing: check-ins, sleep, streaks and patterns over time.", next: "Next" },
  "tour-party": { target: NAV("/feed"), title: "Party", text: "Friends who cheer you on. Write to them, share boards, call for support.", next: "Next" },
  "tour-chest": { target: 'a[href="/rewards"]', title: "Treasure Chest", text: "Set rewards for yourself and buy them with the coins your quests earn. Price them at a day or two of quests.", next: "Next" },
  "tour-feedback": { target: "[data-feedback-btn]", title: "Your feedback", text: "This app is still in development. Tap this any time something is confusing or broken: your notes make the whole platform better.", next: "Next" },
  done: { title: "You're set ✦", text: "Add a habit from + when you're ready, or invite a friend from Party. Settings › Help runs this again any time.", next: "Finish" },
};

const ORDER_TOUR = ["tour-calendar", "tour-boards", "tour-today", "tour-insights", "tour-party", "tour-chest", "tour-feedback"];

const subscribeHtml = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-welcome-open", "class"] });
  return () => mo.disconnect();
};
const welcomeUpNow = () => document.documentElement.hasAttribute("data-welcome-open");

function rectOf(sel?: string): DOMRect | null {
  if (!sel) return null;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return r;
  }
  return null;
}

export function Walkthrough() {
  const router = useRouter();
  const pathname = usePathname();
  const tour = useSyncExternalStore(subscribeTour, () => localStorage.getItem("tour-state") ?? "", () => "");
  const state: TourState | null = tour ? (JSON.parse(tour) as TourState) : null;
  const welcomeUp = useSyncExternalStore(subscribeHtml, welcomeUpNow, () => true);
  const [min, setMin] = useState(() => {
    try {
      return sessionStorage.getItem("tour-min") === "1";
    } catch {
      return false;
    }
  });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(150);

  // The account's place in the walkthrough wins over this device's (latest change wins).
  useEffect(() => {
    tourAction()
      .then((t) => {
        const here = readTour();
        if (!t) {
          if (!here) writeTour({ step: "intro" });
        } else if (!here || (t.at ?? 0) >= (here.at ?? 0)) writeTour(t, false);
      })
      .catch(() => {});
  }, []);

  const step = state && !state.done ? state.step : null;
  const s = step ? STEPS[step] : null;
  const go = (next: string, extra: Partial<TourState> = {}) => {
    const cur = readTour() ?? { step: "intro" };
    writeTour({ ...cur, ...extra, step: next, done: next === "end" ? true : cur.done, at: Date.now() });
  };
  const seen = (k: string) => !!state?.hidden?.includes(`_${k}`);
  const mark = (k: string) => [...new Set([...(state?.hidden ?? []), `_${k}`])];
  const afterReal = () => (seen("tour") ? "done" : "tour-calendar");
  const afterTour = () => (seen("real") ? "done" : "real");

  // Celebrations go first; the card waits behind them.
  useEffect(() => {
    const check = () => setCelebrating(!!document.querySelector('[aria-label="Quest complete"]'));
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true });
    check();
    return () => mo.disconnect();
  }, []);

  // Follow the control it points at.
  useEffect(() => {
    if (!s) return;
    let raf = 0;
    const sel = step === "real-engage" && state?.realId ? `[data-task-id="${state.realId}"] [aria-label="Quest actions"]` : s.target;
    const tick = () => {
      const r = rectOf(sel);
      setRect((old) => (old && r && Math.abs(old.top - r.top) < 1 && Math.abs(old.left - r.left) < 1 && Math.abs(old.width - r.width) < 1 ? old : r));
    };
    tick();
    const id = window.setInterval(tick, 250);
    const on = () => (cancelAnimationFrame(raf), (raf = requestAnimationFrame(tick)));
    window.addEventListener("scroll", on, { passive: true, capture: true });
    window.addEventListener("resize", on);
    return () => {
      window.clearInterval(id);
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [s, step, state?.realId]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [step, rect, min, celebrating]);

  // Steps that move on by themselves, from what you do.
  useEffect(() => {
    if (!step) return;
    // An editing step moves on once the editor that was open closes (once: the observer fires often).
    let opened = !!document.querySelector(EDITOR);
    let handling = false;
    const editorUp = () => !!document.querySelector(EDITOR);
    const check = async () => {
      if (step === "practice" || step === "real") {
        if (editorUp()) go(step === "practice" ? "practice-name" : "real-name", { since: new Date(Date.now() - 2000).toISOString() });
        return;
      }
      if (step === "practice-name" || ["real-name", "real-eta", "real-xp", "real-save"].includes(step)) {
        if (editorUp()) {
          opened = true;
          return;
        }
        if (!opened || handling) return;
        handling = true;
        // The editor closed: was a quest made? (A moment for the save to land.)
        await new Promise((r) => setTimeout(r, 700));
        const t = readTour();
        const made = t?.since ? await tourNewQuestAction(t.since, [t.practiceId ?? "", t.realId ?? ""].filter(Boolean)).catch(() => null) : null;
        if (step === "practice-name") {
          if (!made) return go("practice");
          if (t?.practiceId) {
            const res = await tourCompletePracticeAction(t.practiceId).catch(() => null);
            if (res) celebrateQuest({ taskId: t.practiceId, title: res.title, xp: res.xp, totalXp: res.totalXp, coinsEarned: res.coins });
          }
          router.refresh();
          return go("choice");
        }
        if (!made) return go("real");
        router.refresh();
        return go("real-engage", { realId: made.id });
      }
      if (step === "real-engage" && document.querySelector(".one-thing")) return go("real-focus");
    };
    const mo = new MutationObserver(() => void check());
    mo.observe(document.body, { childList: true, subtree: true });
    const onDone = () => {
      if (step === "real-focus" || step === "real-engage") go(afterReal(), { hidden: mark("real") });
    };
    window.addEventListener("quest-complete", onDone);
    return () => {
      mo.disconnect();
      window.removeEventListener("quest-complete", onDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go/afterReal/mark read the live state each time
  }, [step]);

  if (!s || welcomeUp) return null;

  if (min || celebrating) {
    if (celebrating) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setMin(false);
          try {
            sessionStorage.removeItem("tour-min");
          } catch {
            /* storage unavailable */
          }
        }}
        data-tour-chip
        className="card-pop-in fixed bottom-[92px] left-3 z-[129] flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold"
        style={{ background: "radial-gradient(circle at 35% 25%, #fbefcb, #ead49a 70%)", border: "1px solid #a88a3f", color: "#2a1c10", boxShadow: "0 3px 10px rgba(0,0,0,.25)" }}
      >
        ✦ Walkthrough
      </button>
    );
  }

  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const W = Math.min(340, vw - 24);
  // Under the control when there's room, else above it; centred when it points at nothing.
  let top = vh / 2 - cardH / 2;
  let left = vw / 2 - W / 2;
  // Inside the quest editor the card waits outside it (above, else below), so it never covers the fields.
  const box = s.target?.startsWith(EDITOR) && typeof document !== "undefined" ? document.querySelector(EDITOR)?.getBoundingClientRect() : null;
  if (rect && box) {
    left = Math.max(12, Math.min(vw - W - 12, box.left + box.width / 2 - W / 2));
    top = box.top - 10 - cardH >= 8 ? box.top - 10 - cardH : box.bottom + 10 + cardH <= vh - 8 ? box.bottom + 10 : 8;
  } else if (rect) {
    left = Math.max(12, Math.min(vw - W - 12, rect.left + rect.width / 2 - W / 2));
    top = rect.bottom + 14 + cardH < vh - 12 ? rect.bottom + 14 : Math.max(12, rect.top - 14 - cardH);
  } else if (step === "real-focus") top = 16;

  const needsToday = s.today && pathname !== "/";
  const later = () => {
    setMin(true);
    try {
      sessionStorage.setItem("tour-min", "1");
    } catch {
      /* storage unavailable */
    }
  };

  async function main() {
    if (busy || !step) return;
    if (step === "intro") {
      setBusy(true);
      const q = await tourPracticeQuestAction().catch(() => null);
      setBusy(false);
      if (pathname !== "/") router.push("/");
      else router.refresh();
      return go("practice", { practiceId: q?.id ?? null, since: new Date().toISOString() });
    }
    if (step === "real-name") return go("real-eta");
    if (step === "real-eta") return go("real-xp");
    if (step === "real-xp") return go("real-save");
    const i = ORDER_TOUR.indexOf(step);
    if (i >= 0) return i < ORDER_TOUR.length - 1 ? go(ORDER_TOUR[i + 1]) : go(afterTour(), { hidden: mark("tour") });
    if (step === "done") return go("end");
  }

  return (
    <>
      {rect && (
        <div
          aria-hidden
          data-tour-ring
          className="tour-ring pointer-events-none fixed z-[134] rounded-2xl"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Walkthrough: ${s.title}`}
        data-tour-card
        className="card-pop-in fixed z-[136] flex flex-col gap-2 rounded-2xl px-4 pb-3 pt-3"
        style={{ left, top, width: W, background: "radial-gradient(circle at 30% 15%, #fffaf0, #f3e6c6 75%)", border: "1.5px solid #c9a24a", color: "#2a1c10", boxShadow: "0 12px 30px rgba(0,0,0,.35)", transition: "left 220ms ease, top 220ms ease" }}
      >
        <div className="flex items-start gap-2">
          <span className="font-display flex-1 text-[17px] leading-tight">{s.title}</span>
          <button type="button" onClick={later} className="h-7 shrink-0 text-[12.5px] font-semibold underline underline-offset-2" style={{ color: "#6b5631" }}>
            Later
          </button>
        </div>
        <p className="m-0 text-[14px] leading-snug">{s.text}</p>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
          {step === "intro" && (
            <button type="button" onClick={() => go("end")} className="mr-auto h-9 text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
              No thanks
            </button>
          )}
          {step !== "intro" && step !== "done" && (
            <button type="button" onClick={() => go("end")} className="mr-auto h-9 text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
              End walkthrough
            </button>
          )}
          {needsToday && (
            <button type="button" onClick={() => router.push("/")} className="qe-fact h-9 rounded-full px-3.5 text-[13.5px] font-semibold">
              Go to Today
            </button>
          )}
          {step === "choice" && (
            <>
              <button type="button" onClick={() => go("tour-calendar")} className="qe-fact h-9 rounded-full px-3.5 text-[13.5px] font-semibold">
                Show me around
              </button>
              <button type="button" onClick={() => go("real")} className="h-9 rounded-full px-4 text-[13.5px] font-bold" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116" }}>
                Make a real quest
              </button>
            </>
          )}
          {s.next && (
            <button type="button" onClick={main} disabled={busy} className="h-9 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-60" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116" }}>
              {busy ? "…" : s.next}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
