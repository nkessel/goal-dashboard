"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
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
type Item = { kind: "space" | "laundry" | "chore"; id: string; icon: string; name: string; value: number; note: string; ends: [React.ReactNode, React.ReactNode] };

function itemsOf(c: Cleaning, day: string): Item[] {
  const style = styleOf(c.style);
  const l = laundryNow(c.laundry, day);
  const readToday = c.laundry.readings.find((r) => r.on === day)?.fill ?? null;
  return [
    ...c.spaces.map((s): Item => {
      const m = messNow(s, day);
      return { kind: "space", id: s.id, icon: s.icon, name: s.name, value: m, note: style.words[levelOfTen(m)], ends: [<TidyIcon key="t" />, <MessIcon key="m" />] };
    }),
    {
      kind: "laundry",
      id: "laundry",
      icon: "🧺",
      name: "Laundry",
      value: ((readToday ?? l.fill ?? 0) / 4) * 10,
      // No guessing the next load for now (owner, Nov 3): just how full it is.
      note: (readToday ?? l.fill ?? 0) >= 3.2 ? "ready for a load" : "",
      ends: [<BinIcon key="e" full={false} />, <BinIcon key="f" full />],
    },
    ...c.chores.map((ch): Item => {
      const snoozed = ch.snoozedUntil && ch.snoozedUntil > day;
      const dueOn = choreDueOn(ch, day);
      const when = snoozed ? `💤 until ${dayLabel(ch.snoozedUntil!, day)}` : choreIsDue(ch, day) ? (dueOn < day ? `due since ${ago(dueOn, day)}` : "due today") : `next ${dayLabel(dueOn, day)}`;
      return { kind: "chore", id: ch.id, icon: ch.icon, name: ch.name, value: choreNeed(ch, day), note: when, ends: [<DoneIcon key="d" />, <DueIcon key="u" />] };
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

  // Rows sort themselves as you set them (owner, Nov 3), gliding to their new places, the neediest on top.
  const listRef = useRef<HTMLUListElement>(null);
  const before = useRef<Map<string, number> | null>(null);
  const resort = (next: Cleaning) => {
    const el = listRef.current;
    if (el) before.current = new Map([...el.querySelectorAll<HTMLElement>("[data-row]")].map((r) => [r.dataset.row!, r.getBoundingClientRect().top]));
    setOrder(itemsOf(next, day).sort((a, b) => b.value - a.value).map(key));
  };
  useLayoutEffect(() => {
    const el = listRef.current;
    const was = before.current;
    before.current = null;
    if (!el || !was || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const r of el.querySelectorAll<HTMLElement>("[data-row]")) {
      const from = was.get(r.dataset.row!);
      if (from === undefined) continue;
      const dy = from - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      r.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }, [order]);

  function drag(it: Item, v: number) {
    let next: Cleaning = c;
    if (it.kind === "space") next = { ...c, spaces: c.spaces.map((s) => (s.id === it.id ? { ...s, mess: v, level: levelOfTen(v), ratedOn: day } : s)) };
    else if (it.kind === "laundry") next = { ...c, laundry: { ...c.laundry, readings: [...c.laundry.readings.filter((r) => r.on !== day), { on: day, fill: Math.round((v / 10) * 40) / 10 }].slice(-30) } };
    else {
      const ch = c.chores.find((x) => x.id === it.id);
      if (ch) next = { ...c, chores: c.chores.map((x) => (x.id === ch.id ? choreFromNeed(ch, v, day) : x)) };
    }
    save(next);
    resort(next);
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
            <ul ref={listRef} className="m-0 flex list-none flex-col p-0">
              {list.map((it, i) => {
                const k = key(it);
                const space = it.kind === "space" ? c.spaces.find((s) => s.id === it.id) : undefined;
                const chore = it.kind === "chore" ? c.chores.find((x) => x.id === it.id) : undefined;
                const due = chore ? choreIsDue(chore, day) : false;
                return (
                  <li key={k} data-row={k} className="relative flex flex-col py-1" style={{ borderTop: i ? "1px solid rgba(139,112,64,.18)" : undefined, background: "inherit" }}>
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
function Bar({ value, ends, label, onCommit }: { value: number; ends: [React.ReactNode, React.ReactNode]; label: string; onCommit: (v: number) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? value;
  const commit = () => {
    if (drag !== null && Math.abs(drag - value) >= 0.05) onCommit(drag);
    setDrag(null);
  };
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className="flex w-8 shrink-0 items-center justify-center leading-none" style={{ color: "#2a2318" }}>
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
      <span aria-hidden className="flex w-8 shrink-0 items-center justify-center leading-none" style={{ color: "#2a2318" }}>
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

function SpaceEditor({ s, onSet, onRemove, onClose }: { s: Space; day: string; onSet: (p: Partial<Space>) => void; onRemove: () => void; onClose: () => void }) {
  const [was] = useState(() => JSON.stringify({ name: s.name, icon: s.icon }));
  const changed = JSON.stringify({ name: s.name, icon: s.icon }) !== was;
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1 pt-1">
      <div className="flex items-center gap-1.5">
        <input defaultValue={s.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && onSet({ name: e.target.value.trim().slice(0, 40) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[14px]" style={field} />
        <RemoveBtn name={s.name} onRemove={onRemove} />
        <DoneBtn changed={changed} onClose={onClose} />
      </div>
      <IconRow icons={SPACE_ICONS} value={s.icon} onPick={(icon) => onSet({ icon })} />
    </div>
  );
}

function ChoreEditor({ ch, onSet, onRemove, onClose }: { ch: Chore; onSet: (p: Partial<Chore>) => void; onRemove: () => void; onClose: () => void }) {
  const snap = (x: Chore) => JSON.stringify({ n: x.name, i: x.icon, w: x.weekday ?? null, e: x.everyDays });
  const [was] = useState(() => snap(ch));
  const changed = snap(ch) !== was;
  return (
    <div className="flex flex-col gap-1.5 px-1 pb-1 pt-1">
      <div className="flex items-center gap-1.5">
        <input defaultValue={ch.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== ch.name && onSet({ name: e.target.value.trim().slice(0, 48) })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[14px]" style={field} />
        <RemoveBtn name={ch.name} onRemove={onRemove} />
        <DoneBtn changed={changed} onClose={onClose} />
      </div>
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
    </div>
  );
}

/** Close, or Save once something changed (it's kept as you go; this is where you say you're done). */
function DoneBtn({ changed, onClose }: { changed: boolean; onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors" style={changed ? gold : chipOn(false)}>
      {changed ? "Save" : "Close"}
    </button>
  );
}

/** A small bin that asks once, in place. */
function RemoveBtn({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [sure, setSure] = useState(false);
  return sure ? (
    <button type="button" onClick={onRemove} onBlur={() => setSure(false)} autoFocus className="h-8 shrink-0 rounded-full px-2.5 text-[12.5px] font-semibold" style={{ background: "var(--t-warn)", color: "#fff" }}>
      Remove?
    </button>
  ) : (
    <button type="button" onClick={() => setSure(true)} aria-label={`Remove ${name}`} title="Remove" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/5" style={{ color: "var(--t-warn)" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/* The bar's ends: small storybook icons in colour (owner, Nov 3: "better than white/black"), no faces or metaphors. */
const line = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function TidyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-label="tidy">
      <path d="M11 3l2 5.4 5.4 2-5.4 2L11 18l-2-5.6-5.4-2 5.4-2z" fill="#f6dc8e" stroke="#a8781e" strokeWidth="1.4" {...line} />
      <path d="M11 6.5l.9 2.6 2.6.9-2.6.9-.9 2.7-.9-2.7-2.6-.9 2.6-.9z" fill="#fff8df" />
      <path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#9ccf8a" stroke="#4f7a3c" strokeWidth="1" {...line} />
    </svg>
  );
}
function MessIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-label="messy">
      <ellipse cx="12" cy="20" rx="9" ry="1.6" fill="#000" opacity=".12" />
      <rect x="4" y="14.5" width="9" height="4.5" rx="1" fill="#6f8fc4" stroke="#36507e" strokeWidth="1.2" transform="rotate(-8 8.5 16.8)" />
      <path d="M12.5 19.2c0-2.6 1.2-5 3.6-5.7l1.3 1.3c.9-.5 2.1-.4 2.6.5.6 1-.2 2.3-1.6 2.6l-.4 1.3z" fill="#d4774e" stroke="#8a3f1f" strokeWidth="1.2" {...line} />
      <path d="M7 13.8l1.6-5.3h4.2l1.4 5.3z" fill="#9ccf8a" stroke="#4f7a3c" strokeWidth="1.2" {...line} />
      <path d="M8.6 8.5c0-1.2 1-2 2.1-2s2.1.8 2.1 2" fill="none" stroke="#4f7a3c" strokeWidth="1.2" {...line} />
    </svg>
  );
}
function BinIcon({ full }: { full: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-label={full ? "full" : "empty"}>
      {full && (
        <>
          <path d="M5.5 10c.4-2.4 1.8-3.8 3.6-3.8 1 0 1.8.6 2.2 1.4" fill="#d4774e" stroke="#8a3f1f" strokeWidth="1.2" {...line} />
          <path d="M10 9.5c.6-3 2.4-4.6 4.6-4.6 1.6 0 3 1.2 3.4 3.3L18.5 10z" fill="#6f8fc4" stroke="#36507e" strokeWidth="1.2" {...line} />
          <path d="M8.5 10c.8-1.8 2-2.6 3.5-2.6s2.6.9 3.2 2.6z" fill="#f2d27e" stroke="#a8781e" strokeWidth="1.1" {...line} />
        </>
      )}
      <path d="M4 9.5h16l-1.7 10a1.6 1.6 0 0 1-1.6 1.3H7.3a1.6 1.6 0 0 1-1.6-1.3z" fill="#e2c07a" stroke="#8a6116" strokeWidth="1.4" {...line} />
      <path d="M5 13h14M5.6 16.5h12.8" stroke="#a8803a" strokeWidth="1" {...line} />
      <path d="M8.5 9.5l.6 11M12 9.5v11M15.5 9.5l-.6 11" stroke="#a8803a" strokeWidth=".9" {...line} />
    </svg>
  );
}
function DoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-label="done">
      <circle cx="12" cy="12" r="8.5" fill="#7fae67" stroke="#3f6a2f" strokeWidth="1.4" />
      <path d="M8.3 12.3l2.6 2.6 4.9-5.4" fill="none" stroke="#fffbe9" strokeWidth="2.2" {...line} />
    </svg>
  );
}
function DueIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-label="due">
      <path d="M9.5 3h5" stroke="#8a4a14" strokeWidth="1.8" {...line} />
      <circle cx="12" cy="13" r="7.8" fill="#f3c27a" stroke="#9a5a1c" strokeWidth="1.4" />
      <circle cx="12" cy="13" r="5.6" fill="#fff4dc" />
      <path d="M12 9.6v3.6l2.4 1.5" fill="none" stroke="#9a5a1c" strokeWidth="1.7" {...line} />
    </svg>
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
    <div role="radiogroup" aria-label="Icon" className="flex flex-wrap items-center gap-1">
      {/* Your own emoji (owner, Nov 3: "each area's emoji is editable"). */}
      <input
        defaultValue={icons.includes(value) ? "" : value}
        placeholder="🙂"
        aria-label="Your own emoji"
        title="Type or paste any emoji"
        onChange={(e) => {
          const g = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(e.target.value.trim())].at(-1)?.segment;
          if (g) onPick(g);
        }}
        className="h-8 w-10 rounded-lg text-center text-[16px]"
        style={{ ...field, boxShadow: !icons.includes(value) ? "inset 0 0 0 1.5px #a88a3f" : undefined }}
      />
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
