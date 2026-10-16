"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { completeTaskAction, listQuestStepsAction, saveQuestStepsAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { useEscape } from "@/lib/use-escape";
import { rankOneThing, whyThisOne } from "@/lib/one-thing";
import { adoptFocusTask, getFocusTimer, resetFocusTimer, setFocusTimer, spentSeconds, toggleFocusTimer, useFocusTimer } from "@/lib/focus-timer";

type TaskWithCategory = Task & { categoryLabel?: string | null };

/**
 * "Just one thing": when the list is too much, show a single quest full
 * screen — the best by urgency × importance ÷ effort. "Not now" deals the
 * next one; finishing it celebrates and deals the next.
 */
export function OneThing({ tasks, theme }: { tasks: TaskWithCategory[]; theme: "calm" | "adventure" }) {
  const [deck, setDeck] = useState<string[] | null>(null);
  const [now, setNow] = useState(0);

  function open() {
    const t = Date.now();
    setNow(t);
    setDeck(rankOneThing(tasks, t).map((x) => x.id));
  }

  const isAdventure = theme === "adventure";
  return (
    <>
      <button
        type="button"
        onClick={open}
        className="one-thing-trigger hover-glow mx-auto flex min-h-11 items-center gap-2.5 rounded-full px-5 text-[15.5px]"
        style={
          isAdventure
            ? { background: "rgba(14,18,10,.35)", border: "1px solid rgba(217,180,95,.45)", color: "var(--t-cream)" }
            : { background: "var(--t-card)", border: "1px solid var(--t-card-border)", color: "var(--t-ink)" }
        }
      >
        <TargetGlyph />
        <span className={isAdventure ? "font-display text-[18px]" : "font-semibold"}>Just show me one thing</span>
      </button>
      {deck && (
        <OneThingView
          deck={deck}
          tasks={tasks}
          now={now}
          theme={theme}
          onDeck={setDeck}
          onClose={() => setDeck(null)}
          onReshuffle={open}
        />
      )}
    </>
  );
}

/** Focus mode for one chosen quest (from its ⋯ menu): the same full-screen card, with a timer and its steps. */
export function FocusMode({ task, theme, onClose }: { task: TaskWithCategory; theme: "calm" | "adventure"; onClose: () => void }) {
  const [deck, setDeck] = useState([task.id]);
  const [now] = useState(() => Date.now());
  return <OneThingView focus deck={deck} tasks={[task]} now={now} theme={theme} onDeck={setDeck} onClose={onClose} onReshuffle={onClose} />;
}

