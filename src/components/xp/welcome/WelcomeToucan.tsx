"use client";

import { BUBBLE_PAINT } from "@/lib/toucan-flourish";
import { useBubbleStyle } from "@/lib/use-bubble-style";
import { openPlanMyDay } from "@/components/calendar/PlanMyDay";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Confirm, NoteButton, WhyBox } from "@/components/toucan/SayingFeedback";
import Link from "next/link";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { lineForDay } from "@/lib/greetings";
import { loadFx, patchFx, type FxSettings } from "@/lib/celebration-fx";
import { readPromptVotes, toucanPrompts, writePromptVotes, type PromptVotes } from "@/lib/welcome";
import { useLongPress } from "@/lib/use-long-press";
import { coachAction } from "@/app/actions";
import { Digest } from "@/components/toucan/Digest";
import { talkToToucan } from "@/components/toucan/talk";
import { GearIcon } from "@/components/ui/Icons";
import { REPLY_W, REPLY_SCALE, REPLY_LINE, REPLY_MAX, FIELD } from "@/components/xp/welcome/shared";
import { LineVote } from "@/components/xp/welcome/Lines";

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

export function resetToucanFlight() {
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

export function WelcomeToucan({ fx, quiet = false, onAway, onArrange }: { fx: FxSettings; /** While the screen is being arranged his bubble rests (the panel above the card needs the room). */ quiet?: boolean; /** Going elsewhere in the app (his settings): the screen tucks itself away first. */ onAway: () => void; /** Arrange this screen (the same as its gear, or a long press on a part). */ onArrange: () => void }) {
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
