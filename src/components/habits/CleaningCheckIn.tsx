"use client";

import { useState, useTransition } from "react";
import { saveCleaningAction } from "@/app/actions";
import { freshKey } from "@/lib/quest-drafts";
import {
  CHORE_ICONS,
  MESS_STYLES,
  SPACE_ICONS,
  addDays,
  choreDueOn,
  choreFromNeed,
  choreIsDue,
  choreNeed,
  dayLabel,
  daysBetween,
  laundryNow,
  levelOfTen,
  messNow,
  styleOf,
  todaysPicks,
  type Chore,
  type Cleaning,
  type MessStyle,
  type Space,
} from "@/lib/cleaning";
import { LaundryRun } from "./LaundryRun";
import { MessBattle } from "./MessBattle";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const chipOn = (on: boolean): React.CSSProperties => ({ background: on ? "rgba(217,180,95,.5)" : "rgba(255,250,238,.55)", boxShadow: on ? "inset 0 0 0 1.5px #a88a3f" : "inset 0 0 0 1px rgba(139,112,64,.35)", color: "var(--t-ink)" });
const field: React.CSSProperties = { background: "rgba(255,255,255,.7)", border: "1px solid rgba(139,112,64,.4)", color: "var(--t-ink)" };
const gold: React.CSSProperties = { background: "var(--t-gold)", color: "#2a1c10" };

/** Keeps a press inside the check-in from starting a drag of the habit row. */
const holdStill = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/** One line of the list: a space, the laundry bin or a chore, each with its drag bar (0 nothing to do … 10 needs you). */
type Item = { kind: "space" | "laundry" | "chore"; id: string; icon: string; name: string; value: number; note: string; ends: [string, string] };

function itemsOf(c: Cleaning, day: string): Item[] {
  const style = styleOf(c.style);
  const l = laundryNow(c.laundry, day);
  const readToday = c.laundry.readings.find((r) => r.on === day)?.fill ?? null;
  return [
    ...c.spaces.map((s): Item => {
      const m = messNow(s, day);
      return { kind: "space", id: s.id, icon: s.icon, name: s.name, value: m, note: style.words[levelOfTen(m)], ends: [style.glyphs[0], style.glyphs[2]] };
    }),
    {
      kind: "laundry",
      id: "laundry",
      icon: "🧺",
      name: "Laundry",
      value: ((readToday ?? l.fill ?? 0) / 4) * 10,
      note: l.dueOn === null ? "slide it now and then; I'll predict the next load" : l.daysLeft! <= 0 ? "a load is due" : `next load ${dayLabel(l.dueOn, day)}`,
      ends: ["empty", "full"],
    },
    ...c.chores.map((ch): Item => {
      const snoozed = ch.snoozedUntil && ch.snoozedUntil > day;
      const dueOn = choreDueOn(ch, day);
      const when = snoozed ? `💤 until ${dayLabel(ch.snoozedUntil!, day)}` : choreIsDue(ch, day) ? (dueOn < day ? `due since ${ago(dueOn, day)}` : "due today") : `next ${dayLabel(dueOn, day)}`;
      return { kind: "chore", id: ch.id, icon: ch.icon, name: ch.name, value: choreNeed(ch, day), note: when, ends: ["done", "due"] };
    }),
  ];
}

const key = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;

/**
 * The cleaning list under the cleaning habit: every space, the laundry bin
 * and every chore in one list, each with a drag bar, the one that needs you
 * most on top. Once the habit is ticked, it asks about today's pick.
 */
