"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  coachSetDueAction,
  prioritizeAction,
  rateForDayAction,
  setTaskPlanByAction,
  snoozeQuestAction,
  snoozeQuestUntilAction,
  undoSnoozeAction,
  undoSnoozeUntilAction,
  unrateForDayAction,
  type PrioritizeItem,
} from "@/app/actions";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Fold } from "@/components/ui/Fold";
import { DateField } from "@/components/ui/DateField";
import { CloseIcon, SnoozeIcon } from "@/components/ui/Icons";
import { ScheduleWithin } from "@/components/tasks/ScheduleWithin";

type Day = "today" | "tomorrow";
type Undo = { label: string; run: () => Promise<unknown> };

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const morningIn = (days: number, hour = 6) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const DAY_MS = 86_400_000;
function dueWords(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.round((new Date(keyOf(d) + "T12:00").getTime() - new Date(keyOf(new Date()) + "T12:00").getTime()) / DAY_MS);
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due ${d.toLocaleDateString(undefined, { weekday: "short" })}`;
  return `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
const planDays = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.parse(iso) - Date.now()) / DAY_MS)) : null);

/** Snooze lengths: from Today, an hour or tomorrow; when planning tomorrow, further out. */
function snoozeChoices(day: Day): { main: { label: string; at: () => Date | "tomorrow" }[]; other: { label: string; at: () => Date }[] } {
  if (day === "today")
    return {
      main: [
        { label: "1 hour", at: () => new Date(Date.now() + 3_600_000) },
        { label: "Tomorrow", at: () => "tomorrow" },
      ],
      other: [
        { label: "2 hours", at: () => new Date(Date.now() + 7_200_000) },
        { label: "This evening", at: () => (new Date().getHours() < 17 ? morningIn(0, 17) : new Date(Date.now() + 3_600_000)) },
        { label: "2 days", at: () => morningIn(2) },
        { label: "Next week", at: () => morningIn(7) },
      ],
    };
  return {
    main: [
      { label: "2 days", at: () => morningIn(2) },
      { label: "Next week", at: () => morningIn(7) },
    ],
    other: [
      { label: "3 days", at: () => morningIn(3) },
      { label: "2 weeks", at: () => morningIn(14) },
      { label: "A month", at: () => morningIn(30) },
    ],
  };
}

const VIEW_KEY = "prioritize-view";

/**
 * Prioritize today's or tomorrow's quests (owner, Nov 10): one card at a time (swipe left for Snooze,
 * right to add it, or tap how important it is for the day, 1–5 bars) or a list with the same controls.
 * Due and plan-by dates sit behind one 📅 button on each. Ratings order the day's list, highest first.
 */
