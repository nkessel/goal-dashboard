"use client";

import { FocusSteps as FocusStepsPanel } from "./FocusSteps";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { useRouter } from "next/navigation";
import { completeRiteAction, completeTaskAction, listQuestStepsAction, saveQuestStepsAction, updateTaskAction } from "@/app/actions";
import { IconPicker } from "@/components/tasks/IconPicker";
import { IconScale } from "@/components/tasks/QuestEditorDialog";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { useEscape } from "@/lib/use-escape";
import { rankOneThing, whyThisOne } from "@/lib/one-thing";
import { adoptFocusTask, canPopOutWindow, getFocusTimer, popOutFocusTimer, resetFocusTimer, setFocusTimer, spentSeconds, toggleFocusTimer, useFocusTimer } from "@/lib/focus-timer";

/** `habit` marks a daily habit shown as a quest (focus mode for a habit). */
type TaskWithCategory = Task & { categoryLabel?: string | null; habit?: { riteId: string; day: string } };

/**
 * A daily habit dressed as a quest, so it can use focus mode (timer and
 * all). Its id is "habit:<id>"; finishing it ticks the habit for `day`.
 */
export function habitAsTask(h: { id: string; title: string; description: string | null; xp_value: number; estimate_minutes?: number | null; icon_key?: string | null; icon_source?: string | null }, day: string): TaskWithCategory {
  return {
    id: `habit:${h.id}`,
    title: h.title,
    description: h.description,
    xp_value: h.xp_value,
    estimate_minutes: h.estimate_minutes ?? null,
    icon_key: h.icon_key ?? null,
    icon_source: (h.icon_source as Task["icon_source"]) ?? "monster",
    importance: 0,
    urgency: 0,
    progress: 0,
    status: "open",
    categoryLabel: "Daily habit",
    habit: { riteId: h.id, day },
  } as unknown as TaskWithCategory;
}

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
  const router = useRouter();

  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Quests finished or removed elsewhere drop out of the deck.
  const live = deck.filter((id) => byId.has(id));
  // Edits made right on the card (shown at once, saved in the background).
  const [patches, setPatches] = useState<Record<string, Partial<TaskWithCategory>>>({});
  const baseTask = index < live.length ? byId.get(live[index]) : undefined;
  const patch = baseTask ? patches[baseTask.id] : undefined;
  // Stable object (a new one each render would make the timer re-adopt it in a loop).
  const task = useMemo(() => (baseTask ? (patch ? { ...baseTask, ...patch } : baseTask) : undefined), [baseTask, patch]);
  const editable = !!task && !task.habit;

  function saveField(fields: Partial<TaskWithCategory>) {
    if (!task || task.habit) return;
    const next = { ...task, ...fields };
    setPatches((p) => ({ ...p, [task.id]: { ...p[task.id], ...fields } }));
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskAction(task.id, {
          title: next.title,
          description: next.description ?? "",
          importance: next.importance,
          urgency: next.urgency,
          xpValue: next.xp_value,
          ...("estimate_minutes" in fields ? { estimateMinutes: next.estimate_minutes } : {}),
          ...("effort" in fields ? { effort: next.effort ?? 0 } : {}),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that change.");
      }
    });
  }

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
    setConfirmExit(false);
    setClosing(true);
    setTimeout(() => {
      // Leaving with a paused or unused timer: let it go.
      if (getFocusTimer().runStart === null) resetFocusTimer();
      onClose();
    }, 200);
  }

  function exitKeepingTimer() {
    setConfirmExit(false);
    setClosing(true);
    setTimeout(onClose, 200);
  }

  function exitPausing() {
    setConfirmExit(false);
    setClosing(true);
    setTimeout(() => {
      resetFocusTimer();
      onClose();
    }, 200);
  }

  /** "Pop out": the timer floats in its own window (or as the pill at the top of the app), running. */
  function popOut() {
    if (getFocusTimer().runStart === null) toggleFocusTimer();
    if (canPopOutWindow()) popOutFocusTimer();
    else exitKeepingTimer();
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
        if (t.habit) {
          const res = await completeRiteAction(t.habit.riteId, t.habit.day);
          if (res.xp > 0) celebrateProgress({ title: t.title, xp: res.xp, coinsEarned: res.coinsEarned, fromPct: 0, toPct: 100, heading: "Habit done!", barCaption: "Done for today" });
          if (getFocusTimer().task?.id === t.id) resetFocusTimer();
          router.refresh();
          onClose();
          return;
        }
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
            {editable ? (
              <span className="relative z-[1]" title="Change the portrait">
                <IconPicker
                  taskId={task.id}
                  currentIcon={task.icon_key}
                  currentSource={task.icon_source}
                  taskTitle={task.title}
                  taskDescription={task.description}
                  theme={theme}
                  size={104}
                  centered
                  showEditHint
                  emptyContent={<QuestMonogram id={task.id} title={task.title} size={104} />}
                />
              </span>
            ) : (
              <Portrait task={task} />
            )}
            {task.categoryLabel && (
              <span className="relative z-[1] rounded-md px-2.5 py-0.5 text-[13px]" style={{ background: "rgba(120,90,40,.14)", color: "#5a4a30" }}>
                {task.categoryLabel}
              </span>
            )}
            {editable ? (
              <>
                <InlineText
                  key={`t-${task.id}`}
                  value={task.title}
                  onSave={(v) => v.trim() && saveField({ title: v.trim() })}
                  className="font-display text-[28px] leading-tight [text-wrap:balance]"
                  label="Quest title"
                />
                <InlineText
                  key={`d-${task.id}`}
                  value={task.description ?? ""}
                  multiline
                  placeholder="Add a description"
                  onSave={(v) => saveField({ description: v.trim() || null })}
                  className="max-h-[24vh] overflow-y-auto whitespace-pre-line text-[16px] leading-snug"
                  label="Description"
                />
                <EditableFacts task={task} now={now} onSave={saveField} />
              </>
            ) : (
              <>
                <h2 className="font-display relative z-[1] m-0 text-[28px] leading-tight [text-wrap:balance]" style={{ color: "var(--t-ink)" }}>
                  {task.title}
                </h2>
                {task.description && (
                  <p className="relative z-[1] m-0 max-h-[24vh] overflow-y-auto whitespace-pre-line text-[16px] leading-snug" style={{ color: "#4a3c26" }}>
                    {task.description}
                  </p>
                )}
                <Facts task={task} now={now} />
              </>
            )}
            {!focus && (
              <p className="relative z-[1] m-0 text-[14.5px] italic" style={{ color: "#6b5534" }}>
                {whyThisOne(task, now)}
              </p>
            )}
            <FocusTimer key={`timer-${task.id}`} task={task} minutes={task.estimate_minutes && task.estimate_minutes <= 240 ? task.estimate_minutes : 25} onPopOut={popOut} />
            {!task.habit && <FocusStepsPanel key={`steps-${task.id}`} taskId={task.id} progress={task.progress ?? 0} />}
            {error && (
              <p className="relative z-[1] m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}
            {!task.habit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="relative z-[1] text-[14px] underline decoration-dotted underline-offset-4"
                style={{ color: "#6b5534" }}
              >
                Open quest
              </button>
            )}
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
              {leaving === "done" ? "Completing…" : "Complete ✓"}
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

/** Tap the text to edit it in place; Enter (or tapping away) saves, Escape cancels. */
function InlineText({
  value,
  onSave,
  className,
  multiline = false,
  placeholder,
  label,
}: {
  value: string;
  onSave: (v: string) => void;
  className: string;
  multiline?: boolean;
  placeholder?: string;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const style = { color: multiline ? "#4a3c26" : "var(--t-ink)" };
  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value)}
        title={`Edit ${label.toLowerCase()}`}
        className={`inline-edit relative z-[1] m-0 w-full rounded-lg px-1.5 py-0.5 text-center ${className}`}
        style={{ ...style, opacity: value ? 1 : 0.55, fontStyle: value ? undefined : "italic" }}
      >
        {value || placeholder}
      </button>
    );
  }
  const finish = (save: boolean) => {
    if (save && draft !== value) onSave(draft);
    setDraft(null);
  };
  const common = {
    autoFocus: true,
    value: draft,
    "aria-label": label,
    onBlur: () => finish(true),
    className: `relative z-[1] w-full rounded-lg border px-2 py-1 text-center ${className}`,
    style: { ...style, borderColor: "#b39a6a", background: "rgba(255,250,238,.7)" },
  };
  return multiline ? (
    <textarea
      {...common}
      rows={Math.min(8, Math.max(2, draft.split("\n").length + 1))}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(null);
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) finish(true);
      }}
    />
  ) : (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(null);
        }
        if (e.key === "Enter") finish(true);
      }}
    />
  );
}

