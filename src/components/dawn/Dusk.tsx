"use client";

import { useEffect, useState } from "react";
import { schedulerContextAction } from "@/app/actions";
import { Fold } from "@/components/ui/Fold";
import { addDays, chapterFor, clock12, dealt, minsOf, type Stone } from "@/lib/dawn";
import { useDawn } from "./useDawn";
import { DawnSettings } from "./DawnSettings";
import { GILT, GearButton, Offering, Pill, StonePicker, TimePill, dur, keepAboveKeyboard } from "./parts";

const CREAM = "#efe3c2";
const DIM = "#cbbd93";
const WAKES = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00"];

function hiddenCalendars(): string[] {
  try {
    const raw = window.localStorage.getItem("calendar-layers");
    return raw ? ((JSON.parse(raw) as { hidden?: string[] }).hidden ?? []) : [];
  } catch {
    return [];
  }
}

/** Tomorrow's first commitment on your calendars (after `from`, before 2pm), or null. */
function useFirstCommitment(day: string, from: string | undefined) {
  const [first, setFirst] = useState<{ at: number; title: string } | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const start = new Date(`${day}T${from ?? "04:00"}:00`);
    const end = new Date(`${day}T14:00:00`);
    schedulerContextAction(start.toISOString(), end.toISOString(), hiddenCalendars(), day).then(
      (r) => {
        if (!live) return;
        const next = r.busy.filter((b) => b.start >= start.getTime() && b.start < end.getTime()).sort((a, b) => a.start - b.start)[0];
        setFirst(next ? { at: next.start, title: next.title ?? "Busy" } : null);
      },
      () => live && setFirst(null)
    );
    return () => {
      live = false;
    };
  }, [day, from]);
  return first;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Tomorrow's dawn, chosen tonight (owner, Nov 9: "I like planning it the night before… deciding
 * the earliest wake time feels important too"). Sits at the top of Prepare for tomorrow's day:
 * your earliest wake time, tomorrow's first commitment and the room between them, the stones that
 * fit (✨ Fill my time), one line for tomorrow-you, and a wax seal.
 */
