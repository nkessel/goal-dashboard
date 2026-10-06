"use client";

import { useState, useTransition } from "react";
import type { Task, TaskContext } from "@/lib/data/types";
import { completeTaskAction, toggleManualPriorityAction } from "@/app/actions";
import {
  CONTEXT_OPTIONS,
  GAP_FILLER_MAX_MINUTES,
  floatingTasks,
  gapFillers,
  upkeepQueue,
  windowLabel,
  windowPressure,
} from "@/lib/flexible";
import { EditTaskModal } from "./EditTaskModal";

type Tab = "due" | "gaps" | "place";

/**
 * Today's home for tasks that shouldn't live in a fixed calendar slot —
 * the haircut / clean-the-car kind that urgent work keeps bumping:
 *
 *  - Today's upkeep: one life-maintenance task a day, with a Swap button.
 *  - Due soon: floating tasks with a "do by" window, soonest first; the
 *    chip warms up as the window closes.
 *  - Gap fillers: short (≤20 min) unscheduled tasks to grab when a block
 *    opens up unexpectedly.
 *  - By place: batch errands — tap "Out & about" to see everything that
 *    can be done while you're out.
 */
export function FlexiblePanel({ tasks, theme = "calm" }: { tasks: Task[]; theme?: "calm" | "adventure" }) {
  const isAdventure = theme === "adventure";
  const due = floatingTasks(tasks);
  const gaps = gapFillers(tasks);
  const upkeep = upkeepQueue(tasks);
  const placeCounts = CONTEXT_OPTIONS.map((o) => ({
    ...o,
    count: tasks.filter((t) => t.status === "open" && t.context === o.key).length,
  }));

  const [tab, setTab] = useState<Tab>(due.length ? "due" : gaps.length ? "gaps" : "place");
  const [place, setPlace] = useState<TaskContext | null>(placeCounts.find((p) => p.count > 0)?.key ?? null);
  const [upkeepIndex, setUpkeepIndex] = useState(0);
  const [editing, setEditing] = useState<Task | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visible = (list: Task[]) => list.filter((t) => !hidden.has(t.id));
  const todaysUpkeep = visible(upkeep)[upkeepIndex % Math.max(1, visible(upkeep).length)];

  const panelStyle = {
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-card)",
    border: `2px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
    color: "var(--t-ink)",
  };
  const accent = isAdventure ? "var(--t-gold)" : "var(--t-accent)";

  function complete(task: Task) {
    setError(null);
    setHidden((h) => new Set(h).add(task.id));
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", task.id);
        await completeTaskAction(fd);
      } catch (e) {
        setHidden((h) => {
          const next = new Set(h);
          next.delete(task.id);
          return next;
        });
        setError(e instanceof Error ? e.message : "Couldn't complete that.");
      }
    });
  }

  function pin(task: Task) {
    setError(null);
    startTransition(async () => {
      try {
        await toggleManualPriorityAction(task.id, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't pin that.");
      }
    });
  }

  const nothingYet = !due.length && !gaps.length && !upkeep.length && placeCounts.every((p) => !p.count);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "due", label: "Due soon", count: visible(due).length },
    { key: "gaps", label: isAdventure ? "Quick skirmishes" : "Gap fillers", count: visible(gaps).length },
    { key: "place", label: "By place" },
  ];

  const list =
    tab === "due"
      ? visible(due)
      : tab === "gaps"
        ? visible(gaps)
        : place
          ? visible(tasks.filter((t) => t.status === "open" && t.context === place))
          : [];

  const emptyText =
    tab === "due"
      ? "Give a task a “Do by” date and it floats here until the window closes."
      : tab === "gaps"
        ? `Tasks with a time estimate of ${GAP_FILLER_MAX_MINUTES} min or less show up here — grab one when a block opens up.`
        : "Tag tasks with where they can be done (out, home, computer, phone) to batch them.";

  return (
    <section className="flex flex-col gap-3">
      {todaysUpkeep && (
        <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={panelStyle}>
          <span aria-hidden className="text-xl">
            🧹
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
              {isAdventure ? "Today's keep upkeep" : "Today's upkeep"}
            </div>
            <button
              type="button"
              onClick={() => setEditing(todaysUpkeep)}
              className="block max-w-full truncate text-left text-[15px] font-semibold"
            >
              {todaysUpkeep.title}
            </button>
            {(todaysUpkeep.xp_value > 0 || todaysUpkeep.due_by) && (
              <div className="text-xs" style={{ color: "var(--t-ink-soft)" }}>
                {todaysUpkeep.xp_value > 0 && (
                  <span style={{ color: isAdventure ? "var(--t-xp)" : "var(--t-accent)", fontWeight: 600 }}>
                    +{todaysUpkeep.xp_value} XP
                  </span>
                )}
                {todaysUpkeep.xp_value > 0 && todaysUpkeep.due_by && " · "}
                {todaysUpkeep.due_by && windowLabel(todaysUpkeep.due_by)}
              </div>
            )}
          </div>
          {visible(upkeep).length > 1 && (
            <button
              type="button"
              onClick={() => setUpkeepIndex((i) => i + 1)}
              className="hover-glow h-8 rounded-full border px-3 text-xs font-semibold"
              style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
            >
              Swap
            </button>
          )}
          <button
            type="button"
            onClick={() => complete(todaysUpkeep)}
            className="hover-glow h-8 rounded-full px-3 text-xs font-semibold"
            style={{ background: accent, color: isAdventure ? "#2a1c10" : "#fff" }}
          >
            Done
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-2xl px-3 py-3" style={panelStyle}>
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className={isAdventure ? "font-display text-base" : "text-[15px] font-extrabold"}>
            {isAdventure ? "Side Quests" : "Flexible"}
          </h2>
        </div>

        {nothingYet ? (
          <p className="px-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
            For things like a haircut or cleaning the car: give a task a <b>Do by</b> window, a <b>Where</b>, a short
            time estimate, or mark it <b>Upkeep</b>, and it lands here instead of a calendar slot that keeps getting
            bumped.
          </p>
        ) : (
          <>
            <div role="tablist" className="flex gap-1 rounded-full p-1" style={{ background: isAdventure ? "rgba(0,0,0,.18)" : "var(--t-bg)" }}>
              {tabs.map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={on}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className="h-8 min-w-0 flex-1 truncate rounded-full px-2 text-xs font-semibold"
                    style={{
                      background: on ? (isAdventure ? "var(--t-panel)" : "var(--t-card)") : "transparent",
                      boxShadow: on ? "0 1px 3px rgba(0,0,0,.18)" : undefined,
                      color: on ? "var(--t-ink)" : "var(--t-ink-soft)",
                    }}
                  >
                    {t.label}
                    {t.count ? ` · ${t.count}` : ""}
                  </button>
                );
              })}
            </div>

            {tab === "place" && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {placeCounts.map((p) => {
                  const on = place === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPlace(p.key)}
                      className="hover-glow h-7 rounded-full border px-2.5 text-xs font-medium"
                      style={{
                        borderColor: on ? accent : isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
                        background: on ? (isAdventure ? "rgba(217,180,95,.22)" : "var(--t-accent-soft)") : "transparent",
                        opacity: p.count ? 1 : 0.55,
                      }}
                    >
                      {p.emoji} {isAdventure ? p.adventureLabel : p.calmLabel}
                      {p.count ? ` · ${p.count}` : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {list.length === 0 ? (
              <p className="px-1 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                {emptyText}
              </p>
            ) : (
              <ul className="flex flex-col">
                {list.slice(0, 8).map((task) => (
                  <FlexRow
                    key={task.id}
                    task={task}
                    isAdventure={isAdventure}
                    showWindow={tab !== "gaps"}
                    onComplete={() => complete(task)}
                    onPin={() => pin(task)}
                    onEdit={() => setEditing(task)}
                  />
                ))}
                {list.length > 8 && (
                  <li className="px-1 pt-1 text-xs" style={{ color: "var(--t-ink-soft)" }}>
                    +{list.length - 8} more in More tasks
                  </li>
                )}
              </ul>
            )}
          </>
        )}

        {error && (
          <p className="px-1 text-xs" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
      </div>

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </section>
  );
}

function FlexRow({
  task,
  isAdventure,
  showWindow,
  onComplete,
  onPin,
  onEdit,
}: {
  task: Task;
  isAdventure: boolean;
  showWindow: boolean;
  onComplete: () => void;
  onPin: () => void;
  onEdit: () => void;
}) {
  const pressure = task.due_by ? windowPressure(task.due_by) : 0;
  // Chip warms from neutral to the warn colour as the window closes.
  const chipBg =
    pressure >= 1
      ? "var(--t-warn-bg)"
      : pressure > 0.5
        ? isAdventure
          ? "rgba(217,180,95,.25)"
          : "var(--t-accent-soft)"
        : "transparent";
  const chipColor = pressure >= 1 ? "var(--t-warn)" : "var(--t-ink-soft)";
  const place = task.context ? CONTEXT_OPTIONS.find((o) => o.key === task.context)?.emoji : null;

  return (
    <li className="flex items-center gap-2.5 border-t px-1 py-2 first:border-t-0" style={{ borderColor: isAdventure ? "rgba(214,200,150,.15)" : "var(--t-card-border)" }}>
      <button
        type="button"
        onClick={onComplete}
        aria-label={`Complete ${task.title}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: isAdventure ? "var(--t-gold)" : "var(--t-accent)" }}
      />
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[14px] font-medium">
          {place && <span className="mr-1">{place}</span>}
          {task.title}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {task.estimate_minutes ? <span>⏱ {task.estimate_minutes}m</span> : null}
          {showWindow && task.due_by && (
            <span className="rounded-full px-1.5 py-px font-semibold" style={{ background: chipBg, color: chipColor }}>
              {windowLabel(task.due_by)}
            </span>
          )}
          {task.is_manual_priority && <span>📌 Pinned</span>}
        </span>
      </button>
      {!task.is_manual_priority && (
        <button
          type="button"
          onClick={onPin}
          className="hover-glow h-7 shrink-0 rounded-full border px-2.5 text-[11px] font-semibold"
          style={{ borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)" }}
          title={isAdventure ? "Add to Today's Battle" : "Add to Today's Focus"}
        >
          + Today
        </button>
      )}
    </li>
  );
}
