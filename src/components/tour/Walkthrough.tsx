"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourState } from "@/app/actions";
import { ensureStyleExamplesAction, generateAvatarImageAction, tourAction, tourAvatarAction, tourCompletePracticeAction, tourNameAction, tourNewQuestAction, tourPinQuestAction, tourStarterQuestsAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { SnoozeIcon } from "@/components/ui/Icons";
import { AVATAR_STYLE_OPTIONS, DEFAULT_AVATAR_STYLE, SAMPLE_AVATAR_PROMPTS } from "@/lib/avatar-prompts";
import { readTour, subscribeTour, writeTour } from "@/lib/tour-store";
import { useTourLook } from "@/lib/tour-look";
import { fromStartup } from "@/lib/startup";

/**
 * The new-adventurer walkthrough, guided by the Great Toucan Spirit (owner, Nov 13–15; every account goes
 * through it once). He greets you and asks what to call you, then you make your character (a portrait painted
 * from your words), then two starter quests wait on Today, in any order: "Explore the realm" (Today's parts,
 * then each screen) and "Create your first quest" (name, time, due day, reward, create, then claim this one).
 * Each step dims the screen around the control to press and lights it. Snooze or "Skip this step" sit at the
 * card's lower left; Settings › Help starts it again and picks the cards' look.
 */

type Step = {
  /** What it points at: a CSS selector, or a function that finds it. None = the card stands on its own. */
  target?: string | (() => Element | null);
  /** Where this step sits in its part ("Explore the realm · 2 of 9"). */
  part?: [string, number, number];
  title: (name: string) => string;
  text: (name: string) => string;
  /** The card's main button; without it the step waits for what you do. */
  next?: string;
  /** What to press, in one short line under the words (when the step waits for you). */
  press?: string;
  /** Needs Today on screen (offers to go there). */
  today?: boolean;
  /** The ask, floating beside the lit control (owner, Nov 16: one instruction per tap): "What to do|why", the
   *  first part bold, the second quieter under it. */
  tag?: string;
  /** Several taps in a row, one instruction at a time: the last one whose control is on screen is shown. */
  asks?: { find: () => Element | null; say: string }[];
};

const PLUS = '[aria-label="Create something new"]';
const EDITOR = '[role="dialog"][data-save-keys]';
const NAV = (href: string) => `nav[data-app-nav] a[href="${href}"]`;
const EXPLORE = "Explore the realm";
const CREATE = "Create your first quest";

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

const ex = (i: number): Step["part"] => [EXPLORE, i, 6];
const cr = (i: number): Step["part"] => [CREATE, i, 9];
const hm = (i: number): Step["part"] => ["Your home", i, 6];
/** The XP controls once the XP pill is open, else the pill (owner, Nov 16: light what you'll actually touch). */
const pillOrPanel = (k: "time" | "due" | "xp") => () => document.querySelector(`${EDITOR} [data-tour="panel-${k}"]`) ?? document.querySelector(`${EDITOR} [data-tour="fact-${k}"]`);

const STEPS: Record<string, Step> = {
  intro: {
    title: () => "Welcome, traveller",
    text: () =>
      "Ah, a new traveller at the forest's edge — welcome! I'm the Great Toucan Spirit, and I'll be your guide here. This is a magical place where we turn your most important goals into quests to conquer so you can lead your most fulfilling and adventurous life. Before we set forth: by what name shall I call you?",
  },
  character: {
    title: () => "Your character",
    text: () =>
      "This is where you make your character, your persona in this game of real-life quests. Be a calm monk, a brave warrior, a skilled night elf, or anything else that calls to you. There's no wrong choice, and you can change it any time. Describe your character below, and watch them come to life.",
  },
  // A quick look around the home screen before the two starter quests (owner, Nov 16).
  "home-hero": { target: '[data-tour="hero"]', today: true, part: hm(1), title: (n) => `This is you, ${n}`, text: () => "Your character, level and XP live at the top of your home screen. Every quest you finish earns XP, and your character grows with you.", next: "Next" },
  "home-due": { target: '[data-tour="due-soon"]', today: true, part: hm(2), title: () => "Due soon", text: () => "Quests with a due date coming up gather here, so nothing sneaks up on you. Add them to today with a tap.", next: "Next" },
  "home-habits": { target: '[data-tour="daily-habits"]', today: true, part: hm(3), title: () => "Daily Habits", text: () => "The small things you do again and again, each worth its own XP. Tick them off as you go, and watch your streaks grow.", next: "Next" },
  "home-today": { target: '[data-tour="today-quests"]', today: true, part: hm(4), title: () => "Today's Quests", text: () => "These are today's priorities. Keep this list to as few quests as you can realistically finish by the end of the day: most of them, or all of them.", next: "Next" },
  "home-additional": { target: '[data-tour="additional-quests"]', today: true, part: hm(5), title: () => "Additional Quests", text: () => "Quests you'd like to do that don't need to happen today wait here. Move one up to Today's Quests whenever you have room.", next: "Next" },
  "home-victories": { target: '[data-tour="victories"]', today: true, part: hm(6), title: () => "Victories Today", text: () => "Everything you finish today gathers here, with the XP and coins it earned: a record of your day's wins.", next: "Next" },
  quests: {
    target: '[data-tour="today-quests"]',
    today: true,
    title: () => "Two quests await you",
    text: (n) => `Take them in any order, ${n}: one shows you around the realm, the other helps you create your first real quest. Each pays XP and coins when it's done.`,
    press: "Tap either quest on Today's Quests, or choose one here.",
    tag: "Tap a quest|to begin it",
  },
  "ex-calendar": { target: NAV("/calendar"), part: ex(1), title: () => "The Calendar", text: () => "For scheduling your quests, planning your days, and seeing what's coming up next. Your quests sit beside your own calendars: drag one onto a time to plan it.", next: "Next" },
  "ex-boards": { target: NAV("/boards"), part: ex(2), title: () => "All Quests", text: () => "Every quest you have, gathered on boards for your projects and areas of life. Break big goals into steps, see what's next on each board, and use the priority matrix to sort what matters most from what can wait.", next: "Next" },
  "ex-insights": { target: NAV("/insights"), part: ex(3), title: () => "Insights", text: () => "See how you're really doing: quests completed, mood, energy, sleep and more, across days and weeks, so you can spot what helps you thrive.", next: "Next" },
  "ex-party": { target: NAV("/feed"), part: ex(4), title: () => "Your Party", text: () => "Adventures are better together. Cheer each other on, send messages, share boards, and call for support when you need it.", next: "Next" },
  "ex-chest": { target: 'a[href="/rewards"]', part: ex(5), title: () => "The Treasure Chest", text: () => "Turn your effort into real rewards. Set things you'd love, price them in coins, and treat yourself once you've earned them.", next: "Next" },
  "ex-feedback": {
    target: "[data-feedback-btn]",
    part: ex(6),
    title: () => "Help shape this world",
    text: () => "This realm is still being built, and your voice shapes it. Tap this button whenever something is confusing, broken, or could be better. Every note goes straight to the people building it. You can drag it anywhere it suits you.",
    next: "Claim this quest ✦",
  },
  "cr-intro": {
    target: plusOrNewQuest,
    today: true,
    part: cr(1),
    title: () => "Your first quest",
    text: () =>
      "This is where you add your first quest. A quest can be big or small, and should be something that matters to you. I recommend starting with something you can finish today, so you can begin with a victory under your belt. You can add additional quests at any time.",
    press: "Tap the glowing +, then choose New quest.",
    asks: [
      { find: () => document.querySelector(PLUS), say: "Tap the plus|to start a new quest" },
      { find: () => buttonByText(/^new quest/i), say: "Tap New quest|to name it and set it up" },
    ],
  },
  "cr-name": {
    target: `${EDITOR} [aria-label="Title"]`,
    part: cr(2),
    title: () => "Name your quest",
    text: () => "Write it the way you'd say it to a friend: what you'll actually do.",
    press: "Type it in the glowing field.",
    tag: "Type your quest's name|what you'll actually do",
    next: "Next",
  },
  "cr-eta": {
    target: pillOrPanel("time"),
    part: cr(3),
    title: () => "How long will this take?",
    text: () => "A rough guess is fine. It helps me find room for it in your day.",
    press: "Tap Time, then pick a length.",
    asks: [
      { find: () => document.querySelector(`${EDITOR} [data-tour="fact-time"]`), say: "Tap Time|to set how long it takes" },
      { find: () => document.querySelector(`${EDITOR} [data-tour="panel-time"]`), say: "Pick a length|a rough guess is fine" },
    ],
    next: "Next",
  },
  "cr-due": {
    target: pillOrPanel("due"),
    part: cr(4),
    title: () => "When should it be done?",
    text: () => "Give it a due day. If you like, block out a time for it on your calendar too: a quest with a day is a quest that happens.",
    press: "Tap Due, pick a day, and “Find a time” for your calendar.",
    asks: [
      { find: () => document.querySelector(`${EDITOR} [data-tour="fact-due"]`), say: "Tap Due date|to choose when it's done" },
      { find: () => document.querySelector(`${EDITOR} [data-tour="panel-due"]`), say: "Pick a day|and a time, if you like" },
    ],
    next: "Next",
  },
  "cr-xp": {
    target: pillOrPanel("xp"),
    part: cr(5),
    title: () => "Choose your reward",
    text: () => "Use XP and coins to reward and motivate yourself. XP helps you level up your character, and coins buy special rewards you set for yourself in your Treasure Chest. Give just enough to make you want to start.",
    press: "Tap XP, then set the XP with − and + (or type it), and the coins beside it.",
    asks: [
      { find: () => document.querySelector(`${EDITOR} [data-tour="fact-xp"]`), say: "Tap XP|to choose your reward" },
      { find: () => document.querySelector(`${EDITOR} [data-tour="xp-row"]`), say: "Set your XP|with − and +, or type a number" },
    ],
    next: "Next",
  },
  "cr-save": {
    target: `${EDITOR} [data-submit]`,
    part: cr(6),
    title: () => "Create it",
    text: () => "It will wait for you on Today's Quests.",
    press: "Tap Create quest.",
    tag: "Tap Create quest|it waits on Today's Quests",
  },
  "cr-engage": {
    today: true,
    part: cr(7),
    title: () => "Engage your quest",
    text: () => "When you're ready to begin, Engage Quest clears everything else away so you can focus on this one thing.",
    press: "Tap ⋯ on your new quest (or hold the card), then Engage Quest.",
    asks: [
      { find: () => document.querySelector(`[data-task-id="${readTour()?.realId}"] [aria-label="Quest actions"]`), say: "Tap ⋯|your new quest's menu" },
      { find: () => buttonByText(/^engage quest/i), say: "Tap Engage Quest|to focus on just this one" },
    ],
  },
  "cr-focus": {
    target: () => buttonByText(/complete/i, ".one-thing"),
    part: cr(8),
    title: () => "One quest, nothing else",
    text: () => "Do it now, and tap Complete when it's done. Already done it? Tell me how long it took, then Complete. If it's for later, skip this step: it waits on Today.",
    press: "When it's done, tap Complete.",
    tag: "Tap Complete|when it's done",
  },
  "cr-claim": {
    today: true,
    part: cr(9),
    title: () => "Claim your first victory!",
    text: (n) => `Well done, ${n}! Now claim the reward for this one: tap the circle and watch your XP and coins pour in!`,
    press: `Tap the circle on “${CREATE}”.`,
    tag: "Tap the circle|to claim your reward",
  },
  done: {
    title: (n) => `You're ready, ${n} ✦`,
    text: () => "Name it, do it, claim it: every quest works this way. If you ever want this walk again, it's in Settings › Help. I'll be nearby.",
    next: "Begin my adventure",
  },
};

const ORDER_HOME = ["home-hero", "home-due", "home-habits", "home-today", "home-additional", "home-victories"];
const ORDER_EXPLORE = ["ex-calendar", "ex-boards", "ex-insights", "ex-party", "ex-chest", "ex-feedback"];
const ORDER_CREATE = ["cr-intro", "cr-name", "cr-eta", "cr-due", "cr-xp", "cr-save", "cr-engage", "cr-focus", "cr-claim"];

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
  const look = useTourLook();
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
  const [ask, setAsk] = useState<string | null>(null);
  const [tipW, setTipW] = useState(200);
  const [tipH, setTipH] = useState(56);
  // Where the card's bottom edge last sat: it stays there while it can, so he moves as little as he must.
  const [lastB, setLastB] = useState<number | null>(null);

  // The account's place in the walkthrough wins over this device's (latest change wins); the name it goes by
  // is offered when the toucan asks what to call you.
  useEffect(() => {
    fromStartup("tour", tourAction)
      .then((t) => {
        const here = readTour();
        if (!t) {
          if (!here) writeTour({ step: "intro" });
        } else if (!here || (t.at ?? 0) >= (here.at ?? 0)) writeTour(t, false);
      })
      .catch(() => {});
    fromStartup("tourName", tourNameAction)
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

  // A step from the earlier walkthrough (practice quest, screens tour) starts this one from the top.
  const step = state && !state.done && !snoozed ? (STEPS[state.step] ? state.step : "intro") : null;
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
  const seenIn = (t: TourState | null, k: string) => !!t?.hidden?.includes(`_${k}`);
  const withMark = (t: TourState | null, k: string) => [...new Set([...(t?.hidden ?? []), `_${k}`])];
  /** One starter quest is finished: the other next, or the end. */
  const finished = (k: "explore" | "create") => {
    const t = readTour();
    const other = k === "explore" ? "create" : "explore";
    go(seenIn(t, other) ? "done" : "quests", { hidden: withMark(t, k) });
  };

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

  // A starter quest ticked off (from its step, or any time on Today) counts as that part done.
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<{ taskId?: string }>).detail?.taskId;
      const t = readTour();
      if (!id || !t || t.done) return;
      // The quest you made, completed in Engage Quest (or anywhere): on to claiming the starter quest.
      if (id === t.realId && (t.step === "cr-engage" || t.step === "cr-focus")) go("cr-claim");
      else if (id === t.createId && !seenIn(t, "create")) finished("create");
      else if (id === t.exploreId && !seenIn(t, "explore")) finished("explore");
    };
    window.addEventListener("quest-complete", on);
    return () => window.removeEventListener("quest-complete", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finished reads the live state each time
  }, []);

  // While the starter quests wait, tapping one of them on Today begins it (its circle still ticks it off).
  useEffect(() => {
    if (step !== "quests") return;
    const on = (e: MouseEvent) => {
      const el = e.target as Element | null;
      const card = el?.closest?.("[data-task-id]");
      if (!card || el?.closest('[role="checkbox"],[aria-label="Quest actions"]')) return;
      const id = card.getAttribute("data-task-id");
      const t = readTour();
      const next = id && id === t?.exploreId ? "ex-calendar" : id && id === t?.createId ? "cr-intro" : null;
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      go(next);
    };
    document.addEventListener("click", on, true);
    return () => document.removeEventListener("click", on, true);
  }, [step]);

  // Follow the control it points at.
  useEffect(() => {
    if (!s) return;
    let raf = 0;
    const target: Step["target"] =
      step === "cr-claim" && state?.createId
        ? `[data-task-id="${state.createId}"] [role="checkbox"]`
        : step === "cr-engage" && state?.realId
          ? // Its ⋯, then (once the menu is open) the Engage Quest row itself, so the card never sits on it.
            () => buttonByText(/^engage quest/i) ?? document.querySelector(`[data-task-id="${state.realId}"] [aria-label="Quest actions"]`)
          : s.target;
    // Today's Quests' heading with the two starter quests under it, lit as one.
    const withStarters = step === "quests";
    const union = (): DOMRect | null => {
      const t = readTour();
      const parts = [findTarget(target), ...[t?.exploreId, t?.createId].map((id) => (id ? document.querySelector(`[data-task-id="${id}"]`) : null))]
        .filter((e): e is Element => !!e)
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      if (!parts.length) return null;
      const l = Math.min(...parts.map((r) => r.left)), tp = Math.min(...parts.map((r) => r.top));
      return new DOMRect(l, tp, Math.max(...parts.map((r) => r.right)) - l, Math.max(...parts.map((r) => r.bottom)) - tp);
    };
    let broughtFor: string | null = null;
    const tick = () => {
      // Several taps in a row: the latest one whose control is showing.
      let el: Element | null = null;
      let say = s.tag ?? null;
      if (s.asks) {
        for (let i = s.asks.length - 1; i >= 0 && !el; i--) {
          const e = s.asks[i].find();
          const b = e?.getBoundingClientRect();
          if (e && b && b.width > 0 && b.height > 0) [el, say] = [e, s.asks[i].say];
        }
      } else if (!withStarters) el = findTarget(target);
      setAsk((old) => (old === say ? old : say));
      // A control to tap that sits off screen (a new quest still joining Today) is brought into view, once.
      const eb = s.asks ? el?.getBoundingClientRect() : null;
      if (el && eb && say && broughtFor !== say && (eb.bottom < 40 || eb.top > window.innerHeight - 100)) {
        broughtFor = say;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      const r = withStarters ? union() : (el?.getBoundingClientRect() ?? null);
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
  }, [s, step, state?.createId, state?.realId]);

  // Create quest can sit below the editor's fold once its panels are open: bring it into view.
  useEffect(() => {
    if (step !== "cr-save") return;
    const id = window.setTimeout(() => document.querySelector(`${EDITOR} [data-submit]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
    return () => window.clearTimeout(id);
  }, [step]);

  // A part of Today it points at is brought into view.
  useEffect(() => {
    if (!step || !(step === "quests" || step === "cr-claim" || step === "cr-engage" || step.startsWith("home-"))) return;
    const t = window.setTimeout(() => {
      const tr = readTour();
      const sel =
        step === "cr-claim" && tr?.createId ? `[data-task-id="${tr.createId}"]` : step === "cr-engage" && tr?.realId ? `[data-task-id="${tr.realId}"]` : (STEPS[step].target as string);
      const el = document.querySelector(sel);
      const r = el?.getBoundingClientRect();
      if (el && r && (r.top < 80 || r.bottom > window.innerHeight * 0.55)) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
    return () => window.clearTimeout(t);
  }, [step, pathname]);

  // The card's height places it; the snooze choices open under its footer without moving it.
  useLayoutEffect(() => {
    if (cardRef.current && !snoozing) setCardH(cardRef.current.offsetHeight);
  }, [step, rect, celebrating, snoozing, look]);

  // Steps that move on by themselves, from what you do.
  useEffect(() => {
    if (!step) return;
    // An editing step moves on once the editor that was open closes (once: the observer fires often).
    let opened = !!document.querySelector(EDITOR);
    let handling = false;
    const editorUp = () => !!document.querySelector(EDITOR);
    const check = async () => {
      if (step === "cr-intro") {
        if (editorUp()) go("cr-name", { since: new Date(Date.now() - 2000).toISOString() });
        return;
      }
      if (["cr-name", "cr-eta", "cr-due", "cr-xp", "cr-save"].includes(step)) {
        if (editorUp()) {
          opened = true;
          return;
        }
        if (!opened || handling) return;
        handling = true;
        // The editor closed: was a quest made? (A moment for the save to land.)
        await new Promise((r) => setTimeout(r, 700));
        const t = readTour();
        const made = t?.since ? await tourNewQuestAction(t.since, [t.exploreId ?? "", t.createId ?? ""].filter(Boolean)).catch(() => null) : null;
        if (!made) return go("cr-intro");
        // It joins Today's Quests, where Engage Quest is shown next.
        await tourPinQuestAction(made.id).catch(() => {});
        router.refresh();
        return go("cr-engage", { realId: made.id });
      }
      if (step === "cr-engage" && document.querySelector(".one-thing")) return go("cr-focus");
    };
    const mo = new MutationObserver(() => void check());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go reads the live state each time
  }, [step]);

  if (!s || !showing) return null;
  // A tap in the dark around a show-and-tell step: his card gives a small bow, so you know where to look.
  const nudge = () => cardRef.current?.animate([{ scale: "1" }, { scale: "1.025" }, { scale: "1" }], { duration: 280, easing: "ease-out" });

  const vw = typeof window === "undefined" ? 390 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const W = Math.min(368, vw - 28);
  // The toucan floats above the card's top-left corner (or below it, in the speech-bubble look): keep room.
  const TOPROOM = look === "spirit" ? 12 : 48;
  const BOTROOM = look === "spirit" ? 84 : 8;
  // Low on the screen by default (owner, Nov 16), and it stays put: the card keeps its last place while that
  // still leaves the lit control and its floating ask clear; otherwise the nearest place that does. Anchored by
  // its bottom edge, so a longer or shorter step grows upward instead of shifting the whole card.
  const NAV_ROOM = 96;
  const ASK_ROOM = ask ? 74 : 16;
  const left = Math.max(14, Math.min(vw - W - 14, rect ? rect.left + rect.width / 2 - W / 2 : vw / 2 - W / 2));
  const fits = (b: number) => b <= vh - BOTROOM && b - cardH >= TOPROOM && (!rect || b + 4 <= rect.top - ASK_ROOM || b - cardH - 4 >= rect.bottom + ASK_ROOM);
  const low = vh - NAV_ROOM - BOTROOM;
  // His welcome sits a little above the middle, where the eye rests (owner, Nov 16).
  const welcome = step === "intro" ? Math.round(vh * 0.46 + cardH / 2) : null;
  // Low first (his usual place); just above a control low on the screen; then wherever he last stood; then
  // under or over the control; the top last.
  const lowControl = rect && rect.top > vh * 0.6 ? rect.top - ASK_ROOM - 6 : null;
  // (Where he last stood counts only while that was low: a high place is left as soon as a low one fits.)
  const stayed = lastB != null && lastB - cardH >= vh * 0.4 ? lastB : null;
  const choices = [welcome, low, lowControl, stayed, rect ? rect.bottom + ASK_ROOM + cardH + 6 : null, rect ? rect.top - ASK_ROOM - 6 : null, TOPROOM + cardH].filter((b): b is number => b != null);
  const bottom = choices.find(fits) ?? Math.max(TOPROOM + cardH, Math.min(low, vh - BOTROOM));
  const top = bottom - cardH;
  // The floating ask: beside the lit control, on the card's side of it.
  // The tip goes on the card's side of the control; its pointer lands on the control's middle.
  // Above the control unless the card is above it or there's no room up there.
  const askBelow = rect ? rect.bottom <= top || rect.top - 13 - tipH < 56 : false;
  const cx = rect ? rect.left + rect.width / 2 : 0;
  const tipLeft = Math.max(10, Math.min(vw - tipW - 10, cx - tipW / 2));
  const askSpot: React.CSSProperties | null = rect
    ? { left: 0, top: 0, translate: `${tipLeft}px ${askBelow ? rect.bottom + 13 : rect.top - 13 - tipH}px` }
    : null;
  const [askTitle, askSub] = (ask ?? "").split("|");

  const needsToday = s.today && pathname !== "/";

  async function startQuests() {
    if (busy) return;
    setBusy(true);
    const t = readTour();
    const q = await tourStarterQuestsAction({ exploreId: t?.exploreId, createId: t?.createId }).catch(() => null);
    setBusy(false);
    if (pathname !== "/") router.push("/");
    else router.refresh();
    go("home-hero", q ?? {});
  }

  async function claimExplore() {
    if (busy) return;
    const t = readTour();
    if (t?.exploreId && !seenIn(t, "explore")) {
      setBusy(true);
      const res = await tourCompletePracticeAction(t.exploreId).catch(() => null);
      setBusy(false);
      router.refresh();
      // The celebration's event moves the walkthrough on (see the quest-complete listener).
      if (res) return celebrateQuest({ taskId: t.exploreId, title: res.title, xp: res.xp, totalXp: res.totalXp, coinsEarned: res.coins });
    }
    finished("explore");
  }

  function main() {
    if (busy || !step) return;
    if (step === "ex-feedback") return void claimExplore();
    const h = ORDER_HOME.indexOf(step);
    if (h >= 0) return go(ORDER_HOME[h + 1] ?? "quests");
    const e = ORDER_EXPLORE.indexOf(step);
    if (e >= 0) return go(ORDER_EXPLORE[e + 1]);
    const c = ORDER_CREATE.indexOf(step);
    if (c >= 0) return go(ORDER_CREATE[c + 1]);
    if (step === "done") return go("end");
  }

  /** "Skip this step": on to the next one (a part's last step leaves its quest on Today for later). */
  function skipStep() {
    if (!step || busy) return;
    if (step === "intro") return go("character", { name: nameDraft.trim().slice(0, 40) || null });
    if (step === "character") return void startQuests();
    if (step === "quests" || step === "done") return go("end");
    if (step === "ex-feedback") return go(seenIn(readTour(), "create") ? "done" : "quests", { hidden: withMark(readTour(), "explore") });
    if (step === "cr-claim") return go(seenIn(readTour(), "explore") ? "done" : "quests");
    const h = ORDER_HOME.indexOf(step);
    if (h >= 0) return go(ORDER_HOME[h + 1] ?? "quests");
    const e = ORDER_EXPLORE.indexOf(step);
    if (e >= 0) return go(ORDER_EXPLORE[e + 1]);
    const c = ORDER_CREATE.indexOf(step);
    if (c >= 0) return go(ORDER_CREATE[c + 1]);
  }

  const choice = "h-8 rounded-full px-3 text-[13px] font-semibold tour-chip";
  const left2 = state ? [!seenIn(state, "explore") && EXPLORE, !seenIn(state, "create") && CREATE].filter(Boolean) : [];

  return (
    <>
      {/* The screen dims around what to press, and it glows; with nothing to press it dims all round the card.
          One layer that moves (none appearing or leaving), and it never catches a tap. */}
      <div
        aria-hidden
        data-tour-spot
        className="tour-spot pointer-events-none fixed z-[133]"
        data-dark={step === "intro" ? "true" : undefined}
        style={{ left: 0, top: 0, ...(rect ? { transform: `translate(${rect.left - 6}px, ${rect.top - 6}px)`, width: rect.width + 12, height: rect.height + 12 } : { transform: `translate(${vw / 2}px, ${vh / 2}px)`, width: 0, height: 0 }) }}
      />
      {/* A step that only shows and tells (no "press" line) keeps taps in the dark from reaching the screen
          behind it (owner, Nov 19: tapping around the tutorial opened the avatar, the menu, other screens).
          The lit part stays tappable; a tap in the dark nudges his card instead. Scrolling still passes. */}
      {!s.press &&
        (rect
          ? [
              { left: 0, top: 0, width: "100vw", height: Math.max(0, rect.top - 6) },
              { left: 0, top: rect.bottom + 6, width: "100vw", height: `max(0px, calc(100vh - ${rect.bottom + 6}px))` },
              { left: 0, top: rect.top - 6, width: Math.max(0, rect.left - 6), height: rect.height + 12 },
              { left: rect.right + 6, top: rect.top - 6, width: `max(0px, calc(100vw - ${rect.right + 6}px))`, height: rect.height + 12 },
            ]
          : [{ left: 0, top: 0, width: "100vw", height: "100vh" }]
        ).map((box, i) => <div key={i} aria-hidden data-tour-guard className="tour-guard fixed z-[133]" style={box} onClick={nudge} onContextMenu={(e) => e.preventDefault()} />)}
      {/* Placed by transform, so following the control as it scrolls never counts as the page jumping. */}
      <Remember value={bottom} onChange={setLastB} />
      {/* One instruction at a time, floating right by what to tap: its own look, apart from his card. */}
      {/* One instruction at a time, right by what to tap (owner's pick, Nov 16: "Ink and gold"). */}
      {rect && ask && askSpot && (
        <div
          key={ask}
          ref={(el) => {
            if (el && Math.abs(el.offsetWidth - tipW) > 1) setTipW(el.offsetWidth);
            if (el && Math.abs(el.offsetHeight - tipH) > 1) setTipH(el.offsetHeight);
          }}
          data-tour-tag
          className="tour-tip pointer-events-none fixed z-[137]"
          style={askSpot}
        >
          <span className="tour-tip-t">{askTitle}</span>
          {askSub && <span className="tour-tip-s">{askSub}</span>}
          <span aria-hidden className="tour-tip-tri" data-up={askBelow ? "true" : undefined} style={{ left: Math.max(14, Math.min(tipW - 28, cx - tipLeft - 7)) }} />
        </div>
      )}
      {rect && <div aria-hidden data-tour-ring className="tour-ring pointer-events-none fixed z-[134] rounded-2xl" style={{ left: 0, top: 0, transform: `translate(${rect.left - 6}px, ${rect.top - 6}px)`, width: rect.width + 12, height: rect.height + 12 }} />}
      <div
        ref={cardRef}
        role="dialog"
        aria-label={`The Great Toucan Spirit: ${step === "quests" && left2.length === 1 ? "One quest left" : s.title(name)}`}
        data-tour-card
        data-look={look}
        className="tour-card card-pop-in fixed z-[136] flex flex-col gap-2 rounded-[20px] px-4 pb-3 pt-3"
        // Placed by `translate` and glided there, so moving never reads as the page jumping.
        style={{ left: 0, top: 0, translate: `${left}px ${top}px`, width: W, transition: "translate 420ms cubic-bezier(.3,.7,.2,1)" }}
      >
        {/* The toucan himself, floating at the card's corner (or under it, in the speech-bubble look). */}
        <span aria-hidden className="tour-toucan">
          <ToucanArt size={look === "spirit" ? 72 : 64} />
        </span>
        <div className={`flex min-h-[24px] items-center ${look === "spirit" ? "" : "pl-[54px]"}`}>
          <span className="tour-eyebrow flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.12em]">
            {s.part ? `${s.part[0]} · ${s.part[1]} of ${s.part[2]}` : "The Great Toucan Spirit"}
          </span>
        </div>
        <h2 key={`t-${step}`} className="tour-step-in tour-title font-display m-0 text-[20px] leading-tight">{step === "quests" && left2.length === 1 ? "One quest left" : s.title(name)}</h2>
        <p key={`p-${step}`} className="tour-step-in tour-text m-0 text-[14.5px] leading-snug">{step === "quests" && left2.length === 1 ? `One quest still waits for you, ${name}: “${left2[0]}”. It pays XP and coins when it's done.` : s.text(name)}</p>
        {/* With nothing on screen to point at yet, the ask stays in his words. */}
        {s.press && !rect && <p className="tour-whisper m-0 text-[14px] italic leading-snug">{s.press}</p>}
        {step === "intro" && (
          <form
            className="mt-1 flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              go("character", { name: nameDraft.trim().slice(0, 40) || null });
            }}
          >
            {/* The name is written right on his card, in gold ink on a gilded line: no box. */}
            <label htmlFor="tour-name" className="tour-call text-[12px] italic">
              You may call me…
            </label>
            <div className="tour-name-line">
              <span aria-hidden className="tour-name-star">✦</span>
              <input
                id="tour-name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={40}
                autoComplete="given-name"
                autoCapitalize="words"
                spellCheck={false}
                placeholder="your name"
                aria-label="By what name shall I call you?"
                className="tour-name font-display min-w-0 flex-1"
              />
              <span aria-hidden className="tour-name-star">✦</span>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={!nameDraft.trim()} className="h-10 shrink-0 rounded-full px-5 text-[14px] font-bold transition-opacity disabled:opacity-45" style={GOLD_BTN}>
                Let&apos;s begin ›
              </button>
            </div>
          </form>
        )}
        {step === "character" && <CharacterPainter name={name} busy={busy} onKeep={() => void startQuests()} />}
        {step === "quests" && (
          <div className={`grid gap-2 ${left2.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {left2.includes(EXPLORE) && (
              <button type="button" onClick={() => go("ex-calendar")} className="h-10 rounded-full px-2 text-[13.5px] font-semibold tour-chip">
                {EXPLORE}
              </button>
            )}
            {left2.includes(CREATE) && (
              <button type="button" onClick={() => go("cr-intro")} className="h-10 rounded-full px-2 text-[13.5px] font-bold" style={GOLD_BTN}>
                {CREATE}
              </button>
            )}
          </div>
        )}
        {/* Snooze and "Skip this step" at the lower left; the step's own button at the right. */}
        <div className="mt-0.5 flex items-center gap-2">
          <button
            type="button"
            aria-label="Snooze or skip the walkthrough"
            aria-expanded={!!snoozing}
            onClick={() => setSnoozing((v) => (v ? false : "menu"))}
            className="tour-snooze grid h-8 w-8 shrink-0 place-items-center rounded-full"
          >
            <SnoozeIcon size={16} />
          </button>
          {step !== "done" && (
            <button type="button" onClick={skipStep} className="tour-skip h-8 px-1 text-[12.5px] underline-offset-2 hover:underline">
              Skip this step
            </button>
          )}
          <span className="ml-auto flex items-center gap-2">
            {needsToday && (
              <button type="button" onClick={() => router.push("/")} className="h-9 rounded-full px-4 text-[13.5px] font-semibold tour-chip">
                Go to Today
              </button>
            )}
            {s.next && (
              <button type="button" onClick={main} disabled={busy} className="h-9 rounded-full px-4 text-[14px] font-bold disabled:opacity-60" style={GOLD_BTN}>
                {busy ? "…" : s.next}
              </button>
            )}
          </span>
        </div>
        {snoozing && (
          <div className="reveal flex flex-wrap items-center gap-1.5 rounded-xl px-2 py-2" data-tour-snooze style={{ background: "rgba(255,240,200,.08)", border: "1px solid rgba(242,213,138,.25)" }}>
            <span className="tour-eyebrow w-full text-[12px] font-semibold normal-case tracking-normal">Snooze the walkthrough</span>
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
            <button type="button" onClick={() => go("end")} className="tour-skip ml-auto h-8 px-1 text-[12.5px] underline underline-offset-2">
              Skip the whole walkthrough
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Keeps the card's last resting place (where its bottom edge sat), so the next step starts from there. */
function Remember({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  useEffect(() => onChange(value), [value, onChange]);
  return null;
}

/**
 * The character step: describe them in your own words, choose a style, and he paints the portrait right here
 * (the same painter as Settings › Your character). Already have one? It shows, to keep or paint anew.
 */
function CharacterPainter({ name, busy, onKeep }: { name: string; busy: boolean; onKeep: () => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [repaint, setRepaint] = useState(false);
  const [words, setWords] = useState("");
  const [style, setStyle] = useState(DEFAULT_AVATAR_STYLE);
  const [painting, setPainting] = useState(false);
  const [painted, setPainted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The same parts as Settings › Your character (owner, Nov 16): each style's example, ideas to try, prompting tips.
  const [examples, setExamples] = useState<Record<string, string> | null>(null);
  const [ideas, setIdeas] = useState(0);
  const [tips, setTips] = useState(false);
  useEffect(() => {
    ensureStyleExamplesAction()
      .then(setExamples)
      .catch(() => setExamples({}));
  }, []);
  useEffect(() => {
    tourAvatarAction()
      .then((u) => setUrl(u))
      .catch(() => setUrl(null));
  }, []);

  async function paint() {
    if (!words.trim() || painting) return;
    setPainting(true);
    setErr(null);
    try {
      const u = await generateAvatarImageAction(words, false, style);
      setUrl(u);
      setPainted(true);
      setRepaint(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The paint wouldn't take. Try again?");
    } finally {
      setPainting(false);
    }
  }

  const showPortrait = !!url && !repaint;
  return (
    <div className="-mr-2 mt-1 flex max-h-[46dvh] flex-col gap-2.5 overflow-y-auto overscroll-contain pr-2" data-tour-character>
      {showPortrait ? (
        <div className="reveal flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- stored portrait */}
          <img src={url} alt={`${name}'s character`} width={84} height={84} className="tour-portrait h-[84px] w-[84px] shrink-0" />
          <p className="tour-text m-0 text-[14px] italic leading-snug">{painted ? "There you are! Keep this one, or paint again." : `Here you are, ${name}. Keep your character, or paint a new one.`}</p>
        </div>
      ) : (
        <>
          <div className="tour-describe-line">
            <textarea
              value={words}
              onChange={(e) => setWords(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                  e.preventDefault();
                  void paint();
                }
              }}
              rows={2}
              maxLength={300}
              aria-label="Describe your character"
              placeholder="A calm monk in a hooded robe, holding a lantern…"
              className="tour-describe"
              disabled={painting}
            />
          </div>
          {/* Ideas to try: a tap writes one on the line above (to change as you like). */}
          <div className="flex flex-col gap-1" data-tour-ideas>
            <span className="tour-call text-[12px] italic">Need ideas? Tap one to try it</span>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2].map((k) => {
                const idea = SAMPLE_AVATAR_PROMPTS[(ideas * 3 + k) % SAMPLE_AVATAR_PROMPTS.length];
                return (
                  <button key={idea} type="button" onClick={() => setWords(idea)} disabled={painting} className="tour-chip rounded-2xl px-2.5 py-1 text-left text-[12.5px] leading-snug">
                    {idea}
                  </button>
                );
              })}
              <button type="button" onClick={() => setIdeas((n) => n + 1)} className="tour-skip h-7 px-1 text-[12.5px] underline underline-offset-2">
                More ideas
              </button>
            </div>
          </div>
          {/* Each style shows its own example portrait. */}
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Art style">
            {AVATAR_STYLE_OPTIONS.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={style === o.key} title={o.description} onClick={() => setStyle(o.key)} className="tour-chip tour-style flex flex-col items-stretch gap-1 rounded-xl p-1.5 text-[12.5px] font-semibold" disabled={painting}>
                <span className="relative block aspect-square w-full overflow-hidden rounded-lg" style={{ background: "rgba(0,0,0,.25)" }}>
                  {examples?.[o.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- stored example portrait
                    <img src={examples[o.key]} alt={`${o.label} example`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[10.5px] italic opacity-70">{examples ? "No preview" : "Painting…"}</span>
                  )}
                </span>
                {o.label}
              </button>
            ))}
          </div>
          {/* Prompting tips, folded until asked for. */}
          <div>
            <button type="button" onClick={() => setTips((v) => !v)} aria-expanded={tips} className="tour-call text-[12.5px] italic underline-offset-2 hover:underline">
              {tips ? "Hide the tips" : "Tips for a great portrait ›"}
            </button>
            {tips && (
              <ul className="tour-text reveal m-0 mt-1 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-snug">
                <li><b>Who, wearing what, holding what.</b> “An old owl sage in a starry cloak, holding a lantern” beats “a wizard”.</li>
                <li><b>Pick a mood.</b> Brave, calm, mischievous, weary: one word changes the whole face.</li>
                <li><b>Make it yours.</b> Add something from your real life: your dog, your instrument, the mountains you hike.</li>
                <li><b>One character, close up.</b> Portraits read best small when it&rsquo;s a single figure from the shoulders up.</li>
                <li><b>Try two styles.</b> The same words in Storybook and Heroic can look like different heroes.</li>
              </ul>
            )}
          </div>
          {painting && <p className="tour-text tour-painting m-0 text-[13.5px] italic">Painting your portrait… this takes a few moments.</p>}
          {err && (
            <p className="m-0 text-[13px]" role="alert" style={{ color: "#f3b3a0" }}>
              {err}
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showPortrait ? (
          <>
            <button type="button" onClick={() => setRepaint(true)} className="h-9 rounded-full px-4 text-[13.5px] font-semibold tour-chip">
              Paint a new one
            </button>
            <button type="button" onClick={onKeep} disabled={busy} className="h-9 rounded-full px-4 text-[14px] font-bold disabled:opacity-60" style={GOLD_BTN}>
              {busy ? "…" : painted ? "Keep this one ›" : "Keep my character ›"}
            </button>
          </>
        ) : (
          <>
            {url && (
              <button type="button" onClick={() => setRepaint(false)} className="h-9 rounded-full px-3 text-[13px] font-semibold tour-chip">
                ‹ Keep the one I have
              </button>
            )}
            <button type="button" onClick={() => void paint()} disabled={painting || !words.trim()} className="h-9 rounded-full px-4 text-[14px] font-bold disabled:opacity-45" style={GOLD_BTN}>
              {painting ? "Painting…" : "Paint ✦"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