export function CleaningCheckIn({ initial, day, habitDone, isAdventure, open }: { initial: Cleaning; day: string; habitDone: boolean; isAdventure: boolean; /** The tray, opened from the habit's title. */ open: boolean }) {
  const [c, setC] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The order is set when the list opens, so a row doesn't jump away while you drag it.
  const [order, setOrder] = useState<string[]>(() => itemsOf(initial, day).sort((a, b) => b.value - a.value).map(key));
  const [editing, setEditing] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  // A load under way (kept on this device) shows its steps straight away.
  const [running, setRunning] = useState(() => {
    try {
      return !!window.localStorage.getItem("laundry-run");
    } catch {
      return false;
    }
  });

  function save(next: Cleaning) {
    const before = c;
    setC(next);
    setError(null);
    startTransition(async () => {
      try {
        await saveCleaningAction(next);
      } catch (e) {
        setC(before);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  const picks = todaysPicks(c, day);
  const top = picks[0] ?? null;
  // After the 20 minutes: one question about what you cleaned, until something is logged today.
  const loggedToday = (c.battles ?? []).some((b) => b.on === day) || c.spaces.some((s) => s.ratedOn === day && (s.mess ?? 5) < 2.5) || c.chores.some((ch) => ch.lastDone === day) || c.laundry.loads.at(-1) === day;
  const [answered, setAnswered] = useState(false);
  const askAfter = habitDone && !answered && !loggedToday && top;
  // Fighting back the mess in a space: the before-and-after log, opened in place.
  const [battle, setBattle] = useState<string | null>(null);
  const battleSpace = battle ? (c.spaces.find((s) => s.id === battle) ?? null) : null;
  const battleNode = () =>
    battleSpace && (
      <MessBattle key={battleSpace.id} c={c} space={battleSpace} day={day} startBefore={Math.round(messNow(battleSpace, day))} onLogged={(next) => (setC(next), setAnswered(true))} onClose={() => setBattle(null)} />
    );

  const setSpace = (id: string, patch: Partial<Space>) => save({ ...c, spaces: c.spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const setChore = (id: string, patch: Partial<Chore>) => save({ ...c, chores: c.chores.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch)) });
  const choreDone = (id: string) => setChore(id, { lastDone: day, snoozedUntil: null });
  const loadDone = () => save({ ...c, laundry: { readings: [...c.laundry.readings.filter((r) => r.on !== day), { on: day, fill: 0 }].slice(-30), loads: [...c.laundry.loads.filter((d) => d !== day), day].slice(-20) } });
  const snooze = (id: string, days: number) => {
    setSnoozing(null);
    setChore(id, { snoozedUntil: addDays(day, Math.max(1, Math.min(365, Math.round(days)))) });
  };

  function drag(it: Item, v: number) {
    if (it.kind === "space") setSpace(it.id, { mess: v, level: levelOfTen(v), ratedOn: day });
    else if (it.kind === "laundry") save({ ...c, laundry: { ...c.laundry, readings: [...c.laundry.readings.filter((r) => r.on !== day), { on: day, fill: Math.round((v / 10) * 40) / 10 }].slice(-30) } });
    else {
      const ch = c.chores.find((x) => x.id === it.id);
      if (ch) save({ ...c, chores: c.chores.map((x) => (x.id === ch.id ? choreFromNeed(ch, v, day) : x)) });
    }
  }

  function add(kind: "space" | "chore") {
    const name = adding.trim();
    if (!name) return;
    const id = freshKey(kind === "space" ? "s" : "c");
    if (kind === "space") save({ ...c, spaces: [...c.spaces, { id, name: name.slice(0, 40), icon: "✨", level: 1, mess: 5, ratedOn: day, driftDays: null }] });
    else save({ ...c, chores: [...c.chores, { id, name: name.slice(0, 48), icon: "✨", everyDays: 7, lastDone: null, snoozedUntil: null }] });
    setOrder((o) => [...o, `${kind}:${id}`]);
    setAdding("");
  }

  const items = itemsOf(c, day);
  const byKey = new Map(items.map((i) => [key(i), i]));
  const list = [...order.filter((k) => byKey.has(k)), ...items.map(key).filter((k) => !order.includes(k))].map((k) => byKey.get(k)!);
  const topKey = top ? `${top.kind}:${top.id}` : null;

  const box = isAdventure ? { background: "linear-gradient(180deg, rgba(250,240,214,.96), rgba(238,222,186,.96))", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)" } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  return (
    <div {...holdStill}>
      {/* After the 20 minutes, one question, right under the habit (tray open or not). */}
      {askAfter && top && (
        <div className="reveal ml-7 mt-1 rounded-xl px-2.5 py-1.5" style={box}>
          {battle && top.kind === "space" && battle === top.id ? (
            battleNode()
          ) : (
            <AfterQuestion pick={top} onFight={() => setBattle(top.id)} onDone={() => (setAnswered(true), top.kind === "laundry" ? loadDone() : choreDone(top.id))} onDismiss={() => setAnswered(true)} />
          )}
        </div>
      )}
      <div className="drawer-body" data-open={open ? "true" : "false"}>
        <div className="drawer-inner" inert={!open}>
          <div className="ml-7 mt-1 flex flex-col rounded-xl px-2.5 py-1.5" style={box}>
            {error && (
              <p className="m-0 pb-1 text-[13px]" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col p-0">
              {list.map((it, i) => {
                const k = key(it);
                const space = it.kind === "space" ? c.spaces.find((s) => s.id === it.id) : undefined;
                const chore = it.kind === "chore" ? c.chores.find((x) => x.id === it.id) : undefined;
                const due = chore ? choreIsDue(chore, day) : false;
                return (
                  <li key={k} className="flex flex-col py-1" style={{ borderTop: i ? "1px solid rgba(139,112,64,.18)" : undefined }}>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => (it.kind === "laundry" ? setRunning((r) => !r) : setEditing(editing === k ? null : k))} className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left" title={it.kind === "laundry" ? "Start a load" : "Edit"}>
                        <span aria-hidden className="text-[16px]">{it.icon}</span>
                        <span className="text-[14px] leading-snug" style={{ color: "var(--t-ink)", fontWeight: k === topKey ? 700 : 600 }}>
                          {it.name}
                        </span>
                        <span className="min-w-0 truncate text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                          {it.note}
                        </span>
                      </button>
                      {k === topKey && (
                        <span className="shrink-0 rounded-full px-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: "rgba(217,180,95,.45)", color: "#6a4a10" }}>
                          today
                        </span>
                      )}
                      {chore && due && (
                        <button type="button" onClick={() => setSnoozing(snoozing === k ? null : k)} aria-expanded={snoozing === k} aria-label={`Snooze ${chore.name}`} title="Snooze" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]" style={{ opacity: snoozing === k ? 1 : 0.7, background: snoozing === k ? "rgba(217,180,95,.45)" : undefined }}>
                          💤
                        </button>
                      )}
                    </div>
                    <Bar value={it.value} ends={it.ends} label={it.kind === "laundry" ? "How full is the laundry bin?" : it.kind === "space" ? `How messy is ${it.name}?` : `How much does ${it.name} need doing?`} onCommit={(v) => drag(it, v)} />
                    {chore && snoozing === k && <SnoozeRow name={chore.name} onSnooze={(d) => snooze(chore.id, d)} />}
                    {it.kind === "laundry" && (
                      <div className="drawer-body" data-open={running ? "true" : "false"}>
                        <div className="drawer-inner" inert={!running}>
                          {running && (
                            <div className="pt-1">
                              <LaundryRun
                                onClose={() => setRunning(false)}
                                onFolded={() => {
                                  setRunning(false);
                                  loadDone();
                                }}
                              />
                              <button type="button" onClick={() => (setRunning(false), loadDone())} className="mt-1 h-7 px-1 text-[12.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
                                Already did one? Count it
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {space && editing === k && <SpaceEditor s={space} day={day} onSet={(patch) => setSpace(space.id, patch)} onRemove={() => (setEditing(null), save({ ...c, spaces: c.spaces.filter((x) => x.id !== space.id) }))} onClose={() => setEditing(null)} />}
                    {chore && editing === k && <ChoreEditor ch={chore} onSet={(patch) => setChore(chore.id, patch)} onRemove={() => (setEditing(null), save({ ...c, chores: c.chores.filter((x) => x.id !== chore.id) }))} onClose={() => setEditing(null)} />}
                  </li>
                );
              })}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                add("chore");
              }}
              className="flex gap-1.5 pt-1"
            >
              <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Add a space or chore" aria-label="Add a space or chore" className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[13.5px]" style={{ background: "rgba(255,255,255,.6)", border: "1px dashed rgba(139,112,64,.5)", color: "var(--t-ink)" }} />
              {adding.trim() && (
                <>
                  <button type="button" onClick={() => add("space")} className="h-8 rounded-full px-2.5 text-[13px] font-semibold" style={chipOn(false)} title="A place that gets messy">
                    Space
                  </button>
                  <button type="submit" className="h-8 rounded-full px-2.5 text-[13px] font-semibold" style={gold} title="Something that comes round again">
                    Chore
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The drag bar: moves freely, saved when you let go. */
function Bar({ value, ends, label, onCommit }: { value: number; ends: [string, string]; label: string; onCommit: (v: number) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? value;
  const commit = () => {
    if (drag !== null && Math.abs(drag - value) >= 0.05) onCommit(drag);
    setDrag(null);
  };
  const word = (e: string) => /^[a-z]/.test(e);
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className={`w-8 shrink-0 text-center leading-none ${word(ends[0]) ? "text-[11px]" : "text-[13px]"}`} style={{ color: "var(--t-ink-soft)", letterSpacing: word(ends[0]) ? undefined : "-0.12em" }}>
        {ends[0]}
      </span>
      <input
        type="range"
        min={0}
        max={10}
        step={0.1}
        value={v}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label={label}
        className="mess-bar h-7 min-w-0 flex-1"
        style={{ "--p": `${v * 10}%` } as React.CSSProperties}
      />
      <span aria-hidden className={`w-8 shrink-0 text-center leading-none ${word(ends[1]) ? "text-[11px]" : "text-[13px]"}`} style={{ color: "var(--t-ink-soft)", letterSpacing: word(ends[1]) ? undefined : "-0.12em" }}>
        {ends[1]}
      </span>
    </div>
  );
}

function SnoozeRow({ name, onSnooze }: { name: string; onSnooze: (days: number) => void }) {
  const [custom, setCustom] = useState("3");
  const btn = "h-8 rounded-full px-3 text-[13px]";
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5" role="group" aria-label={`Snooze ${name}`}>
      <button type="button" onClick={() => onSnooze(1)} className={btn} style={chipOn(false)}>
        A day
      </button>
      <button type="button" onClick={() => onSnooze(7)} className={btn} style={chipOn(false)}>
        A week
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(custom) >= 1) onSnooze(Number(custom));
        }}
        className="flex items-center gap-1 text-[13px]"
        style={{ color: "var(--t-ink)" }}
      >
        <input type="number" min={1} max={365} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Days to snooze" className="h-8 w-12 rounded-lg px-1 text-center text-[14px]" style={field} />
        days
        <button type="submit" className={btn} style={gold}>
          OK
        </button>
      </form>
    </div>
  );
}

function SpaceEditor({ s, day, onSet, onRemove, onClose }: { s: Space; day: string; onSet: (p: Partial<Space>) => void; onRemove: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1 pt-1">
      <input defaultValue={s.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && onSet({ name: e.target.value.trim().slice(0, 40) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-8 rounded-lg px-2 text-[14px]" style={field} />
      <IconRow icons={SPACE_ICONS} value={s.icon} onPick={(icon) => onSet({ icon })} />
      <label className="flex flex-wrap items-center gap-1.5 text-[13px]" style={{ color: "var(--t-ink)" }}>
        Gets messier on its own
        <select value={s.driftDays ?? 0} onChange={(e) => onSet({ driftDays: Number(e.target.value) || null, mess: messNow(s, day), ratedOn: day })} className="h-8 rounded-lg px-1.5 text-[13px]" style={field}>
          <option value={0}>no, only when I say</option>
          {[1, 2, 3, 4, 5, 7, 10, 14].map((n) => (
            <option key={n} value={n}>
              a bit every {n === 1 ? "day" : `${n} days`}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-between">
        <button type="button" onClick={onClose} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={gold}>
          Close
        </button>
        <button type="button" onClick={onRemove} className="h-8 px-2 text-[13px] underline" style={{ color: "var(--t-warn)" }}>
          Remove
        </button>
      </div>
    </div>
  );
}

function ChoreEditor({ ch, onSet, onRemove, onClose }: { ch: Chore; onSet: (p: Partial<Chore>) => void; onRemove: () => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1 pt-1">
      <input defaultValue={ch.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== ch.name && onSet({ name: e.target.value.trim().slice(0, 48) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-8 rounded-lg px-2 text-[14px]" style={field} />
      <IconRow icons={CHORE_ICONS} value={ch.icon} onPick={(icon) => onSet({ icon })} />
      {/* Repeats every N days, or on one day of the week (trash night). */}
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Repeats on">
        {WEEKDAYS.map((w, i) => (
          <button key={w} type="button" role="radio" aria-checked={ch.weekday === i} onClick={() => onSet({ weekday: ch.weekday === i ? null : i })} title={`Every ${w}`} className="flex h-8 w-9 items-center justify-center rounded-full text-[12.5px] font-semibold" style={chipOn(ch.weekday === i)}>
            {w.slice(0, 2)}
          </button>
        ))}
      </div>
      {ch.weekday == null && (
        <label className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--t-ink)" }}>
          Or every
          <input type="number" min={1} max={366} inputMode="numeric" defaultValue={ch.everyDays} onBlur={(e) => Number(e.target.value) >= 1 && onSet({ everyDays: Math.round(Number(e.target.value)) })} className="h-8 w-14 rounded-lg px-1.5 text-center" style={field} />
          days
        </label>
      )}
      <div className="flex justify-between">
        <button type="button" onClick={onClose} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={gold}>
          Close
        </button>
        <button type="button" onClick={onRemove} className="h-8 px-2 text-[13px] underline" style={{ color: "var(--t-warn)" }}>
          Remove
        </button>
      </div>
    </div>
  );
}

function AfterQuestion({ pick, onFight, onDone, onDismiss }: { pick: ReturnType<typeof todaysPicks>[number]; onFight: () => void; onDone: () => void; onDismiss: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 text-[13.5px] leading-snug" style={{ color: "var(--t-ink)" }}>
        {pick.kind === "space" ? (
          <>
            Nice work! How much of the mess in <b>{pick.icon} {pick.name}</b> did you fight back?
          </>
        ) : pick.kind === "laundry" ? (
          <>Nice work! Did a load of laundry get done?</>
        ) : (
          <>
            Nice work! Did you finish <b>{pick.icon} {pick.name}</b>?
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {pick.kind === "space" ? (
          <button type="button" onClick={onFight} className="flex h-8 items-center gap-1 rounded-full px-3 text-[14px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            ⚔ Before and after
          </button>
        ) : (
          <button type="button" onClick={onDone} className="flex h-8 items-center gap-1 rounded-full px-3 text-[14px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            ✓ Done
          </button>
        )}
        <button type="button" onClick={onDismiss} className="h-8 px-2 text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
          Not yet
        </button>
      </div>
    </div>
  );
}

/** How the mess levels are drawn (also in Settings › Mess check-in). */
export function MessStylePicker({ value, onPick, compact = false }: { value: MessStyle; onPick: (s: MessStyle) => void; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-ink-soft)" }}>
        Show messes as
      </p>
      <div role="radiogroup" aria-label="Show messes as" className={compact ? "flex flex-wrap gap-1" : "flex flex-col gap-1"}>
        {MESS_STYLES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={value === s.key}
            onClick={() => onPick(s.key)}
            title={s.label}
            className={`flex items-center gap-1.5 rounded-lg px-2 text-left ${compact ? "h-8 text-[13px]" : "min-h-11 text-[14px]"}`}
            style={{ background: value === s.key ? "rgba(217,180,95,.4)" : "rgba(255,250,238,.45)", boxShadow: value === s.key ? "inset 0 0 0 1.5px #a88a3f" : "inset 0 0 0 1px rgba(139,112,64,.3)", color: "var(--t-ink)" }}
          >
            {compact ? (
              <span aria-hidden>{s.mark}</span>
            ) : (
              <span aria-hidden className="w-[92px] shrink-0 whitespace-nowrap" style={{ letterSpacing: "-0.12em" }}>
                {s.glyphs.join(" ")}
              </span>
            )}
            <span className="font-semibold">{s.label}</span>
            {!compact && (
              <span className="text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                {s.words.join(" → ")}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconRow({ icons, value, onPick }: { icons: string[]; value: string; onPick: (i: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1">
      {icons.map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} onClick={() => onPick(i)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[16px]" style={{ background: value === i ? "rgba(217,180,95,.45)" : "transparent", boxShadow: value === i ? "inset 0 0 0 1.5px #a88a3f" : undefined }}>
          {i}
        </button>
      ))}
    </div>
  );
}

/** "yesterday", "3 days ago", "2 weeks ago". */
function ago(d: string, today: string): string {
  const n = daysBetween(d, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 14) return `${n} days ago`;
  return `${Math.round(n / 7)} weeks ago`;
}
