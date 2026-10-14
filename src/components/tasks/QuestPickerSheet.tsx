"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { toggleManualPriorityAction } from "@/app/actions";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { QuestEditorDialog } from "./QuestEditorDialog";

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
}: {
  otherTasks: TaskWithCategory[];
  theme?: "calm" | "adventure";
  onClose: () => void;
}) {
  const isAdventure = theme === "adventure";
  const [step, setStep] = useState<Step>("choose");

  if (step === "create") {
    return (
      <QuestEditorDialog mode={{ kind: "create", pinToBattle: true }} theme={theme} onClose={onClose} />
    );
  }

  return (
    <BottomSheet onClose={onClose} theme={theme}>
      {(requestClose) => {
        return (
          <div className="flex flex-col gap-3">
            <Header title={isAdventure ? "Add to Today's Quests" : "Add to Today's Focus"} isAdventure={isAdventure} onClose={requestClose} />
            <PickerOption
              icon="+"
              label={isAdventure ? "Create a new quest" : "Create a new task"}
              isAdventure={isAdventure}
              onClick={() => setStep("create")}
            />
            <ExistingStep tasks={otherTasks} isAdventure={isAdventure} onDone={requestClose} />
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
          style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
        >
          ←
        </button>
      )}
      <h3
        className={`flex-1 ${isAdventure ? "font-display text-base" : "text-base font-bold"}`}
        style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
      >
        {title}
      </h3>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-lg leading-none"
        style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
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
}: {
  tasks: TaskWithCategory[];
  isAdventure: boolean;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dim = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
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
        await toggleManualPriorityAction(id, true);
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
        {isAdventure ? "Or pick one of your Additional Quests:" : "Or pick one of your other tasks:"}
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        className="rounded border px-2 py-1.5 text-sm"
        style={fieldStyle}
      />
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
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
              className="hover-glow flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-50"
              style={{
                border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}`,
                color: "var(--t-ink)",
              }}
            >
              <span className="truncate">{t.title}</span>
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
