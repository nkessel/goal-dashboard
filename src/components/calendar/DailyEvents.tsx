"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Fold } from "@/components/ui/Fold";
import { dailyEvents, MEAL_NAMES, type DailyEvent, type MealKey, type SchedulerSettings } from "@/lib/auto-schedule";
import { formatLocal } from "@/lib/calendar-dates";
import { getSavedSettings, saveDailyEvent, subscribeSavedSettings } from "@/lib/day-holds";

/**
 * The daily events kept free on the calendar (meals, the wind-down, the tidy, and your own), edited for
 * every day: name, emoji, the window it floats in and its length (owner, Nov 14: rename "Wind-down" to
 * "End of day routine", or add something else). Used in a hold's menu and under the calendar's gear.
 */

const clock = (m: number) => {
  const d = new Date(2000, 0, 1, 0, 0);
  d.setMinutes(((m % 1440) + 1440) % 1440);
  return formatLocal(d, { hour: "numeric", minute: "2-digit" });
};
const chip = "h-8 rounded-full px-2.5 text-[12.5px] font-semibold";
const line = { border: "1px solid #b39a6a" } as const;
const lit = { background: "var(--t-gold, #e2bb5c)", border: "1px solid #8a6116", color: "#2a1c10" } as const;

/** The scheduler settings as they stand here (saved from this screen, else the page's). */
export function useDailySettings(base: Partial<SchedulerSettings> | null | undefined) {
  const saved = useSyncExternalStore(subscribeSavedSettings, getSavedSettings, () => null);
  return (saved ?? base ?? null) as Partial<SchedulerSettings> | null;
}

/** One daily event's every-day options, folded open in place. */
export function DailyEventEditor({ base, ev, onDone }: { base: Partial<SchedulerSettings> | null | undefined; ev: DailyEvent; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(ev.name);
  const [icon, setIcon] = useState(ev.icon);
  const [problem, setProblem] = useState("");
  const save = (patch: Parameters<typeof saveDailyEvent>[2]) => {
    setProblem("");
    saveDailyEvent((base ?? null) as Record<string, unknown> | null, ev.key, patch)
      .then(() => router.refresh())
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Couldn't save"));
  };
  const saveWords = () => {
    const n = name.trim();
    const i = icon.trim();
    const builtIn = !ev.own ? MEAL_NAMES[ev.key as MealKey] : null;
    if (n !== ev.name || i !== ev.icon) save({ name: n && n !== builtIn ? n : undefined, icon: i || undefined });
  };
  const step = (k: "from" | "to", by: number) => {
    const from = k === "from" ? Math.max(0, Math.min(ev.from + by, ev.to - 15)) : ev.from;
    const to = k === "to" ? Math.min(24 * 60, Math.max(ev.to + by, ev.from + 15)) : ev.to;
    const minutes = Math.min(ev.minutes, to - from);
    const ideal = ev.ideal != null ? Math.max(from, Math.min(ev.ideal, to - minutes)) : undefined;
    save({ from, to, minutes, ideal });
  };
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
  };
  return (
    <div className="relative z-[1] flex flex-col gap-1.5 rounded-lg px-1.5 py-1.5" style={{ background: "rgba(120,90,40,.08)", color: "#2a1c10" }} onKeyDown={(e) => e.stopPropagation()}>
      <span className="flex items-center gap-1.5">
        <input
          aria-label="Its emoji"
          value={icon}
          maxLength={4}
          onChange={(e) => setIcon(e.target.value)}
          onBlur={saveWords}
          onKeyDown={keys}
          className="bare-input h-8 w-9 shrink-0 bg-transparent text-center text-[17px] outline-none"
          style={{ borderBottom: "1px solid rgba(168,138,63,.55)" }}
        />
        <input
          aria-label="Its name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveWords}
          onKeyDown={keys}
          className="bare-input font-display h-8 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          style={{ borderBottom: "1px solid rgba(168,138,63,.55)" }}
        />
      </span>
      <span className="px-0.5 text-[12px]" style={{ color: "#6b5631" }}>
        Every day, somewhere between
      </span>
      {(["from", "to"] as const).map((k) => (
        <span key={k} className="flex items-center gap-1">
          <button type="button" onClick={() => step(k, -15)} className={chip} style={line} aria-label={`${k === "from" ? "Start" : "End"} 15 minutes earlier`}>
            −15
          </button>
          <span className="min-w-[64px] flex-1 text-center font-bold tabular-nums">
            <span className="mr-1 text-[11.5px] font-normal" style={{ color: "#6b5631" }}>
              {k === "from" ? "from" : "until"}
            </span>
            {clock(ev[k])}
          </span>
          <button type="button" onClick={() => step(k, 15)} className={chip} style={line} aria-label={`${k === "from" ? "Start" : "End"} 15 minutes later`}>
            +15
          </button>
        </span>
      ))}
      <span className="flex flex-wrap gap-1">
        {[15, 30, 45, 60, 90].map((m) => (
          <button key={m} type="button" disabled={m > ev.to - ev.from} onClick={() => save({ minutes: m })} aria-pressed={m === ev.minutes} className={`${chip} disabled:opacity-35`} style={m === ev.minutes ? lit : line}>
            {m < 60 ? `${m}m` : m === 90 ? "1½h" : "1h"}
          </button>
        ))}
      </span>
      <span className="flex items-center justify-between gap-2 pt-0.5">
        {ev.own ? (
          <button type="button" onClick={() => (save({ gone: true }), onDone?.())} className="h-8 rounded-lg px-1.5 text-[12.5px]" style={{ color: "#8a3f2c" }}>
            Remove it
          </button>
        ) : (
          <button type="button" onClick={() => save({ on: !ev.on })} className="h-8 rounded-lg px-1.5 text-[12.5px]" style={{ color: ev.on ? "#8a3f2c" : "#2f6b3a" }}>
            {ev.on ? "Turn off every day" : "Turn on every day"}
          </button>
        )}
        {onDone && (
          <button type="button" onClick={() => (saveWords(), onDone())} className={chip} style={line}>
            Close
          </button>
        )}
      </span>
      {problem && (
        <span role="alert" className="px-0.5 text-[12px]" style={{ color: "#8a3f2c" }}>
          {problem}
        </span>
      )}
    </div>
  );
}

