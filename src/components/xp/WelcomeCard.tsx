"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CoinIcon } from "@/components/ui/Icons";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { EnergyCheck } from "./EnergyCheck";
import { CheckinIcon } from "./CheckinIcon";
import { likeLine, likedLines, lineForDay, retireLine } from "@/lib/greetings";
import { CHECKIN_STYLES, checkinIconOf, checkinStyleOf, loadFx, patchFx, subscribeFx, type FxSettings } from "@/lib/celebration-fx";
import { addBackGreeting, toucanAsk, welcomeOrder, welcomeShows, type WelcomeEl } from "@/lib/welcome";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { voice, windowOf } from "@/lib/toucan-style";
import { useToucanStyle } from "@/lib/toucan-style-store";
import { useEscape } from "@/lib/use-escape";
import { addJournalEntryAction, setTopPriorityAction } from "@/app/actions";
import { PLAN_DAY, talkToToucan } from "@/components/toucan/ToucanGuide";
import { GearIcon } from "@/components/ui/Icons";
import { ArrangeAbove, ArrangeList, CastleEdit, EditButton, GoldCheck, GreetingOptions } from "./WelcomeArrange";
import { MistScene } from "./MistScene";
import { DueSoonDrawer } from "@/components/tasks/DueSoonDrawer";
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
  priority = null,
  fx: fxProp,
  onClose,
  toToday,
  onCheckedIn,
  onSnooze,
  preview = false,
}: {
  mode: "day" | "back";
  heading: string;
  award: WelcomeAward | null;
  line: string | null;
  metrics: string[];
  lastCheckInAt: string | null;
  due: { id: string; title: string; due_at: string | null }[];
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
}) {
  const style = useToucanStyle();
  // The settings as they are now: changed right here while arranging, or anywhere else.
  const [fx, setFx] = useState(fxProp);
  useEffect(() => subscribeFx(() => setFx(loadFx())), []);
  // The gear arranges the screen in place: each part gets its own controls where it sits.
  const [arranging, setArranging] = useState(false);
  const [shown, setShown] = useState(0);
  // Your verdict on the day's wise line: liked lines come back often, disliked ones never.
  const [verdict, setVerdict] = useState<"like" | "dislike" | null>(() => (line && typeof window !== "undefined" && likedLines().has(line) ? "like" : null));
  const [checkedIn, setCheckedIn] = useState(false);
  // While arranging: the greeting's own options (from the ✎ beside it), and whether the castle is in view.
  const [greetingOpen, setGreetingOpen] = useState(false);
  // The greeting is yours to rewrite: tap it, write your own, and choose whether to keep it.
  const [greeting, setGreeting] = useState(heading);
  const [writing, setWriting] = useState<string | null>(null);
  const [keepAsk, setKeepAsk] = useState<{ text: string; was: string; keep: boolean; retire: boolean } | null>(null);
  function finishWriting() {
    const t = (writing ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    setWriting(null);
    if (!t || t === greeting) return;
    setKeepAsk({ text: t, was: greeting, keep: true, retire: true });
    setGreeting(t);
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
  const savers = useRef<Partial<Record<"focus" | "intention", () => Promise<boolean>>>>({});
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
    focus: <TopPriority register={(f) => (savers.current.focus = f)} last={priority} question={fx.welcomeFocusQ?.trim() || "What are your top priorities today?"} />,
    intention: mode === "day" ? <Intention register={(f) => (savers.current.intention = f)} question={fx.welcomeIntentionQ?.trim() || "Today is about…"} hint={fx.welcomeIntentionHint?.trim() || "e.g. Steady and kind to myself"} /> : null,
    toucan: (
      <div className="flex w-full items-center gap-2.5 text-left">
        <ToucanArt size={40} />
        <p className="m-0 flex-1 text-[15px] italic leading-snug" style={{ color: "#3d2f18" }}>
          {mode === "back" ? (style.tone === "direct" ? "Quick check-in?" : "How are you arriving?") : `${voice.greet(style, windowOf() ?? "morning")} How are you arriving today?`}
        </p>
      </div>
    ),
    checkin: (recent || checkinOpen) && !arranging ? (recent ? null : (
      // Parchment like the rest of the card, its words in ink rather than cream (as in Insights).
      <CheckinPanel fx={fx} mode={mode} metrics={metrics} checkedIn={checkedIn} submit={(f) => (submitCheckin.current = f)} onCollapse={() => setCheckinOpen(false)} onSaved={() => (setCheckedIn(true), onCheckedIn?.())} />
    )) : (
      <button
        type="button"
        onClick={() => setCheckinOpen(true)}
        className="font-display flex h-10 items-center gap-1.5 rounded-full px-5 text-[16px]"
        style={checkinStyleOf(fx).style}
      >
        <CheckinIcon icon={checkinIconOf(fx)} /> {fx.checkinText?.trim() || "Check in"}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.8 }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    ),
    streak: award && award.streak > 0 ? (
      <p className="m-0 text-[14.5px] italic leading-snug" style={{ color: "#5a4a30" }}>
        {award.streak > 1 ? `🔥 ${award.streak}-day streak — keep it going` : "Day one of a new streak"}
      </p>
    ) : null,
    line: line ? (
      <div className="flex w-full flex-col items-center gap-0.5">
        {/* Quiet thumbs, always to the right of the line (at its bottom right when it wraps), the line still centred. */}
        <div className="grid w-full grid-cols-[3.5rem_1fr_3.5rem] items-end gap-1">
          <span aria-hidden />
          <p className={`m-0 text-[16px] leading-snug ${verdict === "dislike" ? "line-through opacity-50" : ""}`} style={{ color: "var(--t-ink)" }}>
            {line}
          </p>
          <span className="flex items-center gap-0.5">
            <LineVote kind="like" on={verdict === "like"} onClick={() => (likeLine(line, verdict !== "like"), setVerdict(verdict === "like" ? null : "like"))} />
            <LineVote kind="dislike" on={verdict === "dislike"} onClick={() => (retireLine(line, verdict !== "dislike"), setVerdict(verdict === "dislike" ? null : "dislike"))} />
          </span>
        </div>
        {verdict && (
          <span className="fade-in text-[12px] italic" style={{ color: "#6b5631" }}>
            {verdict === "like" ? "It'll come back often." : "You won't see it again."}
          </span>
        )}
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
    reward: award && award.xp > 0 ? (
      <div className="flex flex-col items-center gap-1">
        <p className="pc-xp m-0 text-[34px] font-bold leading-none tabular-nums" style={{ color: "var(--t-xp)" }}>
          +{shown} XP
        </p>
        {award.coins > 0 && (
          <p className="m-0 flex items-center gap-1.5 text-[14px]" style={{ color: "#5a4a30" }}>
            <CoinIcon size={16} /> +{award.coins} {award.coins === 1 ? "coin" : "coins"}
          </p>
        )}
      </div>
    ) : null,
    // A gilded button that opens into a drawer of the quests' cards.
    due: <DueSoonDrawer tasks={due} onOpenChange={setDrawerOpen} />,
  };
  const allEls = welcomeOrder(fx);
  const order = allEls.filter((el) => welcomeShows(fx, el) && parts[el]);
  // Not checked in yet? "Not now" offers to ask again later, or to skip it for today.
  const snoozable = !!onSnooze && !checkedIn && order.includes("checkin");
  const confetti = fx.welcomeConfetti !== false && mode === "day";

  return createPortal(
    <div className={`fixed inset-0 ${preview ? "z-[95]" : drawerOpen ? "z-[49]" : "z-[60]"} flex items-center justify-center p-3 ${leaving ? "pointer-events-none" : ""}`} onClick={() => arranging && setArranging(false)} role="dialog" aria-modal="true" aria-label={heading}>
      {/* A misty valley, and the card coming out of the mist. While arranging, the castle's ✎ stands right beside it. */}
      <MistScene leaving={leaving} castle={castleOf(fx.welcomeCastle)} castleSeed={fx.welcomeCastleSeed} castleSlot={arranging ? <CastleEdit fx={fx} /> : null} onCastleVisible={setCastleSeen} />
      <div className="relative flex max-h-full flex-col items-center">
      {/* What isn't part of the card (when it opens, confetti) sits above it while arranging. */}
      {arranging && <ArrangeAbove fx={fx} castleHidden={!castleSeen} onDone={() => setArranging(false)} />}
      <div className={`${leaving ? "mist-card-out" : "mist-emerge"} relative min-h-0`} onClick={(e) => e.stopPropagation()}>
        {!arranging && <WelcomeToucan ask={toucanAsk(fx)} />}
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
        {/* The gear: settings in context (each part's controls right where it sits). */}
        <button
          type="button"
          onClick={() => setArranging((v) => !v)}
          aria-pressed={arranging}
          aria-label={arranging ? "Done arranging" : "Welcome screen settings"}
          title={arranging ? "Done arranging" : "Welcome screen settings"}
          className="settings-gear absolute -right-2 -top-2 z-[2] flex h-[30px] w-[30px] items-center justify-center rounded-full"
          style={{ color: "#f2d27e", background: "radial-gradient(circle at 40% 35%, #3a3524, #1c1a10)", boxShadow: arranging ? "0 0 0 2px #f2d27e, 0 0 12px rgba(242,210,126,.7)" : "0 0 0 1.5px #8d7642, 0 2px 6px rgba(0,0,0,.5)" }}
        >
          {arranging ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <GearIcon size={17} />
          )}
        </button>
        <div className={`parchment relative flex bg-[var(--t-card,#fffaf0)] ${arranging ? "max-h-[70vh]" : "max-h-[88vh]"} w-[min(440px,94vw)] flex-col items-center gap-3 overflow-y-auto rounded-2xl px-5 pb-4 pt-5 text-center`}>
          {/* The greeting, with its ✎ at its upper right. Editing keeps the exact look and layout it will have. */}
          <div className="relative w-full px-8">
            {writing !== null ? (
              <textarea
                autoFocus
                rows={1}
                value={writing}
                ref={(el) => {
                  if (!el) return;
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }}
                onChange={(e) => setWriting(e.target.value.replace(/\n/g, " "))}
                onKeyDown={(e) => {
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
                onBlur={finishWriting}
                maxLength={120}
                aria-label="Your own greeting"
                className="font-display m-0 block w-full resize-none overflow-hidden rounded-lg bg-transparent p-0 text-center leading-tight focus:outline-none"
                style={{ color: "var(--t-ink)", fontSize: greetingSize(writing), boxShadow: "0 0 0 1.5px rgba(139,112,64,.45)", caretColor: "#8a6116" }}
              />
            ) : (
              <p className="font-display m-0 leading-tight [text-wrap:balance]" style={{ color: "var(--t-ink)", fontSize: greetingSize(greeting) }}>
                {greeting}
              </p>
            )}
            {writing === null && (
              <span className={`absolute -top-1 right-0 transition-opacity ${arranging ? "" : "opacity-50 hover:opacity-100 focus-within:opacity-100"}`}>
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
          </div>
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
    </div>,
    document.body
  );
}

/**
 * The toucan flies in over the valley, flaps, glides, and lands on the card's
 * corner. Tap him: plan the day together, talk, hear a wise saying, or change
 * what he asks first.
 */
function WelcomeToucan({ ask }: { ask: string }) {
  const [landed, setLanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [saying, setSaying] = useState<string | null>(null);
  const [rewording, setRewording] = useState(false);
  const [words, setWords] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), 2700);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="welcome-toucan absolute -top-[47px] left-2 z-[3]">
      <button type="button" onClick={() => landed && (setMenu((v) => !v), setSaying(null), setRewording(false))} aria-label="The toucan: plan the day, talk, or a wise saying" aria-expanded={menu} className={`owl-body block ${landed ? "owl-perched cursor-pointer" : "pointer-events-none"}`}>
        <span className="owl-idle block">
          <ToucanArt flying={!landed} size={58} />
        </span>
      </button>
      {landed && (
        <div className="owl-say absolute left-[58px] -top-1 z-[5] w-max max-w-[min(250px,62vw)] rounded-2xl px-3 py-2 text-left text-[13.5px] leading-snug" style={{ background: "#fffaf0", border: "1.5px solid #b39a6a", color: "#3d2f18", boxShadow: "0 4px 14px rgba(0,0,0,.25)" }}>
          {saying ?? (menu ? "How can I help?" : ask)}
          {menu && !rewording && (
            <span className="mt-1.5 flex flex-col items-start gap-1">
              <button type="button" onClick={() => (setMenu(false), talkToToucan(undefined, "talk", PLAN_DAY))} className="font-semibold underline underline-offset-2">
                Plan my day
              </button>
              <button type="button" onClick={() => (setMenu(false), talkToToucan())} className="font-semibold underline underline-offset-2">
                Talk to me
              </button>
              <button type="button" onClick={() => setSaying(lineForDay(`${Date.now()}`))} className="font-semibold underline underline-offset-2">
                Tell me a wise saying
              </button>
              <button type="button" onClick={() => (setRewording(true), setWords(ask))} className="underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                Change what I ask first
              </button>
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
const greetingSize = (t: string) => {
  const n = t.trim().length;
  return n <= 26 ? 25 : n <= 40 ? 23 : n <= 60 ? 21 : 19;
};


/** A small round thumbs up or down for the day's wise line. */
function LineVote({ kind, on, onClick }: { kind: "like" | "dislike"; on: boolean; onClick: () => void }) {
  const like = kind === "like";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={like ? "I like this line: show it more" : "I don't like this line: don't show it again"}
      title={like ? "Like: show it more often" : "Dislike: never show it again"}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-opacity hover:opacity-100 ${on ? "opacity-100" : "opacity-45"}`}
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
function TopPriority({ last, question, register }: { last: { text: string; others?: string[]; day: string } | null; question: string; register: (save: () => Promise<boolean>) => void }) {
  const [today] = useState(() => eveningDayKey());
  const [saved, setSaved] = useState<{ text: string; others: string[] } | null>(last && last.day === today ? { text: last.text, others: last.others ?? [] } : null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // Secondary priorities (important, not urgent): opened from the button under the box.
  const [othersOpen, setOthersOpen] = useState(false);
  const [others, setOthers] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earlier = last && last.day !== today ? last : null;
  const filled = others.filter((o) => o.trim());
  const save = async (value: string, more: string[]) => {
    if (!value.trim()) return true;
    setBusy(true);
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
      setBusy(false);
    }
  };
  // Saved by the screen's own button on the way out (no Save of its own).
  useEffect(() => register(() => (saved && !editing ? Promise.resolve(true) : save(text, filled))));
  if (saved && !editing)
    return (
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
          Top priority
        </span>
        <p className="m-0 text-[16px] leading-snug" style={{ color: "var(--t-ink)" }}>
          {saved.text}{" "}
          <button
            type="button"
            onClick={() => {
              setText(saved.text);
              setOthers([...saved.others, ""]);
              setOthersOpen(saved.others.length > 0);
              setEditing(true);
            }}
            className="text-[12.5px] underline underline-offset-2"
            style={{ color: "#6b5631" }}
          >
            Change
          </button>
        </p>
        {saved.others.length > 0 && (
          <p className="m-0 text-[13.5px] italic leading-snug" style={{ color: "#5a4a30" }}>
            Also, when there&rsquo;s space: {saved.others.join(" · ")}
          </p>
        )}
      </div>
    );
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
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {earlier && !text && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setText(earlier.text);
              if (earlier.others?.length) {
                setOthers([...earlier.others, ""]);
                setOthersOpen(true);
              }
            }}
            className="min-h-8 rounded-full px-3 text-left text-[13px] disabled:opacity-60"
            style={{ border: "1.5px solid #b39a6a", color: "#3d2f18", background: "rgba(255,250,238,.6)" }}
          >
            Same as before: &ldquo;{earlier.text}&rdquo;
          </button>
        )}
      </div>
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
          {error}
        </p>
      )}
    </form>
  );
}

/** A line on what today is about, kept in the journal as an intention. */
function Intention({ question, hint, register }: { question: string; hint: string; register: (save: () => Promise<boolean>) => void }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const save = async () => {
    if (saved || !text.trim()) return true;
    setError(false);
    try {
      await addJournalEntryAction(text.trim(), null, "intention");
      setSaved(true);
      return true;
    } catch {
      // Keep the words so they can try again.
      setError(true);
      return false;
    }
  };
  // Saved by the screen's own button on the way out.
  useEffect(() => register(save));
  if (saved)
    return (
      <p className="m-0 text-[15px] italic" style={{ color: "#3d5a1e" }}>
        ✓ {question.replace(/(…|\.\.\.)\s*$/, "").trim()}: {text}
      </p>
    );
  return (
    <form
      className="flex w-full flex-col gap-1.5 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="text-[15px] font-semibold" style={{ color: "var(--t-ink)" }} htmlFor="welcome-intention">
        {question}
      </label>
      <input id="welcome-intention" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder={hint} className="h-10 w-full rounded-lg px-2.5 text-[16px]" style={FIELD} />
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
          Couldn&rsquo;t save that. Try again in a moment.
        </p>
      )}
    </form>
  );
}

/** The check-in, opened in place of its button. */
function CheckinPanel({ fx, mode, metrics, checkedIn, onSaved, onCollapse, submit }: { fx: FxSettings; mode: "day" | "back"; metrics: string[]; checkedIn: boolean; onSaved: () => void; onCollapse: () => void; submit: (save: (after: () => void) => void) => void }) {
  return (
      <div
        className="w-full rounded-2xl px-2 py-2.5 text-left"
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
        {/* Its title folds it back into the button. */}
        <button type="button" onClick={onCollapse} aria-expanded className="mx-auto mb-1 flex items-center gap-1.5 font-display text-[17px]" style={{ color: "#8a6116" }}>
          {checkedIn ? "Checked in ✓" : "Check in"}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: "rotate(180deg)" }}>
            <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <EnergyCheck full={fx.welcomeMetrics !== false} noSleep={mode === "back" || fx.welcomeSleep === false} today={null} metrics={metrics} onSaved={onSaved} submit={submit} addNights simple />
      </div>
  );
}

/** What a part shows when there's nothing in it right now (while arranging). */
const EMPTY: Partial<Record<WelcomeEl, string>> = {
  intention: "Asks on the day's first visit.",
  streak: "Shows on the day's first visit, once you have a streak.",
  bar: "Shows on the day's first visit.",
  reward: "Shows on the day's first visit.",
  line: "A new line each day.",
};
