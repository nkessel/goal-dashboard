"use client";

import { useEffect, useState, useTransition } from "react";
import { listRecentWinsAction } from "@/app/actions";
import { journalKindMeta } from "@/lib/journal-kinds";
import { eveningDayKey } from "./evening-clock";
import { Seal } from "@/components/xp/VictoriesToday";
import { SectionTitle } from "@/components/ui/Ornaments";

type Win = Awaited<ReturnType<typeof listRecentWinsAction>>[number];

const RANGES = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "Week" },
  { days: 30, label: "Month" },
] as const;


/** Start of the evening-day `daysBack` days before `day` (days run 5:30am to 5:30am). */
function sinceISO(day: string, days: number) {
  const d = new Date(`${day}T05:30:00`);
  d.setDate(d.getDate() - (days - 1));
  return d.toISOString();
}

function dayLabel(key: string, today: string) {
  if (key === today) return "Today";
  const d = new Date(`${key}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * "Celebrate today's wins": a look back at what got done — quests, rites,
 * habits, rewards, journal entries and feedback — drawn like Victories
 * Today. Today by default; reach further back with the range buttons.
 */
export function RecentWins({ day, onHide }: { day: string | null; /** Fold the tray away (small link at the bottom). */ onHide?: () => void }) {
  const [days, setDays] = useState<number>(1);
  const [wins, setWins] = useState<Win[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();

  useEffect(() => {
    if (!day) return;
    startLoading(async () => {
      try {
        setError(null);
        setWins(await listRecentWinsAction(sinceISO(day, days)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your wins.");
      }
    });
  }, [day, days]);

  // Group by the day each win belongs to (rites carry their own evening day).
  const groups = new Map<string, Win[]>();
  for (const w of wins ?? []) {
    const key = w.day ?? eveningDayKey(new Date(w.at));
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  const totalXp = (wins ?? []).reduce((n, w) => n + (w.xp ?? 0), 0);

  // Feedback is one line per day ("Feedback submitted ×n"), like Victories Today.
  type Row = { id: string; seal: "check" | "star" | "gift"; label: React.ReactNode; xp: number };
  const rowsFor = (list: Win[]): Row[] => {
    const feedback = list.filter((w) => w.kind === "feedback");
    const rows: Row[] = list
      .filter((w) => w.kind !== "feedback")
      .map((w) => {
        const sub = w.kind === "journal" ? journalKindMeta(w.sub) : null;
        return {
          id: w.id,
          seal: w.kind === "reward" ? "gift" : w.kind === "journal" ? "star" : "check",
          xp: w.xp ?? 0,
          label: (
            <>
              {(w.kind === "rite" || w.kind === "habit" || w.kind === "journal") && (
                <span style={{ color: "var(--t-ink-soft)" }}>{w.kind === "rite" ? "Evening rite: " : w.kind === "habit" ? "Habit: " : sub ? `${sub.label}: ` : "Journal: "}</span>
              )}
              {w.kind === "reward" && <span style={{ color: "var(--t-ink-soft)" }}>Treasure accepted: </span>}
              {w.title}
            </>
          ),
        };
      });
    if (feedback.length)
      rows.push({
        id: `fb-${feedback[0].id}`,
        seal: "check",
        xp: feedback.reduce((n, w) => n + (w.xp ?? 0), 0),
        label: (
          <>
            {feedback.length > 1 && <span style={{ color: "var(--t-ink-soft)" }}>{feedback.length} × </span>}
            Feedback
          </>
        ),
      });
    return rows;
  };

  const victories = [...groups.values()].reduce((n, list) => n + rowsFor(list).length, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col items-center gap-1 text-center">
        <SectionTitle as="h3" tone="ink" size={21}>
          {days === 1 ? "Victories Today" : "Recent Victories"}
        </SectionTitle>
        <span className="text-[14.5px]" style={{ color: "var(--t-ink)" }}>
          {days === 1 ? "Today\u2019s XP" : "XP"}: <span className="font-semibold tabular-nums">{totalXp}</span>
          {wins && wins.length > 0 && (
            <span style={{ color: "var(--t-ink-soft)" }}>
              {" "}
              · {victories} {victories === 1 ? "victory" : "victories"}
            </span>
          )}
        </span>
      </div>
      <div role="group" aria-label="How far back" className="flex flex-wrap items-center justify-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={days === r.days}
            className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
            style={{ background: days === r.days ? "rgba(217,180,95,.5)" : "rgba(70,50,20,.08)", border: `1.5px solid ${days === r.days ? "#a88a3f" : "transparent"}`, color: "var(--t-ink)" }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="m-0 text-[14px]" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
      {wins === null || (isLoading && wins.length === 0) ? (
        <p className="m-0 py-2 text-center text-[15px] italic" style={{ color: "var(--t-ink-soft)" }}>
          Gathering your wins…
        </p>
      ) : wins.length === 0 ? (
        <p className="m-0 py-2 text-center text-[15.5px] italic" style={{ color: "var(--t-ink-soft)" }}>
          {days === 1 ? "Nothing logged yet today — even small steps count. Try a longer look back." : "Nothing logged in this stretch."}
        </p>
      ) : (
        <div className={`flex max-h-[min(50vh,420px)] flex-col gap-1 overflow-y-auto overscroll-contain pr-1 ${isLoading ? "opacity-60" : ""}`}>
          {[...groups.entries()].map(([key, list]) => (
            <div key={key}>
              {(days > 1 || key !== day) && (
                <p className="font-display m-0 mt-1 text-center text-[16px]" style={{ color: "#5a4520" }}>
                  {day ? dayLabel(key, day) : key}
                </p>
              )}
              <ul className="m-0 flex list-none flex-col p-0">
                {rowsFor(list).map((row, i) => (
                  <li
                    key={row.id}
                    className="flex min-h-[44px] items-center gap-3 py-2 text-[16.5px]"
                    style={{ color: "var(--t-ink)", ...(i ? { borderTop: "1px solid rgba(139,112,64,.35)" } : null) }}
                  >
                    <Seal kind={row.seal} />
                    <span className="min-w-0 flex-1 break-words leading-snug">{row.label}</span>
                    {row.xp > 0 && (
                      <span className="shrink-0 text-[16px]" style={{ color: "var(--t-ink)" }}>
                        +{row.xp} XP
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {onHide && (
        <button type="button" onClick={onHide} className="mx-auto mt-1 rounded-full px-3 py-1 text-[13px] underline-offset-2 hover:underline" style={{ color: "var(--t-ink-soft)" }}>
          Hide victories
        </button>
      )}
    </div>
  );
}
