"use client";

import { fogOn } from "@/lib/welcome-fog";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Confirm, NoteButton, WhyBox } from "@/components/toucan/SayingFeedback";
import Link from "next/link";
import { CoinIcon } from "@/components/ui/Icons";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { EnergyCheck } from "./EnergyCheck";
import { CheckinIcon } from "./CheckinIcon";
import { likeLine, likedLines, lineForDay, retireLine } from "@/lib/greetings";
import { CHECKIN_STYLES, checkinIconOf, checkinStyleOf, loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";
import { addBackGreeting, checkinLabel, readPromptVotes, toucanPrompts, welcomeOrder, welcomeShows, writePromptVotes, type PromptVotes, type WelcomeEl } from "@/lib/welcome";
import { useEscape } from "@/lib/use-escape";
import { coachAction, setTopPriorityAction } from "@/app/actions";
import { Digest, PLAN_DAY, talkToToucan } from "@/components/toucan/ToucanGuide";
import { GearIcon } from "@/components/ui/Icons";
import { ArrangeAbove, ArrangeList, CastleEdit, EditButton, GoldCheck, GreetingOptions } from "./WelcomeArrange";
import { MistScene } from "./MistScene";
import { DueSoonDrawer } from "@/components/tasks/DueSoonDrawer";
import { SleepCheckIn } from "./SleepCheckIn";
import { TodayPlanner } from "./TodayPlanner";
import { castleOf } from "./CastleArt";

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
  const [shown, setShown] = useState(0);
  // Your verdict on the day's wise line: liked lines come back often, disliked ones never.
  const [verdict, setVerdict] = useState<"like" | "dislike" | null>(() => (line && typeof window !== "undefined" && likedLines().has(line) ? "like" : null));
  // Thumbs down asks why; the speech bubble beside the thumbs takes any other note.
  const [lineWhy, setLineWhy] = useState<"down" | "note" | null>(null);
  const [lineSaid, setLineSaid] = useState<string | null>(null);
  // The same for the greeting: thumbs, why, a note, and a word that it landed.
  const [greetVerdict, setGreetVerdict] = useState<"like" | "dislike" | null>(null);
  const [greetWhy, setGreetWhy] = useState<"down" | "note" | null>(null);
  const [greetSaid, setGreetSaid] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  // While arranging: the greeting's own options (from the ✎ beside it), and whether the castle is in view.
  const [greetingOpen, setGreetingOpen] = useState(false);
  // The greeting is yours to rewrite: tap it, write your own, and choose whether to keep it.
  const [greeting, setGreeting] = useState(heading);
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
  const sizing = useRef<{ x: number; w: number } | null>(null);
  // One toucan at a time: while this screen is open the perched one and his notes wait (see PerchedOwl, ToucanGuide).
  useEffect(() => {
    if (min) return;
    const e = document.documentElement;
    e.setAttribute("data-welcome-open", "");
    return () => e.removeAttribute("data-welcome-open");
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
  const savers = useRef<Partial<Record<"focus" | "sleep", () => Promise<boolean>>>>({});
  const [finishing, setFinishing] = useState(false);
  const complete = async () => {
    if (finishing || leaving) return;
    setFinishing(true);
    const ok = (await Promise.all(Object.values(savers.current).map((f) => f?.() ?? true))).every(Boolean);
    setFinishing(false);
    // A save that failed says so where it is, and the screen stays.
    if (!ok) return;
    if (checkinOpen && !checkedIn && submitCheckin.current) submitCheckin.current(leave);
    else leave();
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
  useEffect(() => {
    const typing = () => {
      const a = document.activeElement;
      return document.documentElement.hasAttribute("data-kb") || a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && !["range", "checkbox", "radio", "button"].includes(a.type));
    };
    const measure = () => {
      if (!typing()) setScreenH(window.innerHeight);
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
    setTimeout(() => (onClose(), toToday?.()), elsewhere ? 1350 : 2400);
  };
  // Only the bottom-right button goes on to town: Escape and taps on the mist just close what's open.
  useEscape(() => {
    if (arranging) setArranging(false);
  });

  useEffect(() => {
    if (!award?.xp) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start - 350) / 700);
      setShown(Math.round(Math.max(0, t) * award.xp));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [award?.xp]);

  const parts: Partial<Record<WelcomeEl, React.ReactNode>> = {
    focus: <TopPriority arranging={arranging} register={(f) => (savers.current.focus = f)} last={priority} question={fx.welcomeFocusQ?.trim() || "What are your top priorities today?"} />,
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
          <CheckinIcon icon={checkinIconOf(fx)} /> {checkedIn ? "Checked in ✓" : checkinLabel(fx)}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ opacity: 0.8, transform: checkinOpen && !arranging ? "rotate(180deg)" : undefined }}>
            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {!arranging && (
          <div className="drawer-body w-full" data-open={checkinOpen ? "true" : "false"}>
            <div className="drawer-inner" inert={!checkinOpen}>
              <CheckinPanel fx={fx} metrics={metrics} submit={(f) => (submitCheckin.current = f)} onSaved={() => (setCheckedIn(true), onCheckedIn?.())} />
            </div>
          </div>
        )}
      </div>
    ),
    sleep: <SleepCheckIn register={(f) => (savers.current.sleep = f)} />,
    streak: award && award.streak > 0 ? (
      <p className="m-0 text-[14.5px] italic leading-snug" style={{ color: "#5a4a30" }}>
        {award.streak > 1 ? `🔥 ${award.streak}-day streak — keep it going` : "Day one of a new streak"}
      </p>
    ) : null,
    line: line ? (
      <div className="flex w-full flex-col items-center gap-0.5">
        {/* Quiet thumbs, always to the right of the line (at its bottom right when it wraps), the line still centred. */}
        <div className="grid w-full grid-cols-[5.25rem_1fr_5.25rem] items-end gap-1">
          <span aria-hidden />
          <p className={`m-0 text-[16px] leading-snug ${verdict === "dislike" ? "line-through opacity-50" : ""}`} style={{ color: "var(--t-ink)" }}>
            {line}
          </p>
          <span className="flex items-center gap-0.5">
            <LineVote kind="like" on={verdict === "like"} onClick={() => (likeLine(line, verdict !== "like"), setVerdict(verdict === "like" ? null : "like"), setLineSaid(verdict === "like" ? "Taken back" : "Saved: it'll come back more often"))} />
            <LineVote kind="dislike" on={verdict === "dislike"} onClick={() => (retireLine(line, verdict !== "dislike"), setVerdict(verdict === "dislike" ? null : "dislike"), setLineWhy(verdict === "dislike" ? null : "down"), setLineSaid(verdict === "dislike" ? "It's back in the rotation" : "Got it: it won't come back"))} />
            <NoteButton on={lineWhy === "note"} onClick={() => setLineWhy((w) => (w === "note" ? null : "note"))} />
          </span>
        </div>
        {/* Every press says it landed. */}
        <Confirm text={lineSaid} onDone={() => setLineSaid(null)} />
        {lineWhy && <WhyBox key={lineWhy} saying={line} source="Wise line" down={lineWhy === "down"} onDone={(sent) => (setLineWhy(null), sent && setLineSaid("Thanks, your feedback was sent"))} />}
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
        <span className="pc-xp text-[26px] font-bold leading-none" style={{ color: "var(--t-xp)" }}>
          +{shown} XP
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
    quests: <TodayPlanner today={today} due={due} />,
  };
  const allEls = welcomeOrder(fx);
  const order = allEls.filter((el) => welcomeShows(fx, el) && parts[el]);
  // Not checked in yet? "Not now" offers to ask again later, or to skip it for today.
  const snoozable = !!onSnooze && !checkedIn && order.includes("checkin");
  const confetti = fx.welcomeConfetti !== false && mode === "day";

  if (min)
    return createPortal(
      // The screen tucked away: a small bubble (a sun on the day's first visit, a lantern-moon later) that opens it again.
      <button type="button" onClick={restore} aria-label={mode === "day" ? "Open the morning check-in" : "Open the check-in"} title={mode === "day" ? "Morning check-in" : "Check-in"} className="welcome-min fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] right-4 z-[47] flex h-14 w-14 items-center justify-center rounded-full">
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
    <div data-welcome-root data-kb-plain data-no-ghost style={screenH ? { height: screenH, bottom: "auto" } : undefined} className={`fixed inset-0 ${preview ? "z-[95]" : drawerOpen ? "z-[49]" : "z-[60]"} flex items-start justify-center px-3 pb-3 pt-[max(56px,calc(env(safe-area-inset-top)+48px),9dvh)] ${leaving ? "pointer-events-none" : ""}`} onClick={() => arranging && setArranging(false)} role="dialog" aria-modal="true" aria-label={heading}>
      {/* Overscan: while a phone's keyboard opens or closes the screen briefly changes size; this keeps Today from peeking through above or below. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 -bottom-[60vh] -top-[60vh] -z-[1]" style={{ background: "#1b2119" }} />
      {/* A misty valley, and the card coming out of the mist. While arranging, the castle's ✎ stands right beside it. */}
      <MistScene leaving={leaving || minimizing} castle={castleOf(fx.welcomeCastle)} castleSeed={fx.welcomeCastleSeed} castleSlot={arranging ? <CastleEdit fx={fx} /> : null} onCastleVisible={setCastleSeen} />
      {/* Moved where you put it (drag its heading). */}
      <div className="relative flex max-h-full flex-col items-center" style={at.x || at.y ? { transform: `translate(${at.x}px, ${at.y}px)` } : undefined}>
      {/* What isn't part of the card (when it opens, confetti) sits above it while arranging. */}
      {arranging && <ArrangeAbove fx={fx} castleHidden={!castleSeen} />}
      <div className={`${leaving || minimizing ? "mist-card-out" : "mist-emerge"} relative min-h-0`} onClick={(e) => e.stopPropagation()}>
        {/* Kept mounted (and visible) while arranging, so he doesn't fly in again each time. */}
        <WelcomeToucan fx={fx} onAway={() => minimize(true)} />
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
            className="settings-gear absolute -top-2 right-7 z-[2] flex h-[30px] w-[30px] items-center justify-center rounded-full"
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
          onClick={() => setArranging((v) => !v)}
          aria-pressed={arranging}
          aria-label={arranging ? "Done arranging" : "Welcome screen settings"}
          title={arranging ? "Done arranging" : "Welcome screen settings"}
          className="settings-gear absolute -right-2 -top-2 z-[2] flex h-[30px] w-[30px] items-center justify-center rounded-full"
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
        <div className={`parchment relative flex bg-[var(--t-card,#fffaf0)] ${arranging ? "max-h-[70dvh]" : "max-h-[calc(100dvh-88px)]"} flex-col items-center gap-3 overflow-y-auto rounded-2xl pb-4 pl-5 pr-3 pt-5 text-center [scrollbar-gutter:stable] welcome-scroll`} style={{ width: `min(${cardW}px, 94vw)`, ...(screenH && !arranging ? { maxHeight: screenH - 88 } : {}) }}>
          {/* The greeting, with its ✎ at its upper right. Editing keeps the exact look and layout it will have. */}
          <div
            className={`relative w-full px-8 ${writing === null ? "cursor-grab" : ""}`}
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
              setAt({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
            }}
            onPointerUp={() => {
              if (moving.current?.moved) writeJson("welcome-card-at", at);
              moving.current = null;
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
                style={{ color: "var(--t-ink)", fontSize: greetingSize(writing ?? greeting), caretColor: "#8a6116", outline: "none" }}
              >
                {greeting}
              </p>
              {/* Its ✎, at the text's own upper right. */}
              {writing === null && (
                <span className={`absolute -right-7 -top-1.5 transition-opacity ${arranging ? "" : "opacity-50 hover:opacity-100 focus-within:opacity-100"}`}>
                  <EditButton
                    open={arranging && greetingOpen}
                    onClick={() => {
                      setWriting(greeting);
                      if (arranging) setGreetingOpen(true);
                    }}
                    label="Edit the greeting"
                  />
                </span>
              )}
            </span>
          </div>
          {writing === null && !arranging && (
            <div className="-my-2 flex w-full flex-col items-center">
              <span className="flex h-6 items-center gap-0.5 self-end">
                <Confirm text={greetSaid} onDone={() => setGreetSaid(null)} />
                <span className="flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100">
                  <LineVote kind="like" on={greetVerdict === "like"} onClick={() => voteGreeting(greetVerdict === "like" ? null : "like")} />
                  <LineVote kind="dislike" on={greetVerdict === "dislike"} onClick={() => voteGreeting(greetVerdict === "dislike" ? null : "dislike")} />
                  <NoteButton on={greetWhy === "note"} onClick={() => setGreetWhy((w) => (w === "note" ? null : "note"))} />
                </span>
              </span>
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
          {arranging && greetingOpen && <GreetingOptions fx={fx} />}
          {arranging ? (
            <ArrangeList fx={fx} order={allEls} parts={parts} empty={EMPTY} />
          ) : (
            order.map((el) => (
              <div key={el} className="flex w-full flex-col items-center">
                {parts[el]}
              </div>
            ))
          )}
          {/* The way on stays in reach: pinned to the card's foot while the rest scrolls. */}
          <div className="welcome-foot sticky -bottom-4 z-[3] -mb-4 flex w-full justify-center pb-4 pt-2">
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
                <button key={`${snoozing}-${c.label}`} type="button" onClick={() => (c.ms === "tomorrow" ? leave() : onSnooze!(c.ms))} className="snooze-pop h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={{ ...PILL, animationDelay: `${i * 45}ms` }}>
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
                    if (n > 0) onSnooze!(Math.min(24 * 60, n) * 60_000);
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
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
function resetToucanFlight() {
  toucanLanded = false;
}
function WelcomeToucan({ fx, onAway }: { fx: FxSettings; /** Going elsewhere in the app (his settings): the screen tucks itself away first. */ onAway: () => void }) {
  const [landed, setLanded] = useState(toucanLanded);
  const [flyIn] = useState(!toucanLanded);
  const [menu, setMenu] = useState(false);
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
  const [replying, setReplying] = useState(false);
  const [talk, setTalk] = useState<{ you: string; him: string; thinking: boolean; history: { role: "user" | "assistant"; content: string }[] } | null>(null);
  async function reply() {
    const q = answer.trim();
    if (!q || talk?.thinking) return;
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
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  useEffect(() => {
    if (toucanLanded) return;
    const t = setTimeout(() => ((toucanLanded = true), setLanded(true)), 3150);
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
  const item = "font-semibold underline underline-offset-2";
  return (
    <div className={`${flyIn ? "welcome-toucan" : ""} absolute z-[3]`} style={{ left: 8 + off.x, top: -47 + off.y }}>
      <button
        type="button"
        onClick={() => {
          if (drag.current?.moved || !landed) return;
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
            try {
              window.localStorage.setItem(TOUCAN_AT, JSON.stringify(off));
            } catch {}
            // Let this release's click pass without opening the menu.
            setTimeout(() => (drag.current = null), 0);
          } else drag.current = null;
        }}
        aria-label="The toucan: plan the day, talk, or a wise saying (drag to move him)"
        aria-expanded={menu}
        className={`owl-body block touch-none ${landed ? "owl-perched cursor-grab" : "pointer-events-none"}`}
      >
        <span className="owl-idle block">
          <ToucanArt flying={!landed} size={58} />
        </span>
      </button>
      {landed && (
        <div
          // His bubble moves him too: drag it by its words (buttons and the reply line still work).
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button, input, textarea, a, form")) return;
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
            if (drag.current?.moved) {
              try {
                window.localStorage.setItem(TOUCAN_AT, JSON.stringify(off));
              } catch {}
            }
            drag.current = null;
          }}
          className={`group/bubble toucan-bubble owl-say absolute bottom-1 left-[58px] cursor-grab touch-none z-[5] ${why || talk ? "w-[min(290px,74vw)]" : "w-max min-w-[180px] max-w-[min(250px,62vw)]"} rounded-2xl px-3 pb-3.5 pt-2 text-left text-[13.5px] leading-snug`} style={{ background: "#fffaf0", border: "1.5px solid #b39a6a", color: "#3d2f18", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}>
          {/* ✎ at the top right: rate what he asked, or say more about it. */}
          {/* Hidden while you're answering him (an answer already says it's a good question). */}
          {!menu && !saying && !talk && !replying && (
            <button type="button" onClick={() => setRate((v) => !v)} aria-label="Rate or comment on what he asked" title="Rate or comment" aria-expanded={rate} className={`absolute -right-2 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full${rate ? "" : " opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"}`} style={{ background: rate ? "#f2e2b4" : "#fffaf0", border: "1px solid #b39a6a", color: "#8a6116" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
              </svg>
            </button>
          )}
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
            <span className={!menu && !saying ? "block pr-2" : undefined}>{saying ?? (menu ? "How can I help?" : ask)}</span>
          )}
          <Confirm text={said} onDone={() => setSaid(null)} />
          {/* Hanging from the bubble's lower edge (not part of his words): ‹ › for something else he could ask, and Reply. */}
          {!menu && !saying && (
            <span className="absolute left-2.5 right-2.5 top-[calc(100%-11px)] flex items-start gap-1">
              {!talk && !replying && !answer && prompts.length > 1 && (
                <span className="bubble-coin opacity-0 transition-opacity duration-200 group-hover/bubble:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60">
                  <button type="button" onClick={() => step(-1)} aria-label="Something else he could ask" className="bubble-coin-half" data-side="l">
                    ‹
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="Next thing he could ask" className="bubble-coin-half" data-side="r">
                    ›
                  </button>
                </span>
              )}
              <span className="flex-1" />
              {talk && !talk.thinking && (
                <button type="button" onClick={() => (talkToToucan(undefined, "talk"), setTalk(null), setReplying(false))} title="Open the full conversation" className="bubble-hang flex h-6 items-center rounded-full px-2 text-[11.5px] font-semibold">
                  More
                </button>
              )}
              {/* A blank line to answer him in, hanging under his words; it widens as you type. */}
              <form
                className="relative flex items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void reply();
                }}
              >
                {/* 16px text drawn at 13px (iPhone doesn't zoom on focus), in a box sized to what you see. */}
                <span className="reply-box bubble-hang relative block overflow-hidden rounded-[11px]" style={{ width: REPLY_W, height: answerH }}>
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
                    className="reply-line absolute left-0 top-0 block resize-none bg-transparent py-[3px] pl-3 pr-9 text-[16px] leading-[20px] outline-none"
                    style={{ color: "#2a1c10", width: REPLY_W / REPLY_SCALE, height: answerH / REPLY_SCALE, transform: `scale(${REPLY_SCALE})`, transformOrigin: "0 0", overflowY: answerH >= REPLY_MAX ? "auto" : "hidden" }}
                  />
                </span>
                {answer.trim() && (
                  <button type="submit" aria-label="Send" className="reply-send reveal absolute bottom-[1px] right-[1px] flex h-5 w-5 items-center justify-center rounded-full">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </form>
            </span>
          )}
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
            <span className="mt-1.5 flex flex-col items-start gap-1">
              <button type="button" onClick={() => (setMenu(false), talkToToucan(undefined, "talk", PLAN_DAY))} className={item}>
                Plan my day
              </button>
              <button type="button" onClick={() => (setMenu(false), talkToToucan())} className={item}>
                Talk to me
              </button>
              <button type="button" onClick={() => setSaying(lineForDay(`${Date.now()}`))} className={item}>
                Tell me a wise saying
              </button>
              <button type="button" onClick={() => (setRewording(true), setWords(ask))} className="underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                Change what I ask first
              </button>
              <Link href="/settings?open=toucan-spirit" onClick={onAway} className="underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                Toucan settings
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
const REPLY_W = 168;
const REPLY_SCALE = 0.8125;
const REPLY_LINE = 22;
const REPLY_MAX = 72;

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
function TopPriority({ question, register, arranging = false }: { last: { text: string; others?: string[]; day: string } | null; question: string; register: (save: () => Promise<boolean>) => void; arranging?: boolean }) {
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
      setEditing(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      return false;
    } finally {
    }
  };
  // Saved by the screen's own button on the way out (no Save of its own).
  useEffect(() => register(() => (saved && !editing ? Promise.resolve(true) : save(text, filled))));
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
      <label htmlFor="welcome-priority" className="text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
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
      {othersOpen && (
        <div className="reveal mx-auto flex w-[65%] min-w-[220px] flex-col items-center gap-1">
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
      )}
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
};
