"use client";

import { Fold } from "@/components/ui/Fold";
import { CloseIcon } from "@/components/ui/Icons";
import { useState } from "react";
import type { ImportCard } from "@/lib/data/import-cards";
import { DateField } from "@/components/ui/DateField";
import { BoardOpt, DAY_NAMES, Draft, GOLD, KINDS, KIND_ONE, Kind, OFTEN, Step, chip, dayLabel, inDays, minutesLabel, nextDow, oftenLabel, planLabel, planOptions } from "./types";
import { Choice, Choices, Question } from "./Ask";
import { BoardStep } from "./Boards";

export const MATTERS: { label: string; value: number }[] = [
  { label: "A little", value: 2 },
  { label: "Quite a bit", value: 3 },
  { label: "A lot", value: 5 },
];

export function MattersStep({ value, onPick }: { value: number | null | undefined; onPick: (v: number) => void }) {
  return (
    <>
      <Question hint="It helps the quest find its place among the rest.">How much does it matter to you?</Question>
      <Choices>
        {MATTERS.map((m) => (
          <Choice key={m.label} on={value === m.value} onClick={() => onPick(m.value)}>
            {m.label}
          </Choice>
        ))}
      </Choices>
    </>
  );
}

export function OftenStep({ draft, hint, onChange, onDone }: { draft: Draft; hint: string | null; onChange: (p: Partial<Draft>) => void; onDone: () => void }) {
  return (
    <>
      <Question hint={hint ? `The note says: ${hint}` : undefined}>How often?</Question>
      <Choices>
        {OFTEN.map((o) => (
          <Choice key={o.key} on={draft.often === o.key} onClick={() => (o.key === "days" ? onChange({ often: "days" }) : (onChange({ often: o.key }), onDone()))}>
            {o.label}
          </Choice>
        ))}
      </Choices>
      {draft.often === "days" && <DayPicker days={draft.days} onChange={(days) => onChange({ days })} onDone={onDone} />}
    </>
  );
}

export function DayPicker({ days, onChange, onDone }: { days: number[]; onChange: (d: number[]) => void; onDone?: () => void }) {
  return (
    <div className="reveal flex flex-wrap items-center gap-1.5">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = days.includes(d);
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])} className="h-9 w-12 rounded-full text-[13.5px] font-semibold" style={chip(on)}>
            {DAY_NAMES[d]}
          </button>
        );
      })}
      {onDone && days.length > 0 && (
        <button type="button" onClick={onDone} className="ml-1 h-9 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
          Next
        </button>
      )}
    </div>
  );
}

export const TIMES = [5, 15, 30, 60, 120];

