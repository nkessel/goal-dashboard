"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { toggleManualPriorityAction } from "@/app/actions";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { QuestEditorDialog } from "./QuestEditorDialog";
import { QuestMonogram } from "./QuestMonogram";

type TaskWithCategory = Task & { categoryLabel?: string | null };
type Step = "choose" | "create";

/**
 * Opened by the "+" beside Today's Battle/Focus. Replaces the old inline
 * quick-add row with a proper choice: pin one of the not-yet-prioritized
 * quests already sitting in "Other Quests", or spin up a brand new one —
 * either way it lands in the top-3 priority list. Slides up as a
 * BottomSheet; switching between the three steps swaps content in place
 * rather than closing/reopening the sheet.
 */
export function QuestPickerSheet({
  otherTasks,
  theme = "calm",
  onClose,
  title,
  hint,
  onPick,
}: {
  otherTasks: TaskWithCategory[];
  theme?: "calm" | "adventure";
  onClose: () => void;
  /** Header (default "Add to Today's Quests"). */
  title?: string;
  /** Line above the list of existing quests. */
  hint?: string;
  /** Use a quest somewhere else (e.g. tomorrow's plan) instead of pinning it to today. */
  onPick?: (id: string) => void | Promise<void>;
}) {
  const isAdventure = theme === "adventure";
  const [step, setStep] = useState<Step>("choose");

  if (step === "create") {
    return (
      <QuestEditorDialog
        mode={{ kind: "create", pinToBattle: !onPick }}
        theme={theme}
        onClose={onClose}
        onCreated={onPick ? (id) => void onPick(id) : undefined}
      />
    );
  }

  return (
    <BottomSheet onClose={onClose} theme={theme}>
      {(requestClose) => {
        return (
          <div className="flex flex-col gap-3">
            <Header title={title ?? (isAdventure ? "Add to Today's Quests" : "Add to Today's Focus")} isAdventure={isAdventure} onClose={requestClose} />
            <PickerOption
              icon="+"
              label={isAdventure ? "Create a new quest" : "Create a new task"}
              isAdventure={isAdventure}
              onClick={() => setStep("create")}
            />
            <ExistingStep tasks={otherTasks} isAdventure={isAdventure} onDone={requestClose} onPick={onPick} hint={hint} />
          </div>
        );
      }}
    </BottomSheet>
  );
}

function Header({
  title,
  isAdventure,
  onClose,
  onBack,
}: {
  title: string;
  isAdventure: boolean;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
          style={{ color: "var(--t-ink-soft)" }}
        >
          ←
        </button>
      )}
      <h3
        className={`flex-1 ${isAdventure ? "font-display text-[20px]" : "text-base font-bold"}`}
        style={{ color: "var(--t-ink)" }}
      >
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-9 w-9 items-center justify-center text-2xl leading-none"
        style={{ color: "var(--t-ink-soft)" }}
      >
        ×
      </button>
    </div>
  );
}

function PickerOption({
  icon,
  label,
  isAdventure,
  onClick,
}: {
  icon: string;
  label: string;
  isAdventure: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover-glow flex items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium"
      style={{
        border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
        background: isAdventure ? "rgba(0,0,0,.16)" : "var(--t-bg)",
        color: "var(--t-ink)",
      }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{
          background: isAdventure ? "var(--t-gold)" : "var(--t-accent)",
          color: isAdventure ? "#2a1c10" : "#fff",
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function ExistingStep({
  tasks,
  isAdventure,
  onDone,
  onPick,
  hint,
}: {
  tasks: TaskWithCategory[];
  isAdventure: boolean;
  onDone: () => void;
  onPick?: (id: string) => void | Promise<void>;
  hint?: string;
}) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dim = "var(--t-ink-soft)";
  const fieldStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };
  const filtered = tasks.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()));

  function pick(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      try {
        if (onPick) await onPick(id);
        else await toggleManualPriorityAction(id, true);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't pin that quest.");
        setPendingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px]" style={{ color: dim }}>
        {hint ?? (isAdventure ? "Or pick one of your Additional Quests:" : "Or pick one of your other tasks:")}
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        aria-label="Search quests"
        className="h-10 rounded-lg border px-3 text-[16px]"
        style={fieldStyle}
      />
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <ul className="flex max-h-[46dvh] flex-col gap-1.5 overflow-y-auto overscroll-contain">
        {tasks.length === 0 && (
          <li className="py-2 text-sm" style={{ color: dim }}>
            {isAdventure ? "No other quests waiting — create one instead." : "No other tasks waiting — create one instead."}
          </li>
        )}
        {tasks.length > 0 && filtered.length === 0 && (
          <li className="py-2 text-sm" style={{ color: dim }}>
            No matches.
          </li>
        )}
        {filtered.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => pick(t.id)}
              disabled={isPending}
              className="hover-glow flex min-h-[48px] w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[15px] disabled:opacity-50"
              style={{
                border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
                color: "var(--t-ink)",
              }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "1.5px solid #a58c66", background: "#f3e6c8" }}>
                {(t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? (
                  // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                  <img src={t.icon_key} alt="" className="h-full w-full object-cover" />
                ) : (
                  <QuestMonogram id={t.id} title={t.title} size={36} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block leading-snug">{t.title}</span>
                {t.categoryLabel && (
                  <span className="block truncate text-[12px]" style={{ color: dim }}>
                    {t.categoryLabel}
                  </span>
                )}
              </span>
              {pendingId === t.id && isPending && (
                <span className="shrink-0 text-xs" style={{ color: dim }}>
                  …
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