export function PrioritizeTool({ day, theme, onClose }: { day: Day; theme: "calm" | "adventure"; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<{ items: PrioritizeItem[]; onDay: string[]; ratings: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "list">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
    } catch {
      return "cards";
    }
  });
  // Cards handled this visit (added, rated, snoozed or skipped), in order.
  const [done, setDone] = useState<string[]>([]);
  const [snoozed, setSnoozed] = useState<string[]>([]);
  const [undo, setUndo] = useState<Undo | null>(null);
  const changed = useRef(false);

  useEffect(() => {
    let live = true;
    prioritizeAction(day)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load your quests."));
    return () => {
      live = false;
    };
  }, [day]);

  const pickView = (v: "cards" | "list") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  const items = (data?.items ?? []).filter((t) => !t.snoozed && !snoozed.includes(t.id));
  const onDay = new Set(data?.onDay ?? []);
  const ratings = data?.ratings ?? {};
  const deck = items.filter((t) => !onDay.has(t.id) && !done.includes(t.id));
  const dayWord = day === "today" ? "today" : "tomorrow";

  const patchItem = (id: string, p: Partial<PrioritizeItem>) => setData((d) => d && { ...d, items: d.items.map((t) => (t.id === id ? { ...t, ...p } : t)) });

  function run(p: Promise<unknown>) {
    changed.current = true;
    setError(null);
    p.catch((e) => setError(e instanceof Error ? e.message : "Couldn't save that."));
  }

  function rate(t: PrioritizeItem, n: number | null) {
    const wasOn = onDay.has(t.id);
    setData((d) => d && { ...d, onDay: wasOn ? d.onDay : [...d.onDay, t.id], ratings: n ? { ...d.ratings, [t.id]: n } : d.ratings });
    setDone((v) => (v.includes(t.id) ? v : [...v, t.id]));
    run(rateForDayAction(day, t.id, n));
    if (!wasOn)
      setUndo({
        label: `Added to ${dayWord}`,
        run: async () => {
          setData((d) => d && { ...d, onDay: d.onDay.filter((x) => x !== t.id) });
          setDone((v) => v.filter((x) => x !== t.id));
          await unrateForDayAction(day, t.id, false);
        },
      });
  }

  function skip(t: PrioritizeItem) {
    setDone((v) => [...v, t.id]);
    setUndo({ label: "Skipped", run: async () => setDone((v) => v.filter((x) => x !== t.id)) });
  }

  function snooze(t: PrioritizeItem, at: Date | "tomorrow", label: string) {
    setSnoozed((v) => [...v, t.id]);
    changed.current = true;
    setError(null);
    const p = at === "tomorrow" ? snoozeQuestAction(t.id) : snoozeQuestUntilAction(t.id, at.toISOString());
    p.then((prev) =>
      setUndo({
        label: `Snoozed · ${label.toLowerCase()}`,
        run: async () => {
          setSnoozed((v) => v.filter((x) => x !== t.id));
          if (at === "tomorrow") await undoSnoozeAction(t.id, prev as Awaited<ReturnType<typeof snoozeQuestAction>>);
          else await undoSnoozeUntilAction(t.id, prev as { snoozed_until: string | null });
        },
      })
    ).catch((e) => {
      setSnoozed((v) => v.filter((x) => x !== t.id));
      setError(e instanceof Error ? e.message : "Couldn't snooze it.");
    });
  }

  const setDue = (t: PrioritizeItem, iso: string | null) => {
    patchItem(t.id, { due_at: iso });
    run(coachSetDueAction(t.id, iso));
  };
  const setPlan = (t: PrioritizeItem, days: number | null) => {
    const iso = days === null ? null : morningIn(days, 12).toISOString();
    patchItem(t.id, { plan_by: iso });
    run(setTaskPlanByAction(t.id, iso));
  };

  const close = () => {
    if (changed.current) router.refresh();
    onClose();
  };

  const tools = { day, rate, skip, snooze, setDue, setPlan };

  return (
    <BottomSheet onClose={close} theme={theme}>
      {(requestClose) => (
        <div className="flex flex-col gap-3" role="dialog" aria-modal="true" aria-label={`Prioritize ${dayWord}`} data-prioritize>
          <div className="flex items-center gap-2">
            <h2 className="font-display m-0 flex-1 text-[20px] leading-tight">{day === "today" ? "Prioritize today" : "Prioritize tomorrow"}</h2>
            <div role="tablist" aria-label="View" className="flex rounded-full p-0.5" style={{ border: "1px solid rgba(139,112,64,.4)" }}>
              {(["cards", "list"] as const).map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => pickView(v)} className="h-7 rounded-full px-3 text-[12.5px] font-semibold" style={view === v ? { background: "linear-gradient(180deg,#f2d58a,#d9b45f)", color: "#2a1c10" } : { color: "var(--t-ink-soft)" }}>
                  {v === "cards" ? "Cards" : "List"}
                </button>
              ))}
            </div>
            <button type="button" onClick={requestClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "var(--t-ink-soft)" }}>
              <CloseIcon size={14} />
            </button>
          </div>

          {error && (
            <p role="alert" className="m-0 rounded-lg px-3 py-2 text-[13.5px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
              {error}
            </p>
          )}

          {!data && !error && (
            <p className="m-0 py-10 text-center text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
              Gathering your quests…
            </p>
          )}

          {data && view === "cards" && (
            <div className="flex min-h-[340px] flex-col">
              {deck.length > 0 ? (
                <Deck key={deck[0].id} cards={deck.slice(0, 3)} rating={ratings[deck[0].id] ?? 0} left={deck.length} {...tools} />
              ) : (
                <div className="reveal flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                  <span aria-hidden className="text-[30px]" style={{ color: "#c9a24a" }}>
                    ✦
                  </span>
                  <p className="font-display m-0 text-[18px]">Every quest has its place.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => pickView("list")} className="h-9 rounded-full px-4 text-[13.5px] font-semibold" style={{ border: "1px solid rgba(139,112,64,.5)" }}>
                      See the list
                    </button>
                    <button type="button" onClick={requestClose} className="h-9 rounded-full px-4 text-[13.5px] font-bold" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {data && view === "list" && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {[...items]
                .sort((a, b) => Number(onDay.has(b.id)) - Number(onDay.has(a.id)) || (ratings[b.id] ?? 0) - (ratings[a.id] ?? 0))
                .map((t) => (
                  <Row key={t.id} t={t} on={onDay.has(t.id)} rating={ratings[t.id] ?? 0} {...tools} />
                ))}
              {items.length === 0 && (
                <li className="py-8 text-center text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
                  No open quests to sort.
                </li>
              )}
            </ul>
          )}

          <div className="flex min-h-[28px] items-center justify-center">
            {undo && (
              <span key={undo.label + done.length + snoozed.length} className="fade-in flex items-center gap-2 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                {undo.label}
                <button
                  type="button"
                  onClick={() => {
                    const u = undo;
                    setUndo(null);
                    run(u.run());
                  }}
                  className="font-semibold underline underline-offset-2"
                  style={{ color: "var(--t-ink)" }}
                >
                  Undo
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

type Tools = {
  day: Day;
  rate: (t: PrioritizeItem, n: number | null) => void;
  skip: (t: PrioritizeItem) => void;
  snooze: (t: PrioritizeItem, at: Date | "tomorrow", label: string) => void;
  setDue: (t: PrioritizeItem, iso: string | null) => void;
  setPlan: (t: PrioritizeItem, days: number | null) => void;
};

const FLY = 90;
const REVEAL = 116;

/** The top card and the edges of the next two behind it. */
function Deck({ cards, rating, left, day, rate, skip, snooze, setDue, setPlan }: Tools & { cards: PrioritizeItem[]; rating: number; left: number }) {
  const t = cards[0];
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [out, setOut] = useState<null | "right" | "left">(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [other, setOther] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; dir: "x" | "y" | null } | null>(null);
  const choices = snoozeChoices(day);

  const fly = (dir: "right" | "left", then: () => void) => {
    setOut(dir);
    window.setTimeout(then, 230);
  };
  const add = (n: number | null) => fly("right", () => rate(t, n));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative" style={{ minHeight: 236, overflowX: "clip", overflowY: "visible", paddingBottom: 2 }}>
        {cards
          .slice(1)
          .reverse()
          .map((c, i, arr) => (
            <div key={c.id} aria-hidden className="absolute inset-x-0 top-0 rounded-[18px]" style={{ height: 228, transform: `translateY(${(arr.length - i) * 7}px) scale(${1 - (arr.length - i) * 0.04})`, background: "#f5e9cc", border: "1px solid rgba(139,112,64,.35)", boxShadow: "0 2px 6px rgba(60,40,10,.15)" }} />
          ))}
        {/* Snooze waits behind the card, on the right, for a swipe left. */}
        <div className="absolute inset-y-0 right-0 z-[1] flex w-[110px] flex-col items-center justify-center gap-1.5" aria-hidden={dx > -40 && !snoozeOpen}>
          <button type="button" tabIndex={dx < -40 ? 0 : -1} onClick={() => setSnoozeOpen(true)} className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-[12px] font-bold" style={{ background: "linear-gradient(180deg,#5b6fa8,#3c4c80)", color: "#eef2ff", opacity: Math.min(1, -dx / REVEAL) }}>
            <SnoozeIcon size={20} />
            Snooze
          </button>
        </div>
        <div
          className="quest-card relative z-[2] flex flex-col gap-2.5 rounded-[18px] p-4"
          data-prioritize-card
          style={{
            minHeight: 228,
            background: "radial-gradient(circle at 30% 20%, #fffaf0, #f6ead0 70%)",
            border: "1.5px solid #c9a24a",
            boxShadow: "0 6px 18px rgba(60,40,10,.25)",
            touchAction: "pan-y",
            transform: out ? `translateX(${out === "right" ? 120 : -120}%) rotate(${out === "right" ? 8 : -8}deg)` : `translateX(${dx}px) rotate(${dragging ? dx / 30 : 0}deg)`,
            opacity: out ? 0 : 1,
            transition: dragging ? "none" : "transform 230ms cubic-bezier(.2,.8,.3,1), opacity 230ms",
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button, input, a, [data-no-swipe]")) return;
            start.current = { x: e.clientX, y: e.clientY, base: dx, dir: null };
          }}
          onPointerMove={(e) => {
            const s = start.current;
            if (!s) return;
            const mx = e.clientX - s.x;
            const my = e.clientY - s.y;
            if (!s.dir) {
              if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
              s.dir = Math.abs(mx) > Math.abs(my) ? "x" : "y";
              if (s.dir === "x") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }
            if (s.dir !== "x") return;
            setDragging(true);
            setDx(Math.max(-REVEAL - 30, s.base + mx));
          }}
          onPointerUp={() => {
            const s = start.current;
            start.current = null;
            if (!s || s.dir !== "x") return;
            setDragging(false);
            if (dx > FLY) add(null);
            else if (dx < -50) setDx(-REVEAL);
            else {
              setDx(0);
              setSnoozeOpen(false);
            }
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDx(0);
          }}
        >
          <div className="flex items-start gap-3">
            <Portrait t={t} size={56} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-display text-[18px] leading-snug" style={{ color: "#2a1c10" }}>
                {t.title}
              </span>
              <span className="text-[12.5px]" style={{ color: "#6b5631" }}>
                {[t.board, t.estimate_minutes ? `${t.estimate_minutes}m` : null, `${t.xp_value} XP`].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5 pt-1" data-no-swipe>
            <span className="text-[12.5px] font-semibold" style={{ color: "#6b5631" }}>
              How important {day === "today" ? "today" : "tomorrow"}?
            </span>
            <Bars value={rating} onPick={(n) => add(n)} big />
          </div>
          <Dates t={t} setDue={setDue} setPlan={setPlan} />
          <span className="text-[11.5px]" style={{ color: "rgba(107,86,49,.65)", textAlign: "center" }}>
            {left === 1 ? "Last one" : `${left} to go`}
          </span>
        </div>
      </div>

      <Fold open={snoozeOpen}>
        <div className="qe-fact-panel flex flex-wrap items-center justify-center gap-1.5 rounded-xl px-3 py-2" data-no-swipe>
          <span className="text-[12.5px] font-semibold" style={{ color: "#6b5631" }}>
            Snooze
          </span>
          {choices.main.map((c) => (
            <button key={c.label} type="button" onClick={() => fly("left", () => snooze(t, c.at(), c.label))} className="qe-fact h-8 rounded-full px-3 text-[13px] font-semibold">
              {c.label}
            </button>
          ))}
          <button type="button" aria-expanded={other} onClick={() => setOther((v) => !v)} className="qe-fact h-8 rounded-full px-3 text-[13px] font-semibold" data-open={other ? "true" : undefined}>
            Other…
          </button>
          {other &&
            choices.other.map((c) => (
              <button key={c.label} type="button" onClick={() => fly("left", () => snooze(t, c.at(), c.label))} className="qe-fact fade-in h-8 rounded-full px-3 text-[13px] font-semibold">
                {c.label}
              </button>
            ))}
          <button type="button" onClick={() => (setSnoozeOpen(false), setOther(false), setDx(0))} aria-label="Keep it" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#6b5631" }}>
            <CloseIcon size={12} />
          </button>
        </div>
      </Fold>

      {/* The same three moves without swiping. */}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => (setDx(-REVEAL), setSnoozeOpen(true))} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold" style={{ border: "1px solid rgba(91,111,168,.55)", color: "#3c4c80" }}>
          ‹ <SnoozeIcon size={15} /> Snooze
        </button>
        <button type="button" onClick={() => fly("left", () => skip(t))} className="h-10 rounded-full px-3.5 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          Skip
        </button>
        <button type="button" onClick={() => add(null)} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-bold" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
          Add to {day === "today" ? "today" : "tomorrow"} ›
        </button>
      </div>
    </div>
  );
}

/** One row of the list: the same moves as a card. */
function Row({ t, on, rating, day, rate, snooze, setDue, setPlan }: Tools & { t: PrioritizeItem; on: boolean; rating: number }) {
  const [open, setOpen] = useState<null | "dates" | "snooze">(null);
  const choices = snoozeChoices(day);
  const due = dueWords(t.due_at);
  return (
    <li className="due-in rounded-2xl px-2.5 py-2" style={{ background: on ? "rgba(242,213,138,.22)" : "rgba(255,250,238,.55)", border: `1px solid ${on ? "rgba(201,162,74,.7)" : "rgba(139,112,64,.25)"}` }}>
      <div className="flex items-start gap-2">
        <Portrait t={t} size={30} />
        <span className="min-w-0 flex-1 pt-1 text-[14px] font-semibold leading-tight">
          {on && (
            <span aria-label={`On ${day === "today" ? "today" : "tomorrow"}'s list`} style={{ color: "#a8812e" }}>
              ✓{" "}
            </span>
          )}
          {t.title}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 pl-[38px]">
        <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: due === "Overdue" ? "var(--t-warn)" : "var(--t-ink-soft)" }}>
          {[due, t.board].filter(Boolean).join(" · ")}
        </span>
        <Bars value={rating} onPick={(n) => rate(t, n)} />
        <button type="button" aria-expanded={open === "dates"} aria-label="Due and plan-by dates" title="Due and plan-by dates" onClick={() => setOpen((v) => (v === "dates" ? null : "dates"))} className="qe-fact flex h-8 w-8 items-center justify-center rounded-full text-[14px]" data-open={open === "dates" ? "true" : undefined}>
          📅
        </button>
        <button type="button" aria-expanded={open === "snooze"} aria-label="Snooze" title="Snooze" onClick={() => setOpen((v) => (v === "snooze" ? null : "snooze"))} className="qe-fact flex h-8 w-8 items-center justify-center rounded-full" data-open={open === "snooze" ? "true" : undefined}>
          <SnoozeIcon size={14} />
        </button>
      </div>
      <Fold open={open === "dates"}>
        <div className="pt-2">
          <DatePanel t={t} setDue={setDue} setPlan={setPlan} />
        </div>
      </Fold>
      <Fold open={open === "snooze"}>
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          {[...choices.main, ...choices.other].map((c) => (
            <button key={c.label} type="button" onClick={() => snooze(t, c.at(), c.label)} className="qe-fact h-8 rounded-full px-3 text-[12.5px] font-semibold">
              {c.label}
            </button>
          ))}
        </div>
      </Fold>
    </li>
  );
}

/** 1–5 rising bars: how important it is for the day. Tapping one adds it at that importance. */
function Bars({ value, onPick, big = false }: { value: number; onPick: (n: number) => void; big?: boolean }) {
  const [hover, setHover] = useState(0);
  const lit = hover || value;
  const w = big ? 22 : 9;
  const gap = big ? 8 : 3;
  return (
    <div role="radiogroup" aria-label="How important for the day" className="flex items-end" style={{ gap }} onPointerLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`Importance ${n}`}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHover(n)}
          onClick={() => onPick(n)}
          className="flex items-end justify-center"
          style={{ width: big ? w + 10 : w + 6, height: big ? 44 : 30 }}
        >
          <span
            aria-hidden
            className="block rounded-[3px] transition-[background,transform] duration-150"
            style={{
              width: w,
              height: (big ? 10 : 7) + n * (big ? 6.5 : 4.2),
              background: n <= lit ? "linear-gradient(180deg,#f6dc8e,#c9a24a)" : "rgba(139,112,64,.18)",
              border: `1px solid ${n <= lit ? "#8a6116" : "rgba(139,112,64,.35)"}`,
              transform: hover === n ? "translateY(-2px)" : undefined,
            }}
          />
        </button>
      ))}
    </div>
  );
}

