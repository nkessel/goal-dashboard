import { type PlanTarget } from "./talk";
import { getQuestForEditAction, scheduleTaskAction, schedulerContextAction, setQuestEstimateAction } from "@/app/actions";
import { SCHEDULER_DEFAULTS, planSchedule, type Busy, type SchedulerSettings } from "@/lib/auto-schedule";
import { openFocusMode } from "@/lib/focus-timer";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Pill } from "./ActionCards";

const MINUTES = [15, 30, 45, 60, 90, 120, 180];

const slotLabel = (d: Date, e: Date) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === tomorrow.toDateString() ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (x: Date) => x.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(d)}–${t(e)}`;
};

export function hiddenCalendars(): string[] {
  try {
    const raw = window.localStorage.getItem("calendar-layers");
    return raw ? ((JSON.parse(raw) as { hidden?: string[] }).hidden ?? []) : [];
  } catch {
    return [];
  }
}

/** The ladder for one quest: how long → when → (now, or later). */
export function PlanIt({ quest, onDone }: { quest: PlanTarget; onDone: () => void }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<number | null>(quest.estimate);
  const [stage, setStage] = useState<"estimate" | "when" | "placed">(quest.estimate ? "when" : "estimate");
  const [slots, setSlots] = useState<{ start: Date; end: Date }[] | null>(null);
  const [placed, setPlaced] = useState<{ start: Date; end: Date } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== "when" || !minutes) return;
    let live = true;
    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + 15);
    schedulerContextAction(now.toISOString(), to.toISOString(), hiddenCalendars())
      .then((ctx) => {
        if (!live) return;
        const settings: SchedulerSettings = { ...SCHEDULER_DEFAULTS, ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) };
        const blocking: Busy[] = [...ctx.busy];
        const found: { start: Date; end: Date }[] = [];
        // The first three free stretches that suit it, each after the last.
        for (let k = 0; k < 3; k++) {
          const r = planSchedule([{ id: quest.id, title: quest.title, minutes, dueAt: quest.dueAt }], blocking, settings, now);
          const p = r.placed[0];
          if (!p) break;
          found.push({ start: p.start, end: p.end });
          // Block that stretch plus the rest of its half-day, so the next option is a real alternative.
          blocking.push({ start: p.start.getTime(), end: p.end.getTime() + 3 * 3_600_000 });
        }
        setSlots(found);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read your calendar."));
    return () => {
      live = false;
    };
  }, [stage, minutes, quest.id, quest.title, quest.dueAt]);

  async function choose(m: number) {
    setMinutes(m);
    setError(null);
    setStage("when");
    setSlots(null);
    if (m !== quest.estimate) void setQuestEstimateAction(quest.id, m).catch(() => {});
  }
  async function place(s: { start: Date; end: Date }) {
    setBusy(true);
    setError(null);
    try {
      await scheduleTaskAction(quest.id, s.start.toISOString(), s.end.toISOString());
      setPlaced(s);
      setStage("placed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't put it on the calendar.");
    } finally {
      setBusy(false);
    }
  }
  async function startNow() {
    const t = await getQuestForEditAction(quest.id).catch(() => null);
    if (t) openFocusMode(minutes ? { ...t, estimate_minutes: minutes } : t);
    onDone();
  }

  const rung = (n: number, label: string, on: boolean, done: boolean) => (
    <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[.12em]" style={{ color: on ? "#bff7ea" : done ? "rgba(140,240,220,.75)" : "rgba(232,255,248,.4)" }}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]" style={{ background: done ? "rgba(140,240,220,.85)" : on ? "rgba(140,240,220,.25)" : "transparent", color: done ? "#08241f" : undefined, border: "1px solid rgba(140,240,220,.5)" }}>
        {done ? "✓" : n}
      </span>
      {label}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onDone} className="self-start text-[13px] underline underline-offset-2" style={{ color: "rgba(232,255,248,.7)" }}>
        ← Back
      </button>
      <h3 className="font-display m-0 text-[19px] leading-snug" style={{ color: "#e8fff8" }}>
        {quest.title}
      </h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {rung(1, "Estimate", stage === "estimate", stage !== "estimate")}
        {rung(2, "Give it a time", stage === "when", stage === "placed")}
        {rung(3, "Do it", stage === "placed", false)}
      </div>

      {stage === "estimate" && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14.5px]">How long will it take, roughly? A guess is fine.</p>
          <span className="flex flex-wrap gap-1.5">
            {MINUTES.map((m) => (
              <Pill key={m} strong={minutes === m} onClick={() => void choose(m)}>
                {m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? "hour" : "hours"}`}
              </Pill>
            ))}
          </span>
        </div>
      )}

      {stage === "when" && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14.5px]">
            {minutes} minutes.{" "}
            <button type="button" onClick={() => setStage("estimate")} className="underline underline-offset-2" style={{ color: "rgba(232,255,248,.7)" }}>
              Change
            </button>{" "}
            Here&rsquo;s free time that fits:
          </p>
          {slots === null && !error && (
            <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
              Looking at your calendar…
            </p>
          )}
          {slots?.length === 0 && <p className="m-0 text-[14px]">I couldn&rsquo;t find a free stretch in the next two weeks. Try a shorter estimate, or start a piece of it now.</p>}
          {slots?.map((s) => (
            <button key={s.start.toISOString()} type="button" disabled={busy} onClick={() => void place(s)} className="flex min-h-11 items-center justify-between rounded-2xl px-3.5 text-left text-[14.5px] font-semibold disabled:opacity-60" style={{ background: "rgba(140,240,220,.1)", border: "1px solid rgba(140,240,220,.4)" }}>
              {slotLabel(s.start, s.end)}
              <span className="text-[12.5px] font-bold" style={{ color: "#bff7ea" }}>
                Put it here →
              </span>
            </button>
          ))}
          <Pill onClick={() => void startNow()}>Or just start now</Pill>
        </div>
      )}

      {stage === "placed" && placed && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[15px] leading-snug">
            On your calendar: <b>{slotLabel(placed.start, placed.end)}</b>. When the time comes, open it and begin; I&rsquo;ll be perched nearby.
          </p>
          <span className="flex flex-wrap gap-1.5">
            <Pill strong onClick={() => void startNow()}>
              Start it now instead
            </Pill>
            <Pill onClick={onDone}>Done</Pill>
          </span>
        </div>
      )}

      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "#ffb4a8" }}>
          {error}
        </p>
      )}
    </div>
  );
}
