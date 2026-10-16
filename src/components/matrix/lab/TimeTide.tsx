"use client";

import { useState } from "react";
import { Portrait, type LabTask } from "./shared";

type Band = { key: string; label: string; until: number };
const H = 3_600_000;
const D = 86_400_000;

function startOfDay(t: number, add = 0) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + add);
  return d.getTime();
}

function whenLabel(at: number, now: number) {
  const diff = at - now;
  if (diff < 0) {
    const late = -diff;
    return late < H ? "just now" : late < D ? `${Math.round(late / H)}h overdue` : `${Math.round(late / D)}d overdue`;
  }
  if (diff < H) return `in ${Math.max(1, Math.round(diff / 60_000))}m`;
  if (diff < 12 * H) return `in ${Math.round(diff / H)}h`;
  return new Date(at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Time made visible (for time blindness): what's due now is big and close;
 * the further off something is, the smaller and quieter it gets, drifting
 * nearer as its day approaches. Quests without a date rest on the shore.
 */
export function TimeTide<T extends LabTask>({ tasks, now, isAdventure, onOpen }: { tasks: T[]; now: number; isAdventure: boolean; onOpen: (t: T) => void }) {
  const [shore, setShore] = useState(false);
  const bands: Band[] = [
    { key: "now", label: "Now", until: now + 3 * H },
    { key: "today", label: "Later today", until: startOfDay(now, 1) },
    { key: "tomorrow", label: "Tomorrow", until: startOfDay(now, 2) },
    { key: "week", label: "This week", until: startOfDay(now, 7) },
    { key: "next", label: "Next week", until: startOfDay(now, 14) },
    { key: "far", label: "Further out", until: Infinity },
  ];
  const at = (t: LabTask) => {
    const iso = t.due_at ?? (t.is_on_calendar ? t.scheduled_start : null);
    return iso ? new Date(iso).getTime() : null;
  };
  const dated = tasks.map((t) => ({ t, at: at(t) })).filter((x): x is { t: T; at: number } => x.at !== null).sort((a, b) => a.at - b.at);
  const undated = tasks.filter((t) => at(t) === null);
  const inBand = (i: number) => dated.filter((x) => x.at < bands[i].until && (i === 0 || x.at >= bands[i - 1].until));

  return (
    <div className="flex flex-col gap-2">
      {bands.map((b, i) => {
        const items = inBand(i);
        // Each band further away is a little smaller and quieter.
        const scale = [1, 0.88, 0.8, 0.72, 0.66, 0.6][i];
        const fade = [1, 0.96, 0.9, 0.82, 0.74, 0.66][i];
        const portrait = Math.round(44 * scale);
        return (
          <section
            key={b.key}
            aria-label={b.label}
            className="relative flex flex-col gap-2 rounded-2xl px-3.5 py-3"
            style={{
              opacity: items.length ? fade : 0.6,
              background:
                i === 0
                  ? "linear-gradient(180deg, rgba(246,220,142,.95), rgba(226,190,104,.9))"
                  : isAdventure
                    ? `rgba(236,218,180,${0.92 - i * 0.1})`
                    : `color-mix(in srgb, var(--t-card) ${100 - i * 8}%, transparent)`,
              border: i === 0 ? "2px solid #8a6116" : "1px solid rgba(139,112,64,.3)",
              boxShadow: i === 0 ? "0 0 22px rgba(242,201,76,.35)" : undefined,
            }}
          >
            <h3 className={`m-0 ${isAdventure ? "font-display" : "font-bold"}`} style={{ fontSize: 13 + 7 * scale, color: "#2a1c10" }}>
              {b.label}
              {items.length > 0 && <span className="ml-2 text-[13px] font-normal" style={{ color: "#5a4a30" }}>{items.length}</span>}
            </h3>
            {items.length === 0 ? (
              <p className="m-0 text-[13px]" style={{ color: "#5a4a30" }}>
                {i === 0 ? "Nothing pressing in the next few hours." : "Clear."}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {items.map(({ t, at: when }) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      className="hover-glow flex items-center gap-2 rounded-xl pr-3 text-left"
                      style={{
                        padding: `${4 * scale}px ${10 * scale}px ${4 * scale}px ${4 * scale}px`,
                        background: "rgba(255,250,238,.85)",
                        border: `1.5px solid ${when < now ? "#b0402c" : "#a58c66"}`,
                      }}
                    >
                      <Portrait t={t} size={portrait} />
                      <span className="flex flex-col">
                        <span className="max-w-[220px] truncate font-semibold leading-tight" style={{ fontSize: 11 + 6 * scale, color: "#2a1c10" }}>
                          {t.title}
                        </span>
                        <span className="text-[12px]" style={{ color: when < now ? "#a33a26" : "#5a4a30", fontWeight: when < now ? 700 : 400 }}>
                          {whenLabel(when, now)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="rounded-2xl px-3.5 py-2.5" style={{ border: "1px dashed rgba(139,112,64,.45)", background: isAdventure ? "rgba(236,218,180,.3)" : "transparent" }}>
        <button type="button" onClick={() => setShore((v) => !v)} aria-expanded={shore} className="text-[14px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink-soft)" }}>
          Someday shore · {undated.length} without a date {shore ? "▴" : "▾"}
        </button>
        {shore && (
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
            {undated.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpen(t)} className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12.5px]" style={{ background: "rgba(255,250,238,.6)", border: "1px solid rgba(139,112,64,.3)", color: "#4d4535" }}>
                  <Portrait t={t} size={20} />
                  <span className="max-w-[160px] truncate">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
