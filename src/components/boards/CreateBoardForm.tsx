"use client";

import { useRef, useState, useTransition } from "react";
import { createBoardAction } from "@/app/actions";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";

export function CreateBoardForm({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isAdventure = theme === "adventure";
  const dimText = isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)";
  const borderColor = isAdventure ? "rgba(243,233,207,.35)" : "var(--t-card-border)";
  const inputStyle = {
    borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
    background: isAdventure ? "var(--t-panel)" : "var(--t-card)",
    color: "var(--t-ink)",
  };

  if (!open) {
    return (
      <FloatingActionButton
        onClick={() => setOpen(true)}
        label={`New ${isAdventure ? "campaign" : "board"}`}
        theme={theme}
      />
    );
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          await createBoardAction(formData);
          formRef.current?.reset();
          setOpen(false);
        });
      }}
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{ border: `1px solid ${borderColor}`, background: isAdventure ? "rgba(0,0,0,.22)" : "var(--t-card)" }}
    >
      <input
        name="title"
        placeholder="Board name (e.g. Dreaming, Startup, Daily Tasks)"
        required
        autoFocus
        className="rounded border px-2 py-1.5 text-sm"
        style={inputStyle}
      />
      <textarea
        name="description"
        placeholder="Description (optional)"
        rows={2}
        className="rounded border px-2 py-1.5 text-sm"
        style={inputStyle}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="hover-glow rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          style={{ background: isAdventure ? "var(--t-gold)" : "var(--t-accent)", color: isAdventure ? "#3b2a10" : "#fff" }}
        >
          {isPending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="hover-glow rounded-full px-4 py-1.5 text-sm"
          style={{ color: dimText }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
