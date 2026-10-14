"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import type { Task } from "@/lib/data/types";
import { completeTaskAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { MONSTER_ICONS } from "@/lib/monster-icons";
import { useEscape } from "@/lib/use-escape";
import { rankOneThing, whyThisOne } from "@/lib/one-thing";

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

function OneThingView({
  deck,
  tasks,
  now,
  theme,
  onDeck,
  onClose,
  onReshuffle,
}: {
  deck: string[];
  tasks: TaskWithCategory[];
  now: number;
  theme: "calm" | "adventure";
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

  useEscape(() => (editing ? undefined : requestClose()), !editing);

  function requestClose() {
    if (closing) return;
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
      aria-label="One thing"
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
          Your one thing
        </span>
        <span className="w-11 text-right text-[13px] tabular-nums" style={{ color: "var(--ot-soft)" }}>
          {task ? `${index + 1}/${live.length}` : ""}
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
            <p className="relative z-[1] m-0 text-[14.5px] italic" style={{ color: "#6b5534" }}>
              {whyThisOne(task, now)}
            </p>
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
              onClick={next}
              disabled={!!leaving}
              className="one-thing-secondary min-h-12 flex-1 rounded-full text-[16px] font-semibold"
            >
              Not now
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
          <span className="text-[13px]" style={{ color: "var(--ot-soft)" }}>
            {remaining > 1 ? `${remaining - 1} more after this` : "Last one in the deck"}
          </span>
        </div>
      )}

      {editing && task && <EditTaskModal task={task} theme={theme} onClose={() => setEditing(false)} />}
    </div>,
    document.body
  );
}

function Portrait({ task }: { task: Task }) {
  const art = task.icon_source === "ai" || task.icon_source === "library" ? task.icon_key : null;
  const emoji = task.icon_source === "monster" ? MONSTER_ICONS.find((m) => m.key === task.icon_key)?.emoji : null;
  return (
    <span
      className="relative z-[1] flex h-[132px] w-[132px] items-center justify-center overflow-hidden rounded-full"
      style={{ border: "3px solid #b8964f", background: "#f3e6c8", boxShadow: "0 6px 18px rgba(60,40,10,.3), inset 0 0 0 2px rgba(255,244,220,.8)" }}
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- quest portrait
        <img src={art} alt="" className="h-full w-full object-cover" />
      ) : emoji ? (
        <span className="text-[64px] leading-none">{emoji}</span>
      ) : (
        <QuestMonogram id={task.id} title={task.title} size={132} />
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
          {"⚡".repeat(Math.round(task.importance))}
        </span>
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
