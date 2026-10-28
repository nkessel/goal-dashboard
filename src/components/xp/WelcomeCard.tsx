"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CoinIcon } from "@/components/ui/Icons";
import { ToucanArt } from "@/components/toucan/ToucanArt";
import { EnergyCheck } from "./EnergyCheck";
import { retireLine } from "@/lib/greetings";
import { CHECKIN_STYLES, checkinStyleOf, loadFx, patchFx, type FxSettings } from "@/lib/celebration-fx";
import { addBackGreeting, welcomeOrder, welcomeShows, type WelcomeEl } from "@/lib/welcome";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { dueSoonList, dueWhen } from "@/lib/toucan-guide";
import { voice, windowOf } from "@/lib/toucan-style";
import { useToucanStyle } from "@/lib/toucan-style-store";
import { useEscape } from "@/lib/use-escape";
import { addJournalEntryAction, setTopPriorityAction } from "@/app/actions";
import { PLAN_DAY, talkToToucan } from "@/components/toucan/ToucanGuide";
import { SettingsGear } from "@/components/ui/SettingsGear";

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
  fx,
  onClose,
  onCheckedIn,
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
  /** Called once a check-in is saved here. */
  onCheckedIn?: () => void;
}) {
  const style = useToucanStyle();
  const [shown, setShown] = useState(0);
  const [retired, setRetired] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [addingPhrase, setAddingPhrase] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [phraseSaved, setPhraseSaved] = useState(false);
  // The check-in starts as a gilded button and opens in its place.
  const [checkinOpen, setCheckinOpen] = useState(false);
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
    focus: <TopPriority last={priority} />,
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
        style={checkinStyleOf(fx).style}
      >
        ✦ Check in
      </button>
    ) : (
      <div className="w-full rounded-2xl px-2 py-2.5 text-left" style={{ background: "linear-gradient(180deg, rgba(28,24,16,.94), rgba(18,16,11,.94))", border: "1.5px solid rgba(217,180,95,.45)" }}>
        <p className="m-0 mb-1 text-center font-display text-[17px]" style={{ color: "#f2d27e" }}>
          {checkedIn ? "Checked in ✓" : "Check in"}
        </p>
        <EnergyCheck full={fx.welcomeMetrics !== false} noSleep={mode === "back" || fx.welcomeSleep === false} today={null} metrics={metrics} onSaved={() => (setCheckedIn(true), onCheckedIn?.())} addNights />
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
        {/* What shows here, and in what order, is chosen in Settings. */}
        <SettingsGear to="welcome-screen" label="Welcome screen settings" beforeLeave={onClose} className="pc-card absolute -right-2 -top-2 z-[2]" />
        <div className="pc-card parchment relative flex max-h-[88vh] w-[min(440px,94vw)] flex-col items-center gap-3 overflow-y-auto rounded-2xl px-5 pb-4 pt-5 text-center">
          <p className="font-display m-0 text-[25px] leading-tight" style={{ color: "var(--t-ink)" }}>
            {heading}
            {mode === "back" && !addingPhrase && (
              <button type="button" onClick={() => setAddingPhrase(true)} aria-label="Add a welcome back greeting of your own" title="Add a welcome back greeting of your own" className="ml-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full align-middle hover:bg-black/[.06]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#8a6116" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </p>
          {addingPhrase && (
            <form
              className="reveal flex w-full flex-col gap-1.5 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                if (!phrase.trim()) return;
                patchFx(addBackGreeting(loadFx(), phrase));
                setPhrase("");
                setAddingPhrase(false);
                setPhraseSaved(true);
              }}
            >
              <label htmlFor="welcome-phrase" className="text-[13.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                A welcome back greeting for another time
              </label>
              <div className="flex gap-1.5">
                <input id="welcome-phrase" autoFocus value={phrase} onChange={(e) => setPhrase(e.target.value)} maxLength={120} placeholder="e.g. The hearth is warm, come in" className="h-10 min-w-0 flex-1 rounded-full px-3.5 text-[16px]" style={FIELD} />
                <button type="submit" disabled={!phrase.trim()} className="h-10 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                  Add
                </button>
                <button type="button" onClick={() => setAddingPhrase(false)} aria-label="Cancel" className="h-10 w-8 shrink-0 text-[18px]" style={{ color: "#6b5631" }}>
                  ×
                </button>
              </div>
            </form>
          )}
          {phraseSaved && (
            <p className="fade-in m-0 -mt-1 text-[12.5px] italic" style={{ color: "#3d5a1e" }}>
              ✓ Saved. It will greet you on a future visit.
            </p>
          )}
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

/** Your top priority, in your own words: saved for the day, and kept in mind by the app and the toucan. */
function TopPriority({ last }: { last: { text: string; others?: string[]; day: string } | null }) {
  const [today] = useState(() => eveningDayKey());
  const [saved, setSaved] = useState<{ text: string; others: string[] } | null>(last && last.day === today ? { text: last.text, others: last.others ?? [] } : null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // Important but not urgent: the other priorities, one small field each.
  const [others, setOthers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earlier = last && last.day !== today ? last : null;
  const save = async (value: string, more: string[]) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await setTopPriorityAction(value, more.filter((o) => o.trim()));
      setSaved({ text: r.text, others: r.others });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };
  if (saved && !editing)
    return (
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: "#8a6116" }}>
          Top priority
        </span>
        <p className="m-0 text-[16px] leading-snug" style={{ color: "var(--t-ink)" }}>
          {saved.text}{" "}
          <button type="button" onClick={() => (setText(saved.text), setOthers(saved.others), setEditing(true))} className="text-[12.5px] underline underline-offset-2" style={{ color: "#6b5631" }}>
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
        void save(text, others);
      }}
    >
      <label htmlFor="welcome-priority" className="text-[15px] font-semibold" style={{ color: "var(--t-ink)" }}>
        What&rsquo;s your top priority?
      </label>
      <div className="relative pb-4">
        <textarea
          id="welcome-priority"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="The one thing that matters most right now"
          className="block min-h-[72px] w-full resize-none rounded-xl px-3 pb-4 pt-2 text-[16px] leading-snug"
          style={FIELD}
        />
        {/* Sits on the box's lower border. */}
        <button
          type="button"
          onClick={() => setOthers((o) => [...o, ""])}
          disabled={others.length >= 8}
          className="font-display absolute bottom-0 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[13.5px] disabled:opacity-50"
          style={CHECKIN_STYLES[0].style}
        >
          ✦ Add other priorities
        </button>
      </div>
      {others.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[12px]" style={{ color: "#6b5631" }}>
            Important, not urgent: the toucan brings these up gently, when you have space.
          </span>
          {others.map((o, i) => (
            <div key={i} className="reveal flex items-center gap-1.5">
              <input
                autoFocus={!o}
                value={o}
                onChange={(e) => setOthers((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={160}
                placeholder="Another priority"
                aria-label={`Other priority ${i + 1}`}
                className="h-9 min-w-0 flex-1 rounded-full px-3 text-[16px]"
                style={FIELD}
              />
              <button type="button" onClick={() => setOthers((all) => all.filter((_, j) => j !== i))} aria-label="Remove" className="h-9 w-7 shrink-0 text-[17px]" style={{ color: "#6b5631" }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {earlier && !text && (
          <button type="button" disabled={busy} onClick={() => void save(earlier.text, [...(earlier.others ?? []), ...others])} className="mr-auto min-h-8 rounded-full px-3 text-left text-[13px] disabled:opacity-60" style={{ border: "1.5px solid #b39a6a", color: "#3d2f18", background: "rgba(255,250,238,.6)" }}>
            Same as before: &ldquo;{earlier.text}&rdquo;
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} className="h-9 shrink-0 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
          {busy ? "…" : "Save"}
        </button>
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
