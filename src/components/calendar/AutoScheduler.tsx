"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/data/types";
import { applyAutoScheduleAction, saveSchedulerSettingsAction, schedulerContextAction } from "@/app/actions";
import { SCHEDULER_DEFAULTS, clockOf, planSchedule, type Busy, type SchedulerSettings, type TimeOfDay } from "@/lib/auto-schedule";
import { useEscape } from "@/lib/use-escape";

const LOCAL_KEY = "auto-schedule";
const TIMES: { v: TimeOfDay; label: string; hint: string }[] = [
  { v: "any", label: "Any", hint: "Whenever there's room" },
  { v: "morning", label: "AM", hint: "Mornings" },
  { v: "afternoon", label: "PM", hint: "Afternoons (12–5)" },
  { v: "evening", label: "Eve", hint: "Evenings (after 5)" },
];
const HOURS = Array.from({ length: 19 }, (_, i) => (i + 5) * 60); // 5 AM … 11 PM
const CAPS = [60, 120, 180, 240, 360, 480];

function readLocal(): Partial<SchedulerSettings> | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<SchedulerSettings>) : null;
  } catch {
    return null;
  }
}
function hiddenCalendars(): string[] {
  try {
    const raw = window.localStorage.getItem("calendar-layers");
    return raw ? ((JSON.parse(raw) as { hidden?: string[] }).hidden ?? []) : [];
  } catch {
    return [];
  }
}
const dayLabel = (d: Date) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
};
const hm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * One tap from the scheduling list to a planned fortnight: every quest on the
 * list, in its order, gets the first free time that suits it. You see the
 * whole plan first, nudge it, then place it all at once.
 */
