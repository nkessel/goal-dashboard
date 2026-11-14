"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourState } from "@/app/actions";
import { tourAction, tourCompletePracticeAction, tourNameAction, tourNewQuestAction, tourPracticeQuestAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { SnoozeIcon } from "@/components/ui/Icons";
import { readTour, subscribeTour, writeTour } from "@/lib/tour-store";

/**
 * The new-adventurer walkthrough, guided by the Great Toucan Spirit (owner, Nov 13–14; every account goes
 * through it once). He introduces himself and asks what to call you, then each step dims the screen around the
 * real control you should press, lights it, and waits: a practice quest whose task is to make a quest, then a
 * real one (its name, how long it takes, what it's worth), done in Engage Quest; a tour of the screens, the
 * Treasure Chest and the feedback button. Snooze (1 hour, tomorrow, other) or skip it from the snooze button;
 * Settings › Help starts it again.
 */

type Step = {
  /** What it points at: a CSS selector, or a function that finds it. None = the card stands on its own. */
  target?: string | (() => Element | null);
  /** Where this step sits in its part of the walkthrough (shown as "First quest · 2 of 3"). */
  part?: [string, number, number];
  title: (name: string) => string;
  text: (name: string) => string;
  /** The card's main button; without it the step waits for what you do. */
  next?: string;
  /** What to press, in one short line under the words (when the step waits for you). */
  press?: string;
  /** Needs Today on screen (offers to go there). */
  today?: boolean;
};

const PLUS = '[aria-label="Create something new"]';
const EDITOR = '[role="dialog"][data-save-keys]';
const NAV = (href: string) => `nav[data-app-nav] a[href="${href}"]`;

/** A visible button whose words start with `re` (inside `scope` when given). */
function buttonByText(re: RegExp, scope = "body"): Element | null {
  for (const el of document.querySelectorAll(`${scope} button, ${scope} [role="menuitem"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && re.test((el.textContent ?? "").trim())) return el;
  }
  return null;
}
/** The + button, or, once its menu is open, its "New quest" choice. */
const plusOrNewQuest = () => buttonByText(/^new quest/i) ?? document.querySelector(PLUS);

const STEPS: Record<string, Step> = {
  intro: {
    title: () => "Greetings, traveller",
    text: () => "I am the Great Toucan Spirit, keeper of this quest log. I'll walk beside you for your first steps, one at a time, at your pace. What shall I call you?",
  },
  practice: {
    target: plusOrNewQuest,
    today: true,
    part: ["First quest", 1, 3],
    title: () => "Let's create your first quest",
    text: (n) => `Every journey here begins with a quest, ${n}. I've left a practice one on Today: “Make your first quest”. Let's do it together.`,
    press: "Tap the glowing + below, then choose New quest.",
  },
  "practice-name": {
    target: `${EDITOR} [aria-label="Title"]`,
    part: ["First quest", 2, 3],
    title: () => "Name your quest",
    text: () => "Choose something small you could do right now, like “Drink a glass of water”.",
    press: "Type it in the glowing field, then tap Create quest.",
  },
  choice: {
    part: ["First quest", 3, 3],
    title: (n) => `Well done, ${n} ✦`,
    text: () => "You made a quest, finished it, and earned its reward. That is the heart of it all. What would you like to do next?",
  },
  real: {
    target: plusOrNewQuest,
    today: true,
    part: ["A real quest", 1, 6],
    title: () => "Now, a real quest",
    text: () => "Think of one thing you'd like to get done today. Big or small, it all counts.",
    press: "Tap the glowing +, then choose New quest.",
  },
  "real-name": {
    target: `${EDITOR} [aria-label="Title"]`,
    part: ["A real quest", 2, 6],
    title: () => "Name your quest",
    text: () => "Short and clear: what will you actually do? “Call the dentist” is easier to start than “Health stuff”.",
    press: "Type it in the glowing field.",
    next: "Next",
  },
  "real-eta": {
    target: `${EDITOR} [data-tour="fact-time"]`,
    part: ["A real quest", 3, 6],
    title: () => "How long will this take?",
    text: () => "A rough guess is fine. It helps me find room for it in your day.",
    press: "Tap the glowing Time pill and pick a length.",
    next: "Next",
  },
  "real-xp": {
    target: `${EDITOR} [data-tour="fact-xp"]`,
    part: ["A real quest", 4, 6],
    title: () => "What is it worth to you?",
    text: () => "XP raises your level and character stats. Coins buy rewards you set for yourself. A small task is about 15 XP, a medium one 30, a hard one 50 or more. Choose just enough to make you want to do it.",
    press: "Tap the glowing XP pill to set it.",
    next: "Next",
  },
  "real-save": {
    target: `${EDITOR} [data-submit]`,
    part: ["A real quest", 5, 6],
    title: () => "Create your quest",
    text: () => "It will wait for you on Today's Quests.",
    press: "Tap the glowing Create quest button.",
  },
  "real-engage": {
    today: true,
    part: ["A real quest", 6, 6],
    title: () => "Engage your quest",
    text: () => "When you're ready to begin, Engage Quest clears everything else away so you can focus on this one thing.",
    press: "Tap the glowing ⋯ on your quest (or hold the card), then choose Engage Quest.",
  },
  "real-focus": {
    target: () => buttonByText(/complete/i, ".one-thing"),
    title: () => "One quest, nothing else",
    text: () => "Do it now. If you've already done it, tell me how long it took.",
    press: "When it's done, tap Complete.",
  },
  "tour-calendar": { target: NAV("/calendar"), part: ["Your screens", 1, 8], title: () => "The Calendar", text: () => "When things happen: your quests and your Google calendars side by side. Drag a quest onto a time to plan it.", next: "Next" },
  "tour-boards": { target: NAV("/boards"), part: ["Your screens", 2, 8], title: () => "All Quests", text: () => "Every quest you have, gathered on boards you shape: projects, areas of life, courses.", next: "Next" },
  "tour-today": { target: NAV("/"), part: ["Your screens", 3, 8], title: () => "Today's Quest", text: () => "Your home: today's quests, your habits, and what's due soon.", next: "Next" },
  "tour-insights": { target: NAV("/insights"), part: ["Your screens", 4, 8], title: () => "Insights", text: () => "How you're doing over time: check-ins, sleep, streaks and patterns.", next: "Next" },
  "tour-party": { target: NAV("/feed"), part: ["Your screens", 5, 8], title: () => "Your Party", text: () => "Friends who cheer you on. Send them messages, share boards, and call for support when you need it.", next: "Next" },
  "tour-chest": { target: 'a[href="/rewards"]', part: ["Your screens", 6, 8], title: () => "The Treasure Chest", text: () => "Set rewards for yourself and buy them with the coins your quests earn. Price a reward at about a day or two of quests.", next: "Next" },
  "tour-feedback": { target: "[data-feedback-btn]", part: ["Your screens", 7, 8], title: () => "Help shape this world", text: () => "This app is still being built, and your voice shapes it. Tap this button any time something is confusing, broken, or could be better. Every note goes straight to the people building it.", next: "Next" },
  done: { part: ["Your screens", 8, 8], title: (n) => `You're ready, ${n} ✦`, text: () => "Add a habit from + whenever you like, or invite a friend from your Party. If you ever want this walk again, it's in Settings › Help. I'll be nearby.", next: "Begin my adventure" },
};

const ORDER_TOUR = ["tour-calendar", "tour-boards", "tour-today", "tour-insights", "tour-party", "tour-chest", "tour-feedback"];

const subscribeHtml = (cb: () => void) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-welcome-open", "class"] });
  return () => mo.disconnect();
};
const welcomeUpNow = () => document.documentElement.hasAttribute("data-welcome-open");

function findTarget(t: Step["target"]): Element | null {
  if (!t) return null;
  if (typeof t === "function") return t();
  for (const el of document.querySelectorAll(t)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
}

/** Tomorrow at 9 in the morning. */
function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}
/** This evening at 7 (or in 3 hours if that has passed). */
function thisEvening() {
  const d = new Date();
  d.setHours(19, 0, 0, 0);
  return d.getTime() > Date.now() + 30 * 60_000 ? d.getTime() : Date.now() + 3 * 3_600_000;
}

/** The clock, read outside render's own lines (snooze checks and stamps). */
const nowMs = () => Date.now();

const GOLD_BTN = { background: "linear-gradient(180deg,#f6dd98,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" } as const;

export function Walkthrough() {
  const router = useRouter();
  const pathname = usePathname();
  const tour = useSyncExternalStore(subscribeTour, () => localStorage.getItem("tour-state") ?? "", () => "");
  const state: TourState | null = tour ? (JSON.parse(tour) as TourState) : null;
  const welcomeUp = useSyncExternalStore(subscribeHtml, welcomeUpNow, () => true);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [snoozing, setSnoozing] = useState<false | "menu" | "other">(false);
  const [nameDraft, setNameDraft] = useState("");
  const [, wake] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(180);

  // The account's place in the walkthrough wins over this device's (latest change wins); the name it goes by
  // is offered when the toucan asks what to call you.
  useEffect(() => {
    tourAction()
      .then((t) => {
        const here = readTour();
        if (!t) {
          if (!here) writeTour({ step: "intro" });
        } else if (!here || (t.at ?? 0) >= (here.at ?? 0)) writeTour(t, false);
      })
      .catch(() => {});
    tourNameAction()
      .then((n) => n && setNameDraft((d) => d || readTour()?.name || n))
      .catch(() => {});
  }, []);

  const until = state?.until ?? 0;
  const snoozed = until > nowMs();
  // Snoozed: come back when the time is up (while the app stays open).
  useEffect(() => {
    if (!snoozed) return;
    const t = window.setTimeout(() => wake((n) => n + 1), Math.min(until - nowMs() + 500, 2 ** 31 - 1));
    return () => window.clearTimeout(t);
  }, [snoozed, until]);

  const step = state && !state.done && !snoozed ? state.step : null;
  const s = step ? STEPS[step] : null;
  const name = state?.name || "adventurer";
  const go = (next: string, extra: Partial<TourState> = {}) => {
    const cur = readTour() ?? { step: "intro" };
    setSnoozing(false);
    writeTour({ ...cur, ...extra, step: next, done: next === "end" ? true : cur.done, at: nowMs() });
  };
  const snooze = (ms: number) => {
    const cur = readTour() ?? { step: "intro" };
    setSnoozing(false);
    writeTour({ ...cur, until: ms, at: nowMs() });
  };
  const seen = (k: string) => !!state?.hidden?.includes(`_${k}`);
  const mark = (k: string) => [...new Set([...(state?.hidden ?? []), `_${k}`])];
  const afterReal = () => (seen("tour") ? "done" : "tour-calendar");
  const afterTour = () => (seen("real") ? "done" : "real");

  // One toucan at a time: the perched one steps aside while he guides you here.
  const showing = !!s && !welcomeUp && !celebrating;
  useEffect(() => {
    const e = document.documentElement;
    if (showing) e.setAttribute("data-tour-open", "");
    else e.removeAttribute("data-tour-open");
    return () => e.removeAttribute("data-tour-open");
  }, [showing]);

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
    const target: Step["target"] = step === "real-engage" && state?.realId ? `[data-task-id="${state.realId}"] [aria-label="Quest actions"]` : s.target;
    const tick = () => {
      const el = findTarget(target);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((old) => (old && r && Math.abs(old.top - r.top) < 1 && Math.abs(old.left - r.left) < 1 && Math.abs(old.width - r.width) < 1 && Math.abs(old.height - r.height) < 1 ? old : r));
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
  }, [step, rect, celebrating, snoozing]);

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

  if (!s || !showing) return null;

  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const W = Math.min(352, vw - 28);
  // The toucan's medallion rises above the card's top edge: keep room for it.
  const TOPROOM = 40;
  // Beside the control when there's room (under it, else above it); centred when it points at nothing.
  let top = vh / 2 - cardH / 2;
  let left = vw / 2 - W / 2;
  const inEditor = typeof s.target === "string" && s.target.startsWith(EDITOR);
  // Inside the quest editor the card waits outside it (above, else below), so it never covers the fields.
  const box = inEditor && typeof document !== "undefined" ? document.querySelector(EDITOR)?.getBoundingClientRect() : null;
  if (rect && box) {
    left = Math.max(14, Math.min(vw - W - 14, box.left + box.width / 2 - W / 2));
    top = box.top - 12 - cardH >= TOPROOM ? box.top - 12 - cardH : box.bottom + 12 + TOPROOM + cardH <= vh - 8 ? box.bottom + 12 + TOPROOM : TOPROOM;
  } else if (rect) {
    left = Math.max(14, Math.min(vw - W - 14, rect.left + rect.width / 2 - W / 2));
    top = rect.bottom + 16 + TOPROOM + cardH < vh - 12 ? rect.bottom + 16 + TOPROOM : Math.max(TOPROOM, rect.top - 16 - cardH);
  } else if (step === "intro") top = Math.max(TOPROOM + 24, Math.min(vh * 0.16, vh / 2 - cardH / 2));
  else if (step === "real-focus") top = TOPROOM;
  top = Math.max(TOPROOM, Math.min(top, vh - cardH - 8));

  const needsToday = s.today && pathname !== "/";

  async function begin() {
    if (busy) return;
    setBusy(true);
    const q = await tourPracticeQuestAction().catch(() => null);
    setBusy(false);
    if (pathname !== "/") router.push("/");
    else router.refresh();
    go("practice", { practiceId: q?.id ?? null, since: new Date().toISOString(), name: nameDraft.trim().slice(0, 40) || null });
  }

  function main() {
    if (busy || !step) return;
    if (step === "real-name") return go("real-eta");
    if (step === "real-eta") return go("real-xp");
    if (step === "real-xp") return go("real-save");
    const i = ORDER_TOUR.indexOf(step);
    if (i >= 0) return i < ORDER_TOUR.length - 1 ? go(ORDER_TOUR[i + 1]) : go(afterTour(), { hidden: mark("tour") });
    if (step === "done") return go("end");
  }

  const choice = "h-8 rounded-full px-3 text-[13px] font-semibold tour-chip";

  return (
    <>
      {/* The screen dims around what to press, and it glows; with nothing to press it dims all round the card.
          One layer that moves (none appearing or leaving), and it never catches a tap. */}
      <div
        aria-hidden
        data-tour-spot
        className="tour-spot pointer-events-none fixed z-[133]"
        style={rect ? { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 } : { left: vw / 2, top: vh / 2, width: 0, height: 0 }}
      />
      {rect && <div aria-hidden data-tour-ring className="tour-ring pointer-events-none fixed z-[134] rounded-2xl" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`The Great Toucan Spirit: ${s.title(name)}`}
        data-tour-card
        className="tour-card card-pop-in fixed z-[136] flex flex-col gap-2 rounded-[20px] px-4 pb-3.5 pt-3"
        style={{ left, top, width: W, transition: "left 220ms ease, top 220ms ease" }}
      >
        {/* The toucan himself, in a medallion that rises out of the card's corner. */}
        <div aria-hidden className="tour-medallion absolute -top-9 left-3 grid h-[60px] w-[60px] place-items-center rounded-full">
          <ToucanArt size={40} />
        </div>
        <div className="flex min-h-[26px] items-center gap-2 pl-[66px]">
          <span className="tour-eyebrow flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.12em]">
            {s.part ? `${s.part[0]} · ${s.part[1]} of ${s.part[2]}` : "The Great Toucan Spirit"}
          </span>
          <button
            type="button"
            aria-label="Snooze or skip the walkthrough"
            aria-expanded={!!snoozing}
            onClick={() => setSnoozing((v) => (v ? false : "menu"))}
            className="tour-snooze grid h-8 w-8 shrink-0 place-items-center rounded-full"
          >
            <SnoozeIcon size={16} />
          </button>
        </div>
        {snoozing && (
          <div className="reveal flex flex-wrap items-center gap-1.5 rounded-xl px-2 py-2" data-tour-snooze style={{ background: "rgba(255,240,200,.08)", border: "1px solid rgba(242,213,138,.25)" }}>
            <span className="w-full text-[12px] font-semibold" style={{ color: "#f2d58a" }}>
              Snooze the walkthrough
            </span>
            {snoozing === "menu" ? (
              <>
                <button type="button" className={choice} onClick={() => snooze(Date.now() + 3_600_000)}>1 hour</button>
                <button type="button" className={choice} onClick={() => snooze(tomorrowMorning())}>Tomorrow</button>
                <button type="button" className={choice} onClick={() => setSnoozing("other")}>Other…</button>
              </>
            ) : (
              <>
                <button type="button" className={choice} onClick={() => snooze(Date.now() + 3 * 3_600_000)}>3 hours</button>
                <button type="button" className={choice} onClick={() => snooze(thisEvening())}>This evening</button>
                <button type="button" className={choice} onClick={() => snooze(Date.now() + 3 * 86_400_000)}>In 3 days</button>
                <button type="button" className={choice} onClick={() => setSnoozing("menu")}>‹ Back</button>
              </>
            )}
            <button type="button" onClick={() => go("end")} className="ml-auto h-8 px-1 text-[12.5px] underline underline-offset-2" style={{ color: "#e8d6ae" }}>
              Skip the walkthrough
            </button>
          </div>
        )}
        <h2 className="font-display m-0 text-[20px] leading-tight" style={{ color: "#fbeecb" }}>
          {s.title(name)}
        </h2>
        <p className="m-0 text-[14.5px] leading-snug" style={{ color: "#efe3c6" }}>
          {s.text(name)}
        </p>
        {s.press && (
          <p className="tour-press m-0 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-semibold leading-snug">
            <span aria-hidden>✦</span>
            <span>{s.press}</span>
          </p>
        )}
        {step === "intro" && (
          <form
            className="mt-1 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void begin();
            }}
          >
            <input
              id="tour-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              placeholder="Your name"
              aria-label="What shall I call you?"
              className="tour-input h-10 min-w-0 flex-1 rounded-xl px-3 text-[16px]"
            />
            <button type="submit" disabled={busy || !nameDraft.trim()} className="h-10 shrink-0 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={GOLD_BTN}>
              {busy ? "…" : "Let's begin"}
            </button>
          </form>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 empty:hidden">
          {needsToday && (
            <button type="button" onClick={() => router.push("/")} className="h-9 rounded-full px-4 text-[13.5px] font-semibold tour-chip">
              Go to Today
            </button>
          )}
          {step === "choice" && (
            <div className="grid w-full grid-cols-2 gap-2">
              <button type="button" onClick={() => go("tour-calendar")} className="h-10 rounded-full px-2 text-[13.5px] font-semibold tour-chip">
                Show me around
              </button>
              <button type="button" onClick={() => go("real")} className="h-10 rounded-full px-2 text-[13.5px] font-bold" style={GOLD_BTN}>
                Create a real quest
              </button>
            </div>
          )}
          {s.next && (
            <button type="button" onClick={main} disabled={busy} className="h-9 rounded-full px-5 text-[14px] font-bold disabled:opacity-60" style={GOLD_BTN}>
              {busy ? "…" : s.next}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
