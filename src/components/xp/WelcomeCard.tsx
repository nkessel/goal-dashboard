"use client";

import { SnoozeIcon } from "@/components/ui/Icons";
import { SwipeActions } from "@/components/ui/SwipeActions";
import { openPlanMyDay } from "@/components/calendar/PlanMyDay";
import { WelcomeHabits } from "@/components/xp/WelcomeHabits";

import { fogOn, liftFog } from "@/lib/welcome-fog";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confirm, NoteButton, WhyBox } from "@/components/toucan/SayingFeedback";
import Link from "next/link";
import { CoinIcon } from "@/components/ui/Icons";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { EnergyCheck } from "./EnergyCheck";
import { CheckinIcon } from "./CheckinIcon";
import { likeLine, likedLines, lineForDay, retireLine } from "@/lib/greetings";
import { CHECKIN_STYLES, checkinIconOf, checkinStyleOf, loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";
import { addBackGreeting, checkinLabel, pickFor, readPromptVotes, reflectQuestions, toucanPrompts, welcomeOrder, welcomeShows, writePromptVotes, type PromptVotes, type WelcomeEl } from "@/lib/welcome";
import { useEscape } from "@/lib/use-escape";
import { useLongPress } from "@/lib/use-long-press";
import { coachAction, setTopPriorityAction, welcomePartsXpAction } from "@/app/actions";
import { Digest, talkToToucan } from "@/components/toucan/ToucanGuide";
import { GearIcon } from "@/components/ui/Icons";
import { ArrangeAbove, ArrangeList, CastleEdit, EditButton, GoldCheck, GreetingOptions } from "./WelcomeArrange";
import { MistScene } from "./MistScene";
import { DueSoonDrawer } from "@/components/tasks/DueSoonDrawer";
import { SleepCheckIn } from "./SleepCheckIn";
import { TodayPlanner } from "./TodayPlanner";
import { castleOf } from "./CastleArt";
import { Fold } from "@/components/ui/Fold";
import { addJournalEntryAction } from "@/app/actions";
import { cleanXp, journalPrompts, type JournalPrompt } from "@/lib/journal-prompts";

export type WelcomeAward = { xp: number; streak: number; coins: number; fromPct: number; toPct: number; caption: string };

const CONFETTI_COLORS = ["#f2c94c", "#e2bf63", "#58a04a", "#c0503a", "#4d7fc0", "#f6e6bb"];
const PIECES = Array.from({ length: 24 }, (_, i) => {
  const angle = ((i * 360) / 24 + (i % 3) * 9) * (Math.PI / 180);
  const dist = 140 + ((i * 41) % 90);
  return { dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist * 0.8 - 30), rot: ((i * 97) % 540) - 270, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], round: i % 4 === 0, delay: (i % 5) * 30 };
});

/**
 * The welcome screen: the day's first visit, or "welcome back" after a few
 * hours. Its parts (the toucan's greeting, a check-in with sleep times and
 * mood, the streak, the day's line, the level bar, XP, what's due soon) show
 * in the order and combination chosen in Settings.
 */
