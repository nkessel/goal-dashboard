"use client";

import { useState, useTransition } from "react";
import { completeRiteAction, uncompleteRiteAction } from "@/app/actions";
import { useLocalDay } from "@/components/evening/evening-clock";
import { RiteEditorDialog } from "@/components/evening/RiteEditorDialog";
import type { RiteView } from "@/components/evening/EveningRites";

/**
 * Daily habits: small repeating quests on the day side (stored like evening
 * rites, in the "day" slot). Tick each one once a day for its XP. Collapsible,
 * open by default.
 */
export function DailyHabits({
  habits,
  completions,
  theme,
}: {
  habits: RiteView[];
  completions: { rite_id: string; day: string }[];
  theme: "calm" | "adventure";
}) {
  const day = useLocalDay();
  const [open, setOpen] = useState(true);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<RiteView | "new" | null>(null);
  const [pop, setPop] = useState<{ id: string; xp: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  // Only habits that fall on today (weekday of the app day, 5:30am rollover).
  const weekday = day ? new Date(`${day}T12:00:00`).getDay() : null;
  const todays = habits.filter((h) => !h.days || h.days.length === 0 || weekday === null || h.days.includes(weekday));
  const offToday = habits.length - todays.length;
  const done = (id: string) => optimistic[id] ?? completions.some((c) => c.rite_id === id && c.day === day);
  const doneCount = todays.filter((h) => done(h.id)).length;

  function toggle(h: RiteView) {
    if (!day) return;
    const next = !done(h.id);
    setError(null);
    setOptimistic((o) => ({ ...o, [h.id]: next }));
    if (next && h.xp_value > 0) {
      setPop({ id: h.id, xp: h.xp_value });
      setTimeout(() => setPop((p) => (p?.id === h.id ? null : p)), 1400);
    }
    startTransition(async () => {
      try {
        if (next) await completeRiteAction(h.id, day);
        else await uncompleteRiteAction(h.id, day);
      } catch (e) {
        setOptimistic((o) => ({ ...o, [h.id]: !next }));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  return (
    <section className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="drawer-header relative flex min-h-[58px] w-full items-center justify-center rounded-2xl px-4 py-2.5"
        style={
          isAdventure
            ? {
                background: "linear-gradient(180deg, #3a3524 0%, #2b281b 55%, #221f15 100%)",
                border: "2px solid #8d7642",
                boxShadow: "inset 0 0 0 1px rgba(242,210,126,.18), inset 0 1px 0 rgba(255,235,180,.16), inset 0 -8px 16px rgba(0,0,0,.25), 0 4px 12px rgba(0,0,0,.35)",
              }
            : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }
        }
      >
        <span className={`flex items-center gap-3 ${isAdventure ? "font-display text-[21px]" : "text-sm font-bold"}`} style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
          <HabitIcon />
          Daily Habits
          {todays.length > 0 && (
            <span className="text-[15px] tabular-nums" style={{ color: isAdventure ? "var(--t-gold)" : "var(--t-ink-soft)", fontWeight: 400 }}>
              ({doneCount}/{todays.length})
            </span>
          )}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="absolute right-5 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke={isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="drawer-body" data-open={open ? "true" : "false"}>
        <div className="drawer-inner">
          <div className="mt-2.5 rounded-2xl px-2 pb-2.5 pt-2.5" style={{ background: isAdventure ? "rgba(10,13,8,.35)" : "var(--t-bg)", boxShadow: "inset 0 6px 10px -6px rgba(0,0,0,.55), inset 0 -6px 10px -6px rgba(0,0,0,.55)" }}>
          {error && (
            <p className="m-0 px-2 pb-1 text-[13.5px]" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {todays.map((h) => {
              const d = done(h.id);
              return (
                <li
                  key={h.id}
                  className={`relative flex items-center gap-3 rounded-2xl px-3 py-2 ${isAdventure ? "parchment" : ""}`}
                  style={isAdventure ? { borderRadius: 16 } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={d}
                    aria-label={d ? `Undo ${h.title}` : `Done: ${h.title}`}
                    onClick={() => toggle(h)}
                    className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
                    style={{
                      background: d ? "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)" : "rgba(255,250,238,.6)",
                      border: `2px solid ${d ? "#2f5a26" : "#a58c66"}`,
                    }}
                  >
                    {d && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <button type="button" onClick={() => setEditing(h)} className="relative z-[1] min-w-0 flex-1 text-left" title="Edit habit">
                    <span
                      className="block text-[16px] font-semibold leading-snug"
                      style={{ color: "var(--t-ink)", textDecoration: d ? "line-through" : undefined, textDecorationColor: "rgba(80,60,20,.45)", opacity: d ? 0.7 : 1 }}
                    >
                      {h.title}
                    </span>
                    {(h.description || h.due_time || (h.days && h.days.length < 7)) && (
                      <span className="block text-[13px] leading-snug" style={{ color: "var(--t-ink-soft)" }}>
                        {[scheduleLabel(h), h.description].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                  <span className="relative z-[1] shrink-0 text-[15px] font-bold tabular-nums" style={{ color: "var(--t-xp)" }}>
                    +{h.xp_value} XP
                  </span>
                  {pop?.id === h.id && (
                    <span aria-hidden className="power-spark pointer-events-none absolute left-1/2 top-0 z-[2] text-[16px] font-bold" style={{ color: "var(--t-xp)" }}>
                      +{pop.xp} XP
                    </span>
                  )}
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="habit-add flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-[14.5px]"
                style={{ borderColor: isAdventure ? "rgba(217,180,95,.4)" : "var(--t-card-border)", color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}
              >
                <span aria-hidden className="text-[18px] leading-none" style={{ color: "var(--t-gold)" }}>
                  +
                </span>
                {habits.length === 0 ? "Add a habit" : offToday > 0 ? `Add a habit · ${offToday} not due today` : "Add a habit"}
              </button>
            </li>
          </ul>
          </div>
        </div>
      </div>

      {editing && <RiteEditorDialog rite={editing === "new" ? undefined : editing} slot="day" onClose={() => setEditing(null)} />}
    </section>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PLURAL_DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "Tuesdays · by 5:30 PM", "Mon, Wed, Fri", "by 9:00 AM". */
function scheduleLabel(h: RiteView): string | null {
  const parts: string[] = [];
  if (h.days && h.days.length > 0 && h.days.length < 7) {
    parts.push(h.days.length === 1 ? PLURAL_DAYS[h.days[0]] : h.days.map((d) => DAY_NAMES[d]).join(", "));
  }
  if (h.due_time) {
    const [hh, mm] = h.due_time.split(":").map(Number);
    parts.push(`by ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function HabitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.1 6" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 4.8l.8 4.9 4.8-1.1" stroke="var(--t-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 12.4l2.4 2.4 4.6-5" stroke="#8fc46a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
