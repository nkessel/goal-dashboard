"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateThemeAction } from "@/app/actions";

export function ThemeToggle({ theme }: { theme: "calm" | "adventure" }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function setTheme(next: "calm" | "adventure") {
    if (next === theme) return;
    startTransition(async () => {
      await updateThemeAction(next);
      router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-full border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setTheme("calm")}
        className={`rounded-full px-3 py-1 font-medium transition-colors ${
          theme === "calm" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"
        }`}
      >
        🧘 Calm
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setTheme("adventure")}
        className={`rounded-full px-3 py-1 font-medium transition-colors ${
          theme === "adventure" ? "bg-amber-500 text-white" : "text-zinc-500"
        }`}
      >
        ⚔️ Adventure
      </button>
    </div>
  );
}