export function TimeStep({ value, hint, onPick }: { value: number | null | undefined; hint: string | null; onPick: (m: number) => void }) {
  const [own, setOwn] = useState(value && !TIMES.includes(value) ? String(value) : "");
  return (
    <>
      <Question hint={hint ? `The note says: ${hint}` : undefined}>How long does it take?</Question>
      <Choices>
        {TIMES.map((m) => (
          <Choice key={m} on={value === m} onClick={() => onPick(m)}>
            {minutesLabel(m)}
          </Choice>
        ))}
      </Choices>
      <label className="flex items-center gap-2 text-[13.5px]" style={{ color: "#6b5631" }}>
        Or
        <input value={own} onChange={(e) => setOwn(e.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(e) => e.key === "Enter" && Number(own) > 0 && onPick(Number(own))} inputMode="numeric" placeholder="45" aria-label="Minutes" className="h-9 w-20 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
        minutes
        {Number(own) > 0 && (
          <button type="button" onClick={() => onPick(Number(own))} className="h-9 rounded-full px-4 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
            Next
          </button>
        )}
      </label>
    </>
  );
}

export function Review({ draft, boards, onChange, onJump }: { draft: Draft; boards: BoardOpt[]; onChange: (p: Partial<Draft>) => void; onJump: (s: Step) => void }) {
  const board = boards.find((b) => b.id === draft.boardId);
  // "How much it matters" picks right here (no separate screen for three choices).
  const [matters, setMatters] = useState(false);
  const facts: { step: Step; text: string }[] =
    draft.kind === "reward"
      ? []
      : draft.kind === "habit"
      ? [
          { step: "often", text: oftenLabel(draft) },
          { step: "time", text: draft.minutes ? minutesLabel(draft.minutes) : "Any length" },
        ]
      : [
          ...(draft.kind === "schedule" ? [{ step: "plan" as Step, text: planLabel(draft) }] : []),
          { step: "board", text: board ? board.title : "No board" },
          ...(draft.kind !== "schedule" ? [{ step: "plan" as Step, text: typeof draft.planDays === "number" || draft.due ? planLabel(draft) : "+ Plan it within…" }] : []),
          { step: "matters", text: MATTERS.find((m) => m.value === draft.importance)?.label.replace(/^./, (c) => `Matters ${c.toLowerCase()}`) ?? "+ How much it matters" },
        ];
  return (
    <>
      <Question hint="Tap anything to change it.">Ready to add</Question>
      <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Name" maxLength={200} className="h-11 rounded-xl border px-3 font-display text-[18px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
      <div className="flex flex-wrap gap-1.5">
        {facts.map((f) => (
          <button key={f.step} type="button" onClick={() => (f.step === "matters" ? setMatters((v) => !v) : onJump(f.step))} aria-expanded={f.step === "matters" ? matters : undefined} className="rounded-full px-3 py-1.5 text-[13px]" style={{ background: f.step === "matters" && matters ? "rgba(217,180,95,.25)" : "rgba(255,250,238,.7)", border: "1px solid #c8b38a", color: "#4a3a22" }}>
            {f.text}
          </button>
        ))}
      </div>
      <Fold open={matters}>
        <div className="flex flex-wrap gap-1.5">
          {MATTERS.map((m) => (
            <button key={m.label} type="button" aria-pressed={draft.importance === m.value} onClick={() => (onChange({ importance: draft.importance === m.value ? null : m.value }), setMatters(false))} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={chip(draft.importance === m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </Fold>
      <StepsList steps={draft.steps} onChange={(steps) => onChange({ steps, rewards: draft.rewards?.filter((x) => steps.includes(x)) })} kind={draft.kind} rewards={draft.rewards ?? []} onRewards={(rewards) => onChange({ rewards })} />
    </>
  );
}

export function StepsList({ steps, onChange, kind, rewards = [], onRewards }: { steps: string[]; onChange: (s: string[]) => void; kind: Kind; /** To buy: items marked to become rewards. */ rewards?: string[]; onRewards?: (r: string[]) => void }) {
  const buying = kind === "shopping" && !!onRewards;
  const [add, setAdd] = useState("");
  if (!steps.length && !add && kind === "habit") return null;
  return (
    <div className="flex flex-col gap-1">
      {steps.length > 0 && (
        <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
          {kind === "habit" ? "Sub-habits" : buying ? "Items · 🎁 makes one a reward" : "Sub-quests"}
        </span>
      )}
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span aria-hidden className="text-[10px]" style={{ color: "#b8913f" }}>
            ◆
          </span>
          <input value={s} onChange={(e) => onChange(steps.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Step ${i + 1}`} className="bare-input h-8 min-w-0 flex-1 bg-transparent px-1 text-[14.5px]" style={{ color: "#2a1c10", borderBottom: "1px solid rgba(139,112,64,.3)" }} />
          {buying && (
            // One tap: this item goes to the Treasure Chest as a reward instead of the buy list.
            <button
              type="button"
              onClick={() => onRewards!(rewards.includes(s) ? rewards.filter((x) => x !== s) : [...rewards, s])}
              aria-pressed={rewards.includes(s)}
              aria-label={rewards.includes(s) ? `${s}: back to the buy list` : `Make ${s} a reward`}
              title={rewards.includes(s) ? "A reward (tap to put it back on the list)" : "Make it a reward"}
              className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold transition-colors"
              style={rewards.includes(s) ? { background: "rgba(201,162,74,.22)", border: "1px solid #b8913f", color: "#6b4c12" } : { border: "1px dashed rgba(139,112,64,.4)", color: "#7a6440", opacity: 0.8 }}
            >
              🎁{rewards.includes(s) ? " Reward" : ""}
            </button>
          )}
          <button type="button" onClick={() => onChange(steps.filter((_, j) => j !== i))} aria-label={`Remove step ${i + 1}`} className="flex h-8 w-8 items-center justify-center rounded-full text-[16px] hover:bg-black/[.05]" style={{ color: "#7a6440" }}>
            <CloseIcon size={10} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-[13px]" style={{ color: "#b8913f" }}>
          +
        </span>
        <input
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && add.trim()) {
              onChange([...steps, add.trim()]);
              setAdd("");
            }
          }}
          placeholder={buying ? "Add an item" : "Add a sub-quest"}
          aria-label={buying ? "Add an item" : "Add a sub-quest"}
          className="bare-input h-8 min-w-0 flex-1 bg-transparent px-1 text-[14.5px]"
          style={{ color: "#2a1c10" }}
        />
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-bold uppercase tracking-[.08em]" style={{ color: GOLD }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function AllAtOnce({ draft, boards, hint, onChange }: { draft: Draft; boards: BoardOpt[]; hint: ImportCard; onChange: (p: Partial<Draft>) => void }) {
  const small = (on: boolean) => ({ ...chip(on), minHeight: 32 });
  return (
    <div className="reveal flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k.key} type="button" aria-pressed={draft.kind === k.key} onClick={() => onChange({ kind: k.key })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.kind === k.key)}>
            {KIND_ONE[k.key]}
          </button>
        ))}
      </div>
      <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="Name" maxLength={200} className="h-11 rounded-xl border px-3 font-display text-[18px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
      <textarea value={draft.description} onChange={(e) => onChange({ description: e.target.value })} aria-label="Notes" placeholder="Notes" rows={2} className="rounded-xl border px-3 py-2 text-[15px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
      {draft.kind !== "habit" ? (
        <>
          <Field label="Board">
            <BoardStep bare boards={boards} hint={null} value={draft.boardId} onPick={(boardId) => onChange({ boardId })} />
          </Field>
          <Field label="Plan it within">
            <div className="flex flex-wrap items-center gap-1.5">
              {planOptions().map((o) => (
                <button key={o.label} type="button" aria-pressed={draft.planDays === o.days} onClick={() => onChange({ planDays: draft.planDays === o.days ? null : o.days })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.planDays === o.days)}>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Due (optional)">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                ["Today", inDays(0)],
                ["Tomorrow", inDays(1)],
                ["This weekend", nextDow(6)],
                ["Next week", nextDow(1)],
              ].map(([l, d]) => (
                <button key={l} type="button" aria-pressed={draft.due === d} onClick={() => onChange({ due: draft.due === d ? null : d })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.due === d)}>
                  {l}
                </button>
              ))}
              <DateField value={draft.due ?? ""} onChange={(d) => onChange({ due: d || null })} ariaLabel="Due date" placeholder={hint.due_on ? dayLabel(hint.due_on) : "Pick a day"} className="h-8 rounded-full px-3 text-[13px]" />
            </div>
          </Field>
          <Field label="How much it matters">
            <div className="flex flex-wrap gap-1.5">
              {MATTERS.map((m) => (
                <button key={m.label} type="button" aria-pressed={draft.importance === m.value} onClick={() => onChange({ importance: draft.importance === m.value ? null : m.value })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.importance === m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </Field>
        </>
      ) : (
        <Field label={hint.repeat_text ? `How often (note: ${hint.repeat_text})` : "How often"}>
          <div className="flex flex-wrap gap-1.5">
            {OFTEN.map((o) => (
              <button key={o.key} type="button" aria-pressed={draft.often === o.key} onClick={() => onChange({ often: o.key })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.often === o.key)}>
                {o.label}
              </button>
            ))}
          </div>
          {draft.often === "days" && <DayPicker days={draft.days} onChange={(days) => onChange({ days })} />}
        </Field>
      )}
      <Field label="Time it takes">
        <div className="flex flex-wrap items-center gap-1.5">
          {TIMES.map((m) => (
            <button key={m} type="button" aria-pressed={draft.minutes === m} onClick={() => onChange({ minutes: draft.minutes === m ? null : m })} className="rounded-full px-3 text-[13px] font-semibold" style={small(draft.minutes === m)}>
              {minutesLabel(m)}
            </button>
          ))}
          <input value={draft.minutes && !TIMES.includes(draft.minutes) ? String(draft.minutes) : ""} onChange={(e) => onChange({ minutes: Number(e.target.value.replace(/\D/g, "").slice(0, 4)) || null })} inputMode="numeric" placeholder="min" aria-label="Minutes" className="h-8 w-16 rounded-full border px-2 text-center text-[14px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.75)", color: "#2a1c10" }} />
        </div>
      </Field>
      <StepsList steps={draft.steps} onChange={(steps) => onChange({ steps, rewards: draft.rewards?.filter((x) => steps.includes(x)) })} kind={draft.kind} rewards={draft.rewards ?? []} onRewards={(rewards) => onChange({ rewards })} />
    </div>
  );
}

export const URGENCY: { label: string; value: number }[] = [
  { label: "Can wait", value: 2 },
  { label: "Soonish", value: 3 },
  { label: "Pressing", value: 5 },
];

/** When to plan it by: a few clear choices, and Custom… for days, a due date and urgency. */
export function PlanStep({ draft, noted, onChange, onDone }: { draft: Draft; noted: string | null; onChange: (p: Partial<Draft>) => void; onDone: () => void }) {
  const [custom, setCustom] = useState(false);
  const [days, setDays] = useState(typeof draft.planDays === "number" ? String(draft.planDays) : "");
  const pick = (planDays: number | null) => (onChange({ planDays }), onDone());
  return (
    <>
      <Question hint="It joins your list to schedule, soonest first, and the planner finds it a time.">When should it be planned within?</Question>
      <Choices>
        {planOptions().map((o) => (
          <Choice key={o.label} on={draft.planDays === o.days} onClick={() => pick(o.days)}>
            {o.label}
          </Choice>
        ))}
        <Choice on={custom} onClick={() => setCustom(!custom)}>
          Other…
        </Choice>
        <Choice on={draft.planDays === null} onClick={() => pick(null)}>
          One day (no timeframe)
        </Choice>
      </Choices>
      <div className="drawer-body" data-open={custom || undefined}>
        <div className="drawer-inner">
          <div className="flex flex-col gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
            <label className="flex items-center gap-2 text-[14px]">
              Within
              <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="45" aria-label="Days" className="h-9 w-16 rounded-lg border px-2 text-center text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.85)", color: "#2a1c10" }} />
              days
            </label>
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              Due by
              <DateField value={draft.due ?? ""} min={inDays(0)} onChange={(d) => onChange({ due: d || null })} ariaLabel="Due date" placeholder={noted ? dayLabel(noted) : "No due date"} className="h-9 rounded-full px-3 text-[13.5px]" />
              {draft.due && (
                <button type="button" onClick={() => onChange({ due: null })} className="text-[12.5px] underline" style={{ color: "#6b5631" }}>
                  clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
              <span className="mr-1">How urgent</span>
              {URGENCY.map((u) => (
                <button key={u.label} type="button" aria-pressed={draft.urgency === u.value} onClick={() => onChange({ urgency: draft.urgency === u.value ? null : u.value })} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={chip(draft.urgency === u.value)}>
                  {u.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => (onChange({ planDays: Number(days) > 0 ? Number(days) : draft.due ? undefined : null }), onDone())} className="h-9 self-end rounded-full px-5 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10", border: "1px solid #8a6116" }}>
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
