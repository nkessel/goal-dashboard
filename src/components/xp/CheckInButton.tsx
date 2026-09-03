"use client";

import { useState, useTransition } from "react";
import { dailyCheckInAction } from "@/app/actions";

export function CheckInButton({ alreadyCheckedInToday }: { alreadyCheckedInToday: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(alreadyCheckedInToday);

  function checkIn() {
    startTransition(async () => {
      try {
        const result = await dailyCheckInAction();
        if (result.alreadyCheckedInToday) {
          setMessage("Already checked in today.");
        } else {
          const streakNote = result.usedProtectionToken
            ? ` (streak protected — token used, now day ${result.streakCount})`
            : ` — streak day ${result.streakCount}`;
          setMessage(`+${result.xpAwarded} XP${streakNote}${result.award?.leveledUp ? ` 🎉 Level up to ${result.award.level}!` : ""}`);
        }
        setDone(true);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={checkIn}
        disabled={isPending || done}
        className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950 dark:text-amber-300"
      >
        {done ? "✓ Checked in" : isPending ? "Checking in…" : "☀️ Daily check-in"}
      </button>
      {message && <span className="text-zinc-500">{message}</span>}
    </div>
  );
}
