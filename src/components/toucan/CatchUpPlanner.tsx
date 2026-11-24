import { applyAutoScheduleAction, applyCatchUpAction, courseworkAction, schedulerContextAction } from "@/app/actions";
import { SCHEDULER_DEFAULTS, planSchedule, type SchedulerSettings } from "@/lib/auto-schedule";
import { AHEAD_DAYS, catchUpOrder, catchUpPlan, looksLikeCourse, type CourseItem } from "@/lib/catch-up";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { when, Pill } from "./ActionCards";
import { hiddenCalendars } from "./PlanIt";

/**
 * Getting up to date: pick the course boards, and the plan lays them out:
 * what's coming up first (get ahead), then what was missed, from the
 * beginning. Use it to put that order on your scheduling list, then find time.
 */
export function CatchUpPlanner({ onBack, onAsk }: { onBack: () => void; onAsk: (q: string) => void }) {
  const router = useRouter();
  type Item = CourseItem & { scheduled_start: string | null };
  const [data, setData] = useState<{ boards: { id: string; title: string; dated: number }[]; items: Item[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [est, setEst] = useState<Record<string, number>>({});
  const [stage, setStage] = useState<"plan" | "applied" | "placed">("plan");
  const [proposal, setProposal] = useState<{ id: string; title: string; start: Date; end: Date }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());

  useEffect(() => {
    courseworkAction()
      .then((d) => {
        setData({ boards: d.boards, items: d.items as Item[] });
        setChosen(new Set(d.chosen?.length ? d.chosen : d.boards.filter((b) => looksLikeCourse(b.dated)).map((b) => b.id)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't read your quests."));
  }, []);

  const items = (data?.items ?? []).filter((i) => i.board_id && chosen.has(i.board_id));
  const plan = catchUpPlan(items, now);
  const order = catchUpOrder(plan);
  const minutes = (i: Item) => est[i.id] ?? i.estimate_minutes ?? 60;
  const total = (list: Item[]) => list.reduce((n, i) => n + minutes(i), 0);
  const hrs = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);
  const cycle = (i: Item) => {
    const steps = [30, 45, 60, 90, 120, 180];
    const cur = minutes(i);
    setEst((e) => ({ ...e, [i.id]: steps[(steps.indexOf(cur) + 1) % steps.length] ?? 60 }));
  };
  const fmtDue = (iso: string) => {
    const d = new Date(iso);
    const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
    const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    return days < 0 ? `was due ${day}` : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due ${day}`;
  };

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await applyCatchUpAction([...chosen], order.map((i) => i.id), Object.fromEntries(order.map((i) => [i.id, minutes(i)])));
      setStage("applied");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the plan.");
    } finally {
      setBusy(false);
    }
  }
  async function findTime() {
    setBusy(true);
    setError(null);
    try {
      const to = new Date(now);
      to.setDate(to.getDate() + SCHEDULER_DEFAULTS.horizon + 1);
      const ctx = await schedulerContextAction(now.toISOString(), to.toISOString(), hiddenCalendars());
      const settings: SchedulerSettings = { ...SCHEDULER_DEFAULTS, ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) };
      // Coming up first, then the oldest missed ones; already-scheduled ones keep their time.
      const want = order.filter((i) => !(i.scheduled_start && Date.parse(i.scheduled_start) > now.getTime())).slice(0, 10);
      const r = planSchedule(want.map((i) => ({ id: i.id, title: i.title, minutes: minutes(i), dueAt: Date.parse(i.due_at ?? "") > now.getTime() ? i.due_at : null })), ctx.busy, settings, now);
      setProposal(r.placed.map((p) => ({ id: p.id, title: p.title, start: p.start, end: p.end })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read your calendar.");
    } finally {
      setBusy(false);
    }
  }
  async function place() {
    if (!proposal?.length) return;
    setBusy(true);
    try {
      await applyAutoScheduleAction(proposal.map((p) => ({ taskId: p.id, startISO: p.start.toISOString(), endISO: p.end.toISOString() })));
      setStage("placed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't put them on the calendar.");
    } finally {
      setBusy(false);
    }
  }

  const section = (title: string, hint: string, list: Item[], start: number) =>
    list.length > 0 && (
      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.85)" }}>
            {title}
          </span>
          <span className="text-[11.5px] tabular-nums" style={{ color: "rgba(232,255,248,.6)" }}>
            {list.length} · {hrs(total(list))}
          </span>
        </span>
        <span className="text-[12px]" style={{ color: "rgba(232,255,248,.6)" }}>
          {hint}
        </span>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {list.map((i, k) => (
            <li key={i.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: "rgba(140,240,220,.06)", border: "1px solid rgba(140,240,220,.18)" }}>
              <span className="w-5 shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color: "rgba(140,240,220,.8)" }}>
                {start + k + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{i.title}</span>
                <span className="block truncate text-[11.5px]" style={{ color: "rgba(232,255,248,.6)" }}>
                  {i.board} · {i.due_at ? fmtDue(i.due_at) : "no date"}
                  {i.scheduled_start && Date.parse(i.scheduled_start) > now.getTime() ? ` · on your calendar ${when(i.scheduled_start)}` : ""}
                </span>
              </span>
              <button type="button" onClick={() => cycle(i)} title="Tap to change how long it takes" className="h-7 shrink-0 rounded-full px-2 text-[11.5px] font-bold tabular-nums" style={{ border: "1px solid rgba(140,240,220,.4)" }}>
                {hrs(minutes(i))}
              </button>
            </li>
          ))}
        </ol>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-[13px] underline underline-offset-2" style={{ color: "rgba(232,255,248,.7)" }}>
        ← Back
      </button>
      <h3 className="font-display m-0 text-[19px] leading-snug">Getting up to date</h3>
      {!data && !error && (
        <p className="m-0 text-[13.5px] italic" style={{ color: "rgba(232,255,248,.6)" }}>
          Gathering your coursework…
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {data.boards.map((b) => (
              <Pill key={b.id} strong={chosen.has(b.id)} onClick={() => setChosen((c) => (c.has(b.id) ? new Set([...c].filter((x) => x !== b.id)) : new Set([...c, b.id])))}>
                {chosen.has(b.id) ? "✓ " : ""}
                {b.title}
              </Pill>
            ))}
          </div>
          {order.length === 0 ? (
            <p className="m-0 text-[14px]">Pick the boards that hold your coursework.</p>
          ) : (
            <>
              <p className="m-0 text-[14px] leading-snug">
                The way through: first get ahead of what&rsquo;s coming up in the next {AHEAD_DAYS} days, then catch up on what was missed, from the very beginning. One at a time is plenty.
              </p>
              {section("Coming up: get ahead", "Soonest first. These keep you current.", plan.ahead, 0)}
              {section("Catching up, from the beginning", "Oldest first, so each one builds on the last.", plan.behind, plan.ahead.length)}
              {section("Further ahead", "They'll move up as their dates come near.", plan.later, plan.ahead.length + plan.behind.length)}
              {section("No date", "", plan.undated, plan.ahead.length + plan.behind.length + plan.later.length)}

              {stage === "plan" && (
                <Pill strong onClick={() => void apply()}>
                  {busy ? "Saving…" : "Use this order"}
                </Pill>
              )}
              {stage === "applied" && !proposal && (
                <div className="flex flex-col gap-1.5">
                  <p className="m-0 text-[13.5px]" style={{ color: "#bff7ea" }}>
                    Done: these are real quests now, in this order at the top of your scheduling list. Today and I will follow it too.
                  </p>
                  <span className="flex flex-wrap gap-1.5">
                    <Pill strong onClick={() => void findTime()}>
                      {busy ? "Looking at your calendar…" : "Find time for the next ten"}
                    </Pill>
                    <Pill onClick={() => onAsk("Help me begin the first assignment on my catch-up plan.")}>Help me begin the first</Pill>
                  </span>
                </div>
              )}
              {proposal && stage !== "placed" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold uppercase tracking-[.14em]" style={{ color: "rgba(140,240,220,.85)" }}>
                    Free time that fits
                  </span>
                  {proposal.length === 0 && <span className="text-[13.5px]">I couldn&rsquo;t find free time in the next two weeks. Shorter estimates may help.</span>}
                  {proposal.map((p) => (
                    <span key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate">{p.title}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: "rgba(232,255,248,.7)" }}>
                        {when(p.start.toISOString())}
                      </span>
                    </span>
                  ))}
                  {proposal.length > 0 && (
                    <Pill strong onClick={() => void place()}>
                      {busy ? "Placing…" : "Put these on my calendar"}
                    </Pill>
                  )}
                </div>
              )}
              {stage === "placed" && (
                <p className="m-0 text-[14px] leading-snug" style={{ color: "#bff7ea" }}>
                  On your calendar. When each time comes, just open it and begin. I&rsquo;ll be perched nearby. ✦
                </p>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p className="m-0 text-[13px] font-semibold" style={{ color: "#ffb4a8" }}>
          {error}
        </p>
      )}
    </div>
  );
}
