"use client";

import { useState } from "react";
import { driveWords, saveQuestDrive, useQuestDrive } from "@/lib/use-quest-cal";

const PICKS = [10, 15, 20, 30, 45, 60];

/**
 * Driving time to a quest's place, each way (owner, Nov 12: "the option for driving time is crucial, in the
 * location part of the UI"). The calendar keeps that much time free before and after the quest.
 * The same pills as the editor's Time: a few picks, then Other with a bare number.
 */
export function DrivePicks({ taskId }: { taskId: string }) {
  const drive = useQuestDrive(taskId);
  const [other, setOther] = useState(() => !!drive && !PICKS.includes(drive));
  const set = (m: number | null) => void saveQuestDrive(taskId, m).catch(() => {});
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-0.5 flex items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
          <span aria-hidden>🚗</span> Drive
        </span>
        {PICKS.map((m) => (
          <button key={m} type="button" aria-pressed={drive === m && !other} onClick={() => (setOther(false), set(drive === m && !other ? null : m))} className="qe-fact h-8 rounded-full px-2.5 text-[13px] font-semibold" data-open={drive === m && !other ? "true" : undefined}>
            {driveWords(m)}
          </button>
        ))}
        <button type="button" aria-pressed={other} onClick={() => setOther((o) => !o)} className="qe-fact h-8 rounded-full px-2.5 text-[13px] font-semibold" data-open={other ? "true" : undefined}>
          Other
        </button>
        {other && (
          <span className="flex items-center gap-1 text-[13px]" style={{ color: "var(--t-ink)" }}>
            <input
              autoFocus
              inputMode="numeric"
              defaultValue={drive ?? ""}
              aria-label="Minutes of driving each way"
              onBlur={(e) => set(Number(e.target.value.replace(/\D/g, "")) || null)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLInputElement).blur())}
              className="bare-input w-12 border-b text-center text-[16px]"
              style={{ borderColor: "rgba(168,138,63,.7)", background: "transparent" }}
            />
            min
          </span>
        )}
      </div>
      <span className="text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
        {drive ? `Each way: the calendar keeps ${driveWords(drive)} free before and after.` : "Each way: the calendar keeps it free before and after."}
      </span>
    </div>
  );
}
