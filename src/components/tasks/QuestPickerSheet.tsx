"use client";

import { useRef, useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { createPriorityTaskAction, toggleManualPriorityAction } from "@/app/actions";
import { BottomSheet } from "@/components/ui/BottomSheet";

type TaskWithCategory = Task & { categoryLabel?: string | null };
type Step = "choose" | "create" | "existing";

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

  return (
    <BottomSheet onClose={onClose} theme={theme}>
      {(requestClose) => {
        if (step === "create") {
          return (
            <CreateStep isAdventure={isAdventure} onBack={() => setStep("choose")} onDone={requestClose} />
          );
        }
        if (step === "existing") {
          return (
            <ExistingStep
              tasks={otherTasks}
              isAdventure={isAdventure}
              onBack={() => setStep("choose")}
              onDone={requestClose}
            />
          );
        }
        return (
          <div className="flex flex-col gap-3">
            <Header
              title={isAdventure ? "Add to Today's Battle" : "Add to Today's Focus"}
              isAdventure={isAdventure}
              onClose={requestClose}
            />
            <PickerOption
              icon="+"
              label={isAdventure ? "Create new quest" : "Create new task"}
              isAdventure={isAdventure}
              onClick={() => setStep("create")}
            />
            <PickerOption
              icon="📋"
              label={isAdventure ? "Add an existing quest" : "Add an existing task"}
              isAdventure={isAdventure}
              onClick={() => setStep("existing")}
            />
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

function CreateStep({
  isAdventure,
  onBack,
  onDone,
}: {
  isAdventure: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel-2)" : "var(--t-bg)",
    color: "var(--t-ink)",
  };

  return (
    <form
      ref={formRef}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await createPriorityTaskAction(formData);
            formRef.current?.reset();
            onDone();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong");
          }
        });
      }}
      className="flex flex-col gap-3"
    >
      <Header title={isAdventure ? "New quest" : "New task"} isAdventure={isAdventure} onClose={onDone} onBack={onBack} />
      <input
        name="title"
        placeholder={isAdventure ? "Quest title" : "Task title"}
        required
        autoFocus
        className="rounded border px-2 py-1.5 text-sm"
        style={fieldStyle}
      />
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#2a1c10" : "#fff" }}
      >
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

function ExistingStep({
  tasks,
  isAdventure,
  onBack,
  onDone,
}: {
  tasks: TaskWithCategory[];
  isAdventure: boolean;
  onBack: () => void;
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
      <Header
        title={isAdventure ? "Add an existing quest" : "Add an existing task"}
        isAdventure={isAdventure}
        onClose={onDone}
        onBack={onBack}
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        autoFocus
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