export function AutoScheduler({ tasks, theme, onClose }: { tasks: Task[]; theme: "calm" | "adventure"; onClose: () => void }) {
  useEscape(() => onClose());
  const router = useRouter();
  const isAdventure = theme === "adventure";
  const [settings, setSettings] = useState<SchedulerSettings | null>(null);
  const [busy, setBusy] = useState<Busy[] | null>(null);
  const [google, setGoogle] = useState(true);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [applying, startApplying] = useTransition();
  // Planning starts from the moment the planner opens.
  const [now] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    const to = new Date(now);
    to.setDate(to.getDate() + SCHEDULER_DEFAULTS.horizon + 1);
    schedulerContextAction(now.toISOString(), to.toISOString(), hiddenCalendars())
      .then((ctx) => {
        if (!live) return;
        setBusy(ctx.busy);
        setGoogle(ctx.google);
        setSettings({ ...SCHEDULER_DEFAULTS, ...(readLocal() ?? {}), ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) });
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read your calendar."));
    return () => {
      live = false;
    };
  }, [now]);

  // Saved a moment after the last change (here and on your account).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function change(patch: Partial<SchedulerSettings>) {
    setSettings((s) => {
      const next = { ...(s ?? SCHEDULER_DEFAULTS), ...patch };
      try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void saveSchedulerSettingsAction(next).catch(() => {}), 700);
      return next;
    });
  }
  const setPref = (id: string, v: TimeOfDay) => settings && change({ prefs: { ...settings.prefs, [id]: v } });

  // Quests already on the calendar ahead keep their time.
  const items = useMemo(
    () =>
      tasks
        .filter((t) => !(t.is_on_calendar && t.scheduled_start && new Date(t.scheduled_start) > now))
        .filter((t) => !skipped.has(t.id))
        .map((t) => ({ id: t.id, title: t.title, minutes: t.estimate_minutes, effort: t.effort ?? null, dueAt: t.due_at ?? null })),
    [tasks, skipped, now]
  );
  const plan = useMemo(() => (settings && busy ? planSchedule(items, busy, settings, now) : null), [items, busy, settings, now]);
  const byDay = useMemo(() => {
    const groups: { label: string; rows: NonNullable<typeof plan>["placed"] }[] = [];
    for (const p of [...(plan?.placed ?? [])].sort((a, b) => a.start.getTime() - b.start.getTime())) {
      const label = dayLabel(p.start);
      const g = groups[groups.length - 1];
      if (g && g.label === label) g.rows.push(p);
      else groups.push({ label, rows: [p] });
    }
    return groups;
  }, [plan]);

  function apply() {
    if (!plan?.placed.length) return;
    setError(null);
    startApplying(async () => {
      try {
        const res = await applyAutoScheduleAction(plan.placed.map((p) => ({ taskId: p.id, startISO: p.start.toISOString(), endISO: p.end.toISOString() })));
        setDone(res.done);
        router.refresh();
        setTimeout(onClose, 1600);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't place them.");
      }
    });
  }

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const gold = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  const select = "h-9 rounded-lg border px-1.5 text-[15px]";
  const selectStyle = { borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: ink };
  const taskOf = new Map(tasks.map((t) => [t.id, t]));

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[62] flex items-end justify-center p-0 sm:items-center sm:p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Auto-schedule"
        onClick={(e) => e.stopPropagation()}
        className={`card-pop-in flex max-h-[92svh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl ${isAdventure ? "parchment parchment-framed" : ""}`}
        style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
      >
        <div className="relative z-[1] flex items-start gap-2 px-4 pb-2 pt-3.5">
          <div className="min-w-0 flex-1">
            <h3 className={`m-0 ${isAdventure ? "font-display text-[21px]" : "text-[17px] font-bold"}`} style={{ color: ink }}>
              ✨ Auto-schedule
            </h3>
            <p className="m-0 text-[13.5px] leading-snug" style={{ color: soft }}>
              Your list, in order, placed into free time{google ? " around your Google calendars" : ""}. Look it over, nudge anything, then place it all.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[24px] leading-none hover:bg-black/[.06]" style={{ color: soft }}>
            ×
          </button>
        </div>

        {settings && (
          <div className="relative z-[1] mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2 text-[13.5px]" style={{ background: isAdventure ? "rgba(120,90,40,.1)" : "var(--t-bg)", color: ink }}>
            <label className="flex items-center gap-1.5">
              <span style={{ color: soft }}>Between</span>
              <select aria-label="Start of the day" value={settings.dayStart} onChange={(e) => change({ dayStart: Math.min(Number(e.target.value), settings.dayEnd - 60) })} className={select} style={selectStyle}>
                {HOURS.map((m) => (
                  <option key={m} value={m}>
                    {clockOf(m)}
                  </option>
                ))}
              </select>
              <span style={{ color: soft }}>and</span>
              <select aria-label="End of the day" value={settings.dayEnd} onChange={(e) => change({ dayEnd: Math.max(Number(e.target.value), settings.dayStart + 60) })} className={select} style={selectStyle}>
                {HOURS.map((m) => (
                  <option key={m} value={m}>
                    {clockOf(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span style={{ color: soft }}>Up to</span>
              <select aria-label="Most quest time on one day" value={settings.maxPerDay} onChange={(e) => change({ maxPerDay: Number(e.target.value) })} className={select} style={selectStyle}>
                {CAPS.map((m) => (
                  <option key={m} value={m}>
                    {m / 60}h
                  </option>
                ))}
              </select>
              <span style={{ color: soft }}>a day</span>
            </label>
            <label className="flex min-h-9 items-center gap-1.5">
              <input type="checkbox" checked={settings.skipWeekends} onChange={(e) => change({ skipWeekends: e.target.checked })} className="h-4 w-4" />
              Keep weekends free
            </label>
          </div>
        )}

        <div className="relative z-[1] flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
          {!plan && !error && (
            <p className="m-0 py-8 text-center text-[14.5px] italic" style={{ color: soft }}>
              Reading your calendar…
            </p>
          )}
          {plan && plan.placed.length === 0 && plan.unplaced.length === 0 && (
            <p className="m-0 py-8 text-center text-[14.5px]" style={{ color: soft }}>
              Everything on the list already has a time. 🎉
            </p>
          )}
          {byDay.map((g) => (
            <section key={g.label} className="flex flex-col gap-1">
              <h4 className={`m-0 ${isAdventure ? "font-display text-[16px]" : "text-[13.5px] font-bold uppercase tracking-wide"}`} style={{ color: isAdventure ? "#6b4f1d" : soft }}>
                {g.label}
              </h4>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {g.rows.map((p) => {
                  const t = taskOf.get(p.id);
                  const pref = settings?.prefs[p.id] ?? "any";
                  return (
                    <li key={p.id} className="fade-in flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-2.5 py-2" style={{ background: isAdventure ? "rgba(255,250,238,.55)" : "var(--t-bg)", border: "1px solid rgba(139,112,64,.25)" }}>
                      <span className="w-[92px] shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: isAdventure ? "#6b4f1d" : "var(--t-accent)" }}>
                        {hm(p.start)} – {hm(p.end)}
                      </span>
                      <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug" style={{ color: ink }}>
                        {p.title}
                        {p.late && (
                          <span className="ml-1.5 whitespace-nowrap text-[12px] font-bold" style={{ color: "var(--t-warn)" }}>
                            after its due date
                          </span>
                        )}
                        {p.split && (
                          <span className="ml-1.5 whitespace-nowrap text-[12px]" style={{ color: soft }}>
                            first {Math.round((p.end.getTime() - p.start.getTime()) / 3_600_000)}h of {Math.round(((t?.estimate_minutes ?? 0) / 60) * 10) / 10}h
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span role="radiogroup" aria-label={`When for ${p.title}`} className="flex rounded-full p-0.5" style={{ background: "rgba(120,90,40,.12)" }}>
                          {TIMES.map((o) => (
                            <button
                              key={o.v}
                              type="button"
                              role="radio"
                              aria-checked={pref === o.v}
                              title={o.hint}
                              onClick={() => setPref(p.id, o.v)}
                              className="h-7 rounded-full px-2 text-[12px] font-semibold"
                              style={pref === o.v ? { background: gold, color: isAdventure ? "#2a1c10" : "#fff" } : { color: soft }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </span>
                        <button type="button" onClick={() => setSkipped((s) => new Set(s).add(p.id))} aria-label={`Leave ${p.title} out of this plan`} title="Leave it out this time" className="flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none hover:bg-black/[.06]" style={{ color: soft }}>
                          ×
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {plan && plan.unplaced.length > 0 && (
            <section className="flex flex-col gap-1">
              <h4 className="m-0 text-[13.5px] font-bold" style={{ color: "var(--t-warn)" }}>
                Didn&rsquo;t fit
              </h4>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {plan.unplaced.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 text-[14px]" style={{ color: ink }}>
                    <span className="min-w-0 flex-1 truncate">{u.title}</span>
                    <span className="shrink-0 text-[12.5px]" style={{ color: soft }}>
                      {u.why}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[12.5px]" style={{ color: soft }}>
                Try a longer day, a higher daily limit, or &ldquo;Any&rdquo; time.
              </p>
            </section>
          )}
          {skipped.size > 0 && (
            <button type="button" onClick={() => setSkipped(new Set())} className="self-start text-[13px] underline" style={{ color: soft }}>
              Bring back the {skipped.size} left out
            </button>
          )}
          {error && (
            <p className="m-0 text-[14px] font-semibold" style={{ color: "var(--t-warn)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="relative z-[1] flex items-center gap-2 border-t px-4 py-3" style={{ borderColor: "rgba(139,112,64,.3)" }}>
          {done !== null ? (
            <p className="card-pop-in m-0 flex-1 text-center text-[16px] font-bold" style={{ color: isAdventure ? "#3f6a2c" : "var(--t-good)" }}>
              ✓ {done === 1 ? "1 quest placed" : `${done} quests placed`}. Your days have a shape.
            </p>
          ) : (
            <>
              <button type="button" onClick={onClose} className="h-11 rounded-full px-4 text-[14.5px] underline" style={{ color: soft }}>
                Not now
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={applying || !plan?.placed.length}
                className="hover-glow ml-auto h-11 rounded-full px-6 text-[15px] font-bold disabled:opacity-50"
                style={{ background: gold, color: isAdventure ? "#2a1c10" : "#fff" }}
              >
                {applying ? "Placing…" : plan?.placed.length ? `Place ${plan.placed.length} on the calendar` : "Place on the calendar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
