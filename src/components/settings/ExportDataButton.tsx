"use client";

import { useState, useTransition } from "react";
import { exportAccountDataAction } from "@/app/actions";

/**
 * Downloads the whole account (profile, boards, goals, tasks, friendships,
 * invite links, activity feed, notifications, XP history) as one JSON file
 * — for migrating from a local dev instance to a published one, or just a
 * backup. Nothing is uploaded anywhere; the file is generated and handed to
 * the browser to save.
 */
export function ExportDataButton({ theme = "calm" }: { theme?: "calm" | "adventure" }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdventure = theme === "adventure";

  function handleExport() {
    setError(null);
    startTransition(async () => {
      try {
        const data = await exportAccountDataAction();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `goal-dashboard-export-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't export your data.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={isPending}
        className="self-start rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        style={{
          borderColor: isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)",
          color: "var(--t-ink)",
        }}
      >
        {isPending ? "Preparing export…" : "Export all my data (JSON)"}
      </button>
      {error && (
        <p className="text-xs" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