export function DuskPlan({ day }: { day: string }) {
  const tomorrow = addDays(day, 1);
  const { dawn, patchDay, saveSettings } = useDawn(day);
  const [gear, setGear] = useState(false);
  const t = dawn?.days[tomorrow] ?? {};
  const first = useFirstCommitment(tomorrow, dawn?.on.wake ? t.wake : undefined);
  const [cue, setCue] = useState<string | null>(null);
  if (!dawn || !(dawn.on.plan || dawn.on.wake)) return null;
  const on = dawn.on;
  const until = t.leave ? minsOf(t.leave) : first ? minsOf(hhmm(first.at)) : null;
  const room = t.wake && until != null && until > minsOf(t.wake) ? until - minsOf(t.wake) : null;
  const lib = new Map(dawn.stones.map((s) => [s.id, s]));
  const chosen = (t.stones ?? []).filter((id) => lib.has(id));
  const week = on.week ? chapterFor(dawn, tomorrow) : null;

  return (
    <div className="mb-3 flex flex-col gap-2.5 rounded-2xl px-3 pb-3 pt-2" style={{ background: "rgba(255,250,238,.05)", border: "1px solid rgba(217,180,95,.3)", color: CREAM }}>
      <div className="flex items-center gap-2">
        <span className="font-display text-[16px]" style={{ color: "#f3d98d" }}>
          ☀️ Tomorrow&apos;s morning routine
        </span>
        {t.sealed && <span className="text-[12.5px]" style={{ color: DIM }}>sealed ✦</span>}
        <span className="ml-auto">
          <GearButton dark open={gear} onClick={() => setGear((g) => !g)} />
        </span>
      </div>
      <Fold open={gear}>
        <div className="rounded-xl px-2.5 pb-1 pt-1" style={{ background: "#fffaf0", border: "1px solid #c9a24a" }}>
          <DawnSettings dawn={dawn} save={saveSettings} day={tomorrow} />
        </div>
      </Fold>

      {on.wake && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px]" style={{ color: DIM }}>
            Earliest wake time
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {WAKES.map((w) => (
              <Pill key={w} sm dark on={t.wake === w} onClick={() => patchDay(tomorrow, { wake: t.wake === w ? undefined : w })}>
                {clock12(w)}
              </Pill>
            ))}
            <TimePill dark value={t.wake && !WAKES.includes(t.wake) ? t.wake : undefined} onChange={(v) => patchDay(tomorrow, { wake: v })} label="Another wake time" />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: DIM }}>
            <span>
              {first === undefined
                ? "Looking at tomorrow's calendar…"
                : first
                  ? `First: ${clock12(hhmm(first.at))} ${first.title}`
                  : "Nothing on your calendar before 2pm"}
            </span>
            <span className="flex items-center gap-1">
              Leave at
              <TimePill dark value={t.leave} onChange={(v) => patchDay(tomorrow, { leave: v })} label="Leave time (optional)" placeholder="—" />
              {t.leave && (
                <button type="button" onClick={() => patchDay(tomorrow, { leave: undefined })} className="text-[12px] underline decoration-dotted">
                  clear
                </button>
              )}
            </span>
          </div>
          {room != null && (
            <p className="reveal m-0 text-[14px]" style={{ color: CREAM }}>
              ✦ About <b>{dur(room)}</b> for your morning routine{t.leave ? " before you leave" : first ? ` before ${first.title}` : ""}.
            </p>
          )}
        </div>
      )}

      {on.plan && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px]" style={{ color: DIM }}>
            Tomorrow&apos;s stones{chosen.length ? "" : " (tap in the order you'll walk them)"}
          </span>
          {week && (
            <span className="text-[13px]" style={{ color: DIM }}>
              {week.chapter.emoji} This week: <b style={{ color: CREAM }}>{week.chapter.title}</b>
              {week.chapter.practice ? ` · ${week.chapter.practice}` : ""} (it leads the path)
            </span>
          )}
          <StonePicker
            dark
            stones={dawn.stones}
            chosen={chosen}
            room={room}
            onChange={(ids) => patchDay(tomorrow, { stones: ids, sealed: undefined })}
            onAdd={(s: Stone) => (saveSettings({ stones: [...dawn.stones, s] }), patchDay(tomorrow, { stones: [...chosen, s.id] }))}
          />
          <input
            value={cue ?? t.cue ?? ""}
            onChange={(e) => setCue(e.target.value)}
            onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
            onBlur={() => cue !== null && (patchDay(tomorrow, { cue: cue.trim() || undefined }), setCue(null))}
            placeholder="A line for tomorrow-you (e.g. After coffee, I'll stretch)"
            aria-label="A line for tomorrow morning"
            maxLength={140}
            className="bare-input h-9 border-b bg-transparent px-1 text-[16px] outline-none sm:text-[14px]"
            style={{ borderColor: "rgba(217,180,95,.45)", color: CREAM }}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => patchDay(tomorrow, { sealed: !t.sealed, ...(cue !== null ? { cue: cue.trim() || undefined } : {}) })}
              disabled={!chosen.length}
              className="flex h-10 items-center gap-2 rounded-full pl-1.5 pr-4 text-[14.5px] font-semibold disabled:opacity-40"
              style={t.sealed ? { background: "rgba(255,250,238,.1)", border: "1px solid rgba(217,180,95,.5)", color: CREAM } : GILT}
            >
              <span className="dawn-wax" style={{ width: 30, height: 30, fontSize: 12 }} aria-hidden>
                ✦
              </span>
              {t.sealed ? "Sealed · change it" : "Seal tomorrow's morning"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tonight (owner, Nov 9): your planner's evening reflections (what went right, magical moments,
 * what you're looking forward to…) and one evening offering card. A quiet bar that slides open.
 */
export function DuskEvening({ day }: { day: string }) {
  const { dawn, patchDay, tick } = useDawn(day);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!dawn) return null;
  const on = dawn.on;
  const prompts = on.pmPrompts ? dawn.prompts.filter((p) => p.on) : [];
  const d = dawn.days[day] ?? {};
  const cards = on.offerPm ? dealt(dawn, day, "pm", d.pmDraw ?? 0, on.hand ? 3 : 1) : [];
  if (!prompts.length && !cards.length) return null;
  const answered = prompts.filter((p) => (d.answers?.[p.id] ?? "").trim()).length;
  const picked = d.pmCard ? (dawn.cards.find((c) => c.id === d.pmCard) ?? null) : null;

  return (
    <section className="rounded-2xl" style={{ background: "rgba(8,10,30,.35)", border: "1px solid rgba(217,180,95,.2)", color: CREAM }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-4 text-left">
        <span className="font-display text-[16px]" style={{ color: "#f3d98d" }}>
          🌙 Tonight
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: DIM }}>
          {answered ? `${answered === 1 ? "1 reflection" : `${answered} reflections`} written${d.pmTook ? " · offering taken" : ""}` : "reflections and an offering"}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined, color: DIM }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Fold open={open}>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {cards.length > 0 && (
            <Offering
              dark
              label="Tonight's offering"
              cards={cards}
              hand={on.hand}
              chosen={picked}
              took={!!d.pmTook}
              done={!!d.pmDone}
              onPick={(c) => patchDay(day, { pmCard: c.id })}
              onAnother={() => patchDay(day, { pmDraw: (d.pmDraw ?? 0) + 1, pmCard: undefined })}
              onTake={() => patchDay(day, { pmTook: true, pmCard: picked?.id ?? cards[0].id })}
              onDone={(v) => tick(day, { extra: "pmCard" }, v)}
            />
          )}
          {prompts.map((p) => (
            <label key={p.id} className="flex flex-col gap-1">
              <span className="text-[14px]" style={{ color: "#f3d98d" }}>
                {p.q}
              </span>
              <textarea
                value={draft[p.id] ?? d.answers?.[p.id] ?? ""}
                onChange={(e) => setDraft((x) => ({ ...x, [p.id]: e.target.value }))}
                onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
                onBlur={() => draft[p.id] !== undefined && patchDay(day, { answers: { [p.id]: draft[p.id] } })}
                rows={1}
                className="bare-input min-h-9 resize-none border-b bg-transparent px-1 py-1 text-[16px] leading-snug outline-none [field-sizing:content] sm:text-[14.5px]"
                style={{ borderColor: "rgba(217,180,95,.4)", color: CREAM }}
              />
            </label>
          ))}
        </div>
      </Fold>
    </section>
  );
}
