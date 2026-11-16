"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { completeLessonAction, lessonsAction, saveLessonButtonAction, undoLessonAction, type LessonButton as Config } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { Fold } from "@/components/ui/Fold";
import { InlineNumber } from "@/components/ui/InlineNumber";

// Each habit's lesson button and today's count, read once per page load (kept on the account, `life_wheel.lessons`).
type State = { buttons: Record<string, Config>; today: Record<string, number>; loaded: boolean };
let state: State = { buttons: {}, today: {}, loaded: false };
const EMPTY: State = { buttons: {}, today: {}, loaded: false };
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  subs.forEach((f) => f());
};
function useLessons(day: string) {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      loading ??= lessonsAction(day)
        .then((r) => set({ buttons: { ...r.buttons, ...state.buttons }, today: { ...r.today, ...state.today }, loaded: true }))
        .catch(() => set({ loaded: true }));
      return () => subs.delete(cb);
    },
    () => state,
    () => EMPTY
  );
}

const DEFAULT: Config = { on: true, xp: 10, coins: 1 };
/** Habits that read like a course get the button without being asked. */
const COURSE = /\b(course|class|lesson|lecture|coursework|module|study|studying)\b/i;

/** Is the button showing on this habit, and can it be turned on or off (from the habit's menu)? */
export function useLessonButton(habit: { id: string; title: string }, day: string) {
  const s = useLessons(day);
  const cfg = s.buttons[habit.id];
  const on = s.loaded && (cfg ? cfg.on : COURSE.test(habit.title));
  const toggle = () => {
    const next = { ...DEFAULT, ...cfg, on: !on };
    set({ buttons: { ...state.buttons, [habit.id]: next } });
    void saveLessonButtonAction(habit.id, { on: next.on }).catch(() => {});
  };
  return { on, toggle };
}

function BookIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.8v13.4c3.6-.2 6.2.4 8 1.7 1.8-1.3 4.4-1.9 8-1.7V4.8c-3.6-.2-6.2.4-8 1.7z" />
      <path d="M12 6.5v13.4" />
    </svg>
  );
}

/**
 * "Complete lesson" under a habit (owner, Nov 16): each press pays the lesson's XP and coins with the small
 * celebration, as many times a day as you finish one. The pencil beside it changes what a lesson pays.
 */
export function LessonButton({ habit, day }: { habit: { id: string; title: string }; day: string }) {
  const s = useLessons(day);
  const { on } = useLessonButton(habit, day);
  const cfg = { ...DEFAULT, ...s.buttons[habit.id] };
  const count = s.today[habit.id] ?? 0;
  const [editing, setEditing] = useState(false);
  const [last, setLast] = useState<{ xp: number; coins: number; noteId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!on) return null;
  const soft = { color: "var(--t-ink-soft)" };
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };

  const save = (patch: Partial<Config>) => {
    set({ buttons: { ...state.buttons, [habit.id]: { ...cfg, ...patch } } });
    void saveLessonButtonAction(habit.id, patch).catch(() => setError("Couldn't save that."));
  };
  const complete = () =>
    start(async () => {
      setError(null);
      try {
        const r = await completeLessonAction(habit.id, day);
        set({ today: { ...state.today, [habit.id]: r.count } });
        setLast({ xp: r.xp, coins: r.coins, noteId: r.noteId });
        if (r.xp > 0 || r.coins > 0) celebrateProgress({ title: habit.title, heading: "Lesson complete!", xp: r.xp, coinsEarned: r.coinsEarned, fromPct: 0, toPct: 100, barCaption: r.count > 1 ? `${r.count} lessons today` : "One more lesson learned" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  const undo = () =>
    start(async () => {
      if (!last) return;
      try {
        const r = await undoLessonAction(habit.id, day, last);
        set({ today: { ...state.today, [habit.id]: r.count } });
        setLast(null);
      } catch {
        setError("Couldn't undo that.");
      }
    });

  return (
    <div data-lesson-button className="due-in ml-11 mt-1 flex flex-col gap-1" {...stop}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={complete} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold disabled:opacity-60" style={{ background: "rgba(201,162,74,.18)", border: "1px solid rgba(160,120,40,.55)", color: "#5a3f0c" }}>
          <BookIcon />
          Complete lesson
          <span className="font-normal tabular-nums" style={{ color: "#7a5a1c" }}>
            +{cfg.xp} XP{cfg.coins > 0 ? ` · ${cfg.coins} ${cfg.coins === 1 ? "coin" : "coins"}` : ""}
          </span>
        </button>
        <button type="button" onClick={() => setEditing((e) => !e)} aria-expanded={editing} aria-label="Change what a lesson pays" title="Change what a lesson pays" className="flex h-6 w-6 items-center justify-center rounded-full text-[13px]" style={{ color: "#8a6116", background: editing ? "rgba(217,180,95,.3)" : undefined }}>
          ✎
        </button>
        {count > 0 && (
          <span className="text-[12.5px] tabular-nums" style={soft} role="status">
            {count === 1 ? "1 lesson today" : `${count} lessons today`}
          </span>
        )}
        {last && (
          <button type="button" onClick={undo} disabled={busy} className="text-[12.5px] underline underline-offset-2" style={soft}>
            Undo
          </button>
        )}
      </div>
      <Fold open={editing}>
        <div className="qe-fact-panel flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-3 py-2 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
          <span className="flex items-center gap-1.5">
            Each lesson pays
            <InlineNumber value={cfg.xp} onChange={(n) => save({ xp: n })} min={0} max={500} suffix=" XP" label="XP for a lesson" className="font-semibold" />
          </span>
          <span className="flex items-center gap-1.5">
            and
            <InlineNumber value={cfg.coins} onChange={(n) => save({ coins: n })} min={0} max={100} suffix={cfg.coins === 1 ? " coin" : " coins"} label="Coins for a lesson" className="font-semibold" />
          </span>
          <span className="text-[12.5px]" style={soft}>
            tap a number to change it
          </span>
        </div>
      </Fold>
      {error && (
        <span className="text-[12.5px]" style={{ color: "#8a2f1c" }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** The habit menu's row that adds or removes the button. */
export function LessonMenuItem({ habit, day, onPicked }: { habit: { id: string; title: string }; day: string; onPicked: () => void }) {
  const { on, toggle } = useLessonButton(habit, day);
  return (
    <button
      type="button"
      role="menuitem"
      data-mi="lesson"
      onClick={() => {
        toggle();
        onPicked();
      }}
      className="relative z-[1] flex min-h-11 items-center gap-2 px-4 text-left text-[15px] hover:bg-black/5"
      style={{ borderTop: "1px solid rgba(139,112,64,.2)" }}
    >
      <span aria-hidden className="flex w-[18px] justify-center" style={{ color: "#8a6c2c" }}>
        <BookIcon />
      </span>
      {on ? "Remove the Complete lesson button" : "Add a Complete lesson button"}
    </button>
  );
}