function OneThingView({
  deck,
  tasks,
  now,
  theme,
  focus = false,
  onDeck,
  onClose,
  onReshuffle,
}: {
  deck: string[];
  tasks: TaskWithCategory[];
  now: number;
  theme: "calm" | "adventure";
  /** A single quest chosen from its menu: no deck, "Close" instead of "Not now". */
  focus?: boolean;
  onDeck: (d: string[]) => void;
  onClose: () => void;
  onReshuffle: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<"skip" | "done" | null>(null);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Quests finished or removed elsewhere drop out of the deck.
  const live = deck.filter((id) => byId.has(id));
  const task = index < live.length ? byId.get(live[index]) : undefined;

  const [confirmExit, setConfirmExit] = useState(false);
  useEscape(() => (confirmExit ? setConfirmExit(false) : requestClose()), !editing);

  // While this view is up, the floating timer pill stays hidden.
  useEffect(() => {
    setFocusTimer({ open: true });
    return () => setFocusTimer({ open: false });
  }, []);

  function requestClose() {
    if (closing) return;
    const t = getFocusTimer();
    if (t.runStart !== null && !confirmExit) {
      setConfirmExit(true);
      return;
    }
    // Leaving with a paused or unused timer: let it go.
    if (t.runStart === null) resetFocusTimer();
    setConfirmExit(false);
    setClosing(true);
    setTimeout(onClose, 200);
  }

  function exitKeepingTimer() {
    setConfirmExit(false);
    setClosing(true);
    setTimeout(onClose, 200);
  }

  function exitPausing() {
    resetFocusTimer();
    setConfirmExit(false);
    setClosing(true);
    setTimeout(onClose, 200);
  }

  function next() {
    setLeaving("skip");
    setTimeout(() => {
      setLeaving(null);
      setIndex((i) => i + 1);
    }, 260);
  }

  function complete(t: TaskWithCategory) {
    setError(null);
    setLeaving("done");
    const imageUrl = t.icon_source === "ai" || t.icon_source === "library" ? t.icon_key : null;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", t.id);
        const res = await completeTaskAction(fd);
        celebrateQuest({
          taskId: t.id,
          title: t.title,
          description: t.description,
          tag: t.categoryLabel,
          xp: t.xp_value,
          iconSrc: imageUrl,
          totalXp: res?.totalXp ?? null,
          coinsEarned: res?.coinsEarned ?? 0,
          isReward: false,
        });
        onDeck(deck.filter((id) => id !== t.id));
        setLeaving(null);
        if (getFocusTimer().task?.id === t.id) resetFocusTimer();
        if (focus) onClose();
      } catch (e) {
        setLeaving(null);
        setError(e instanceof Error ? e.message : "Couldn't complete that quest.");
      }
    });
  }

  const remaining = live.length - index;

  return createPortal(
    <div
      className={`one-thing fixed inset-0 z-[49] flex flex-col ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      data-theme={theme}
      role="dialog"
      aria-modal="true"
      aria-label={focus ? "Focus mode" : "One thing"}
      // Clicks here must not reach the quest card this view was opened from
      // (React events bubble through portals). Empty space closes the view.
      onClick={(e) => {
        e.stopPropagation();
        if (editing || confirmExit) return;
        const el = e.target as HTMLElement;
        if (!el.closest("article, button, a, input, label, [data-keep]")) requestClose();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[28px] leading-none"
          style={{ color: "var(--ot-soft)" }}
        >
          ×
        </button>
        <span className="font-display flex-1 text-center text-[19px]" style={{ color: "var(--ot-gold)" }}>
          {focus ? "Focus mode" : "Your one thing"}
        </span>
        <span className="w-11 text-right text-[13px] tabular-nums" style={{ color: "var(--ot-soft)" }}>
          {task && !focus ? `${index + 1}/${live.length}` : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-4">
        {task ? (
          <article
            key={task.id}
            className={`one-thing-card parchment-framed parchment relative flex w-full max-w-md flex-col items-center gap-3 px-6 pb-6 pt-7 text-center ${
              leaving === "skip" ? "one-thing-out" : leaving === "done" ? "one-thing-done" : "one-thing-in"
            }`}
            style={{ borderRadius: 22 }}
          >
            <Portrait task={task} />
            {task.categoryLabel && (
              <span className="relative z-[1] rounded-md px-2.5 py-0.5 text-[13px]" style={{ background: "rgba(120,90,40,.14)", color: "#5a4a30" }}>
                {task.categoryLabel}
              </span>
            )}
            <h2 className="font-display relative z-[1] m-0 text-[28px] leading-tight [text-wrap:balance]" style={{ color: "var(--t-ink)" }}>
              {task.title}
            </h2>
            {task.description && (
              <p className="relative z-[1] m-0 max-h-[24vh] overflow-y-auto whitespace-pre-line text-[16px] leading-snug" style={{ color: "#4a3c26" }}>
                {task.description}
              </p>
            )}
            <Facts task={task} now={now} />
            {!focus && (
              <p className="relative z-[1] m-0 text-[14.5px] italic" style={{ color: "#6b5534" }}>
                {whyThisOne(task, now)}
              </p>
            )}
            <FocusTimer key={`timer-${task.id}`} task={task} minutes={task.estimate_minutes && task.estimate_minutes <= 240 ? task.estimate_minutes : 25} />
            <FocusSteps key={`steps-${task.id}`} taskId={task.id} />
            {error && (
              <p className="relative z-[1] m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="relative z-[1] text-[14px] underline decoration-dotted underline-offset-4"
              style={{ color: "#6b5534" }}
            >
              Open quest
            </button>
          </article>
        ) : (
          <div className="one-thing-in flex max-w-sm flex-col items-center gap-4 text-center">
            <p className="font-display m-0 text-[26px]" style={{ color: "var(--ot-text)" }}>
              {live.length === 0 ? "Nothing to do right now." : "That's every quest."}
            </p>
            <p className="m-0 text-[15.5px]" style={{ color: "var(--ot-soft)" }}>
              {live.length === 0 ? "Every open quest is done, locked, or waiting for review." : "You passed on all of them for now. Deal them again?"}
            </p>
            {live.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIndex(0);
                  onReshuffle();
                }}
                className="one-thing-primary min-h-12 rounded-full px-7 text-[16px] font-bold"
              >
                Deal again
              </button>
            )}
          </div>
        )}
      </div>

      {task && (
        <div className="flex flex-col items-center gap-2 px-4 pb-[max(18px,env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-md gap-3">
            <button
              type="button"
              onClick={focus ? requestClose : next}
              disabled={!!leaving}
              className="one-thing-secondary min-h-12 flex-1 rounded-full text-[16px] font-semibold"
            >
              {focus ? "Close" : "Not now"}
            </button>
            <button
              type="button"
              onClick={() => complete(task)}
              disabled={!!leaving}
              className="one-thing-primary min-h-12 flex-[1.4] rounded-full text-[16px] font-bold"
            >
              {leaving === "done" ? "Completing…" : "Done ✓"}
            </button>
          </div>
          {!focus && (
            <span className="text-[13px]" style={{ color: "var(--ot-soft)" }}>
              {remaining > 1 ? `${remaining - 1} more after this` : "Last one in the deck"}
            </span>
          )}
        </div>
      )}

      {editing && task && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
      {confirmExit && (
        <div data-keep className="overlay-fade-in absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: "rgba(5,7,16,.55)" }} onClick={() => setConfirmExit(false)}>
          <div
            role="alertdialog"
            aria-label="Your timer is still running"
            onClick={(e) => e.stopPropagation()}
            className="card-pop-in parchment parchment-framed flex w-full max-w-sm flex-col gap-3 rounded-2xl p-5 text-center"
            style={{ color: "var(--t-ink)", background: "var(--t-card)" }}
          >
            <p className="font-display relative z-[1] m-0 text-[21px]">Your timer is still running</p>
            <p className="relative z-[1] m-0 text-[14.5px]" style={{ color: "var(--t-ink-soft)" }}>
              Keep it going while you look around? It stays at the top of the screen.
            </p>
            <div className="relative z-[1] flex flex-col gap-2">
              <button type="button" onClick={exitKeepingTimer} className="one-thing-primary min-h-11 rounded-full text-[15.5px] font-bold">
                Keep it running
              </button>
              <button type="button" onClick={exitPausing} className="min-h-11 rounded-full text-[15px] font-semibold" style={{ border: "1.5px solid #a88a3f", color: "var(--t-ink)" }}>
                Stop the timer and exit
              </button>
              <button type="button" onClick={() => setConfirmExit(false)} className="min-h-10 text-[14px] underline" style={{ color: "var(--t-ink-soft)" }}>
                Stay in focus mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function Portrait({ task }: { task: Task }) {
  const art = task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;
  const emoji = task.icon_source === "monster" ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji : null;
  return (
    <span
      className="relative z-[1] flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-full"
      style={{ border: "3px solid #b8964f", background: "#f3e6c8", boxShadow: "0 6px 18px rgba(60,40,10,.3), inset 0 0 0 2px rgba(255,244,220,.8)" }}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
        <img src={art} alt="" className="h-full w-full object-cover" />
      ) : emoji ? (
        <span className="text-[52px] leading-none">{emoji}</span>
      ) : (
        <QuestMonogram id={task.id} title={task.title} size={104} />
      )}
    </span>
  );
}

function Facts({ task, now }: { task: Task; now: number }) {
  const facts: string[] = [];
  if (task.due_at) {
    const d = new Date(task.due_at);
    const late = d.getTime() < now;
    facts.push(`${late ? "Was due" : "Due"} ${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
  }
  if (task.estimate_minutes != null) facts.push(`⏱ ${task.estimate_minutes < 60 ? `${task.estimate_minutes}m` : `${Math.floor(task.estimate_minutes / 60)}h${task.estimate_minutes % 60 ? ` ${task.estimate_minutes % 60}m` : ""}`}`);
  if (task.steps_total) facts.push(`${task.steps_done ?? 0}/${task.steps_total} steps`);
  if (task.progress) facts.push(`${task.progress}% done`);
  return (
    <div className="relative z-[1] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[14.5px]" style={{ color: "#4a3c26" }}>
      {facts.map((f) => (
        <span key={f} className="whitespace-nowrap">
          {f}
        </span>
      ))}
      <span className="whitespace-nowrap font-bold" style={{ color: "var(--t-xp)" }}>
        +{task.xp_value} XP
      </span>
      {(task.urgency > 0 || task.importance > 0) && (
        <span className="whitespace-nowrap" title={`Urgency ${task.urgency}, importance ${task.importance}`}>
          {"🔥".repeat(Math.round(task.urgency))}
          {task.urgency > 0 && task.importance > 0 ? " " : ""}
          {"❤️".repeat(Math.round(task.importance))}
        </span>
      )}
    </div>
  );
}

/**
 * Countdown (5 / 10 / 25 minutes or any length) or a stopwatch that counts
 * up. Either pauses at any time; the countdown keeps going past zero.
 */
function FocusTimer({ task, minutes }: { task: TaskWithCategory; minutes: number }) {
  const t = useFocusTimer();
  const [custom, setCustom] = useState("");
  const [tick, setTick] = useState(0);
  // Follow this quest in the shared timer (keeps a running one going).
  useEffect(() => {
    adoptFocusTask(task, Math.max(1, Math.min(240, minutes)));
  }, [task, minutes]);
  const mine = t.task?.id === task.id;
  const mode = mine ? t.mode : "countdown";
  const length = mine ? t.length : Math.max(1, Math.min(240, minutes));
  const running = mine && t.runStart !== null;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);
  const spent = mine ? spentSeconds(t, running ? tick || t.runStart! : 0) : 0;
  const total = length * 60;
  const counting = mode === "countdown";
  const left = total - spent;
  const over = counting && left < 0;
  const shownSecs = Math.abs(Math.round(counting ? left : spent));
  const hh = Math.floor(shownSecs / 3600);
  const mm = Math.floor((shownSecs % 3600) / 60);
  const ss = String(shownSecs % 60).padStart(2, "0");
  const clock = hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  const pct = counting ? Math.min(1, spent / total) : (spent % 3600) / 3600;
  const started = spent > 0 || running;

  function toggle() {
    if (!mine) adoptFocusTask(task, length);
    setTick(Date.now());
    toggleFocusTimer();
  }
  function reset() {
    setFocusTimer({ elapsed: 0, runStart: null });
  }
  function setMode(m: "countdown" | "stopwatch") {
    setFocusTimer({ mode: m, elapsed: 0, runStart: null });
  }
  function pickLength(m: number) {
    setFocusTimer({ length: m, elapsed: 0, runStart: null });
  }

  const chip = (on: boolean): React.CSSProperties =>
    on ? { background: "rgba(217,180,95,.55)", border: "1px solid #5a4520", color: "#2a1c10" } : { border: "1px solid rgba(139,112,64,.45)", color: "#4a3c26" };

  return (
    <div className="relative z-[1] flex w-full flex-col gap-2 rounded-2xl px-3 py-2.5" style={{ background: "rgba(120,90,40,.1)", border: "1px solid rgba(139,112,64,.35)" }}>
      <div className="flex items-center gap-3">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="shrink-0">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(120,90,40,.2)" strokeWidth="4" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={over ? "#b5462e" : "#a88a3f"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(pct * 113.1).toFixed(1)} 113.1`}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <span className="font-display text-[26px] leading-none tabular-nums" style={{ color: over ? "#b5462e" : "var(--t-ink)" }}>
            {over ? "+" : ""}
            {clock}
          </span>
          <span className="text-[12px]" style={{ color: "#6b5534" }}>
            {over ? "Past your time — keep going or call it" : running ? "Focusing…" : spent > 0 ? "Paused" : counting ? `${length}-minute countdown` : "Stopwatch"}
          </span>
        </div>
        {spent > 0 && !running && (
          <button type="button" onClick={reset} className="h-10 rounded-full px-2 text-[14px] underline" style={{ color: "#6b5534" }}>
            Reset
          </button>
        )}
        <button type="button" onClick={toggle} className="one-thing-primary h-10 min-w-[84px] rounded-full px-4 text-[15px] font-bold">
          {running ? "Pause" : spent > 0 ? "Resume" : "Start"}
        </button>
      </div>
      {!started && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div role="radiogroup" aria-label="Timer type" className="flex rounded-full p-0.5" style={{ border: "1px solid rgba(139,112,64,.45)" }}>
            {(
              [
                ["countdown", "Countdown"],
                ["stopwatch", "Stopwatch"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className="h-8 rounded-full px-3 text-[13px] font-semibold"
                style={mode === m ? { background: "rgba(217,180,95,.6)", color: "#2a1c10" } : { color: "#4a3c26" }}
              >
                {label}
              </button>
            ))}
          </div>
          {counting && (
            <>
              {[5, 10, 25].map((m) => (
                <button key={m} type="button" onClick={() => { setCustom(""); pickLength(m); }} className="h-8 rounded-full px-2.5 text-[13px] font-semibold tabular-nums" style={chip(length === m && !custom)}>
                  {m}m
                </button>
              ))}
              <label className="flex h-8 items-center gap-1 rounded-full px-2 text-[13px]" style={chip(!!custom)}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  value={custom}
                  placeholder={[5, 10, 25].includes(length) ? "other" : String(length)}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    const n = Math.round(Number(e.target.value));
                    if (n >= 1 && n <= 240) pickLength(n);
                  }}
                  aria-label="Minutes"
                  className="w-10 bg-transparent text-center text-[16px] font-semibold tabular-nums outline-none"
                />
                min
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Step = { id: string; title: string; done: boolean };

/** The quest's steps, tickable right here. */
function FocusSteps({ taskId }: { taskId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => {
    let alive = true;
    listQuestStepsAction(taskId)
      .then((rows) => alive && setSteps((rows ?? []).map((r) => ({ id: r.id, title: r.title, done: r.done }))))
      .catch(() => alive && setSteps([]));
    return () => {
      alive = false;
    };
  }, [taskId]);
  if (!steps || steps.length === 0) return null;

  function toggle(id: string) {
    const next = steps!.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
    setSteps(next);
    setError(null);
    startTransition(async () => {
      try {
        await saveQuestStepsAction(taskId, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that step.");
      }
    });
  }

  const done = steps.filter((s) => s.done).length;
  return (
    <div className="relative z-[1] flex w-full flex-col gap-1 text-left">
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#6b5534" }}>
        Steps · {done}/{steps.length}
      </span>
      <ul className="m-0 flex list-none flex-col p-0">
        {steps.map((s) => (
          <li key={s.id}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2.5 py-1 text-[15.5px]" style={{ color: "var(--t-ink)" }}>
              <input type="checkbox" checked={s.done} onChange={() => toggle(s.id)} className="h-5 w-5 shrink-0 accent-[#58a04a]" />
              <span style={{ textDecoration: s.done ? "line-through" : undefined, opacity: s.done ? 0.65 : 1 }}>{s.title}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function TargetGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="var(--t-gold)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="var(--t-gold)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.8" fill="var(--t-gold)" />
    </svg>
  );
}
