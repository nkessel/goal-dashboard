"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CoinIcon } from "@/components/ui/Icons";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { EnergyCheck } from "./EnergyCheck";
import { retireLine } from "@/lib/greetings";
import type { FxSettings } from "@/lib/celebration-fx";
import { welcomeOrder, welcomeShows, type WelcomeEl } from "@/lib/welcome";
import { dueSoonList, dueWhen } from "@/lib/toucan-guide";
import { voice, windowOf } from "@/lib/toucan-style";
import { useToucanStyle } from "@/lib/toucan-style-store";
import { useEscape } from "@/lib/use-escape";
import { addJournalEntryAction, addToTopOfTodayAction, createQuestAction } from "@/app/actions";
import { PLAN_DAY, talkToToucan } from "@/components/toucan/ToucanGuide";

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
  suggestions = [],
  fx,
  onClose,
  onCheckedIn,
  onLeave,
}: {
  mode: "day" | "back";
  heading: string;
  award: WelcomeAward | null;
  line: string | null;
  metrics: string[];
  lastCheckInAt: string | null;
  due: { id: string; title: string; due_at: string | null }[];
  /** Candidates for today's main quest (due soon, then most important). */
  suggestions?: { id: string; title: string; due_at: string | null }[];
  fx: FxSettings;
  onClose: () => void;
  /** Called once a check-in is saved here. */
  onCheckedIn?: () => void;
  /** Steps aside without counting as a skip (it comes back on the next visit). */
  onLeave?: () => void;
}) {
  const style = useToucanStyle();
  const [shown, setShown] = useState(0);
  const [retired, setRetired] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  // Welcome back starts with just a gilded button; the check-in opens in its place.
  const [checkinOpen, setCheckinOpen] = useState(mode === "day");
  // Checked in within the last hour? Then there's no need to ask again here.
  const [recent] = useState(() => !!lastCheckInAt && Date.now() - Date.parse(lastCheckInAt) < 3_600_000);
  useEscape(onClose);

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

  const soon = dueSoonList(due);
  const parts: Partial<Record<WelcomeEl, React.ReactNode>> = {
    focus: <MainQuest suggestions={suggestions} mode={mode} />,
    intention: mode === "day" ? <Intention /> : null,
    plan: (
      <button
        type="button"
        onClick={() => {
          onClose();
          talkToToucan(undefined, "talk", PLAN_DAY);
        }}
        className="flex h-11 items-center gap-2 rounded-full px-5 text-[14.5px] font-bold"
        style={{ background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" }}
      >
        🗓 Plan my day with the toucan
      </button>
    ),
    toucan: (
      <div className="flex w-full items-center gap-2.5 text-left">
        <ToucanArt size={40} />
        <p className="m-0 flex-1 text-[15px] italic leading-snug" style={{ color: "#3d2f18" }}>
          {mode === "back" ? (style.tone === "direct" ? "Quick check-in?" : "How are you arriving?") : `${voice.greet(style, windowOf() ?? "morning")} How are you arriving today?`}
        </p>
      </div>
    ),
    checkin: recent ? null : !checkinOpen ? (
      <button
        type="button"
        onClick={() => setCheckinOpen(true)}
        className="font-display flex h-12 items-center gap-2 rounded-full px-7 text-[18px]"
        style={{ background: "linear-gradient(180deg, #f8e3a0 0%, #e2bf63 45%, #b8913f 100%)", border: "1.5px solid #4a3913", color: "#2a1c10", boxShadow: "inset 0 1px 0 rgba(255,250,230,.8), inset 0 -2px 0 rgba(90,60,15,.35), 0 2px 6px rgba(74,57,19,.35)" }}
      >
        ✦ Check in
      </button>
    ) : (
      <div className="w-full rounded-2xl px-2 py-2.5 text-left" style={{ background: "linear-gradient(180deg, rgba(28,24,16,.94), rgba(18,16,11,.94))", border: "1.5px solid rgba(217,180,95,.45)" }}>
        <p className="m-0 mb-1 text-center font-display text-[17px]" style={{ color: "#f2d27e" }}>
          {checkedIn ? "Checked in ✓" : "Check in"}
        </p>
        <EnergyCheck full={fx.welcomeMetrics !== false} noSleep={mode === "back" || fx.welcomeSleep === false} today={null} metrics={metrics} onSaved={() => (setCheckedIn(true), onCheckedIn?.())} onSleepLink={onLeave ?? onClose} />
      </div>
    ),
    streak: award && award.streak > 0 ? (
      <p className="m-0 text-[14.5px] italic leading-snug" style={{ color: "#5a4a30" }}>
        {award.streak > 1 ? `🔥 ${award.streak}-day streak — keep it going` : "Day one of a new streak"}
      </p>
    ) : null,
    line: line ? (
      <div className="flex w-full flex-col items-center gap-1.5">
        <p className={`m-0 text-[16px] leading-snug ${retired ? "line-through opacity-50" : ""}`} style={{ color: "var(--t-ink)" }}>
          {line}
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px]" style={{ color: "#6b5631" }}>
          <input type="checkbox" checked={retired} onChange={(e) => (setRetired(e.target.checked), retireLine(line, e.target.checked))} className="h-3.5 w-3.5" />
          Don&rsquo;t show this line again
        </label>
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
    due: (
      <div className="w-full text-left">
        <p className="m-0 text-[13px] font-semibold" style={{ color: "#5a4a30" }}>
          Due soon
        </p>
        {soon.length ? (
          <ul className="m-0 mt-0.5 flex list-none flex-col gap-0.5 p-0 text-[14.5px]" style={{ color: "var(--t-ink)" }}>
            {soon.slice(0, 4).map((t) => (
              <li key={t.id}>
                “{t.title}” <span style={{ color: "#7a5f2e" }}>{dueWhen(t.due_at!)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px]" style={{ color: "#5a4a30" }}>
            Nothing due today or tomorrow.
          </p>
        )}
      </div>
    ),
  };
  const order = welcomeOrder(fx).filter((el) => welcomeShows(fx, el) && parts[el]);
  const confetti = fx.welcomeConfetti !== false && mode === "day";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label={heading}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {confetti && (
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
            {PIECES.map((p, i) => (
              <span
                key={i}
                className="pc-confetti absolute block"
                style={{ width: p.round ? 8 : 7, height: p.round ? 8 : 12, marginLeft: -4, marginTop: -5, borderRadius: p.round ? 999 : 2, background: p.color, "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, "--rot": `${p.rot}deg`, animationDelay: `${p.delay}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        )}
        <div className="pc-card parchment relative flex max-h-[88vh] w-[min(440px,94vw)] flex-col items-center gap-3 overflow-y-auto rounded-2xl px-5 pb-4 pt-5 text-center">
          <p className="font-display m-0 text-[25px] leading-tight" style={{ color: "var(--t-ink)" }}>
            {heading}
          </p>
          {order.map((el) => (
            <div key={el} className="flex w-full flex-col items-center">
              {parts[el]}
            </div>
          ))}
          <button type="button" onClick={onClose} className="mt-1 h-10 rounded-full border px-5 text-[14px] font-semibold" style={{ borderColor: "#b39a6a", color: "#5a4a30" }}>
            {checkedIn || mode === "day" ? "Continue" : "Not now"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const FIELD = { background: "rgba(255,250,238,.92)", border: "1px solid #b39a6a", color: "#2a1c10" };

/** Today's main quest: tap one that matters (it goes to the top of Today), or write a new one. */
function MainQuest({ suggestions, mode }: { suggestions: { id: string; title: string; due_at: string | null }[]; mode: "day" | "back" }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pin = async (run: () => Promise<unknown>, label: string) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      setChosen(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };
  if (chosen)
    return (
      <p className="m-0 text-[15px]" style={{ color: "#3d5a1e" }}>
        ✓ “{chosen}” is at the top of Today.
      </p>
    );
  return (
    <div className="flex w-full flex-col gap-1.5 text-left">
      <p className="m-0 text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
        {mode === "day" ? "What would make today a success?" : "What matters most for the rest of today?"}
      </p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button key={t.id} type="button" disabled={busy} onClick={() => pin(() => addToTopOfTodayAction(t.id), t.title)} className="min-h-9 rounded-full px-3 text-left text-[13.5px] disabled:opacity-60" style={{ border: "1.5px solid #b39a6a", color: "#3d2f18", background: "rgba(255,250,238,.6)" }}>
              {t.title}
              {t.due_at && <span style={{ color: "#8a5a1e" }}> · {dueWhen(t.due_at)}</span>}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const title = text.trim();
          if (title) void pin(() => createQuestAction({ title, importance: 4, urgency: 3, xpValue: 20, placement: "today" }), title);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={120} placeholder={suggestions.length ? "Or something else…" : "Your main quest today…"} aria-label="Today's main quest" className="h-10 min-w-0 flex-1 rounded-lg px-2.5 text-[16px]" style={FIELD} />
        <button type="submit" disabled={busy || !text.trim()} className="h-10 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          Add
        </button>
      </form>
      {error && (
        <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** A line on what today is about, kept in the journal as an intention. */
function Intention() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  if (saved)
    return (
      <p className="m-0 text-[15px] italic" style={{ color: "#3d5a1e" }}>
        ✓ Today is about: {text}
      </p>
    );
  return (
    <form
      className="flex w-full flex-col gap-1.5 text-left"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await addJournalEntryAction(text.trim(), null, "intention");
          setSaved(true);
        } catch {
          /* keep the words so they can try again */
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-[15px] font-semibold" style={{ color: "var(--t-ink)" }} htmlFor="welcome-intention">
        Today is about…
      </label>
      <div className="flex gap-1.5">
        <input id="welcome-intention" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="e.g. Steady and kind to myself" className="h-10 min-w-0 flex-1 rounded-lg px-2.5 text-[16px]" style={FIELD} />
        <button type="submit" disabled={busy || !text.trim()} className="h-10 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          Save
        </button>
      </div>
    </form>
  );
}