/** One 📅 button on a card: its due and plan-by dates, opened in place. */
function Dates({ t, setDue, setPlan }: { t: PrioritizeItem; setDue: Tools["setDue"]; setPlan: Tools["setPlan"] }) {
  const [open, setOpen] = useState(false);
  const due = dueWords(t.due_at);
  const plan = planDays(t.plan_by);
  const summary = [due, plan !== null ? (plan === 0 ? "plan today" : `plan within ${plan}d`) : null].filter(Boolean).join(" · ") || "Add a due or plan-by date";
  return (
    <div className="flex flex-col items-center gap-2" data-no-swipe>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="qe-fact flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold" data-open={open ? "true" : undefined}>
        <span aria-hidden>📅</span>
        {summary}
      </button>
      <Fold open={open}>
        <DatePanel t={t} setDue={setDue} setPlan={setPlan} />
      </Fold>
    </div>
  );
}

function DatePanel({ t, setDue, setPlan }: { t: PrioritizeItem; setDue: Tools["setDue"]; setPlan: Tools["setPlan"] }) {
  const dueKey = t.due_at ? keyOf(new Date(t.due_at)) : "";
  const at = (days: number) => {
    const d = morningIn(days, 17);
    return d.toISOString();
  };
  const quick = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "In a week", days: 7 },
  ];
  return (
    <div className="qe-fact-panel flex flex-col gap-2 rounded-xl px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12.5px] font-semibold" style={{ color: "#6b5631" }}>
          Due
        </span>
        {quick.map((q) => {
          const on = dueKey === keyOf(morningIn(q.days));
          return (
            <button key={q.label} type="button" aria-pressed={on} onClick={() => setDue(t, on ? null : at(q.days))} className="qe-fact h-8 rounded-full px-2.5 text-[12.5px] font-semibold" data-open={on ? "true" : undefined}>
              {q.label}
            </button>
          );
        })}
        <DateField value={dueKey} onChange={(k) => setDue(t, k ? new Date(`${k}T17:00`).toISOString() : null)} ariaLabel="Due date" placeholder="a date" className="h-8 rounded-lg border px-2 text-[13px]" style={{ borderColor: "rgba(139,112,64,.45)", background: "rgba(255,250,238,.6)" }} />
      </div>
      <ScheduleWithin days={planDays(t.plan_by)} onRate={(d) => setPlan(t, d)} small />
    </div>
  );
}

function Portrait({ t, size }: { t: PrioritizeItem; size: number }) {
  const src = t.icon_key && (t.icon_source === "ai" || t.icon_source === "library") ? t.icon_key : null;
  return (
    <span className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, border: "1.5px solid #c9a24a", background: "radial-gradient(circle at 35% 30%, #fffaf0, #f3e6c6 60%, #e6d3a6)" }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
      )}
    </span>
  );
}
