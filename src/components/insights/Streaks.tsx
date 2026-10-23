"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeRiteAction, deleteCheckNoteAction, logSlipAction, saveStreaksAction } from "@/app/actions";
import { MILESTONES, streakLabel, streakState, type StreakDef, type StreakNote } from "@/lib/streaks";
import { DateField } from "@/components/ui/DateField";

const INK = "#3b2a14";
const SOFT = "#6b5631";
const GOLD = "#c9a24a";

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};
const minuteNow = () => Math.ceil(Date.now() / 60_000) * 60_000;

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const wordFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/^(no|not|without|zero|quit|stop|avoid)\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .slice(0, 24);

/**
 * Streaks of keeping away from something. Private to you: never on Today and
 * never shared. A slip is an event with the streak's word, so the count picks
 * up events you logged before, and "Reset" just logs one.
 */
export type HabitStreak = { id: string; title: string; days: number[] | null; icon: string | null; done: string[]; skipped: string[] };

export function Streaks({ initial, notes: initialNotes, habits = [] }: { initial: StreakDef[]; notes: StreakNote[]; habits?: HabitStreak[] }) {
  const router = useRouter();
  const now = useSyncExternalStore(subscribeMinute, minuteNow, () => 0);
  const [defs, setDefs] = useState(initial);
  const [notes, setNotes] = useState(initialNotes);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [word, setWord] = useState("");
  const [wordTouched, setWordTouched] = useState(false);
  const [since, setSince] = useState("");
  const [slipping, setSlipping] = useState<{ id: string; at: string } | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<StreakDef | null>(null);
  const [undo, setUndo] = useState<{ noteId: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function persist(next: StreakDef[]) {
    const prev = defs;
    setDefs(next);
    start(async () => {
      try {
        setDefs(await saveStreaksAction(next));
      } catch (e) {
        setDefs(prev);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function add() {
    const n = name.trim();
    const w = (wordTouched ? word : wordFrom(n)).trim().replace(/^#/, "");
    if (!n || !w) return;
    const sinceMs = since ? Date.parse(since) : now;
    persist([...defs, { id: `s${crypto.randomUUID().slice(0, 8)}`, name: n, word: w, since: new Date(Number.isFinite(sinceMs) ? sinceMs : now).toISOString() }]);
    setName("");
    setWord("");
    setWordTouched(false);
    setSince("");
    setAdding(false);
  }
  function slip(def: StreakDef, atLocal: string) {
    const at = new Date(atLocal ? Date.parse(atLocal) : now).toISOString();
    setSlipping(null);
    const temp = { id: `temp-${crypto.randomUUID()}`, body: `#${def.word.split(",")[0].trim()}`, created_at: at };
    setNotes((n) => [...n, temp]);
    start(async () => {
      try {
        const saved = await logSlipAction(def.word, at);
        setNotes((n) => n.map((x) => (x.id === temp.id ? { id: saved.id, body: saved.body, created_at: saved.created_at } : x)));
        setUndo({ noteId: saved.id, name: def.name });
        router.refresh();
      } catch (e) {
        setNotes((n) => n.filter((x) => x.id !== temp.id));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function undoSlip() {
    if (!undo) return;
    const id = undo.noteId;
    setUndo(null);
    setNotes((n) => n.filter((x) => x.id !== id));
    start(() => deleteCheckNoteAction(id).then(() => router.refresh(), () => {}));
  }

  const states = useMemo(() => (now ? defs.map((d) => ({ def: d, s: streakState(d, notes, now) })) : []), [defs, notes, now]);
  const field = "h-10 min-w-0 rounded-lg border px-2.5 text-[16px]";
  const fieldStyle = { borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: INK };

  return (
    <div className="flex flex-col gap-2.5">
      {states.length === 0 && !adding && (
        <p className="m-0 text-[14px]" style={{ color: SOFT }}>
          Count the days you keep away from something. Only you see these, and they stay off Today.
        </p>
      )}

      <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
        {states.map(({ def, s }) => {
          const next = MILESTONES.find((m) => m > s.days);
          const reached = [...MILESTONES].reverse().find((m) => m <= s.days);
          // The last four weeks, oldest first: a dot per day, dimmed where there was a slip.
          const days = Array.from({ length: 28 }, (_, i) => {
            const dayStart = new Date(now);
            dayStart.setHours(0, 0, 0, 0);
            dayStart.setDate(dayStart.getDate() - (27 - i));
            const a = dayStart.getTime();
            const b = a + 86_400_000;
            return { slip: s.slips.some((x) => x.at >= a && x.at < b), before: b <= Math.min(Date.parse(def.since), s.slips[0]?.at ?? Infinity) };
          });
          return (
            <li key={def.id} className="relative flex flex-col gap-1.5 rounded-xl px-3.5 py-3" style={{ background: "rgba(255,250,238,.6)", border: "1.5px solid rgba(139,112,64,.3)" }}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-tight" style={{ color: INK }}>
                    {def.name}
                  </div>
                  <div className="font-display text-[30px] leading-none tabular-nums" style={{ color: s.days >= 7 ? "#8a6116" : INK }}>
                    {streakLabel(s.ms)}
                  </div>
                </div>
                <button type="button" onClick={() => setMenu(menu === def.id ? null : def.id)} aria-label={`More for ${def.name}`} className="-mr-1.5 -mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[18px] leading-none hover:bg-black/[.06]" style={{ color: SOFT }}>
                  ⋯
                </button>
                {menu === def.id && (
                  <div role="menu" className="card-pop-in absolute right-2 top-10 z-10 flex min-w-[170px] flex-col overflow-hidden rounded-xl parchment" style={{ borderRadius: 12 }}>
                    <button type="button" role="menuitem" onClick={() => (setMenu(null), setRenaming(def))} className="relative z-[1] min-h-11 px-4 text-left text-[15px] hover:bg-black/5">
                      ✎ Edit
                    </button>
                    <button type="button" role="menuitem" onClick={() => (setMenu(null), persist(defs.filter((d) => d.id !== def.id)))} className="relative z-[1] min-h-11 px-4 text-left text-[15px] hover:bg-black/5" style={{ borderTop: "1px solid rgba(139,112,64,.2)", color: "#9a3b26" }}>
                      Remove streak
                    </button>
                  </div>
                )}
              </div>
              <div className="text-[12.5px]" style={{ color: SOFT }}>
                Since {new Date(s.start).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {s.best > s.days ? ` · best ${s.best} ${s.best === 1 ? "day" : "days"}` : s.days > 0 ? " · your best yet" : ""}
              </div>
              <div className="flex items-center gap-[3px]" aria-label="The last four weeks">
                {days.map((d, i) => (
                  <span
                    key={i}
                    className="h-2.5 flex-1 rounded-full"
                    title={d.slip ? "A slip" : d.before ? "Before counting" : "Clear"}
                    style={{ background: d.before ? "rgba(139,112,64,.12)" : d.slip ? "rgba(154,59,38,.45)" : GOLD, opacity: d.before ? 1 : d.slip ? 1 : 0.85 }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-[12.5px]" style={{ color: SOFT }}>
                  {reached ? `✦ ${reached}-day mark` : ""}
                  {next ? `${reached ? " · " : ""}${next - s.days} more ${next - s.days === 1 ? "day" : "days"} to the ${next}-day mark` : ""}
                </span>
                <button type="button" onClick={() => setSlipping({ id: def.id, at: toLocalInput(now) })} className="ml-auto h-8 rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid #b39a6a", color: SOFT }}>
                  Log a slip
                </button>
              </div>
              {slipping?.id === def.id && (
                <div className="fade-in flex flex-col gap-2 rounded-lg p-2.5" style={{ background: "rgba(120,90,40,.1)" }}>
                  <span className="text-[13.5px]" style={{ color: INK }}>
                    Start the count again from:
                  </span>
                  <input type="datetime-local" value={slipping.at} max={toLocalInput(now + 60_000)} onChange={(e) => setSlipping({ id: def.id, at: e.target.value })} className={field} style={fieldStyle} aria-label="When" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setSlipping(null)} className="h-9 rounded-full px-3 text-[13.5px] underline" style={{ color: SOFT }}>
                      Cancel
                    </button>
                    <button type="button" onClick={() => slip(def, slipping.at)} className="h-9 rounded-full px-4 text-[13.5px] font-bold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                      Start again
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {habits.length > 0 && now > 0 && (
        <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2" aria-label="Habits">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} now={now} onLogged={() => router.refresh()} />
          ))}
        </ul>
      )}

      {undo && (
        <p className="fade-in m-0 flex items-center gap-2 text-[13.5px]" style={{ color: SOFT }}>
          {undo.name} starts again. Every day from here counts.
          <button type="button" onClick={undoSlip} className="underline" style={{ color: INK }}>
            Undo
          </button>
        </p>
      )}

      {renaming && (
        <div className="fade-in flex flex-col gap-2 rounded-xl p-3" style={{ background: "rgba(255,250,238,.6)", border: "1.5px solid rgba(139,112,64,.3)" }}>
          <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
            Name
            <input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className={field} style={fieldStyle} maxLength={40} />
          </label>
          <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
            An event with any of these words counts as a slip (separate with commas)
            <input value={renaming.word} onChange={(e) => setRenaming({ ...renaming, word: e.target.value })} className={field} style={fieldStyle} maxLength={60} />
          </label>
          <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
            Counting since (if there&rsquo;s no slip after it)
            <input type="datetime-local" value={toLocalInput(Date.parse(renaming.since))} max={toLocalInput(now + 60_000)} onChange={(e) => e.target.value && setRenaming({ ...renaming, since: new Date(e.target.value).toISOString() })} className={field} style={fieldStyle} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRenaming(null)} className="h-9 rounded-full px-3 text-[13.5px] underline" style={{ color: SOFT }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                persist(defs.map((d) => (d.id === renaming.id ? renaming : d)));
                setRenaming(null);
              }}
              className="h-9 rounded-full px-4 text-[13.5px] font-bold"
              style={{ background: "var(--t-gold)", color: "#2a1c10" }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {adding ? (
        <div className="fade-in flex flex-col gap-2 rounded-xl p-3" style={{ background: "rgba(255,250,238,.6)", border: "1.5px dashed rgba(139,112,64,.45)" }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="What you're keeping away from, e.g. No weed" className={field} style={fieldStyle} maxLength={40} aria-label="Streak name" />
          <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
            Events with any of these words count as a slip, past ones too (separate with commas)
            <input
              value={wordTouched ? word : wordFrom(name)}
              onChange={(e) => {
                setWordTouched(true);
                setWord(e.target.value);
              }}
              placeholder="weed"
              className={field}
              style={fieldStyle}
              maxLength={60}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]" style={{ color: SOFT }}>
            Counting since (optional, if it&rsquo;s not in your events)
            <input type="datetime-local" value={since} max={toLocalInput(now + 60_000)} onChange={(e) => setSince(e.target.value)} className={field} style={fieldStyle} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-full px-3 text-[13.5px] underline" style={{ color: SOFT }}>
              Cancel
            </button>
            <button type="button" onClick={add} disabled={!name.trim()} className="h-9 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
              Start the count
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start rounded-full px-3 py-1.5 text-[13.5px] font-semibold" style={{ border: "1px dashed #8a6c2c", color: INK }}>
          + New streak
        </button>
      )}
      {error && (
        <p className="m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const dayKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A habit's streak: days in a row it was done (on the days it's due), the last four weeks, and Log it. */
function HabitCard({ habit, now, onLogged }: { habit: HabitStreak; now: number; onLogged: () => void }) {
  const [extra, setExtra] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState(() => dayKeyOf(new Date(now)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const done = new Set([...habit.done, ...extra]);
  const skipped = new Set(habit.skipped);
  const due = (d: Date) => !habit.days || habit.days.length === 0 || habit.days.includes(d.getDay());
  // Counting back from today (today only counts once it's done).
  let streak = 0;
  const d = new Date(now);
  for (let i = 0; i < 400; i++) {
    const k = dayKeyOf(d);
    if (due(d)) {
      if (done.has(k)) streak++;
      else if (i > 0 || skipped.has(k)) break;
    }
    d.setDate(d.getDate() - 1);
  }
  const todayKey = dayKeyOf(new Date(now));
  const cells = Array.from({ length: 28 }, (_, i) => {
    const c = new Date(now);
    c.setDate(c.getDate() - (27 - i));
    const k = dayKeyOf(c);
    return { k, done: done.has(k), due: due(c) };
  });
  async function log(k: string) {
    setBusy(true);
    setMsg(null);
    try {
      await completeRiteAction(habit.id, k);
      setExtra((x) => [...x, k]);
      setPicking(false);
      setMsg(k === todayKey ? "Logged for today ✓" : `Logged for ${new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ✓`);
      onLogged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't log that.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="relative flex flex-col gap-1.5 rounded-xl px-3.5 py-3" style={{ background: "rgba(255,250,238,.6)", border: "1.5px solid rgba(139,112,64,.3)" }}>
      <div className="flex items-start gap-2">
        {habit.icon && (
          // eslint-disable-next-line @next/next/no-img-element -- habit portrait
          <img src={habit.icon} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" style={{ border: "1.5px solid #a58c66" }} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight" style={{ color: INK }}>
            {habit.title}
          </div>
          <div className="font-display text-[30px] leading-none tabular-nums" style={{ color: streak >= 7 ? "#8a6116" : INK }}>
            🔥 {streak} {streak === 1 ? "day" : "days"}
          </div>
        </div>
        <span className="mt-0.5 text-[11px] font-bold uppercase tracking-[.1em]" style={{ color: SOFT }}>
          Habit
        </span>
      </div>
      <div className="flex items-center gap-[3px]" aria-label="The last four weeks">
        {cells.map((c) => (
          <span key={c.k} className="h-2.5 flex-1 rounded-full" title={c.done ? "Done" : c.due ? "Not done" : "Not due"} style={{ background: c.done ? GOLD : c.due ? "rgba(139,112,64,.22)" : "rgba(139,112,64,.08)" }} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: SOFT }}>
          {msg ?? (done.has(todayKey) ? "Done today ✓" : "Not yet today")}
        </span>
        {!done.has(todayKey) && (
          <button type="button" disabled={busy} onClick={() => log(todayKey)} className="h-8 rounded-full px-3 text-[12.5px] font-bold disabled:opacity-60" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Log it
          </button>
        )}
        <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking} className="h-8 rounded-full px-3 text-[12.5px] font-semibold" style={{ border: "1px solid #b39a6a", color: SOFT }}>
          Another day…
        </button>
      </div>
      {picking && (
        <div className="fade-in flex items-center gap-2 rounded-lg p-2" style={{ background: "rgba(120,90,40,.1)" }}>
          <DateField value={day} max={todayKey} onChange={setDay} ariaLabel="Which day" className="h-10 min-w-0 flex-1 rounded-lg border px-2 text-[16px]" style={{ borderColor: "#b39a6a", background: "rgba(255,250,238,.7)", color: INK }} />
          <button type="button" disabled={busy || !day || done.has(day)} onClick={() => log(day)} className="h-10 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            {done.has(day) ? "Done that day" : "Log it"}
          </button>
        </div>
      )}
    </li>
  );
}