/** Every daily event as a list (under the calendar's gear): tap one to change it, "+ Add a daily event" for your own. */
export function DailyEventsList({ base }: { base: Partial<SchedulerSettings> | null | undefined }) {
  const settings = useDailySettings(base);
  const all = dailyEvents(settings);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const add = () => {
    const n = (adding ?? "").trim();
    setAdding(null);
    if (!n) return;
    const key = `e:${Date.now().toString(36)}`;
    void saveDailyEvent((settings ?? null) as Record<string, unknown> | null, key, { on: true, from: 9 * 60, to: 11 * 60, minutes: 30, ideal: 9 * 60, name: n }).catch(() => {});
    setOpen(key);
  };
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5" style={{ color: "var(--t-ink)" }}>
      <span className="text-[13.5px]">Daily events</span>
      {all.map((ev) => (
        <div key={ev.key} className="flex flex-col">
          <button
            type="button"
            aria-expanded={open === ev.key}
            onClick={() => setOpen((o) => (o === ev.key ? null : ev.key))}
            className="flex h-8 items-center gap-1.5 rounded-lg px-1 text-left text-[13px]"
            style={{ opacity: ev.on ? 1 : 0.5, background: open === ev.key ? "rgba(217,180,95,.2)" : undefined }}
          >
            <span aria-hidden className="w-5 shrink-0 text-center">
              {ev.icon}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{ev.name}</span>
            <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--t-ink-soft)" }}>
              {ev.on ? `${clock(ev.from)}–${clock(ev.to)}` : "Off"}
            </span>
          </button>
          <Fold open={open === ev.key}>
            <DailyEventEditor key={`${ev.key}:${ev.name}:${ev.icon}`} base={settings} ev={ev} />
          </Fold>
        </div>
      ))}
      {adding === null ? (
        <button type="button" onClick={() => setAdding("")} className="mt-0.5 h-8 rounded-lg px-1 text-left text-[13px] font-semibold" style={{ border: "1px dashed rgba(139,112,64,.5)", color: "var(--t-ink-soft)" }}>
          + Add a daily event
        </button>
      ) : (
        <input
          autoFocus
          aria-label="New daily event's name"
          placeholder="Its name, e.g. End of day routine"
          value={adding}
          maxLength={40}
          onChange={(e) => setAdding(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") add();
            if (e.key === "Escape") setAdding(null);
          }}
          className="bare-input mt-0.5 h-8 bg-transparent px-1 text-[13px] outline-none"
          style={{ borderBottom: "1px solid rgba(168,138,63,.55)" }}
        />
      )}
    </div>
  );
}
