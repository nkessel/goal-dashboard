"use client";

import { BUBBLE_PAINT } from "@/lib/toucan-flourish";
import { useBubbleStyle } from "@/lib/use-bubble-style";
import { SnoozeIcon } from "@/components/ui/Icons";
import { SwipeActions } from "@/components/ui/SwipeActions";
import { openPlanMyDay } from "@/components/calendar/PlanMyDay";
import { HabitOptions, WelcomeHabits } from "@/components/xp/WelcomeHabits";
import { fogOn } from "@/lib/welcome-fog";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confirm, NoteButton, WhyBox } from "@/components/toucan/SayingFeedback";
import Link from "next/link";
import { CoinIcon } from "@/components/ui/Icons";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { CheckinIcon } from "./CheckinIcon";
import { likeLine, likedLines, lineForDay, retireLine } from "@/lib/greetings";
import { checkinIconOf, checkinStyleOf, loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";
import { addBackGreeting, checkinLabel, readPromptVotes, reflectQuestions, toucanPrompts, welcomeOrder, welcomeShows, writePromptVotes, type PromptVotes, type WelcomeEl } from "@/lib/welcome";
import { useEscape } from "@/lib/use-escape";
import { useLongPress } from "@/lib/use-long-press";
import { coachAction, welcomePartsXpAction } from "@/app/actions";
import { Digest } from "@/components/toucan/Digest";
import { talkToToucan } from "@/components/toucan/talk";
import { GearIcon } from "@/components/ui/Icons";
import { ArrangeAbove, ArrangeList, CastleEdit, EditButton, GoldCheck, GreetingOptions } from "./WelcomeArrange";
import { MistScene } from "./MistScene";
import { DueSoonDrawer } from "@/components/tasks/DueSoonDrawer";
import { SleepCheckIn } from "./SleepCheckIn";
import { TodayPlanner } from "./TodayPlanner";
import { castleOf } from "./CastleArt";
import { Fold } from "@/components/ui/Fold";
import { DawnPath } from "@/components/dawn/DawnPath";
import { type WelcomeAward } from "@/components/xp/welcome/types";
import { PIECES, SNOOZE_MAIN, snoozeOther, GILT, PILL, readJson, writeJson, greetingSize, REPLY_W, REPLY_SCALE, REPLY_LINE, REPLY_MAX, FIELD, PartKey, ButtonKey, isPartKey, isButtonKey, EMPTY, SNOOZE_PARTS_KEY, localDay, readSnoozedParts, revealThroughMist } from "@/components/xp/welcome/shared";
import { TopPriority } from "@/components/xp/welcome/TopPriority";
import { WelcomeJournal, JournalPromptsEditor } from "@/components/xp/welcome/WelcomeJournal";
import { ButtonShell, ButtonEditor } from "@/components/xp/welcome/Buttons";
import { LineVote, ReflectLine, CheckinPanel } from "@/components/xp/welcome/Lines";

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
    if (!t || t === greeting || t === (hello + greeting).trim()) return;
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
    if (!filledRef.current.includes(k)) {
      filledRef.current = [...filledRef.current, k];
      // Paid the moment the part is saved, not on the way out (owner, Nov 13); once a day each, the server keeps count.
      if (k !== "focus" && partXp(k) > 0) void welcomePartsXpAction([{ key: k, xp: partXp(k) }]).catch(() => {});
    }
    setFilledParts((cur) => (cur.includes(k) ? cur : [...cur, k]));
  };
  // Journal prompts written this visit, each with its own XP.
  const journalRef = useRef<{ key: string; xp: number }[]>([]);
  const [journalFilled, setJournalFilled] = useState<{ key: string; xp: number }[]>([]);
  const fillJournal = (key: string, xpN: number) => {
    if (journalRef.current.some((j) => j.key === key)) return;
    journalRef.current = [...journalRef.current, { key, xp: xpN }];
    if (xpN > 0) void welcomePartsXpAction([{ key, xp: xpN }]).catch(() => {});
    setJournalFilled(journalRef.current);
  };
  // Pays each part filled in this visit (once a day each, the server keeps count).
  const payParts = () => {
    const list = [...filledRef.current.filter((k) => k !== "focus").map((k) => ({ key: k as string, xp: partXp(k) })), ...journalRef.current].filter((p) => p.xp > 0);
    if (list.length) void welcomePartsXpAction(list).catch(() => {});
  };
  const partXp = (k: PartKey) => Math.max(0, Math.min(50, btn[k]?.xp ?? 5));
  const [btnEdit, setBtnEdit] = useState<ButtonKey | null>(null);
  // Swipe a part's folded button left for its Snooze button (till tomorrow; owner, Nov 6 and 12). Hiding is in its editor (hold it). Snoozes live on this device.
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
  const hidePart = (el: WelcomeEl) =>
    patchFx({ welcomeHide: [...new Set([...(loadFx().welcomeHide ?? ["due"]), el])], ...(el === "dawn" ? { welcomeDawnOn: false } : {}) });
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
    habits: <WelcomeHabits fx={fx} label={btn.habits?.text?.trim()} icon={btn.habits?.icon} />,
    dawn: <DawnPath label={btn.dawn?.text?.trim()} icon={btn.dawn?.icon} />,
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
            // Not the gear's class: that one turns on hover, which tilted the minus (owner, Nov 9).
            className="hover-glow absolute right-[42px] top-1.5 z-[4] flex h-[28px] w-[28px] items-center justify-center rounded-full"
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
                {/* The whole greeting is yours to write over, "Good morning!" too (owner, Nov 4). */}
                {hello}
                {greeting}
                {/* Its ✎ and quiet thumbs, right after the last word. */}
                {writing === null && (
                  <span contentEditable={false} data-show={arranging || greetTools ? "true" : "false"} className="touch-tools ml-1 inline-flex items-center gap-0.5 whitespace-nowrap align-middle font-sans text-[16px]">
                    <span className={`transition-opacity ${arranging ? "" : "opacity-50 hover:opacity-100 focus-within:opacity-100"}`}>
                      <EditButton
                        open={arranging && greetingOpen}
                        onClick={() => {
                          setWriting(hello + greeting);
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
                      // Only a folded button slides, and only to its Snooze: a small icon button, no words, no swipe to hide (owner, Nov 12).
                      compact
                      startOn={(t) => !!(t as HTMLElement | null)?.closest?.("button[aria-expanded='false']")}
                      right={{ label: "Snooze till tomorrow", icon: <SnoozeIcon />, background: "linear-gradient(180deg,#3a3f7a,#232655)", color: "#f2d27e", onAction: () => snoozePart(el) }}
                    >
                      {parts[el]}
                    </SwipeActions>
                  </div>
                ) : (
                  parts[el]
                )}
                {/* Done: a clear green check at the section button's left (owner, Nov 13). */}
                {((el === "focus" && journalFilled.length > 0) || (isPartKey(el) && el !== "focus" && filledParts.includes(el))) && (
                  <span aria-label="Done" className="card-pop-in pointer-events-none absolute left-0.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "#4e8a3a", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12.500l4.500 4.500L19 7.500" stroke="#fff" strokeWidth="3.400" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                {el === "focus" && journalFilled.length > 0 && (
                  <span className="pointer-events-none mt-0.5 text-[11.5px] font-semibold tabular-nums" style={{ color: "#4e6a35" }}>
                    +{journalFilled.reduce((a, j) => a + j.xp, 0)} XP
                  </span>
                )}
                {isPartKey(el) && el !== "focus" && partXp(el) > 0 && (
                  <span className="pointer-events-none mt-0.5 text-[11.5px] font-semibold tabular-nums" style={{ color: filledParts.includes(el) ? "#4e6a35" : "#8a6a2c", opacity: filledParts.includes(el) ? 1 : 0.75 }}>
                    {filledParts.includes(el) ? `+${partXp(el)} XP` : `+${partXp(el)} XP when filled in`}
                  </span>
                )}
                {isButtonKey(el) && (
                  <Fold open={btnEdit === el}>
                    <ButtonEditor k={el} fx={fx} pays={isPartKey(el) && el !== "focus"} onDone={() => setBtnEdit(null)} onSnooze={() => (setBtnEdit(null), snoozePart(el))} onHide={() => (setBtnEdit(null), hidePart(el))}>
                      {el === "focus" && <JournalPromptsEditor fx={fx} />}
                      {/* The Habits button's function: which habits it shows, and adding one (owner, Nov 9). */}
                      {el === "habits" && <HabitOptions fx={fx} />}
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
  const [carried, setCarried] = useState(false);
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
  // His bubble's look and way, chosen in Toucan settings (here "Each place its own" is parchment, words + the respond line).
  const bubbleStyle = useBubbleStyle();
  const glow = bubbleStyle.look === "spirit";
  const [unfolded, setUnfolded] = useState(false);
  const respondShown = bubbleStyle.way !== "quiet" || unfolded || replying || !!answer || !!talk;
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
          if (!d.moved) setCarried(true);
          d.moved = true;
          setOff({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
        }}
        onPointerCancel={() => setCarried(false)}
        onPointerUp={() => {
          const d = drag.current;
          setCarried(false);
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
            {/* He flies while you carry him (owner, Nov 10), and settles when you let go. */}
            <ToucanArt flying={!landed || carried} size={58} />
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
          onClick={(e) => {
            // Words first: a tap on his words shows the respond line.
            if (respondShown || drag.current?.moved || (e.target as HTMLElement).closest("button, input, textarea, a, form")) return;
            setUnfolded(true);
          }}
          data-bubble-look={glow ? "spirit" : undefined}
          className={`toucan-bubble owl-say absolute top-1 left-[60px] cursor-grab select-none touch-none z-[5] w-[min(232px,calc(100vw-128px))] rounded-2xl pb-4 pl-3 pr-7 pt-2 text-left text-[13.5px] leading-snug [-webkit-touch-callout:none]`}
          style={{ ...BUBBLE_PAINT[glow ? "spirit" : "parchment"].bubble, translate: menu && menuDx ? `${menuDx}px 0` : undefined }}
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
          {(rate || bubbleStyle.way === "full") && !menu && !saying && !talk && (
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
          {!menu && !saying && !respondShown && (
            <span className="absolute inset-x-0 top-[calc(100%-9px)] flex justify-center">
              <button type="button" onClick={() => setUnfolded(true)} aria-label="Respond to him" title="Respond" className="bubble-hang flex h-[18px] items-center rounded-full px-2 text-[13px] leading-none tracking-widest">
                ⋯
              </button>
            </span>
          )}
          {!menu && !saying && respondShown && (
            <span className={`absolute inset-x-0 top-[calc(100%-7px)] flex justify-center gap-1 ${unfolded ? "fade-in" : ""}`}>
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
