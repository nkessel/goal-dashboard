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
 * Prioritize today's or tomorrow's quests (owner, Nov 10; reworked Nov 12): the day's own quests first, one
 * card at a time or as a list; additional quests wait behind a button. Set how important it is for the day
 * on one five-part bar (drag or tap), then Save: nothing is kept until then. Swipe a card left to skip it
 * for now (Undo on the next card); Snooze hides it until the time you pick. Swiping right does nothing for
 * now (owner: paused while that's rethought). Due and plan-by dates sit behind one 📅 button.
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
  // The day's own quests come first; additional quests only once asked for.
  const [more, setMore] = useState(false);
  // What was on the day when it opened: a quest added from here stays under "additional" for this visit.
  const [first, setFirst] = useState<Set<string> | null>(null);

  useEffect(() => {
    let live = true;
    prioritizeAction(day)
      .then((d) => live && (setData(d), setFirst(new Set(d.onDay))))
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
  const mine = first ?? new Set<string>();
  const dayItems = items.filter((t) => mine.has(t.id));
  const moreItems = items.filter((t) => !mine.has(t.id));
  // Unrated ones first, so what's still undecided comes up before what you already placed.
  const unratedFirst = (a: PrioritizeItem, b: PrioritizeItem) => Number(!!ratings[a.id]) - Number(!!ratings[b.id]);
  const deck = [...(more ? moreItems : dayItems)].filter((t) => !done.includes(t.id)).sort(unratedFirst);
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
    if (wasOn) setUndo({ label: n ? `Saved · ${n} of 5` : "Saved", run: async () => setDone((v) => v.filter((x) => x !== t.id)) });
    else
      setUndo({
        label: `Saved and added to ${dayWord}`,
        run: async () => {
          setData((d) => d && { ...d, onDay: d.onDay.filter((x) => x !== t.id) });
          setDone((v) => v.filter((x) => x !== t.id));
          await unrateForDayAction(day, t.id, false);
        },
      });
  }

  function skip(t: PrioritizeItem) {
    setDone((v) => [...v, t.id]);
    setUndo({ label: `Skipped “${t.title.length > 26 ? t.title.slice(0, 25) + "…" : t.title}” for now`, run: async () => setDone((v) => v.filter((x) => x !== t.id)) });
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

          {data && (
            <div className="flex items-center gap-2">
              <h3 className="font-display m-0 flex-1 text-[15px] uppercase tracking-[.08em]" style={{ color: "#6b5631" }}>
                {more ? "Additional quests" : day === "today" ? "Today’s quests" : "Tomorrow’s quests"}
              </h3>
              {more && (
                <button type="button" onClick={() => setMore(false)} className="h-8 text-[13px] font-semibold underline underline-offset-2" style={{ color: "var(--t-ink-soft)" }}>
                  ‹ Back to {dayWord}’s
                </button>
              )}
            </div>
          )}

          {data && view === "cards" && (
            <div className="flex min-h-[330px] flex-col">
              {deck.length > 0 ? (
                <Deck key={deck[0].id} cards={deck.slice(0, 3)} rating={ratings[deck[0].id] ?? 0} left={deck.length} on={onDay.has(deck[0].id)} {...tools} />
              ) : (
                <div className="reveal flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                  <span aria-hidden className="text-[30px]" style={{ color: "#c9a24a" }}>
                    ✦
                  </span>
                  <p className="font-display m-0 text-[18px]">{more ? "Every quest has its place." : dayItems.length ? `${day === "today" ? "Today" : "Tomorrow"}’s quests are in order.` : `Nothing on ${dayWord}’s list yet.`}</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {!more && moreItems.length > 0 && <MoreButton n={moreItems.length} onClick={() => setMore(true)} />}
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
              {[...(more ? moreItems : dayItems)]
                .sort((a, b) => (ratings[b.id] ?? 0) - (ratings[a.id] ?? 0))
                .map((t) => (
                  <Row key={t.id} t={t} on={onDay.has(t.id)} rating={ratings[t.id] ?? 0} {...tools} />
                ))}
              {(more ? moreItems : dayItems).length === 0 && (
                <li className="py-6 text-center text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
                  {more ? "No other open quests." : `Nothing on ${dayWord}’s list yet.`}
                </li>
              )}
            </ul>
          )}

          {/* Additional quests stay out of the way until today's are done (owner, Nov 12). */}
          {data && !more && moreItems.length > 0 && (view === "list" || deck.length > 0) && (
            <div className="flex justify-center">
              <MoreButton n={moreItems.length} onClick={() => setMore(true)} />
            </div>
          )}

          <div className="flex min-h-[28px] items-center justify-center">
            {undo && (
              <span key={undo.label + done.length + snoozed.length} data-prioritize-undo className="fade-in flex items-center gap-2 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
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

function MoreButton({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-prioritize-more className="qe-fact flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold">
      Additional quests ({n}) ›
    </button>
  );
}

const FLY = 80;

/** The top card and the edges of the next two behind it. */
function Deck({ cards, rating, left, on, day, rate, skip, snooze, setDue, setPlan }: Tools & { cards: PrioritizeItem[]; rating: number; left: number; on: boolean }) {
  const t = cards[0];
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [out, setOut] = useState<null | "left" | "up">(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [other, setOther] = useState(false);
  // The level waits here until Save (owner, Nov 12: "save the priority with a button before it saves and goes to another item").
  const [level, setLevel] = useState(rating);
  const start = useRef<{ x: number; y: number; dir: "x" | "y" | null } | null>(null);
  const choices = snoozeChoices(day);
  const dayWord = day === "today" ? "today" : "tomorrow";

  const fly = (dir: "left" | "up", then: () => void) => {
    setOut(dir);
    window.setTimeout(then, 230);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative" style={{ minHeight: 236, overflowX: "clip", overflowY: "visible", paddingBottom: 2 }}>
        {cards
          .slice(1)
          .reverse()
          .map((c, i, arr) => (
            <div key={c.id} aria-hidden className="absolute inset-x-0 top-0 rounded-[18px]" style={{ height: 228, transform: `translateY(${(arr.length - i) * 7}px) scale(${1 - (arr.length - i) * 0.04})`, background: "#f5e9cc", border: "1px solid rgba(139,112,64,.35)", boxShadow: "0 2px 6px rgba(60,40,10,.15)" }} />
          ))}
        {/* What a swipe left does, shown as the card moves. */}
        <span aria-hidden className="absolute inset-y-0 right-3 z-[1] flex items-center text-[13px] font-semibold" style={{ color: "#6b5631", opacity: Math.min(1, -dx / FLY) }}>
          Skip for now
        </span>
        <div
          className="quest-card relative z-[2] flex flex-col gap-2.5 rounded-[18px] p-4"
          data-prioritize-card
          style={{
            minHeight: 228,
            background: "radial-gradient(circle at 30% 20%, #fffaf0, #f6ead0 70%)",
            border: "1.5px solid #c9a24a",
            boxShadow: "0 6px 18px rgba(60,40,10,.25)",
            touchAction: "pan-y",
            transform: out === "left" ? "translateX(-120%) rotate(-8deg)" : out === "up" ? "translateY(-24px) scale(.96)" : `translateX(${dx}px) rotate(${dragging ? dx / 30 : 0}deg)`,
            opacity: out ? 0 : 1,
            transition: dragging ? "none" : "transform 230ms cubic-bezier(.2,.8,.3,1), opacity 230ms",
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button, input, a, [data-no-swipe]")) return;
            start.current = { x: e.clientX, y: e.clientY, dir: null };
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
            // Left only: a pull to the right just resists (adding by swipe is paused).
            setDx(mx < 0 ? mx : Math.min(14, mx / 6));
          }}
          onPointerUp={() => {
            const s = start.current;
            start.current = null;
            if (!s || s.dir !== "x") return;
            setDragging(false);
            if (dx < -FLY) fly("left", () => skip(t));
            else setDx(0);
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
              How important {dayWord}? {level ? <b style={{ color: "#2a1c10" }}>{level} of 5</b> : <span className="font-normal opacity-80">drag or tap</span>}
            </span>
            <Bars value={level} onPick={setLevel} big />
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
            Hide it until
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
          <button type="button" onClick={() => (setSnoozeOpen(false), setOther(false))} aria-label="Keep it" className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: "#6b5631" }}>
            <CloseIcon size={12} />
          </button>
        </div>
      </Fold>

      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-expanded={snoozeOpen} onClick={() => setSnoozeOpen((v) => !v)} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold" style={{ border: "1px solid rgba(91,111,168,.55)", color: "#3c4c80" }}>
          <SnoozeIcon size={15} /> Snooze…
        </button>
        <button type="button" disabled={!level} onClick={() => fly("up", () => rate(t, level))} data-prioritize-save className="flex h-10 items-center gap-1.5 rounded-full px-5 text-[13.5px] font-bold transition-opacity" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10", opacity: level ? 1 : 0.45 }}>
          {on ? "Save" : `Save · add to ${dayWord}`}
        </button>
      </div>
      {/* What each move does, in a line (owner, Nov 12: "more explanation of what skip vs snooze does"). */}
      <p className="m-0 text-center text-[12px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
        <b>Swipe left</b> to skip it for now: nothing changes. <b>Snooze</b> hides it from your lists until the time you pick.
      </p>
    </div>
  );
}

/** One row of the list: the same moves as a card. */
function Row({ t, on, rating, day, rate, snooze, setDue, setPlan }: Tools & { t: PrioritizeItem; on: boolean; rating: number }) {
  const [open, setOpen] = useState<null | "dates" | "snooze">(null);
  const [level, setLevel] = useState(rating);
  const choices = snoozeChoices(day);
  const due = dueWords(t.due_at);
  const dirty = level > 0 && level !== rating;
  return (
    <li className="due-in rounded-2xl px-2.5 py-2" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.25)" }}>
      <div className="flex items-start gap-2">
        <Portrait t={t} size={30} />
        <span className="min-w-0 flex-1 pt-1 text-[14px] font-semibold leading-tight">{t.title}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 pl-[38px]">
        <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: due === "Overdue" ? "var(--t-warn)" : "var(--t-ink-soft)" }}>
          {[due, t.board].filter(Boolean).join(" · ")}
        </span>
        <Bars value={level} onPick={setLevel} />
        {dirty ? (
          <button type="button" onClick={() => rate(t, level)} className="fade-in h-8 rounded-full px-3 text-[12.5px] font-bold" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
            {on ? "Save" : "Save · add"}
          </button>
        ) : (
          <>
            <button type="button" aria-expanded={open === "dates"} aria-label="Due and plan-by dates" title="Due and plan-by dates" onClick={() => setOpen((v) => (v === "dates" ? null : "dates"))} className="qe-fact flex h-8 w-8 items-center justify-center rounded-full text-[14px]" data-open={open === "dates" ? "true" : undefined}>
              📅
            </button>
            <button type="button" aria-expanded={open === "snooze"} aria-label="Snooze: hide it until later" title="Snooze: hide it until later" onClick={() => setOpen((v) => (v === "snooze" ? null : "snooze"))} className="qe-fact flex h-8 w-8 items-center justify-center rounded-full" data-open={open === "snooze" ? "true" : undefined}>
              <SnoozeIcon size={14} />
            </button>
          </>
        )}
      </div>
      <Fold open={open === "dates"}>
        <div className="pt-2">
          <DatePanel t={t} setDue={setDue} setPlan={setPlan} />
        </div>
      </Fold>
      <Fold open={open === "snooze"}>
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-[12px] font-semibold" style={{ color: "#6b5631" }}>
            Hide it until
          </span>
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

/**
 * How important for the day: one line of five equal parts (owner, Nov 12). Drag along it or tap a part,
 * as on the importance scales; tapping the last lit part again clears it. Arrow keys work too.
 */
function Bars({ value, onPick, big = false }: { value: number; onPick: (n: number) => void; big?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; moved: boolean; start: number } | null>(null);
  const valueAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(5, Math.ceil(((clientX - r.left) / r.width) * 5)));
  };
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="How important for the day"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value}
      data-prioritize-bars
      className="flex cursor-pointer touch-none select-none items-center outline-offset-4"
      style={{ gap: big ? 5 : 3, width: big ? 230 : 96, height: big ? 40 : 30 }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, moved: false, start: value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        if (Math.abs(e.clientX - drag.current.x) > 4) drag.current.moved = true;
        if (drag.current.moved) onPick(valueAt(e.clientX));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved) return;
        const v = valueAt(e.clientX);
        onPick(v === d.start ? 0 : v);
      }}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          onPick(Math.min(5, value + 1));
        }
        if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          onPick(Math.max(0, value - 1));
        }
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden
          className="pointer-events-none block flex-1 rounded-full transition-[background] duration-150"
          style={{ height: big ? 14 : 9, background: n <= value ? "linear-gradient(180deg,#f6dc8e,#c9a24a)" : "rgba(139,112,64,.18)", border: `1px solid ${n <= value ? "#8a6116" : "rgba(139,112,64,.35)"}` }}
        />
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
