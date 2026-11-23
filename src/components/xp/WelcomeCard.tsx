"use client";

import { SnoozeIcon } from "@/components/ui/Icons";
import { SwipeActions } from "@/components/ui/SwipeActions";
import { HabitOptions, WelcomeHabits } from "@/components/xp/WelcomeHabits";
import { fogOn } from "@/lib/welcome-fog";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CoinIcon } from "@/components/ui/Icons";
import { CheckinIcon } from "./CheckinIcon";
import { checkinIconOf, checkinStyleOf, loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";
import { checkinLabel, reflectQuestions, welcomeOrder, welcomeShows, type WelcomeEl } from "@/lib/welcome";
import { useEscape } from "@/lib/use-escape";
import { welcomePartsXpAction } from "@/app/actions";
import { GearIcon } from "@/components/ui/Icons";
import { ArrangeAbove, ArrangeList, CastleEdit, GreetingOptions } from "./WelcomeArrange";
import { MistScene } from "./MistScene";
import { DueSoonDrawer } from "@/components/tasks/DueSoonDrawer";
import { SleepCheckIn } from "./SleepCheckIn";
import { TodayPlanner } from "./TodayPlanner";
import { castleOf } from "./CastleArt";
import { Fold } from "@/components/ui/Fold";
import { DawnPath } from "@/components/dawn/DawnPath";
import { type WelcomeAward } from "@/components/xp/welcome/types";
import { PIECES, SNOOZE_MAIN, snoozeOther, GILT, PILL, writeJson, PartKey, ButtonKey, isPartKey, isButtonKey, EMPTY, SNOOZE_PARTS_KEY, localDay, readSnoozedParts, revealThroughMist } from "@/components/xp/welcome/shared";
import { TopPriority } from "@/components/xp/welcome/TopPriority";
import { WelcomeJournal, JournalPromptsEditor } from "@/components/xp/welcome/WelcomeJournal";
import { ButtonShell, ButtonEditor } from "@/components/xp/welcome/Buttons";
import { ReflectLine, CheckinPanel } from "@/components/xp/welcome/Lines";
import { resetToucanFlight, WelcomeToucan } from "./welcome/WelcomeToucan";
import { useCardPlacement, useHeldScroll, usePinnedPaper } from "./welcome/use-card";
import { useHeldScreen } from "./welcome/use-held-screen";
import { GreetingLine } from "./welcome/GreetingLine";
import { useWiseLine, WiseLine } from "./welcome/WiseLine";

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
  // The day's wise line, ‹ › and thumbs (welcome/WiseLine.tsx). Its state stays up here so it lasts while you arrange.
  const wise = useWiseLine(line);
  const [checkedIn, setCheckedIn] = useState(false);
  // While arranging: the greeting's own options (from the ✎ beside it), and whether the castle is in view.
  const [greetingOpen, setGreetingOpen] = useState(false);
  // The pinned foot's parchment lines up with the card's own (it showed as a different patch of paper).
  const cardRef = useRef<HTMLDivElement>(null);
  const { footRef, capRef, alignFoot } = usePinnedPaper(cardRef);
  const { spacerRef, holdScroll, giveBack } = useHeldScroll(cardRef);
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
  const { at, setAt, cardW, setCardW, movingRef, sizingRef } = useCardPlacement(cardRef);
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
  const { screenH, kbLift, kbRoom } = useHeldScreen(cardRef);
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
    line: wise.shownLine ? <WiseLine {...wise} shownLine={wise.shownLine} /> : null,
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
              sizingRef.current = { x: e.clientX, w: cardW };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = sizingRef.current;
              if (!d) return;
              setCardW(Math.round(Math.max(340, Math.min(Math.min(900, window.innerWidth - 24), d.w + (e.clientX - d.x) * 2))));
            }}
            onPointerUp={() => {
              if (sizingRef.current) writeJson("welcome-card-w", cardW);
              sizingRef.current = null;
            }}
          />
        )}
        <div ref={cardRef} data-welcome-card onScroll={() => (alignFoot(), giveBack())} onClickCapture={holdScroll} className={`parchment relative flex bg-[var(--t-card,#fffaf0)] max-h-[calc(100svh-var(--wtop)-12px)] flex-col items-center gap-3 overflow-y-auto overscroll-none rounded-2xl pb-4 pl-5 pr-3 pt-10 text-center [scrollbar-gutter:stable] welcome-scroll`} style={{ width: `min(${cardW}px, 94vw)`, ...(screenH ? { maxHeight: `calc(${screenH}px - var(--wtop) - 12px - ${Math.max(0, at.y)}px)` } : {}) }}>
          {/* The top band stays put while the card scrolls, so nothing slides under the toucan's perch or the corner buttons. */}
          <div ref={capRef} aria-hidden className="welcome-cap pointer-events-none sticky -top-10 z-[3] -mb-3 -ml-5 -mr-3 -mt-10 h-10 shrink-0 self-stretch" />
          <GreetingLine heading={heading} arranging={arranging} greetingOpen={greetingOpen} setGreetingOpen={setGreetingOpen} cardRef={cardRef} at={at} setAt={setAt} movingRef={movingRef} />
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