export function WelcomeCard({
  mode,
  heading,
  award,
  line,
  metrics,
  lastCheckInAt,
  due,
  today = [],
  priority = null,
  fx: fxProp,
  onClose,
  toToday,
  onCheckedIn,
  onSnooze,
  preview = false,
  startMinimized = false,
  onMinimize,
}: {
  mode: "day" | "back";
  heading: string;
  award: WelcomeAward | null;
  line: string | null;
  metrics: string[];
  lastCheckInAt: string | null;
  due: { id: string; title: string; due_at: string | null }[];
  /** Today's Quests, in order (chosen right here). */
  today?: { id: string; title: string; due_at: string | null }[];
  /** Your latest top priority (and the day it was for). */
  priority?: { text: string; others?: string[]; day: string } | null;
  fx: FxSettings;
  onClose: () => void;
  /** Saying you're ready goes on to Today (called as the welcome screen fades). */
  toToday?: () => void;
  /** Called once a check-in is saved here. */
  onCheckedIn?: () => void;
  /** Bring it back after this many milliseconds instead of skipping it for today. */
  onSnooze?: (ms: number) => void;
  /** Opened from Settings to try it out: shows above the settings popup. */
  preview?: boolean;
  /** Tucked away as a small sun (or moon) bubble, to open again later. */
  startMinimized?: boolean;
  onMinimize?: (minimized: boolean) => void;
}) {
  // The settings as they are now: changed right here while arranging, or anywhere else.
  const [fx, setFx] = useState(fxProp);
  useEffect(() => subscribeFx(() => setFx(loadFx())), []);
  // The gear arranges the screen in place: each part gets its own controls where it sits.
  const [arranging, setArranging] = useState(false);
  // A long press on a part (phones) arranges the screen with that part's options open.
  const [holdEl, setHoldEl] = useState<WelcomeEl | null>(null);
  // Your verdict on the day's wise line: liked lines come back often, disliked ones never.
  const [verdict, setVerdict] = useState<"like" | "dislike" | null>(() => (line && typeof window !== "undefined" && likedLines().has(line) ? "like" : null));
  // More wise lines with ‹ › (the day's line first; each › brings one you haven't seen this visit).
  const [moreLines, setMoreLines] = useState<string[]>([]);
  const [lineAt, setLineAt] = useState(0);
  const shownLine = lineAt === 0 ? line : (moreLines[lineAt - 1] ?? line);
  const stepLine = (d: number) => {
    let next = lineAt + d;
    if (next < 0) return;
    if (next > moreLines.length) {
      const seen = new Set([line, ...moreLines]);
      let pick = "";
      for (let i = 0; i < 12 && (!pick || seen.has(pick)); i++) pick = lineForDay(`more-${line}-${moreLines.length}-${i}`);
      if (!pick || seen.has(pick)) return;
      setMoreLines((m) => [...m, pick]);
      next = moreLines.length + 1;
    }
    const to = next === 0 ? line : (moreLines[next - 1] ?? null);
    setLineAt(next);
    setVerdict(to && likedLines().has(to) ? "like" : null);
    setLineWhy(null);
  };
  // Thumbs down asks why; the speech bubble beside the thumbs takes any other note.
  const [lineWhy, setLineWhy] = useState<"down" | "note" | null>(null);
  const [lineSaid, setLineSaid] = useState<string | null>(null);
  // The same for the greeting: thumbs, why, a note, and a word that it landed.
  const [greetVerdict, setGreetVerdict] = useState<"like" | "dislike" | null>(null);
  const [greetWhy, setGreetWhy] = useState<"down" | "note" | null>(null);
  const [greetSaid, setGreetSaid] = useState<string | null>(null);
  // Phones: the greeting's and the wise line's ✎ and thumbs wait until you tap the words (no tools always showing).
  const [greetTools, setGreetTools] = useState(false);
  const [lineTools, setLineTools] = useState(false);
  const movedRef = useRef(false);
  const [checkedIn, setCheckedIn] = useState(false);
  // While arranging: the greeting's own options (from the ✎ beside it), and whether the castle is in view.
  const [greetingOpen, setGreetingOpen] = useState(false);
  // The greeting is yours to rewrite: tap it, write your own, and choose whether to keep it.
  // The pinned foot's parchment lines up with the card's own (it showed as a different patch of paper).
  const cardRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  // The pinned cap at the card's top too (the band the toucan perches on and the corner buttons sit in).
  const capRef = useRef<HTMLDivElement>(null);
  const alignFoot = () => {
    const c = cardRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    for (const f of [footRef.current, capRef.current]) {
      if (!f) continue;
      const fr = f.getBoundingClientRect();
      f.style.backgroundPosition = `${Math.round(cr.left + c.clientLeft - fr.left)}px ${Math.round(cr.top + c.clientTop - fr.top)}px`;
    }
  };
  // Once (it re-ran on every render, measuring the card each time, during the mist's opening).
  useLayoutEffect(() => {
    alignFoot();
    window.addEventListener("resize", alignFoot);
    const ro = new ResizeObserver(alignFoot);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => {
      window.removeEventListener("resize", alignFoot);
      ro.disconnect();
    };
  }, []);
  // A part folding shut near the bottom must not pull everything down (the card would scroll back to
  // fit, moving what you tapped; ui-check, Nov 2): a spacer under the parts holds the scroll still, and
  // gives the room back as you scroll up.
  const spacerRef = useRef<HTMLDivElement>(null);
  const holdScroll = () => {
    const c = cardRef.current;
    const sp = spacerRef.current;
    if (!c || !sp) return;
    const st = c.scrollTop;
    if (st <= 0) return;
    const until = performance.now() + 700;
    const tick = () => {
      const max = c.scrollHeight - c.clientHeight;
      if (max < st - 0.5) {
        sp.style.height = `${(parseFloat(sp.style.height) || 0) + (st - max)}px`;
        c.scrollTop = st;
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const lastTop = useRef(0);
  const giveBack = () => {
    const c = cardRef.current;
    const sp = spacerRef.current;
    if (!c || !sp) return;
    const h = parseFloat(sp.style.height) || 0;
    const up = lastTop.current - c.scrollTop;
    lastTop.current = c.scrollTop;
    if (h > 0 && up > 0) sp.style.height = `${Math.max(0, h - up)}px`;
  };
  const [greeting, setGreeting] = useState(heading);
  // "Good morning!" before it (unless it already speaks of the time of day). Shown only, never saved into the line.
  const [hour] = useState(() => new Date().getHours());
  const hello = /\b(good|morning|afternoon|evening|night|dawn|dusk)\b/i.test(greeting) ? "" : hour < 5 ? "Good evening! " : hour < 12 ? "Good morning! " : hour < 17 ? "Good afternoon! " : "Good evening! ";
  const [writing, setWriting] = useState<string | null>(null);
  const greetingRef = useRef<HTMLParagraphElement>(null);
  // The next time this screen opens, he flies in again.
  useEffect(() => () => resetToucanFlight(), []);
  // Minimized: a small sun (or moon) bubble; the app is yours meanwhile.
  const [min, setMin] = useState(startMinimized);
  const [minimizing, setMinimizing] = useState(false);
  function minimize(now = false) {
    if (min || minimizing) return;
    onMinimize?.(true);
    if (now || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMin(true);
      return;
    }
    // Into the forest, and Today through the fog.
    setMinimizing(true);
    setTimeout(() => {
      fogOn(1200);
      setMin(true);
      setMinimizing(false);
    }, 1100);
  }
  function restore() {
    onMinimize?.(false);
    setMin(false);
  }
  // Where you've put it, and how wide (kept on this device).
  const [at, setAt] = useState<{ x: number; y: number }>(() => readJson("welcome-card-at", { x: 0, y: 0 }));
  const [cardW, setCardW] = useState<number>(() => readJson("welcome-card-w", 500));
  const moving = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  // Never off the screen: a spot (or width) kept from a wider window, or a drag too far, comes back in.
  useLayoutEffect(() => {
    // Only a new width counts: the keyboard (and Chrome's toolbar) change the height alone, and the
    // card's spot mustn't be pulled up for good while a field has focus.
    let lastW = -1;
    const fitIn = () => {
      const c = cardRef.current;
      if (!c || moving.current || window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      const w = c.offsetWidth;
      const maxX = Math.max(0, (window.innerWidth - w) / 2 - 16);
      const maxY = Math.max(0, window.innerHeight * 0.4);
      setAt((a) => {
        const x = Math.round(Math.max(-maxX, Math.min(maxX, a.x)));
        const y = Math.round(Math.max(0, Math.min(maxY, a.y)));
        return x === a.x && y === a.y ? a : { x, y };
      });
    };
    fitIn();
    window.addEventListener("resize", fitIn);
    return () => window.removeEventListener("resize", fitIn);
  }, [cardW]);
  const sizing = useRef<{ x: number; w: number } | null>(null);
  // One toucan at a time: while this screen is open the perched one and his notes wait (see PerchedOwl, ToucanGuide).
  useEffect(() => {
    if (min) return;
    const e = document.documentElement;
    e.setAttribute("data-welcome-open", "");
    return () => {
      e.removeAttribute("data-welcome-open");
      // The toucan's notes wait a while after this (ToucanGuide's raise reads it).
      e.dataset.welcomeClosedAt = String(Date.now());
    };
  }, [min]);
  // Writing: the cursor goes to the end of the greeting itself.
  useEffect(() => {
    const el = greetingRef.current;
    if (writing === null || !el || document.activeElement === el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }, [writing]);
  const [keepAsk, setKeepAsk] = useState<{ text: string; was: string; keep: boolean; retire: boolean } | null>(null);
  function finishWriting() {
    const t = (writing ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    setWriting(null);
    if (!t || t === greeting) return;
    setKeepAsk({ text: t, was: greeting, keep: true, retire: true });
    setGreeting(t);
  }
  // Thumbs on the greeting: liked ones come round more often; a thumbs down retires it (and asks why).
  function voteGreeting(v: "like" | "dislike" | null) {
    const now = loadFx();
    const without = (xs?: string[]) => (xs ?? []).filter((x) => x !== greeting);
    patchFx({
      welcomeBackLiked: v === "like" ? [...without(now.welcomeBackLiked), greeting] : without(now.welcomeBackLiked),
      welcomeBackOff: v === "dislike" ? [...without(now.welcomeBackOff), greeting] : without(now.welcomeBackOff),
    });
    const was = greetVerdict;
    setGreetVerdict(v);
    setGreetWhy(v === "dislike" ? "down" : null);
    setGreetSaid(v === "like" ? "Saved: it'll greet you more often" : v === "dislike" ? "Got it: it won't greet you again" : was === "dislike" ? "It's back in the rotation" : "Taken back");
  }
  function settleGreeting() {
    if (!keepAsk) return;
    const now = loadFx();
    const patch: Partial<FxSettings> = keepAsk.keep ? addBackGreeting(now, keepAsk.text) : {};
    if (keepAsk.retire) patch.welcomeBackOff = [...new Set([...(patch.welcomeBackOff ?? now.welcomeBackOff ?? []), keepAsk.was])];
    if (Object.keys(patch).length) patchFx(patch);
    setKeepAsk(null);
  }
  const [castleSeen, setCastleSeen] = useState(true);
  // Snooze: the times spread out in a line from the button ("other" brings the rest).
  const [snoozing, setSnoozing] = useState<false | "main" | "other">(false);
  const [customMin, setCustomMin] = useState("");
  // Complete check-in: saves whatever is entered in the check-in, then on into the forest.
  const submitCheckin = useRef<((after: () => void) => void) | null>(null);
  // The top priority and the intention save with it too: nothing typed here is lost on the way out.
  const savers = useRef<Partial<Record<"focus" | "sleep" | "journal", () => Promise<boolean>>>>({});
  const [finishing, setFinishing] = useState(false);
  const complete = async () => {
    if (finishing || leaving) return;
    setFinishing(true);
    const ok = (await Promise.all(Object.values(savers.current).map((f) => f?.() ?? true))).every(Boolean);
    setFinishing(false);
    // A save that failed says so where it is, and the screen stays.
    if (!ok) return;
    const goOn = () => (payParts(), leave());
    if (checkinOpen && !checkedIn && submitCheckin.current) submitCheckin.current(goOn);
    else goOn();
  };
  // The check-in starts as a gilded button and opens in its place.
  const [checkinOpen, setCheckinOpen] = useState(false);
  // While Due soon's drawer is open, the screen steps down a layer so a card's editor can open over it.
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Checked in within the last hour? Then there's no need to ask again here.
  const [recent] = useState(() => !!lastCheckInAt && Date.now() - Date.parse(lastCheckInAt) < 3_600_000);
  // Ready: into the forest, through the mist, and out onto Today.
  const [leaving, setLeaving] = useState(false);
  // The screen's height, held still while a phone keyboard is up (or a field has focus), so
  // opening and closing it (the feedback box, a field here) never resizes or moves the card.
  const [screenH, setScreenH] = useState<number | null>(null);
  // Keyboard up over a field low on the card (the toucan's respond line, say): the card glides
  // up just enough to show it, and back down when the keyboard goes.
  const [kbLift, setKbLift] = useState(0);
  // Room added under the card's parts while the keyboard is up, so the card can scroll a low field into view.
  const [kbRoom, setKbRoom] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const a = document.activeElement as HTMLElement | null;
        const inside = !!a?.closest("[data-welcome-root]") && (a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement || !!a?.isContentEditable);
        // Against the held height: Chrome on iPhone shrinks innerHeight with the keyboard, so innerHeight alone never shows it.
        const base = Math.max(window.innerHeight, screenRef.current?.h ?? 0);
        if (!inside || base - vv.height < 120) return setKbLift(0), setKbRoom(0);
        setKbLift((cur) => {
          const r = a!.getBoundingClientRect();
          // Where it would sit without the lift.
          const bottom = r.bottom + cur;
          const top = r.top + cur;
          const need = Math.max(0, Math.round(Math.min(bottom - (vv.offsetTop + vv.height - 14), top - vv.offsetTop - 60)));
          // Never so far that the toucan perched on the card's top goes off the screen (ui-check, Nov 6: the
          // Journal's box sits lower): the rest is made up by scrolling the card over a little room at its foot.
          const cardTop = (cardRef.current?.getBoundingClientRect().top ?? 0) + cur;
          const most = Math.max(0, Math.round(cardTop - vv.offsetTop - 64));
          const lift = Math.min(need, most);
          const rest = need - lift;
          setKbRoom(rest);
          if (rest > 0) requestAnimationFrame(() => cardRef.current?.scrollBy({ top: rest, behavior: "smooth" }));
          return lift;
        });
      });
    };
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
    };
  }, []);
  // Measured before the first paint, then again only when the screen's width changes (a turn of the phone):
  // iPhone's toolbars and keyboard change its height while you scroll or type, and the card must not follow
  // (that was the bounce while scrolling and the dark band as the keyboard went down; owner's recordings, Nov 2).
  const screenRef = useRef<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const typing = () => {
      const a = document.activeElement;
      return document.documentElement.hasAttribute("data-kb") || a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(a.type));
    };
    const measure = () => {
      const w = window.innerWidth;
      const prev = screenRef.current;
      if (prev && (prev.w === w || typing())) return;
      screenRef.current = { w, h: window.innerHeight };
      setScreenH(window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  const leave = () => {
    if (leaving) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return (onClose(), toToday?.());
    setLeaving(true);
    const elsewhere = !!toToday && window.location.pathname !== "/";
    // From another page, the fog takes over once the mist has rolled in, and Today lifts it.
    setTimeout(() => {
      // Today comes through the mist instead of appearing at once (owner, Nov 4: "a hard jump right into the today screen").
      if (!elsewhere) revealThroughMist();
      onClose();
      toToday?.();
    }, elsewhere ? 1350 : 2400);
  };
  // Snoozing leaves the same way as Continue: the card dives into the forest and the mist lifts (owner, Nov 3: "it just jumps").
  const snoozeOut = (ms: number) => {
    if (leaving) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return onSnooze?.(ms);
    setLeaving(true);
    setTimeout(() => {
      if (window.location.pathname === "/") revealThroughMist();
      onSnooze?.(ms);
    }, window.location.pathname === "/" ? 2400 : 1350);
  };
  // Only the bottom-right button goes on to town: Escape and taps on the mist just close what's open.
  useEscape(() => {
    if (arranging) setArranging(false);
  });

  // The XP counts up by writing straight into its text (a state update each frame re-rendered the whole card).
  const xpRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!award?.xp) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start - 350) / 700);
      if (xpRef.current) xpRef.current.textContent = `+${Math.round(Math.max(0, t) * award.xp)} XP`;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [award?.xp]);

  // Buttons you shape yourself (right-click or hold one): words, icon, and the XP a part pays once filled in (owner, Nov 6).
  const btn = fx.welcomeButtons ?? {};
  const [filledParts, setFilledParts] = useState<PartKey[]>([]);
  const filledRef = useRef<PartKey[]>([]);
  const fillPart = (k: PartKey) => {
    if (!filledRef.current.includes(k)) filledRef.current = [...filledRef.current, k];
    setFilledParts((cur) => (cur.includes(k) ? cur : [...cur, k]));
  };
  // Journal prompts written this visit, each with its own XP.
  const journalRef = useRef<{ key: string; xp: number }[]>([]);
  const [journalFilled, setJournalFilled] = useState<{ key: string; xp: number }[]>([]);
  const fillJournal = (key: string, xpN: number) => {
    if (journalRef.current.some((j) => j.key === key)) return;
    journalRef.current = [...journalRef.current, { key, xp: xpN }];
    setJournalFilled(journalRef.current);
  };
  // Pays each part filled in this visit (once a day each, the server keeps count).
  const payParts = () => {
    const list = [...filledRef.current.filter((k) => k !== "focus").map((k) => ({ key: k as string, xp: partXp(k) })), ...journalRef.current].filter((p) => p.xp > 0);
    if (list.length) void welcomePartsXpAction(list).catch(() => {});
  };
  const partXp = (k: PartKey) => Math.max(0, Math.min(50, btn[k]?.xp ?? 5));
  const [btnEdit, setBtnEdit] = useState<ButtonKey | null>(null);
  // Swipe a part's button left to snooze it until tomorrow, right to hide it (owner, Nov 6). Snoozes live on this device.
  const [snoozedParts, setSnoozedParts] = useState<string[]>(() => readSnoozedParts());
  const snoozePart = (el: WelcomeEl) => {
    const next = [...new Set([...snoozedParts, el])];
    setSnoozedParts(next);
    try {
      window.localStorage.setItem(SNOOZE_PARTS_KEY, JSON.stringify({ day: localDay(), parts: next }));
    } catch {
      /* storage unavailable */
    }
  };
  const hidePart = (el: WelcomeEl) => patchFx({ welcomeHide: [...new Set([...(loadFx().welcomeHide ?? ["due"]), el])] });
  const parts: Partial<Record<WelcomeEl, React.ReactNode>> = {
    // The Journal (owner, Nov 6): a button that opens prompt pills; Top priorities is the first and default.
    focus: (
      <WelcomeJournal
        fx={fx}
        label={btn.focus?.text?.trim()}
        icon={btn.focus?.icon}
        registerJournal={(f) => (savers.current.journal = f)}
        onWritten={(id, xpN) => fillJournal(`journal-${id}`, xpN)}
        priorities={(q, xpN) => (
          <TopPriority arranging={arranging} register={(f) => (savers.current.focus = f)} last={priority} question={q || fx.welcomeFocusQ?.trim() || "What are your top priorities today?"} onFilled={() => fillJournal("focus", xpN)} />
        )}
      />
    ),
    checkin: recent ? null : (
      <div className="flex w-full flex-col items-center">
        {/* The button stays; the check-in slides open beneath it (and closes the same way). */}
        <button
          type="button"
          onClick={() => !arranging && setCheckinOpen((v) => !v)}
          aria-expanded={checkinOpen}
          className="font-display flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]"
          style={checkinStyleOf(fx).style}
        >
          {btn.checkin?.icon ? <span aria-hidden>{btn.checkin.icon}</span> : <CheckinIcon icon={checkinIconOf(fx)} />} {checkedIn ? "Checked in ✓" : btn.checkin?.text?.trim() || checkinLabel(fx)}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ opacity: 0.8, transform: checkinOpen && !arranging ? "rotate(180deg)" : undefined }}>
            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {!arranging && (
          <div className="drawer-body w-full" data-open={checkinOpen ? "true" : "false"}>
            <div className="drawer-inner" inert={!checkinOpen}>
              <CheckinPanel fx={fx} metrics={metrics} submit={(f) => (submitCheckin.current = f)} onSaved={() => (setCheckedIn(true), fillPart("checkin"), onCheckedIn?.())} />
            </div>
          </div>
        )}
      </div>
    ),
    sleep: <SleepCheckIn register={(f) => (savers.current.sleep = f)} label={btn.sleep?.text?.trim()} icon={btn.sleep?.icon} onFilled={() => fillPart("sleep")} />,
    streak: award && award.streak > 0 ? (
      <p className="m-0 text-[14.5px] italic leading-snug" style={{ color: "#5a4a30" }}>
        {award.streak > 1 ? `🔥 ${award.streak}-day login streak — keep it going` : "Day one of a new login streak"}
      </p>
    ) : null,
    reflect: reflectQuestions(fx).length ? <ReflectLine questions={reflectQuestions(fx)} /> : null,
    habits: <WelcomeHabits fx={fx} />,
    line: shownLine ? (
      <div className="flex w-full flex-col items-center gap-0.5">
        {/* ‹ › either side for more wise lines (owner, Nov 5); quiet thumbs right after the line's last word. */}
        <div className="flex w-full items-center gap-1">
        <button type="button" onClick={() => stepLine(-1)} disabled={lineAt === 0} aria-label="The wise line before" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[18px] leading-none disabled:opacity-25" style={{ color: "#8a6a2c" }}>
          ‹
        </button>
        <p onClick={(e) => !(e.target as HTMLElement).closest("button") && setLineTools((v) => !v)} className={`m-0 text-center text-[16px] leading-snug [text-wrap:pretty] ${verdict === "dislike" ? "line-through opacity-50" : ""}`} style={{ color: "var(--t-ink)" }}>
          {shownLine}
          <span data-show={lineTools || !!lineWhy ? "true" : "false"} className="touch-tools ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle no-underline" style={{ textDecoration: "none" }}>
            <LineVote kind="like" on={verdict === "like"} onClick={() => (likeLine(shownLine, verdict !== "like"), setVerdict(verdict === "like" ? null : "like"), setLineSaid(verdict === "like" ? "Taken back" : "Saved: it'll come back more often"))} />
            <LineVote kind="dislike" on={verdict === "dislike"} onClick={() => (retireLine(shownLine, verdict !== "dislike"), setVerdict(verdict === "dislike" ? null : "dislike"), setLineWhy(verdict === "dislike" ? null : "down"), setLineSaid(verdict === "dislike" ? "It's back in the rotation" : "Got it: it won't come back"))} />
            <NoteButton on={lineWhy === "note"} onClick={() => setLineWhy((w) => (w === "note" ? null : "note"))} />
          </span>
        </p>
        <button type="button" onClick={() => stepLine(1)} aria-label="Another wise line" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[18px] leading-none" style={{ color: "#8a6a2c" }}>
          ›
        </button>
        </div>
        {/* Every press says it landed. */}
        <Confirm text={lineSaid} onDone={() => setLineSaid(null)} />
        {lineWhy && <WhyBox key={lineWhy} saying={shownLine} source="Wise line" down={lineWhy === "down"} onDone={(sent) => (setLineWhy(null), sent && setLineSaid("Thanks, your feedback was sent"))} />}
      </div>
    ) : null,
    bar: award ? (
      <div className="w-full">
        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.18)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.2)" }}>
          <div className="pc-fill h-full rounded-full" style={{ "--from": `${award.fromPct}%`, "--to": `${award.toPct}%`, width: `${award.toPct}%`, background: "linear-gradient(90deg, #b8913f, #e2bf63 60%, #8fc46a)" } as React.CSSProperties} />
        </div>
        <p className="m-0 mt-1 text-[12.5px] tabular-nums" style={{ color: "#5a4a30" }}>
          {award.caption}
        </p>
      </div>
    ) : null,
    // One compact line: XP, then coins beside it.
    reward: award && award.xp > 0 ? (
      <p className="m-0 flex items-baseline justify-center gap-2.5 tabular-nums">
        <span ref={xpRef} className="pc-xp text-[26px] font-bold leading-none tabular-nums" style={{ color: "var(--t-xp)" }}>
          +0 XP
        </span>
        {award.coins > 0 && (
          <span className="flex items-center gap-1 text-[14px]" style={{ color: "#5a4a30" }}>
            <CoinIcon size={16} /> +{award.coins} {award.coins === 1 ? "coin" : "coins"}
          </span>
        )}
      </p>
    ) : null,
    // A gilded button that opens into a drawer of the quests' cards.
    due: <DueSoonDrawer tasks={due} onOpenChange={setDrawerOpen} />,
    quests: <TodayPlanner today={today} due={due} label={btn.quests?.text?.trim()} icon={btn.quests?.icon} />,
  };
  const allEls = welcomeOrder(fx);
  const order = allEls.filter((el) => welcomeShows(fx, el) && parts[el] && !snoozedParts.includes(el));
  // Not checked in yet? "Not now" offers to ask again later, or to skip it for today.
  const snoozable = !!onSnooze && !checkedIn && order.includes("checkin");
  const confetti = fx.welcomeConfetti !== false && mode === "day";

  if (min)
    return createPortal(
      // The screen tucked away: a small bubble (a sun on the day's first visit, a lantern-moon later) that opens it again.
      <button type="button" onClick={restore} aria-label={mode === "day" ? "Open the morning check-in" : "Open the check-in"} title={mode === "day" ? "Morning check-in" : "Check-in"} className="welcome-min fixed bottom-[calc(env(safe-area-inset-bottom)+144px)] right-3.5 z-[47] flex h-14 w-14 items-center justify-center rounded-full">
        {mode === "day" ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4.6" fill="#f6c843" stroke="#a8761a" strokeWidth="1.2" />
            {Array.from({ length: 8 }, (_, i) => (
              <path key={i} d="M12 2.2v2.6" stroke="#d99a1e" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${i * 45} 12 12)`} />
            ))}
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="#f2e2a8" stroke="#a8893f" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        )}
      </button>,
      document.body
    );
  return createPortal(
    <div data-welcome-root data-kb-plain data-no-ghost style={{ ...(screenH ? { height: screenH, bottom: "auto" } : {}), translate: kbLift ? `0 ${-kbLift}px` : undefined, transition: "translate 240ms cubic-bezier(.2,.8,.2,1)", "--wtop": "max(92px, calc(env(safe-area-inset-top) + 84px))" } as React.CSSProperties} className={`fixed inset-0 ${preview ? "z-[95]" : drawerOpen ? "z-[49]" : "z-[60]"} flex items-start justify-center px-3 pb-3 pt-[var(--wtop)] ${leaving ? "pointer-events-none" : ""}`} onClick={() => arranging && setArranging(false)} role="dialog" aria-modal="true" aria-label={heading}>
      {/* Overscan: while a phone's keyboard opens or closes the screen briefly changes size; this keeps Today from peeking through above or below. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 -bottom-[60vh] -top-[60vh] -z-[1]" style={{ background: "#1b2119" }} />
      {/* A misty valley, and the card coming out of the mist. While arranging, the castle's ✎ stands right beside it. */}
      <MistScene leaving={leaving || minimizing} castle={castleOf(fx.welcomeCastle)} castleSeed={fx.welcomeCastleSeed} castleSlot={arranging ? <CastleEdit fx={fx} /> : null} onCastleVisible={setCastleSeen} />
      {/* Moved where you put it (drag its heading). */}
      <div className="relative flex max-h-full flex-col items-center" style={at.x || at.y ? { transform: `translate(${at.x}px, ${at.y}px)` } : undefined}>
      <div className={`${leaving || minimizing ? "mist-card-out" : "mist-emerge"} relative min-h-0`} onClick={(e) => e.stopPropagation()}>
        {/* Kept mounted (and visible) while arranging, so he doesn't fly in again each time. */}
        <WelcomeToucan fx={fx} quiet={arranging} onAway={() => minimize(true)} onArrange={() => (setHoldEl(null), setArranging(true))} />
        {confetti && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
            {PIECES.map((p, i) => (
              <span
                key={i}
                className="pc-confetti absolute block"
                style={{ width: p.round ? 8 : 7, height: p.round ? 8 : 12, marginLeft: -4, marginTop: -5, borderRadius: p.round ? 999 : 2, background: p.color, "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg`, animationDelay: `${p.delay + 1300}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        )}
        {/* A soft light around the card, where the mist has thinned. */}
        <span aria-hidden className="pointer-events-none absolute -inset-12" style={{ background: "radial-gradient(ellipse at center, rgba(255,250,240,.5), rgba(255,250,240,0) 70%)" }} />
        {/* Minimize: tuck it into a small sun bubble and go on into the app; tap the sun to come back. */}
        {!arranging && !preview && (
          <button
            type="button"
            onClick={() => minimize()}
            aria-label="Minimize the check-in"
            title="Minimize (comes back from the sun bubble)"
            data-welcome-corner
            className="settings-gear absolute right-[42px] top-1.5 z-[4] flex h-[28px] w-[28px] items-center justify-center rounded-full"
            style={{ color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 17h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {/* The gear: settings in context (each part's controls right where it sits). */}
        <button
          type="button"
          onClick={() => (setHoldEl(null), setArranging((v) => !v))}
          aria-pressed={arranging}
          aria-label={arranging ? "Done arranging" : "Welcome screen settings"}
          title={arranging ? "Done arranging" : "Welcome screen settings"}
          data-welcome-corner
          className="settings-gear absolute right-1.5 top-1.5 z-[4] flex h-[28px] w-[28px] items-center justify-center rounded-full"
          // While arranging it stays the gear, lit gold (pressed in); tap it again to finish.
          style={arranging ? { color: "#2a1c10", background: "radial-gradient(circle at 35% 30%, #fff0bd, #e2bb5c 55%, #a88a3f)", boxShadow: "0 0 0 1.5px #4a3913, 0 0 12px rgba(242,210,126,.75), inset 0 1px 2px rgba(60,40,10,.35)" } : { color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }}
        >
          <GearIcon size={17} />
        </button>
        {/* Resize from the lower-right corner (it stays centred, so it grows both ways). */}
        {!arranging && (
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 z-[3] h-6 w-6 cursor-nwse-resize touch-none"
            onPointerDown={(e) => {
              sizing.current = { x: e.clientX, w: cardW };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = sizing.current;
              if (!d) return;
              setCardW(Math.round(Math.max(340, Math.min(Math.min(900, window.innerWidth - 24), d.w + (e.clientX - d.x) * 2))));
            }}
            onPointerUp={() => {
              if (sizing.current) writeJson("welcome-card-w", cardW);
              sizing.current = null;
            }}
          />
        )}
        <div ref={cardRef} data-welcome-card onScroll={() => (alignFoot(), giveBack())} onClickCapture={holdScroll} className={`parchment relative flex bg-[var(--t-card,#fffaf0)] max-h-[calc(100svh-var(--wtop)-12px)] flex-col items-center gap-3 overflow-y-auto overscroll-none rounded-2xl pb-4 pl-5 pr-3 pt-10 text-center [scrollbar-gutter:stable] welcome-scroll`} style={{ width: `min(${cardW}px, 94vw)`, ...(screenH ? { maxHeight: `calc(${screenH}px - var(--wtop) - 12px - ${Math.max(0, at.y)}px)` } : {}) }}>
          {/* The top band stays put while the card scrolls, so nothing slides under the toucan's perch or the corner buttons. */}
          <div ref={capRef} aria-hidden className="welcome-cap pointer-events-none sticky -top-10 z-[3] -mb-3 -ml-5 -mr-3 -mt-10 h-10 shrink-0 self-stretch" />
          {/* The greeting, with its ✎ at its upper right. Editing keeps the exact look and layout it will have. */}
          <div
            className={`relative w-full px-2 ${writing === null ? "cursor-grab" : ""}`}
            // Drag the heading to move the whole screen (a tap still writes the greeting); a double-click puts it back.
            onPointerDown={(e) => {
              if (writing !== null || (e.target as HTMLElement).closest("button, input, textarea, [contenteditable='true']")) return;
              moving.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = moving.current;
              if (!d) return;
              if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
              d.moved = true;
              const half = Math.max(0, (window.innerWidth - (cardRef.current?.offsetWidth ?? 0)) / 2 - 16);
              setAt({ x: Math.max(-half, Math.min(half, d.ox + e.clientX - d.x)), y: Math.max(0, Math.min(window.innerHeight * 0.4, d.oy + e.clientY - d.y)) });
            }}
            onPointerUp={() => {
              movedRef.current = !!moving.current?.moved;
              if (moving.current?.moved) writeJson("welcome-card-at", at);
              moving.current = null;
            }}
            onClick={(e) => {
              if (movedRef.current || writing !== null || (e.target as HTMLElement).closest("button")) return;
              setGreetTools((v) => !v);
            }}
            onDoubleClick={() => (setAt({ x: 0, y: 0 }), writeJson("welcome-card-at", { x: 0, y: 0 }))}
          >
            {/* The greeting itself is where you write: same font, size, wrapping and place (no box). */}
            <span className="relative inline-block max-w-full">
              <p
                key={writing === null ? `show:${greeting}` : "writing"}
                ref={greetingRef}
                contentEditable={writing !== null}
                suppressContentEditableWarning
                role={writing !== null ? "textbox" : undefined}
                aria-label={writing !== null ? "Your own greeting" : undefined}
                onInput={(e) => setWriting((e.currentTarget.textContent ?? "").slice(0, 120))}
                onKeyDown={(e) => {
                  if (writing === null) return;
                  if (e.key === "Enter") {
                    e.preventDefault();
                    finishWriting();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setWriting(null);
                  }
                }}
                onBlur={() => writing !== null && finishWriting()}
                className={`font-display m-0 leading-tight outline-none [text-wrap:balance] ${writing !== null ? "cursor-text" : ""}`}
                style={{ color: "var(--t-ink)", fontSize: greetingSize(writing ?? hello + greeting), caretColor: "#8a6116", outline: "none" }}
              >
                {writing === null && hello}
                {greeting}
                {/* Its ✎ and quiet thumbs, right after the last word. */}
                {writing === null && (
                  <span contentEditable={false} data-show={arranging || greetTools ? "true" : "false"} className="touch-tools ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle font-sans text-[16px]">
                    <span className={`transition-opacity ${arranging ? "" : "opacity-50 hover:opacity-100 focus-within:opacity-100"}`}>
                      <EditButton
                        open={arranging && greetingOpen}
                        onClick={() => {
                          setWriting(greeting);
                          if (arranging) setGreetingOpen(true);
                        }}
                        label="Edit the greeting"
                      />
                    </span>
                    {!arranging && (
                      <span className="flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100">
                        <LineVote kind="like" on={greetVerdict === "like"} onClick={() => voteGreeting(greetVerdict === "like" ? null : "like")} />
                        <LineVote kind="dislike" on={greetVerdict === "dislike"} onClick={() => voteGreeting(greetVerdict === "dislike" ? null : "dislike")} />
                        <NoteButton on={greetWhy === "note"} onClick={() => setGreetWhy((w) => (w === "note" ? null : "note"))} />
                      </span>
                    )}
                  </span>
                )}
              </p>
            </span>
          </div>
          {writing === null && !arranging && (
            <div className="-my-1 flex w-full flex-col items-center empty:hidden">
              {greetSaid && <Confirm text={greetSaid} onDone={() => setGreetSaid(null)} />}
              {greetWhy && <WhyBox key={greetWhy} saying={greeting} source="Welcome greeting" down={greetWhy === "down"} onDone={(sent) => (setGreetWhy(null), sent && setGreetSaid("Thanks, your feedback was sent"))} />}
            </div>
          )}
          {keepAsk && (
            <div className="reveal flex w-full flex-col gap-1.5 rounded-xl px-3 py-2.5" style={{ border: "1px solid rgba(139,112,64,.45)", background: "rgba(255,250,238,.7)" }}>
              <GoldCheck checked={keepAsk.keep} onChange={(v) => setKeepAsk({ ...keepAsk, keep: v })}>
                Save &ldquo;{keepAsk.text}&rdquo; for the future, in the rotation of greetings
              </GoldCheck>
              <GoldCheck checked={keepAsk.retire} onChange={(v) => setKeepAsk({ ...keepAsk, retire: v })}>
                Retire today&rsquo;s original, &ldquo;{keepAsk.was}&rdquo;
              </GoldCheck>
              <div className="flex justify-end">
                <button type="button" onClick={settleGreeting} className="h-8 rounded-full px-4 text-[13px] font-bold" style={GILT}>
                  Done
                </button>
              </div>
            </div>
          )}
          {/* When it opens, confetti, the castle: one folded line at the top of the card (one scroller, so Done is always reachable). */}
          {arranging && <ArrangeAbove fx={fx} castleHidden={!castleSeen} />}
          {arranging && greetingOpen && <GreetingOptions fx={fx} />}
          {arranging ? (
            <ArrangeList fx={fx} order={allEls} parts={parts} empty={EMPTY} focusEl={holdEl} />
          ) : (
            order.map((el) => (
              // No long press to arrange: only the gear opens the screen's settings (owner, Nov 5).
              // Right-click or hold a part's button to shape it: its words, icon and XP (owner, Nov 6).
              <ButtonShell key={el} el={el} onEdit={(k) => setBtnEdit((cur) => (cur === k ? null : k))}>
                {isButtonKey(el) ? (
                  <div className="w-full">
                    <SwipeActions
                      startOn={(t) => !!(t as HTMLElement | null)?.closest?.("button[aria-expanded]")}
                      left={{ label: "Hide", background: "linear-gradient(180deg,#6b5631,#4a3913)", color: "#f6e3a8", onAction: () => hidePart(el) }}
                      right={{ label: "Snooze", icon: <SnoozeIcon />, background: "linear-gradient(180deg,#3a3f7a,#232655)", color: "#f2d27e", onAction: () => snoozePart(el) }}
                    >
                      {parts[el]}
                    </SwipeActions>
                  </div>
                ) : (
                  parts[el]
                )}
                {el === "focus" && journalFilled.length > 0 && (
                  <span className="pointer-events-none mt-0.5 text-[11.5px] font-semibold tabular-nums" style={{ color: "#4e6a35" }}>
                    ✓ +{journalFilled.reduce((a, j) => a + j.xp, 0)} XP on the way
                  </span>
                )}
                {isPartKey(el) && el !== "focus" && partXp(el) > 0 && (
                  <span className="pointer-events-none mt-0.5 text-[11.5px] font-semibold tabular-nums" style={{ color: filledParts.includes(el) ? "#4e6a35" : "#8a6a2c", opacity: filledParts.includes(el) ? 1 : 0.75 }}>
                    {filledParts.includes(el) ? `✓ +${partXp(el)} XP on the way` : `+${partXp(el)} XP when filled in`}
                  </span>
                )}
                {isButtonKey(el) && (
                  <Fold open={btnEdit === el}>
                    <ButtonEditor k={el} fx={fx} pays={isPartKey(el) && el !== "focus"} onDone={() => setBtnEdit(null)} onSnooze={() => (setBtnEdit(null), snoozePart(el))} onHide={() => (setBtnEdit(null), hidePart(el))}>
                      {el === "focus" && <JournalPromptsEditor fx={fx} />}
                    </ButtonEditor>
                  </Fold>
                )}
              </ButtonShell>
            ))
          )}
          <div ref={spacerRef} aria-hidden className="w-full shrink-0" style={{ height: 0, marginTop: -12 }} />
          {kbRoom > 0 && <div aria-hidden className="w-full shrink-0" style={{ height: kbRoom }} />}
          {/* The way on stays in reach: pinned to the card's foot while the rest scrolls. */}
          <div ref={footRef} className="welcome-foot sticky -bottom-4 z-[3] -mb-4 flex w-full justify-center pb-4 pt-2">
          {arranging ? (
            <button type="button" onClick={() => setArranging(false)} className="mt-1 h-10 rounded-full px-6 text-[14px] font-bold" style={GILT}>
              Done
            </button>
          ) : snoozing ? (
            // The times spread out in one line from where Snooze was.
            <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-1.5">
              <button type="button" onClick={() => (snoozing === "other" ? setSnoozing("main") : setSnoozing(false))} aria-label="Back" title="Back" className="snooze-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={PILL}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {(snoozing === "main" ? SNOOZE_MAIN : snoozeOther()).map((c, i) => (
                <button key={`${snoozing}-${c.label}`} type="button" onClick={() => (c.ms === "tomorrow" ? leave() : snoozeOut(c.ms))} className="snooze-pop h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={{ ...PILL, animationDelay: `${i * 45}ms` }}>
                  {c.label}
                </button>
              ))}
              {snoozing === "main" ? (
                <button key="other" type="button" onClick={() => setSnoozing("other")} className="snooze-pop h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={{ ...PILL, animationDelay: `${SNOOZE_MAIN.length * 45}ms` }}>
                  Other…
                </button>
              ) : (
                <form
                  className="snooze-pop flex h-8 items-center gap-1 rounded-full pl-2.5 pr-1"
                  style={{ ...PILL, animationDelay: "180ms" }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = Math.round(Number(customMin));
                    if (n > 0) snoozeOut(Math.min(24 * 60, n) * 60_000);
                  }}
                >
                  <input value={customMin} onChange={(e) => setCustomMin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="45" aria-label="Minutes" className="h-6 w-9 bg-transparent text-center text-[16px] tabular-nums focus:outline-none" />
                  <span className="text-[12.5px]">min</span>
                  <button type="submit" disabled={!Number(customMin)} aria-label="Snooze for that long" className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold disabled:opacity-40" style={GILT}>
                    ✓
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="mt-1 flex w-full items-center gap-2">
              {snoozable && (
                <button type="button" onClick={() => setSnoozing("main")} className="flex h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold" style={{ borderColor: "#b39a6a", color: "#5a4a30" }}>
                  <SnoozeIcon />
                  Snooze
                </button>
              )}
              {/* Bottom right, the one way on: saves what's entered in the check-in, then on into the forest. */}
              <button type="button" disabled={finishing} onClick={() => void complete()} className="font-display ml-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] disabled:opacity-70" style={GILT}>
                {finishing ? "Saving…" : order.includes("checkin") && !checkedIn ? "Complete check-in" : "Continue to town"}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M9 5.5l6.5 6.5L9 18.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * The toucan flies in over the valley, flaps, glides, and lands on the card's
 * corner. Tap him: plan the day together, talk, hear a wise saying, or change
 * what he asks first.
 */
const TOUCAN_AT = "welcome-toucan-at";
function readToucanAt(): { x: number; y: number } {
  try {
    const v = JSON.parse(window.localStorage.getItem(TOUCAN_AT) || "null") as { x: number; y: number } | null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

/**
 * The toucan on the welcome screen. Tap (or right-click) him for a menu; drag
 * him anywhere (he remembers). His bubble's ‹ › step through what he could
 * ask, and its ⋯ gives your thumbs on a line.
 */
/** He flies in once per visit; after that he's simply there. */
let toucanLanded = false;
// Kept for this tab too: iPhone's photo picker can reload the page, and he shouldn't fly in again then.
const LANDED_KEY = "welcome-toucan-landed";
function landedBefore(): boolean {
  if (toucanLanded || typeof window === "undefined") return toucanLanded;
  try {
    const at = Number(window.sessionStorage.getItem(LANDED_KEY));
    return at > 0 && Date.now() - at < 30 * 60_000;
  } catch {
    return false;
  }
}
function markLanded() {
  toucanLanded = true;
  try {
    window.sessionStorage.setItem(LANDED_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}
function resetToucanFlight() {
  toucanLanded = false;
  try {
    window.sessionStorage.removeItem(LANDED_KEY);
  } catch {
    /* storage unavailable */
  }
}
type Box = { left: number; top: number; right: number; bottom: number };
/** Everything of his that shows (body, bubble, its ✎ and the line hanging under it), as one box. */
function toucanBox(wrap: HTMLElement): Box | null {
  let box: Box | null = null;
  for (const el of [wrap, ...wrap.querySelectorAll<HTMLElement>("*")]) {
    // His soft glow may spill past an edge.
    if (el.classList.contains("toucan-aura")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return box;
}
/** The card's top band he may perch over (above the greeting); everything below it is the card's own. */
const PERCH_BAND = 34;
/**
 * Where he can sit so that he and his bubble stay on screen and off the card: its greeting,
 * buttons, wise line and foot, and the minimize and gear buttons. The nearest shift from where he
 * was put (up first, then sideways, then down); null when there's no such spot.
 */
function clearSpot(
  wrap: HTMLElement,
  at: { x: number; y: number },
  home: { x: number; y: number },
  /** What his bubble must stay off: everything, only the corner buttons (a tall menu), or nothing (he alone stays clear). */
  bubbleOff: "all" | "corners" | "none" = "all",
  /** Only say whether he can stay where he is (null when he can't). */
  stayOnly = false
): { x: number; y: number } | null {
  // He and his bubble, each as its own box (the bubble reaches past the corner buttons' line; he doesn't).
  const parts = [...wrap.children].map((c) => toucanBox(c as HTMLElement)).filter((b): b is Box => !!b);
  const scope = wrap.parentElement;
  const card = scope?.querySelector<HTMLElement>("[data-welcome-card]")?.getBoundingClientRect();
  if (!parts.length || !scope || !card) return null;
  // Where they'd be without the current shift.
  const boxes = parts.map((p) => ({ left: p.left - at.x, top: p.top - at.y, right: p.right - at.x, bottom: p.bottom - at.y }));
  const cardBlock: Box = { left: card.left, top: card.top + PERCH_BAND, right: card.right, bottom: card.bottom };
  const corners: Box[] = [];
  // The corner buttons, and the feedback button (it waits in the sky at the top right while this screen is up).
  [...scope.querySelectorAll<HTMLElement>("[data-welcome-corner]"), ...document.querySelectorAll<HTMLElement>("[data-feedback-btn]")].forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width) corners.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  const blocks: Box[] = [cardBlock, ...corners];
  // He (the first box) always stays clear of everything; his bubble as asked.
  const blocksFor = (i: number) => (i === 0 || bubbleOff === "all" ? blocks : bubbleOff === "corners" ? corners : []);
  const m = 6;
  const pad = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ok = (dx: number, dy: number, give = 0) =>
    boxes.every(
      (b, i) =>
        b.left + dx >= m - give && b.right + dx <= vw - m + give && b.top + dy >= m - give && b.bottom + dy <= vh - m + give &&
        !blocksFor(i).some((r) => b.left + dx < r.right + pad - give && b.right + dx > r.left - pad + give && b.top + dy < r.bottom + pad - give && b.bottom + dy > r.top - pad + give)
    );
  if (stayOnly) return ok(at.x, at.y, 2) ? at : null;
  if (ok(0, 0)) return { x: 0, y: 0 };
  // Where he is now still fine (give or take a couple of pixels)? He stays (no back and forth).
  if (ok(at.x, at.y, 2)) return at;
  // The nearest clear spot: try every shift that lines one of his edges up with an edge of the
  // card, a corner button or the screen (going up costs less than going down).
  // His own perch (where he lands) is always one of them.
  const xs = new Set<number>([0, home.x]);
  const ys = new Set<number>([0, home.y]);
  for (const b of boxes) {
    for (const r of blocks) {
      xs.add(Math.floor(r.left - pad - b.right - 1));
      xs.add(Math.ceil(r.right + pad - b.left + 1));
      ys.add(Math.floor(r.top - pad - b.bottom - 1));
      ys.add(Math.ceil(r.bottom + pad - b.top + 1));
    }
    xs.add(Math.ceil(m - b.left));
    xs.add(Math.floor(vw - m - b.right));
    ys.add(Math.ceil(m - b.top));
    ys.add(Math.floor(vh - m - b.bottom));
  }
  let best: { x: number; y: number } | null = null;
  let cost = Infinity;
  for (const dy of ys) {
    for (const dx of xs) {
      const c = dx * dx + (dy > 0 ? 4 : 1) * dy * dy;
      if (c < cost && ok(dx, dy)) {
        best = { x: dx, y: dy };
        cost = c;
      }
    }
  }
  return best;
}
/** Only on screen (when no clear spot exists, e.g. a long talk with him). */
function onScreen(wrap: HTMLElement, at: { x: number; y: number }): { x: number; y: number } {
  const box = toucanBox(wrap);
  if (!box) return at;
  const m = 6;
  const left = box.left - at.x;
  const right = box.right - at.x;
  const top = box.top - at.y;
  const bottom = box.bottom - at.y;
  return {
    x: Math.round(Math.max(m - left, Math.min(0, window.innerWidth - m - right))),
    y: Math.round(Math.max(m - top, Math.min(0, window.innerHeight - m - bottom))),
  };
}

function WelcomeToucan({ fx, quiet = false, onAway, onArrange }: { fx: FxSettings; /** While the screen is being arranged his bubble rests (the panel above the card needs the room). */ quiet?: boolean; /** Going elsewhere in the app (his settings): the screen tucks itself away first. */ onAway: () => void; /** Arrange this screen (the same as its gear, or a long press on a part). */ onArrange: () => void }) {
  const [landed, setLanded] = useState(landedBefore);
  const [flyIn] = useState(() => !landedBefore());
  const [menu, setMenu] = useState(false);
  // His menu slides sideways to stay on screen (he doesn't move for it).
  const [menuDx, setMenuDx] = useState(0);
  const [saying, setSaying] = useState<string | null>(null);
  const [rewording, setRewording] = useState(false);
  const [words, setWords] = useState("");
  const [votes, setVotes] = useState(readPromptVotes);
  const prompts = toucanPrompts(fx, votes);
  const [idx, setIdx] = useState(0);
  const ask = prompts[idx % prompts.length];
  const [rate, setRate] = useState(false);
  const [why, setWhy] = useState<"down" | "note" | null>(null);
  // What his bubble says after a press (so you know it landed).
  const [said, setSaid] = useState<string | null>(null);
  // Talking with him in his own bubble (light: his words only, no buttons).
  const [answer, setAnswer] = useState("");
  // The respond line's height as you see it (it grows a line at a time, never wider).
  const [answerH, setAnswerH] = useState(REPLY_LINE);
  const [nods, setNods] = useState(0);
  const [replying, setReplying] = useState(false);
  const [talk, setTalk] = useState<{ you: string; him: string; thinking: boolean; history: { role: "user" | "assistant"; content: string }[] } | null>(null);
  async function reply() {
    const q = answer.trim();
    if (!q || talk?.thinking) return;
    // He nods: your words landed.
    setNods((n) => n + 1);
    const history = talk?.history ?? [{ role: "assistant" as const, content: ask }];
    // Answering him counts like a thumbs up: this is a question you respond to (remembered, not made the first one).
    if (!talk && !votes.liked.includes(ask)) {
      const next: PromptVotes = { liked: [...new Set([ask, ...votes.liked])].slice(0, 30), hidden: votes.hidden.filter((x) => x !== ask) };
      writePromptVotes(next);
      setVotes(next);
    }
    setAnswer("");
    setAnswerH(REPLY_LINE);
    setRate(false);
    setTalk({ you: q, him: "", thinking: true, history });
    try {
      const r = await coachAction(q, true, history);
      setTalk({ you: q, him: r.reply, thinking: false, history: [...history, { role: "user" as const, content: q }, { role: "assistant" as const, content: r.reply }].slice(-10) });
    } catch {
      setTalk({ you: q, him: "I lost the thread for a moment. Try me again?", thinking: false, history });
    }
  }
  const [off, setOff] = useState(readToucanAt);
  // On a narrow phone the respond line is a little shorter, so it stays under his bubble (clear of the card's buttons).
  const replyW = Math.max(120, Math.min(REPLY_W, (typeof window === "undefined" ? 999 : window.innerWidth) - 240));
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [fitTick, setFitTick] = useState(0);
  // After a drop he glides (animated) to the nearest spot clear of the card's words and buttons.
  const [settling, setSettling] = useState(false);
  const settle = (at: { x: number; y: number }) => {
    setSettling(true);
    setFitTick((n) => n + 1);
    setTimeout(() => setSettling(false), 320);
    try {
      window.localStorage.setItem(TOUCAN_AT, JSON.stringify(at));
    } catch {}
  };
  // Kept on screen and off the card (its greeting, buttons, wise line and foot): wherever he was put,
  // however his bubble grows, and as the card's parts open and close.
  const wrapRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  const nudgeRef = useRef(nudge);
  // Where he perches is worked out once (after he lands, after a drop, when the window changes size),
  // never because his bubble grew or shrank: that moving was the jump when ✎ or his menu opened (owner, Nov 2).
  useLayoutEffect(() => {
    const fit = () => {
      const w = wrapRef.current;
      if (!w || !landed || drag.current?.moved) return;
      const drawn = { x: Number(w.dataset.nx) || 0, y: Number(w.dataset.ny) || 0 };
      const n = nudgeRef.current;
      const home = { x: -off.x, y: -off.y };
      const next = clearSpot(w, drawn, home, "none") ?? onScreen(w, drawn);
      if (Math.abs(next.x - n.x) > 1 || Math.abs(next.y - n.y) > 1) {
        nudgeRef.current = next;
        setNudge(next);
      }
    };
    fit();
    // A new width only: the keyboard and Chrome's toolbar change the height alone, and re-placing him
    // then dropped him onto the card (Nov 2 recording).
    let lastW = window.innerWidth;
    const resized = () => {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      fit();
    };
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on landing, a drop (fitTick) or a window resize
  }, [landed, fitTick]);
  // His menu slides sideways onto the screen if it would run off it (he stays put).
  useLayoutEffect(() => {
    if (!menu) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- back in place once his menu closes (measured layout)
      if (menuDx) setMenuDx(0);
      return;
    }
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!b) return;
    const cur = Number(bubbleRef.current!.dataset.dx) || 0;
    const dx = Math.round(Math.max(6 - (b.left - cur), Math.min(0, window.innerWidth - 6 - (b.right - cur))));
    if (Math.abs(dx - cur) > 1) setMenuDx(dx);
  }, [menu, menuDx]);
  // Once the card has come out of the mist (it rises while it emerges), look again.
  useEffect(() => {
    const t = setTimeout(() => setFitTick((n) => n + 1), 2300);
    return () => clearTimeout(t);
  }, [landed]);
  useEffect(() => {
    if (landedBefore()) return;
    const t = setTimeout(() => (markLanded(), setLanded(true)), 3150);
    return () => clearTimeout(t);
  }, []);
  const vote = (up: boolean) => {
    const next: PromptVotes = up ? { liked: [...new Set([ask, ...votes.liked])].slice(0, 30), hidden: votes.hidden.filter((x) => x !== ask) } : { liked: votes.liked.filter((x) => x !== ask), hidden: [...new Set([...votes.hidden, ask])] };
    writePromptVotes(next);
    setVotes(next);
    setRate(false);
    if (up) patchFx({ welcomeToucanAsk: ask });
    setSaid(up ? "Got it: I'll ask this first" : "Got it: I won't ask that again");
  };
  const step = (d: number) => (setSaying(null), setMenu(false), setRate(false), setTalk(null), setReplying(false), setIdx((i) => (i + d + prompts.length) % prompts.length));
  const item = "flex h-8 w-full items-center rounded-lg px-1.5 text-left font-semibold hover:bg-black/[.05]";
  // His saying can be closed for this visit (×); tapping him brings it back. He's quiet on arrival unless
  // Toucan Spirit › “Speaks when you arrive” is on (owner, Nov 4).
  // Quiet by default (owner, Nov 4 and again Nov 6: "the toucan is still bothering me when I log in").
  const [closed, setClosed] = useState(() => typeof window === "undefined" || !loadFx().welcomeToucanTalks);
  // Rating what he asked: a long press or right-click on his bubble (no ✎ on show; owner, Nov 2).
  const rateHold = useLongPress(() => {
    if (menu || saying || talk) return;
    setRate(true);
    navigator.vibrate?.(8);
  });
  const resting = !menu && !saying && !talk && !rate;
  const showBubble = landed && !quiet && (!closed || menu);
  const showCoin = showBubble && resting && !replying && !answer && prompts.length > 1;
  return (
    <div ref={wrapRef} data-nx={nudge.x} data-ny={nudge.y} className={`${flyIn ? "welcome-toucan" : ""} absolute z-[5]`} style={{ left: 8 + off.x + nudge.x, top: -47 + off.y + nudge.y, transition: settling ? "left 260ms cubic-bezier(.2,.8,.3,1), top 260ms cubic-bezier(.2,.8,.3,1)" : undefined }}>
      <button
        type="button"
        onClick={() => {
          if (drag.current?.moved || !landed) return;
          // Closed bubble: a tap brings his saying back; otherwise his menu.
          if (closed && !menu) {
            setClosed(false);
            return;
          }
          setMenu((v) => !v);
          setSaying(null);
          setRewording(false);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!landed) return;
          setMenu(true);
          setSaying(null);
          setRewording(false);
        }}
        onPointerDown={(e) => {
          if (!landed) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
          d.moved = true;
          setOff({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
        }}
        onPointerUp={() => {
          const d = drag.current;
          if (d?.moved) {
            settle(off);
            // Let this release's click pass without opening the menu.
            setTimeout(() => (drag.current = null), 0);
          } else drag.current = null;
        }}
        aria-label={closed ? "The toucan: show what he's asking" : "The toucan: plan the day, talk, or a wise saying (drag to move him)"}
        aria-expanded={menu}
        className={`owl-body block touch-none ${landed ? "owl-perched cursor-grab" : "pointer-events-none"}`}
      >
        <span key={nods} className={nods ? "tc-nod block" : "block"}>
          <span className="owl-idle block">
            <ToucanArt flying={!landed} size={58} />
          </span>
        </span>
      </button>
      {/* ‹ › under him: one gilded coin, each half a button (mirrored chevrons, so it's truly symmetrical). */}
      {showCoin && (
        <span className="bubble-coin fade-in" style={{ position: "absolute", left: 14, top: 61 }}>
          <button type="button" onClick={() => step(-1)} aria-label="Something else he could ask" className="bubble-coin-half" data-side="l">
            <svg width="9" height="12" viewBox="0 0 9 12" fill="none" aria-hidden>
              <path d="M6.5 1.5 2 6l4.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next thing he could ask" className="bubble-coin-half" data-side="r">
            <svg width="9" height="12" viewBox="0 0 9 12" fill="none" aria-hidden style={{ transform: "scaleX(-1)" }}>
              <path d="M6.5 1.5 2 6l4.5 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
      )}
      {showBubble && (
        <div
          {...rateHold.handlers}
          // His bubble moves him too: drag it by its words (buttons and the reply line still work).
          onPointerDown={(e) => {
            rateHold.handlers.onPointerDown(e);
            if ((e.target as HTMLElement).closest("button, input, textarea, a, form")) return;
            drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            rateHold.handlers.onPointerMove(e);
            const d = drag.current;
            if (!d) return;
            if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
            d.moved = true;
            setOff({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
          }}
          onPointerUp={() => {
            rateHold.handlers.onPointerUp();
            if (drag.current?.moved) settle(off);
            drag.current = null;
          }}
          ref={bubbleRef}
          data-dx={menu ? menuDx : 0}
          // A fixed width, so new words never make it wider or narrower; it grows only downward (his menu, a talk, the rating).
          className={`toucan-bubble owl-say absolute top-1 left-[60px] cursor-grab select-none touch-none z-[5] w-[min(232px,calc(100vw-128px))] rounded-2xl pb-4 pl-3 pr-7 pt-2 text-left text-[13.5px] leading-snug [-webkit-touch-callout:none]`}
          style={{ background: "#fffaf0", border: "1.5px solid #b39a6a", color: "#3d2f18", boxShadow: "0 4px 14px rgba(0,0,0,.25)", translate: menu && menuDx ? `${menuDx}px 0` : undefined }}
        >
          {/* × closes what he's saying for this visit (tap him to see it again); in his menu, it closes the menu. */}
          <button
            type="button"
            onClick={() => {
              if (menu) {
                setMenu(false);
                setRewording(false);
                return;
              }
              if (saying) return setSaying(null);
              if (talk) return (setTalk(null), setReplying(false));
              if (rate) return (setRate(false), setWhy(null));
              setClosed(true);
            }}
            aria-label={menu ? "Close his menu" : rate ? "Close the rating" : "Close what he's saying"}
            title="Close"
            className="bubble-x absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          {talk ? (
            // A light back-and-forth right here in his bubble: your words, then his.
            <span className="flex flex-col gap-1.5">
              {talk.you && (
                <span className="self-end rounded-xl px-2 py-1 text-[13px]" style={{ background: "rgba(242,210,126,.55)", color: "#2a1c10" }}>
                  {talk.you}
                </span>
              )}
              <span className="text-[13.5px]">{talk.thinking ? <span className="italic opacity-70">…thinking</span> : <Digest text={talk.him} />}</span>
            </span>
          ) : (
            <span className={menu ? "font-display block text-[14px]" : "block"}>{saying ?? (menu ? "How can I help?" : ask)}</span>
          )}
          <Confirm text={said} onDone={() => setSaid(null)} />
          {rate && !menu && !saying && (
            <span className="fade-in mt-1.5 flex flex-col">
              <span className="flex items-center gap-1">
                <LineVote kind="like" on={votes.liked.includes(ask)} onClick={() => vote(true)} />
                <LineVote kind="dislike" on={why === "down"} onClick={() => setWhy(why === "down" ? null : "down")} />
                <NoteButton text on={why === "note"} onClick={() => setWhy(why === "note" ? null : "note")} />
              </span>
              {why && (
                <WhyBox
                  key={why}
                  saying={ask}
                  source="Toucan's question"
                  down={why === "down"}
                  onDone={(sent) => {
                    // A thumbs down retires it once you've said why (or skipped).
                    if (why === "down") vote(false);
                    setWhy(null);
                    if (sent) setSaid("Thanks, your feedback was sent");
                  }}
                />
              )}
            </span>
          )}
          {menu && !rewording && (
            <span className="mt-1 flex flex-col">
              <button type="button" onClick={() => (setMenu(false), onAway?.(), openPlanMyDay())} className={item}>
                Plan my day
              </button>
              <button type="button" onClick={() => (setMenu(false), talkToToucan())} className={item}>
                Talk to me
              </button>
              <button type="button" onClick={() => setSaying(lineForDay(`${Date.now()}`))} className={item}>
                A wise saying
              </button>
              <button type="button" onClick={() => (setRewording(true), setWords(ask))} className={item} style={{ color: "var(--t-ink-soft)" }}>
                Change what I ask first
              </button>
              <button type="button" onClick={() => (setMenu(false), onArrange())} className={item} style={{ color: "var(--t-ink-soft)" }}>
                Arrange this screen
              </button>
              <Link href="/settings?open=toucan-spirit" onClick={onAway} className={item} style={{ color: "var(--t-ink-soft)" }}>
                <GearIcon size={13} />
                <span className="ml-1.5">Toucan settings</span>
              </Link>
            </span>
          )}
          {menu && rewording && (
            <form
              className="mt-1.5 flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                patchFx({ welcomeToucanAsk: words.trim().slice(0, 120) });
                setRewording(false);
                setMenu(false);
                setIdx(0);
              }}
            >
              <input autoFocus value={words} onChange={(e) => setWords(e.target.value)} maxLength={120} aria-label="What the toucan asks first" className="h-8 min-w-0 flex-1 rounded-full px-2.5 text-[16px]" style={FIELD} />
              <button type="submit" className="h-8 shrink-0 rounded-full px-2.5 text-[12.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                Save
              </button>
            </form>
          )}
          {/* The respond line: centred under his words, a quarter of it over the bubble's lower edge. */}
          {!menu && !saying && (
            <span className="absolute inset-x-0 top-[calc(100%-7px)] flex justify-center gap-1">
              {talk && !talk.thinking && (
                <button type="button" onClick={() => (talkToToucan(undefined, "talk"), setTalk(null), setReplying(false))} title="Open the full conversation" className="bubble-hang flex h-[26px] items-center rounded-full px-2 text-[11.5px] font-semibold">
                  More
                </button>
              )}
              <form
                className="relative flex items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void reply();
                }}
              >
                {/* 16px text drawn at 13px (iPhone doesn't zoom on focus), in a box sized to what you see. */}
                <span className="reply-box bubble-hang relative block overflow-hidden rounded-[13px]" style={{ width: replyW, height: answerH }}>
                  <textarea
                    value={answer}
                    rows={1}
                    onChange={(e) => {
                      setAnswer(e.target.value);
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      setAnswerH(Math.min(Math.max(REPLY_LINE, Math.ceil(t.scrollHeight * REPLY_SCALE)), REPLY_MAX));
                      t.style.height = "";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (answer.trim()) void reply();
                      }
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setAnswer("");
                        setAnswerH(REPLY_LINE);
                        e.currentTarget.blur();
                      }
                    }}
                    onFocus={() => (setReplying(true), setRate(false))}
                    onBlur={() => !answer && setReplying(false)}
                    placeholder="Respond…"
                    aria-label="Respond to the toucan"
                    enterKeyHint="send"
                    maxLength={400}
                    className="reply-line absolute left-0 top-0 block resize-none bg-transparent py-[4px] pl-3.5 pr-9 text-[16px] leading-[20px] outline-none"
                    style={{ color: "#2a1c10", width: replyW / REPLY_SCALE, height: answerH / REPLY_SCALE, transform: `scale(${REPLY_SCALE})`, transformOrigin: "0 0", overflowY: answerH >= REPLY_MAX ? "auto" : "hidden" }}
                  />
                </span>
                {answer.trim() && (
                  <button type="submit" aria-label="Send" className="reply-send reveal absolute bottom-[3px] right-[3px] flex h-5 w-5 items-center justify-center rounded-full">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </form>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Snooze's first line: soon, or Other… for the rest. */
const SNOOZE_MAIN: { label: string; ms: number | "tomorrow" }[] = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "30 min", ms: 30 * 60_000 },
  { label: "1 hr", ms: 3_600_000 },
];
/** Other…: longer, this evening (when it's a while off), tomorrow, or a number of minutes. */
function snoozeOther() {
  const now = new Date();
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18).getTime() - now.getTime();
  const out: { label: string; ms: number | "tomorrow" }[] = [
    { label: "2 hrs", ms: 2 * 3_600_000 },
    { label: "3 hrs", ms: 3 * 3_600_000 },
  ];
  if (evening > 3.5 * 3_600_000) out.push({ label: "This evening", ms: evening });
  out.push({ label: "Tomorrow", ms: "tomorrow" });
  return out;
}

const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;
const PILL = { border: "1.5px solid #b39a6a", color: "#3d2f18", background: "rgba(255,250,238,.7)" } as const;

/** The greeting's size: full for a short one, a little smaller as it grows (it may wrap onto a second line). */
function readJson<T>(k: string, fallback: T): T {
  try {
    const v = JSON.parse(window.localStorage.getItem(k) ?? "null") as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(k: string, v: unknown) {
  try {
    window.localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

const greetingSize = (t: string) => {
  const n = t.trim().length;
  return n <= 26 ? 25 : n <= 40 ? 23 : n <= 60 ? 21 : 19;
};


/** A small round thumbs up or down for the day's wise line. */
/** The toucan's respond line: 168px wide, one 22px line at rest, up to about four lines. */
const REPLY_W = 184;
const REPLY_SCALE = 0.8125;
const REPLY_LINE = 26;
const REPLY_MAX = 74;

function LineVote({ kind, on, onClick }: { kind: "like" | "dislike"; on: boolean; onClick: () => void }) {
  const like = kind === "like";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={like ? "I like this line: show it more" : "I don't like this line: don't show it again"}
      title={like ? "Like: show it more often" : "Dislike: never show it again"}
      className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-opacity before:absolute before:-inset-2 before:content-[''] hover:opacity-100 ${on ? "opacity-100" : "opacity-45"}`}
      style={{ background: on ? (like ? "rgba(120,170,80,.22)" : "rgba(192,80,58,.16)") : "transparent" }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden style={like ? undefined : { transform: "rotate(180deg)" }}>
        <path d="M7 10v10H4V10h3zm2 10h8.2a2 2 0 0 0 2-1.6l1.3-6.5A2 2 0 0 0 18.5 9.5H14l.8-4a1.6 1.6 0 0 0-2.9-1.2L9 9v11z" fill={on ? (like ? "#4f7a30" : "#93402c") : "none"} stroke={on ? (like ? "#4f7a30" : "#93402c") : "#8a6116"} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

const FIELD = { background: "rgba(255,250,238,.92)", border: "1px solid #b39a6a", color: "#2a1c10" };

/** Your top priorities, in your own words: saved for the day, and kept in mind by the app and the toucan. */
function TopPriority({ question, register, arranging = false, icon, onFilled }: { last: { text: string; others?: string[]; day: string } | null; question: string; register: (save: () => Promise<boolean>) => void; arranging?: boolean; /** An emoji in place of the target (welcome button editor). */ icon?: string; /** Saved with words in it (for the welcome screen's XP). */ onFilled?: () => void }) {
  // A fresh mind dump every time (owner, Oct 31): nothing carries over into the box.
  const [saved, setSaved] = useState<{ text: string; others: string[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // Secondary priorities (important, not urgent): opened from the button under the box.
  const [othersOpen, setOthersOpen] = useState(false);
  const [others, setOthers] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const filled = others.filter((o) => o.trim());
  const save = async (value: string, more: string[]) => {
    if (!value.trim()) return true;
    setError(null);
    try {
      const r = await setTopPriorityAction(value, more.filter((o) => o.trim()));
      setSaved({ text: r.text, others: r.others });
      onFilled?.();
      setEditing(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      return false;
    } finally {
    }
  };
  // Saved by the screen's own button on the way out (no Save of its own).
  // Braces: returning the saver would make it the effect's cleanup, run on every render.
  useEffect(() => {
    register(() => (saved && !editing ? Promise.resolve(true) : save(text, filled)));
  });
  const edit = () => {
    if (!saved) return;
    setText(saved.text);
    setOthers([...saved.others, ""]);
    setOthersOpen(saved.others.length > 0);
    setEditing(true);
  };
  if (saved && !editing) {
    // One item per line you wrote; long words and links wrap instead of running off the card.
    const lines = saved.text.split("\n").filter((l) => l.trim());
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        {/* While arranging, the part's own name stands in for this label. */}
        {!arranging && (
          <div className="relative flex items-center justify-center">
            <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
              Top priority
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2">
              <EditButton open={false} onClick={edit} label="Change top priority" />
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={edit}
          aria-label={`Top priority: ${lines.join("; ")}. Change`}
          className="font-display flex min-h-[44px] w-full min-w-0 flex-col gap-1.5 rounded-xl px-3 py-2 text-left text-[17px] font-medium leading-snug [overflow-wrap:anywhere] transition-colors hover:bg-[rgba(217,180,95,.12)]"
          style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(179,154,106,.55)", color: "var(--t-ink)" }}
        >
          {lines.map((l, i) => (
            <span key={i} className="flex min-w-0 items-start gap-2">
              {lines.length > 1 && (
                <span aria-hidden className="mt-[.45em] h-2 w-2 shrink-0 rotate-45" style={{ background: "#c9a24a" }} />
              )}
              <span className="min-w-0 flex-1">{l}</span>
            </span>
          ))}
        </button>
        {saved.others.length > 0 && (
          <div className="mt-0.5 flex w-full min-w-0 flex-col gap-0.5 px-1 text-left [overflow-wrap:anywhere]">
            <span className="text-[12px] font-semibold" style={{ color: "#8a6116" }}>
              When there&rsquo;s space
            </span>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {saved.others.map((o, i) => (
                <li key={i} className="flex min-w-0 items-start gap-2 text-[14.5px] leading-snug" style={{ color: "#5a4a30" }}>
                  <span aria-hidden className="mt-[.5em] h-1.5 w-1.5 shrink-0 rotate-45 border" style={{ borderColor: "#b08a3a" }} />
                  <span className="min-w-0 flex-1">{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-1.5 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void save(text, filled);
      }}
    >
      <label htmlFor="welcome-priority" className="flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
        {/* A target beside the question (owner, Nov 5). */}
        {/* A bullseye with an arrow struck in its heart, fletched (owner, Nov 6: "a better target with an arrow sticking out of it"). */}
        {icon ? <span aria-hidden className="text-[18px] leading-none">{icon}</span> : (
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden className="shrink-0">
          <circle cx="12" cy="16" r="10.5" fill="#a3412a" stroke="#5e2414" strokeWidth="1.2" />
          <circle cx="12" cy="16" r="8" fill="#fbf1d6" />
          <circle cx="12" cy="16" r="5.6" fill="#a3412a" />
          <circle cx="12" cy="16" r="3.2" fill="#fbf1d6" />
          <circle cx="12" cy="16" r="1.5" fill="#d9b45f" stroke="#8a6116" strokeWidth=".6" />
          <path d="M12 16 24.2 3.8" stroke="#5a3d17" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M20.4 7.6 24 4 22.8 1.8 19.6 4.6Z" fill="#e8d7a8" stroke="#8a6116" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M20.4 7.6 24 4 26.2 5.2 23.4 8.4Z" fill="#c9a55a" stroke="#8a6116" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M12.6 15.4 10.6 16.2M12.6 15.4 11.8 17.4" stroke="#3a2a14" strokeWidth=".9" strokeLinecap="round" />
        </svg>
        )}
        {question}
      </label>
      <div className="relative pb-4">
        {/* Grows with what you write. */}
        <textarea
          id="welcome-priority"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(260, el.scrollHeight)}px`;
          }}
          maxLength={400}
          rows={2}
          placeholder="What is most important now?"
          className="block min-h-[72px] w-full resize-none rounded-xl px-3 pb-4 pt-2 text-[16px] leading-snug"
          style={FIELD}
        />
        {/* Sits on the box's lower border; opens (and closes) the secondary priorities. */}
        <button
          type="button"
          onClick={() => setOthersOpen((v) => !v)}
          aria-expanded={othersOpen}
          className="font-display absolute bottom-0 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px]"
          style={CHECKIN_STYLES[0].style}
        >
          {othersOpen ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5.5 15l6.5-6.5 6.5 6.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span aria-hidden className="text-[16px] leading-none">+</span>
          )}
          Other priorities{filled.length && !othersOpen ? ` (${filled.length})` : ""}
        </button>
      </div>
      <Fold open={!!othersOpen}>
        <div className="mx-auto flex w-[65%] min-w-[220px] flex-col items-center gap-1">
          {others.map((o, i) => (
            <div key={i} className="flex w-full items-center gap-1">
              <input
                autoFocus={i === others.length - 1 && !o}
                value={o}
                onChange={(e) => {
                  const v = e.target.value;
                  setOthers((all) => {
                    const next = all.map((x, j) => (j === i ? v : x));
                    // Writing in the last box brings a fresh one below it.
                    if (i === next.length - 1 && v.trim() && next.length < 8) next.push("");
                    return next;
                  });
                }}
                maxLength={160}
                placeholder={i === 0 ? "e.g. Call Mom about the visit, by Sunday" : "Another"}
                aria-label={`Secondary priority ${i + 1}`}
                className="h-9 min-w-0 flex-1 rounded-full px-3 text-[16px]"
                style={FIELD}
              />
              {o && (
                <button type="button" onClick={() => setOthers((all) => (all.length > 1 ? all.filter((_, j) => j !== i) : [""]))} aria-label="Remove" className="h-9 w-6 shrink-0 text-[16px]" style={{ color: "#6b5631" }}>
                  ×
                </button>
              )}
            </div>
          ))}
          <span className="text-center text-[12px] leading-snug" style={{ color: "#6b5631" }}>
            <b>Secondary Priorities</b> · important, not urgent. Add a due date or anything else the toucan should know, and he&rsquo;ll bring them up when there&rsquo;s space.
          </span>
        </div>
      </Fold>
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
          {error}
        </p>
      )}
    </form>
  );
}

/** The check-in, slid open under its button (sleep has its own part now). */
function CheckinPanel({ fx, metrics, onSaved, submit }: { fx: FxSettings; metrics: string[]; onSaved: () => void; submit: (save: (after: () => void) => void) => void }) {
  return (
    <div
      className="mt-2 w-full rounded-2xl px-2 py-2.5 text-left"
      style={{
        background: "linear-gradient(180deg, rgba(255,250,236,.75), rgba(240,226,190,.75))",
        border: "1.5px solid rgba(139,112,64,.5)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.6)",
        ["--t-cream" as string]: "var(--t-ink)",
        ["--ec-soft" as string]: "var(--t-ink-soft)",
        ["--ec-chip" as string]: "rgba(120,90,40,.1)",
        ["--ec-gold" as string]: "#8a6116",
        ["--ec-line" as string]: "rgba(139,112,64,.45)",
        ["--ec-value" as string]: "#5a3d12",
        ["--ec-l" as string]: "30%",
      }}
    >
      <p className="m-0 mb-1.5 text-center text-[14.5px] italic" style={{ color: "#5a4420" }}>
        How are you arriving today?
      </p>
      <EnergyCheck full={fx.welcomeMetrics !== false} noSleep today={null} metrics={metrics} onSaved={onSaved} submit={submit} simple />
    </div>
  );
}

/** What a part shows when there's nothing in it right now (while arranging). */
const EMPTY: Partial<Record<WelcomeEl, string>> = {
  streak: "Shows on the day's first visit, once you have a streak.",
  bar: "Shows on the day's first visit.",
  reward: "Shows on the day's first visit.",
  line: "A new line each day.",
  reflect: "Add a question with its ✎.",
  habits: "Pick habits with its ✎.",
};

/** One of your reflection questions: the same one all day, ‹ › for another. */
function ReflectLine({ questions }: { questions: string[] }) {
  const [start] = useState(() => questions.indexOf(pickFor(new Date().toDateString(), questions)));
  const [i, setI] = useState(0);
  const q = questions[(((start + i) % questions.length) + questions.length) % questions.length];
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[.1em]" style={{ color: "#8a6116" }}>
        To reflect on
      </span>
      <div className="flex w-full items-center justify-center gap-1.5">
        {questions.length > 1 && (
          <button type="button" onClick={() => setI((n) => n - 1)} aria-label="Another question" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "#8a6116" }}>
            ‹
          </button>
        )}
        <p key={q} className="due-in m-0 font-display text-[16.5px] italic leading-snug" style={{ color: "var(--t-ink)" }}>
          {q}
        </p>
        {questions.length > 1 && (
          <button type="button" onClick={() => setI((n) => n + 1)} aria-label="Next question" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] hover:bg-black/[.06]" style={{ color: "#8a6116" }}>
            ›
          </button>
        )}
      </div>
    </div>
  );
}

/** The mist stays over the page for a breath as the welcome screen goes, then lifts, and Today fades up beneath it. */
function revealThroughMist() {
  const e = document.documentElement;
  fogOn(4000);
  e.setAttribute("data-mist-reveal", "");
  window.setTimeout(liftFog, 180);
  window.setTimeout(() => e.removeAttribute("data-mist-reveal"), 1400);
}

type PartKey = "checkin" | "sleep" | "focus";
type ButtonKey = PartKey | "quests";
const isPartKey = (el: string): el is PartKey => el === "checkin" || el === "sleep" || el === "focus";
const isButtonKey = (el: string): el is ButtonKey => isPartKey(el) || el === "quests";
const BUTTON_NAMES: Record<ButtonKey, string> = { checkin: "Emotional check-in", sleep: "Sleep check-in", focus: "Journal", quests: "Choose today's quests" };

/**
 * A welcome part whose button can be shaped in place: right-click it, or hold it on a phone, and its
 * editor folds open under it (no popup). Only presses on the part's own button or label count, so
 * fields and sliders inside keep their own right-click.
 */
function ButtonShell({ el, onEdit, children }: { el: WelcomeEl; onEdit: (k: ButtonKey) => void; children: React.ReactNode }) {
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const fired = useRef(false);
  const onButton = (t: EventTarget | null) => {
    const n = t as HTMLElement | null;
    if (!n?.closest || n.closest("input, textarea, [contenteditable='true'], [data-button-editor]")) return false;
    return !!n.closest("button, label");
  };
  const stop = () => {
    if (hold.current) clearTimeout(hold.current.t);
    hold.current = null;
  };
  if (!isButtonKey(el)) return <div className="flex w-full flex-col items-center">{children}</div>;
  return (
    <div
      className="flex w-full flex-col items-center [-webkit-touch-callout:none]"
      onContextMenu={(e) => {
        if (!onButton(e.target)) return;
        e.preventDefault();
        onEdit(el);
      }}
      onPointerDown={(e) => {
        fired.current = false;
        if (e.pointerType === "mouse" || !onButton(e.target)) return;
        const x = e.clientX;
        const y = e.clientY;
        hold.current = {
          x,
          y,
          t: setTimeout(() => {
            fired.current = true;
            hold.current = null;
            navigator.vibrate?.(8);
            onEdit(el);
          }, 550),
        };
      }}
      onPointerMove={(e) => {
        const h = hold.current;
        if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) stop();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onClickCapture={(e) => {
        // The tap that ended a hold doesn't also open the part.
        if (!fired.current) return;
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}

/** The editor that folds open under a welcome button: its words, an emoji for its icon, and its XP. */
function ButtonEditor({ k, fx, pays, onDone, children, onSnooze, onHide }: { k: ButtonKey; fx: FxSettings; pays: boolean; onDone: () => void; children?: React.ReactNode; onSnooze?: () => void; onHide?: () => void }) {
  const cur = fx.welcomeButtons?.[k] ?? {};
  const set = (patch: { text?: string; icon?: string; xp?: number }) => {
    const all = { ...(loadFx().welcomeButtons ?? {}) };
    const next = { ...(all[k] ?? {}), ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (next[key] === undefined || next[key] === "") delete next[key];
    all[k] = next;
    patchFx({ welcomeButtons: all });
  };
  const field = "bare-input h-8 min-w-0 rounded-none border-0 border-b bg-transparent px-1 text-[14px] focus:outline-none";
  const line = { borderColor: "#b39a6a", color: "#2a1c10" };
  return (
    <div data-button-editor="" className="mt-1.5 flex w-full max-w-[420px] flex-col gap-1.5 rounded-xl px-3 py-2 text-[13px]" style={{ border: "1px solid rgba(139,112,64,.45)", background: "rgba(255,250,238,.75)", color: "#2a1c10" }}>
      <label className="flex items-center gap-2">
        <span className="w-12 shrink-0 font-semibold">Words</span>
        <input defaultValue={cur.text ?? ""} placeholder={BUTTON_NAMES[k]} maxLength={60} onChange={(e) => set({ text: e.target.value })} className={`${field} flex-1`} style={line} />
      </label>
      <label className="flex items-center gap-2">
        <span className="w-12 shrink-0 font-semibold">Icon</span>
        <input defaultValue={cur.icon ?? ""} placeholder="an emoji, e.g. 🌙" maxLength={4} onChange={(e) => set({ icon: e.target.value.trim() })} className={`${field} w-28`} style={line} />
      </label>
      {pays && (
        <label className="flex items-center gap-2">
          <span className="w-12 shrink-0 font-semibold">XP</span>
          <input type="number" inputMode="numeric" min={0} max={50} defaultValue={cur.xp ?? 5} onChange={(e) => set({ xp: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) })} className={`${field} w-16 tabular-nums`} style={line} />
          <span style={{ color: "#6b5631" }}>once a day, when you fill it in</span>
        </label>
      )}
      {children}
      {(onSnooze || onHide) && (
        <div className="flex items-center gap-3 text-[12.5px]">
          {onSnooze && (
            <button type="button" onClick={onSnooze} className="underline underline-offset-2" style={{ color: "#6b5631" }}>
              Snooze till tomorrow
            </button>
          )}
          {onHide && (
            <button type="button" onClick={onHide} className="underline underline-offset-2" style={{ color: "#6b5631" }}>
              Hide it (the gear brings it back)
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => (set({ text: undefined, icon: undefined, xp: undefined }), onDone())} className="text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
          Back to how it was
        </button>
        <button type="button" onClick={onDone} className="h-8 rounded-full px-4 text-[13px] font-bold" style={GILT}>
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * The welcome screen's Journal (owner, Nov 6): a gilded button that opens a row of prompt pills.
 * Top priorities (the box the app and the toucan remember) is the first and opens by default; the
 * others (morning pages, gratitude…) are a plain page to write on. What's written is saved to your
 * journal by the screen's own button, each prompt paying its XP once a day.
 */
function WelcomeJournal({ fx, label, icon, priorities, registerJournal, onWritten }: { fx: FxSettings; label?: string; icon?: string; priorities: (question: string, xp: number) => React.ReactNode; registerJournal: (save: () => Promise<boolean>) => void; onWritten: (id: string, xp: number) => void }) {
  const prompts = journalPrompts(fx);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("priorities");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const current = prompts.find((p) => p.id === pick) ?? prompts[0];
  const top = prompts.find((p) => p.id === "priorities")!;
  async function save() {
    setError(null);
    try {
      for (const p of prompts) {
        const t = (texts[p.id] ?? "").trim();
        if (p.id === "priorities" || !t || saved[p.id] === t) continue;
        await addJournalEntryAction(`${p.label}: ${p.prompt}\n\n${t}`, null);
        setSaved((s) => ({ ...s, [p.id]: t }));
        onWritten(p.id, cleanXp(p.xp));
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your journal.");
      return false;
    }
  }
  // Saved by the screen's own button on the way out (braces: an effect's return value is its cleanup).
  useEffect(() => {
    registerJournal(save);
  });
  const written = prompts.filter((p) => p.id !== "priorities" && (texts[p.id] ?? "").trim()).length;
  return (
    <div className="flex w-full flex-col items-center">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-display flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]" style={GILT}>
        <span aria-hidden>{icon || "📖"}</span>
        {label || "Journal"}
        {written > 0 && !open && <span className="font-sans text-[12.5px] font-semibold opacity-80">· {written} written</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ opacity: 0.8, transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open}>
        <div className="flex w-full flex-col gap-2 pt-2">
          <div role="tablist" aria-label="Journal prompts" className="flex flex-wrap justify-center gap-1.5">
            {prompts.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === current.id}
                onClick={() => setPick(p.id)}
                className="h-8 rounded-full px-3 text-[13px] font-semibold"
                style={p.id === current.id ? { ...GILT } : { background: "rgba(255,250,238,.6)", border: "1px solid #b39a6a", color: "#2a1c10" }}
              >
                {p.label}
                {(p.id === "priorities" ? false : !!(texts[p.id] ?? "").trim()) && " ✓"}
              </button>
            ))}
          </div>
          {/* Top priorities keeps its own box; it stays mounted so its words are saved even from another pill. */}
          <div hidden={current.id !== "priorities"}>{priorities(top.prompt, cleanXp(top.xp))}</div>
          {current.id !== "priorities" && (
            <div className="flex flex-col gap-1">
              <p className="m-0 text-[14.5px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
                {current.prompt}
              </p>
              <textarea
                key={current.id}
                value={texts[current.id] ?? ""}
                onChange={(e) => setTexts((t) => ({ ...t, [current.id]: e.target.value }))}
                rows={current.id === "pages" ? 7 : 3}
                maxLength={6000}
                placeholder="Write here…"
                aria-label={current.prompt}
                className="w-full resize-y rounded-xl border px-3 py-2 text-[16px] leading-snug focus:outline-none"
                style={FIELD}
              />
              <span className="text-right text-[11.5px]" style={{ color: "#6b5631" }}>
                +{cleanXp(current.xp)} XP once you write · saved with the screen&rsquo;s button
              </span>
            </div>
          )}
          {error && (
            <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>
      </Fold>
    </div>
  );
}

/** The Journal's prompts, edited under its button (right-click or hold it): name, question, XP; add or remove. */
function JournalPromptsEditor({ fx }: { fx: FxSettings }) {
  const [list, setList] = useState<JournalPrompt[]>(() => journalPrompts(fx));
  const save = (next: JournalPrompt[]) => {
    setList(next);
    patchFx({ journalPrompts: next });
  };
  const edit = (i: number, patch: Partial<JournalPrompt>) => save(list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const field = "bare-input h-7 min-w-0 rounded-none border-0 border-b bg-transparent px-1 text-[13.5px] focus:outline-none";
  const line = { borderColor: "#b39a6a", color: "#2a1c10" };
  return (
    <div className="flex flex-col gap-1.5 border-t pt-1.5" style={{ borderColor: "rgba(139,112,64,.3)" }}>
      <span className="font-semibold">Prompts</span>
      {list.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-0.5 rounded-lg px-1.5 py-1" style={{ background: "rgba(255,255,255,.35)" }}>
          <div className="flex items-center gap-1.5">
            <input value={p.label} onChange={(e) => edit(i, { label: e.target.value.slice(0, 30) })} aria-label="Pill name" className={`${field} flex-1 font-semibold`} style={line} />
            <input type="number" inputMode="numeric" min={0} max={50} value={p.xp} onChange={(e) => edit(i, { xp: cleanXp(e.target.value) })} aria-label={`XP for ${p.label}`} className={`${field} w-12 tabular-nums`} style={line} />
            <span>XP</span>
            {p.id !== "priorities" && (
              <button type="button" onClick={() => save(list.filter((_, j) => j !== i))} aria-label={`Remove ${p.label}`} className="flex h-7 w-7 items-center justify-center text-[16px]" style={{ color: "#6b5631" }}>
                ×
              </button>
            )}
          </div>
          <input value={p.prompt} onChange={(e) => edit(i, { prompt: e.target.value.slice(0, 240) })} aria-label={`What ${p.label} asks`} className={field} style={line} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => save([...list, { id: `p${Date.now().toString(36)}`, label: "New prompt", prompt: "What's on your mind this morning?", xp: 5 }])}
        className="self-start text-[13px] font-semibold underline underline-offset-2"
        style={{ color: "#6b5631" }}
      >
        + Add a prompt
      </button>
    </div>
  );
}

const SNOOZE_PARTS_KEY = "welcome-snoozed-parts";
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
/** Parts snoozed today on this device (a new day brings them back). */
function readSnoozedParts(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const v = JSON.parse(window.localStorage.getItem(SNOOZE_PARTS_KEY) ?? "null") as { day?: string; parts?: string[] } | null;
    return v?.day === localDay() && Array.isArray(v.parts) ? v.parts : [];
  } catch {
    return [];
  }
}