/** The card's facts, each tappable: time estimate, XP, and the ratings. */
function EditableFacts({ task, now, onSave }: { task: TaskWithCategory; now: number; onSave: (f: Partial<TaskWithCategory>) => void }) {
  const [open, setOpen] = useState<"time" | "xp" | "ratings" | null>(null);
  const [num, setNum] = useState("");
  const chip = "inline-edit whitespace-nowrap rounded-full px-2 py-0.5";
  const due = task.due_at ? new Date(task.due_at) : null;
  function openNum(which: "time" | "xp") {
    setNum(String(which === "time" ? (task.estimate_minutes ?? "") : task.xp_value));
    setOpen(which);
  }
  function commitNum() {
    const n = Math.round(Number(num));
    if (open === "time") onSave({ estimate_minutes: num.trim() === "" ? null : Math.max(1, Math.min(1440, n || 0)) || null });
    if (open === "xp") onSave({ xp_value: Math.max(0, Math.min(1000, n || 0)) });
    setOpen(null);
  }
  const est = task.estimate_minutes;
  return (
    <div className="relative z-[1] flex w-full flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-[14.5px]" style={{ color: "#4a3c26" }}>
        {due && (
          <span className="whitespace-nowrap px-1">
            {due.getTime() < now ? "Was due" : "Due"} {due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </span>
        )}
        <button type="button" onClick={() => openNum("time")} className={chip} title="Edit the time estimate">
          ⏱ {est != null ? (est < 60 ? `${est}m` : `${Math.floor(est / 60)}h${est % 60 ? ` ${est % 60}m` : ""}`) : "add time"}
        </button>
        <button type="button" onClick={() => openNum("xp")} className={`${chip} font-bold`} style={{ color: "var(--t-xp)" }} title="Edit the XP">
          +{task.xp_value} XP
        </button>
        <button type="button" onClick={() => setOpen(open === "ratings" ? null : "ratings")} className={chip} title="Edit importance, urgency and difficulty">
          {task.urgency > 0 || task.importance > 0 ? (
            <>
              <Glyphs src="/design/ui-trophy.svg" n={Math.round(task.importance)} />
              {task.importance > 0 && task.urgency > 0 ? " " : ""}
              <Glyphs src="/design/ui-flame-sm.png" n={Math.round(task.urgency)} />
            </>
          ) : (
            "rate it"
          )}
        </button>
        {task.steps_total ? <span className="whitespace-nowrap px-1">{task.steps_done ?? 0}/{task.steps_total} steps</span> : null}
      </div>
      {(open === "time" || open === "xp") && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            value={num}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNum();
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(null);
              }
            }}
            aria-label={open === "time" ? "Minutes" : "XP"}
            className="h-9 w-20 rounded-lg border px-2 text-center text-[16px]"
            style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.7)" }}
          />
          <span className="text-[14px]" style={{ color: "#6b5534" }}>
            {open === "time" ? "minutes" : "XP"}
          </span>
          <button type="button" onClick={commitNum} className="one-thing-primary h-9 rounded-full px-4 text-[14px] font-bold">
            Save
          </button>
        </div>
      )}
      {open === "ratings" && (
        <div className="flex w-full flex-col gap-1 rounded-xl px-3 py-2 text-left" style={{ background: "rgba(120,90,40,.1)", color: "var(--t-ink)" }}>
          <IconScale label="Importance" icon="/design/ui-flame-sm.png" value={Math.round(task.importance)} onChange={(v) => onSave({ importance: v })} />
          <IconScale label="Urgency" icon="/design/ui-hourglass.svg" value={Math.round(task.urgency)} onChange={(v) => onSave({ urgency: v })} />
          <IconScale label="Difficulty" icon="/design/ui-muscle.svg" value={Math.round(task.effort ?? 0)} onChange={(v) => onSave({ effort: v })} />
        </div>
      )}
    </div>
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
        <span className="inline-flex items-center whitespace-nowrap" title={`Importance ${task.importance}, urgency ${task.urgency}`}>
          <Glyphs src="/design/ui-trophy.svg" n={Math.round(task.importance)} />
          {task.urgency > 0 && task.importance > 0 ? " " : ""}
          <Glyphs src="/design/ui-flame-sm.png" n={Math.round(task.urgency)} />
        </span>
      )}
    </div>
  );
}

/**
 * Countdown (5 / 10 / 25 minutes or any length) or a stopwatch that counts
 * up. Either pauses at any time; the countdown keeps going past zero.
 */
function FocusTimer({ task, minutes, onPopOut }: { task: TaskWithCategory; minutes: number; onPopOut: () => void }) {
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
        <button type="button" onClick={onPopOut} aria-label="Pop out the timer" title="Pop out the timer, so it stays with you while you do other things" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ border: "1px solid rgba(139,112,64,.45)", color: "#4a3c26" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="5" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13 3h8v8M21 3l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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

function TargetGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="var(--t-gold)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="var(--t-gold)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.8" fill="var(--t-gold)" />
    </svg>
  );
}

/** Trophies for importance, flames for urgency (the same marks as the quest cards). */
function Glyphs({ src, n }: { src: string; n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex items-center gap-px align-[-2px]">
      {Array.from({ length: n }).map((_, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- decorative glyph from /public
        <img key={i} src={src} alt="" width={15} height={15} className="h-[15px] w-[15px] shrink-0" />
      ))}
    </span>
  );
}
