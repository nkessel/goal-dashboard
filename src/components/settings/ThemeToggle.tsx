"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateThemeAction } from "@/app/actions";

export function ThemeToggle({ theme }: { theme: "calm" | "adventure" }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isAdventure = theme === "adventure";

  function setTheme(next: "calm" | "adventure") {
    if (next === theme) return;
    startTransition(async () => {
      await updateThemeAction(next);
      router.refresh();
    });
  }

  return (
    <div
      className="inline-flex rounded-full p-0.5 text-xs"
      style={{ border: `1px solid ${isAdventure ? "var(--t-panel-border)" : "var(--t-card-border)"}` }}
    >
      <button
        type="button"
        disabled={isPending}
        onClick={() => setTheme("calm")}
        className="hover-glow rounded-full px-3 py-1 font-medium transition-colors"
        style={theme === "calm" ? { background: "var(--t-accent)", color: "#fff" } : { color: "var(--t-ink-soft)" }}
      >
        🧘 Calm
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setTheme("adventure")}
        className="hover-glow rounded-full px-3 py-1 font-medium transition-colors"
        style={
          theme === "adventure" ? { background: "var(--t-gold)", color: "#2a1c10" } : { color: "var(--t-ink-soft)" }
        }
      >
        ⚔️ Adventure
      </button>
    </div>
  );
}
