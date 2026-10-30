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
  choreIsDue,
  dayLabel,
  daysBetween,
  laundryNow,
  levelNow,
  styleOf,
  tenOf,
  todaysPicks,
  type Chore,
  type Cleaning,
  type MessLevel,
  type MessStyle,
  type Space,
} from "@/lib/cleaning";
import { LaundryRun } from "./LaundryRun";
import { MessBattle } from "./MessBattle";

type Panel = "spaces" | "laundry" | "chores" | null;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const chipOn = (on: boolean): React.CSSProperties => ({ background: on ? "rgba(217,180,95,.5)" : "rgba(255,250,238,.55)", boxShadow: on ? "inset 0 0 0 1.5px #a88a3f" : "inset 0 0 0 1px rgba(139,112,64,.35)", color: "var(--t-ink)" });

/** Keeps a press inside the check-in from starting a drag of the habit row. */
const holdStill = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/**
 * The mess check-in under the cleaning habit: today's pick for the 20
 * minutes, with three buttons behind it (spaces, the laundry bin, the
 * chore deck). Once the habit is ticked, it asks how the space looks now.
 */
export function CleaningCheckIn({ initial, day, habitDone, isAdventure, open }: { initial: Cleaning; day: string; habitDone: boolean; isAdventure: boolean; /** The tray, opened from the habit's title. */ open: boolean }) {
  const [c, setC] = useState(initial);
  // With fewer than two spaces, the tray opens straight onto setting them up;
  // on a laundry day (or with a load under way), onto the laundry.
  const [panel, setPanel] = useState<Panel>(() => {
    if (initial.spaces.length < 2) return "spaces";
    if (todaysPicks(initial, day)[0]?.kind === "laundry") return "laundry";
    try {
      if (window.localStorage.getItem("laundry-run")) return "laundry";
    } catch {}
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  const style = styleOf(c.style);
  const picks = todaysPicks(c, day);
  const top = picks[0] ?? null;
  const laundry = laundryNow(c.laundry, day);
  const dueChores = c.chores.filter((ch) => choreIsDue(ch, day)).length;
  // After the 20 minutes: one question about what you cleaned, until something is logged today.
  const loggedToday = (c.battles ?? []).some((b) => b.on === day) || c.spaces.some((s) => s.ratedOn === day && s.level === 0) || c.chores.some((ch) => ch.lastDone === day) || c.laundry.loads.at(-1) === day;
  const [answered, setAnswered] = useState(false);
  const askAfter = habitDone && !answered && !loggedToday && top;
  // Fighting back the mess in a space: the battle log, opened in place.
  const [battle, setBattle] = useState<string | null>(null);
  const battleSpace = battle ? c.spaces.find((s) => s.id === battle) ?? null : null;
  const battleNode = (onDone?: () => void) =>
    battleSpace && (
      <MessBattle
        key={battleSpace.id}
        c={c}
        space={battleSpace}
        day={day}
        startBefore={tenOf(levelNow(battleSpace, day))}
        onLogged={(next) => (setC(next), setAnswered(true), onDone?.())}
        onClose={() => setBattle(null)}
      />
    );

  const choreDone = (id: string) => save({ ...c, chores: c.chores.map((ch) => (ch.id === id ? { ...ch, lastDone: day, snoozedUntil: null } : ch)) });
  const loadDone = () => save({ ...c, laundry: { readings: [...c.laundry.readings.filter((r) => r.on !== day), { on: day, fill: 0 }].slice(-30), loads: [...c.laundry.loads.filter((d) => d !== day), day].slice(-20) } });

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const chip = (on: boolean) =>
    ({
      background: on ? (isAdventure ? "rgba(217,180,95,.4)" : "var(--t-accent)") : "rgba(255,250,238,.55)",
      color: on && !isAdventure ? "#fff" : ink,
      boxShadow: on ? "inset 0 0 0 1.5px #a88a3f" : "inset 0 0 0 1px rgba(139,112,64,.35)",
    }) as React.CSSProperties;

  const box = isAdventure ? { background: "linear-gradient(180deg, rgba(250,240,214,.96), rgba(238,222,186,.96))", border: "1.5px solid #b39a6a", boxShadow: "inset 0 1px 0 rgba(255,255,255,.5)" } : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" };
  return (
    <div {...holdStill}>
      {/* After the 20 minutes, one question, right under the habit (tray open or not). */}
      {askAfter && top && (
        <div className="reveal ml-7 mt-1 rounded-xl px-2.5 py-1.5" style={box}>
          {battle && top.kind === "space" && battle === top.id ? (
            battleNode()
          ) : (
            <AfterQuestion
              pick={top}
              onFight={() => setBattle(top.id)}
              onDone={() => (setAnswered(true), top.kind === "laundry" ? loadDone() : choreDone(top.id))}
              onDismiss={() => setAnswered(true)}
            />
          )}
        </div>
      )}
      <div className="drawer-body" data-open={open ? "true" : "false"}>
        <div className="drawer-inner" inert={!open}>
          <div className="ml-7 mt-1 flex flex-col gap-1.5 rounded-xl px-2.5 py-1.5" style={box}>
            {error && (
              <p className="m-0 text-[13px]" style={{ color: "var(--t-warn)" }}>
                {error}
              </p>
            )}
            {/* The priority list: messiest and most due first. */}
            {/* A battle opened from the list or a space shows here, at the top of the tray. */}
            {battleSpace && !(askAfter && top?.id === battleSpace.id) && <div className="rounded-lg px-1.5 py-1" style={{ background: "rgba(255,250,238,.55)", boxShadow: "inset 0 0 0 1px rgba(168,138,63,.45)" }}>{battleNode()}</div>}
            {picks.length > 0 ? (
              <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
                {picks.map((p, i) => (
                  <li key={`${p.kind}-${p.id}`} className="flex items-baseline gap-1.5 text-[14px] leading-snug" style={{ color: ink }}>
                    <span className="w-4 shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color: "#8a6116" }}>
                      {i + 1}
                    </span>
                    <span className={i === 0 ? "font-semibold" : undefined}>
                      {p.icon} {p.name}
                    </span>
                    <span className="text-[12.5px]" style={{ color: soft }}>
                      · {p.why}
                    </span>
                    {p.kind === "space" && (
                      <FightButton onClick={() => setBattle(battle === p.id ? null : p.id)} on={battle === p.id} name={p.name} />
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 text-[14px]" style={{ color: soft }}>
                Everything&apos;s calm. Any 20 minutes you like today ✨
              </p>
            )}

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Check in">
              <button type="button" onClick={() => setPanel(panel === "spaces" ? null : "spaces")} aria-expanded={panel === "spaces"} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold" style={chip(panel === "spaces")}>
                <span aria-hidden>{style.mark}</span> Spaces
              </button>
              <button type="button" onClick={() => setPanel(panel === "laundry" ? null : "laundry")} aria-expanded={panel === "laundry"} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold" style={chip(panel === "laundry")}>
                <span aria-hidden>🧺</span> Laundry
                {laundry.dueOn && (
                  <span className="font-normal" style={{ color: panel === "laundry" && !isAdventure ? "#fff" : soft }}>
                    · {laundry.daysLeft! <= 0 ? "due" : dayLabel(laundry.dueOn, day)}
                  </span>
                )}
              </button>
              <button type="button" onClick={() => setPanel(panel === "chores" ? null : "chores")} aria-expanded={panel === "chores"} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold" style={chip(panel === "chores")}>
                <span aria-hidden>🃏</span> Chores
                {dueChores > 0 && (
                  <span className="font-normal" style={{ color: panel === "chores" && !isAdventure ? "#fff" : soft }}>
                    · {dueChores} due
                  </span>
                )}
              </button>
            </div>

            {panel === "spaces" && <SpacesPanel c={c} day={day} save={save} onFight={(id) => setBattle(battle === id ? null : id)} fighting={battle} />}
            {panel === "laundry" && <LaundryPanel c={c} day={day} save={save} onLoad={loadDone} />}
            {panel === "chores" && <ChoresPanel c={c} day={day} save={save} onDone={choreDone} />}
          </div>
        </div>
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

// ---------------------------------------------------------------------------
// Spaces

/** ⚔: log a round of fighting back the mess in this space (before and after). */
function FightButton({ onClick, on, name }: { onClick: () => void; on: boolean; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={on}
      aria-label={`Fight back the mess in ${name}`}
      title="Fought back the mess? Log before and after for XP"
      className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-[14px] transition-opacity hover:opacity-100"
      style={{ opacity: on ? 1 : 0.7, background: on ? "rgba(217,180,95,.45)" : undefined }}
    >
      ⚔
    </button>
  );
}

/** How messy a space is: one compact slider, the style's calm end on the left and its messy end on the right. */
function LevelPicker({ value, styleKey, onPick, label }: { value: MessLevel; styleKey: MessStyle; onPick: (lv: MessLevel) => void; label: string }) {
  const s = styleOf(styleKey);
  // Moves freely; saved when you let go.
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? value;
  const commit = () => {
    if (drag !== null && drag !== value) onPick(drag as MessLevel);
    setDrag(null);
  };
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5" title={s.words[v]}>
      <span aria-hidden className="shrink-0 text-[14px] leading-none" style={{ letterSpacing: "-0.12em", opacity: v === 0 ? 1 : 0.55 }}>
        {s.glyphs[0]}
      </span>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={v}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label={`How messy is ${label}?`}
        aria-valuetext={s.words[v]}
        className="h-7 min-w-0 flex-1"
        style={{ accentColor: v === 2 ? "#c0563a" : v === 1 ? "#a88a3f" : "#6f9a4a" }}
      />
      <span aria-hidden className="shrink-0 text-[14px] leading-none" style={{ letterSpacing: "-0.12em", opacity: v === 2 ? 1 : 0.55 }}>
        {s.glyphs[2]}
      </span>
    </div>
  );
}

function SpacesPanel({ c, day, save, onFight, fighting }: { c: Cleaning; day: string; save: (n: Cleaning) => void; onFight: (id: string) => void; fighting: string | null }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const style = styleOf(c.style);
  const setSpace = (id: string, patch: Partial<Space>) => save({ ...c, spaces: c.spaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  function add() {
    const name = adding.trim();
    if (!name) return;
    save({ ...c, spaces: [...c.spaces, { id: freshKey("s"), name: name.slice(0, 40), icon: "✨", level: 1, ratedOn: day, driftDays: null }] });
    setAdding("");
  }

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "rgba(139,112,64,.3)" }}>
      <p className="m-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
        Slide each space to how it looks now. The messiest comes up first.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {c.spaces.map((s) => {
          const lv = levelNow(s, day);
          const drifted = lv !== s.level;
          return (
            <li key={s.id} className="flex flex-col gap-1 rounded-lg px-1 py-1" style={{ background: editing === s.id ? "rgba(255,250,238,.5)" : undefined }}>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setEditing(editing === s.id ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title="Edit this space">
                  <span aria-hidden className="text-[18px]">{s.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold leading-snug" style={{ color: "var(--t-ink)" }}>
                      {s.name}
                    </span>
                    <span className="block text-[12px] leading-tight" style={{ color: "var(--t-ink-soft)" }}>
                      {style.words[lv]}
                      {drifted ? " (on its own since you rated it)" : s.ratedOn && s.ratedOn !== day ? ` · rated ${ago(s.ratedOn, day)}` : ""}
                    </span>
                  </span>
                </button>
                <LevelPicker value={lv} styleKey={c.style} label={s.name} onPick={(level) => setSpace(s.id, { level, ratedOn: day })} />
                <FightButton onClick={() => onFight(s.id)} on={fighting === s.id} name={s.name} />
              </div>
              {editing === s.id && (
                <div className="flex flex-col gap-1.5 px-1 pb-1">
                  <input
                    defaultValue={s.name}
                    aria-label="Name"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && setSpace(s.id, { name: e.target.value.trim().slice(0, 40) })}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="h-8 rounded-lg px-2 text-[14px]"
                    style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(139,112,64,.4)", color: "var(--t-ink)" }}
                  />
                  <IconRow icons={SPACE_ICONS} value={s.icon} onPick={(icon) => setSpace(s.id, { icon })} />
                  <label className="flex flex-wrap items-center gap-1.5 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
                    Gets messier on its own
                    <select value={s.driftDays ?? 0} onChange={(e) => setSpace(s.id, { driftDays: Number(e.target.value) || null, level: lv, ratedOn: day })} className="h-8 rounded-lg px-1.5 text-[13.5px]" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(139,112,64,.4)" }}>
                      <option value={0}>no, only when I say</option>
                      {[1, 2, 3, 4, 5, 7, 10, 14].map((n) => (
                        <option key={n} value={n}>
                          a step every {n === 1 ? "day" : `${n} days`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex justify-between">
                    <button type="button" onClick={() => setEditing(null)} className="h-8 rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                      Close
                    </button>
                    <button type="button" onClick={() => (setEditing(null), save({ ...c, spaces: c.spaces.filter((x) => x.id !== s.id) }))} className="h-8 px-2 text-[13px] underline" style={{ color: "var(--t-warn)" }}>
                      Remove this space
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-1.5"
      >
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Add a space (closet, car…)" aria-label="Add a space" className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[13.5px]" style={{ background: "rgba(255,255,255,.6)", border: "1px dashed rgba(139,112,64,.5)", color: "var(--t-ink)" }} />
        {adding.trim() && (
          <button type="submit" className="h-8 rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Add
          </button>
        )}
      </form>
      <MessStylePicker value={c.style} onPick={(style) => save({ ...c, style })} compact />
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

// ---------------------------------------------------------------------------
// Laundry

const FILL_WORDS = ["Empty", "¼", "½", "¾", "Full"];

function LaundryPanel({ c, day, save, onLoad }: { c: Cleaning; day: string; save: (n: Cleaning) => void; onLoad: () => void }) {
  const now = laundryNow(c.laundry, day);
  const readToday = c.laundry.readings.find((r) => r.on === day)?.fill ?? null;
  const shown = readToday ?? (now.fill === null ? 0 : Math.round(now.fill));
  // The slider moves freely; the reading is saved when you let go.
  const [drag, setDrag] = useState<number | null>(null);
  const value = drag ?? shown;
  // A load under way (kept on this device) opens straight to where it is.
  const [running, setRunning] = useState(() => {
    try {
      return !!window.localStorage.getItem("laundry-run");
    } catch {
      return false;
    }
  });
  const setFill = (fill: number) => save({ ...c, laundry: { ...c.laundry, readings: [...c.laundry.readings.filter((r) => r.on !== day), { on: day, fill }].slice(-30) } });
  const commit = () => {
    if (drag !== null && drag !== readToday) setFill(drag);
    setDrag(null);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "rgba(139,112,64,.3)" }}>
      {/* How full the bin is: one slider, empty on the left, full on the right. */}
      <div className="flex items-center gap-1.5">
        <Bin fill={0} size={22} />
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          value={value}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          aria-label="How full is the laundry bin?"
          aria-valuetext={FILL_WORDS[value]}
          className="h-8 min-w-0 flex-1"
          style={{ accentColor: value >= 4 ? "#c0563a" : value >= 3 ? "#d08a3a" : "#a88a3f", opacity: readToday === null && drag === null ? 0.7 : 1 }}
        />
        <Bin fill={4} size={22} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--t-ink)" }}>
          {now.dueOn === null ? (
            "Slide it now and then, and I'll predict the next load."
          ) : now.daysLeft! <= 0 ? (
            <>🧺 A load is due {now.daysLeft! < 0 ? "now" : "today"}.</>
          ) : (
            <>
              Next load around <b>{dayLabel(now.dueOn, day)}</b>.
            </>
          )}
          {c.laundry.loads.length > 0 && <span style={{ color: "var(--t-ink-soft)" }}> Last {c.laundry.loads.at(-1) === day ? "today" : ago(c.laundry.loads.at(-1)!, day)}.</span>}
        </span>
        {!running && (
          <>
            <button type="button" onClick={onLoad} className="h-8 rounded-full px-2 text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--t-ink-soft)" }} title="Already did one: count it">
              ✓ Did one
            </button>
            <button type="button" onClick={() => setRunning(true)} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
              🧺 Start a load
            </button>
          </>
        )}
      </div>
      {/* Load, wash, dry, fold: each with its timer. */}
      <div className="drawer-body" data-open={running ? "true" : "false"}>
        <div className="drawer-inner" inert={!running}>
          {running && (
            <LaundryRun
              onClose={() => setRunning(false)}
              onFolded={() => {
                setRunning(false);
                onLoad();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** A little wicker bin, filled to the guess. */
function Bin({ fill, size = 44 }: { fill: number; size?: number }) {
  const h = Math.max(0, Math.min(4, fill)) / 4;
  const clip = `bin-clip-${Math.round(fill)}`;
  return (
    <svg width={size} height={(size * 48) / 44} viewBox="0 0 44 48" aria-hidden className="shrink-0">
      <defs>
        <clipPath id={clip}>
          <path d="M6 10h32l-3.5 34a3 3 0 0 1-3 2.7H12.5a3 3 0 0 1-3-2.7z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width="44" height="48" fill="#e8d6ae" />
        <rect x="0" y={10 + 37 * (1 - h)} width="44" height="48" fill={h >= 1 ? "#c0563a" : h >= 0.75 ? "#d08a3a" : "#7f9fc8"} style={{ transition: "y .4s ease" }} />
        {[18, 26, 34].map((y) => (
          <path key={y} d={`M4 ${y}h36`} stroke="rgba(110,80,30,.35)" strokeWidth="1.2" />
        ))}
      </g>
      <path d="M6 10h32l-3.5 34a3 3 0 0 1-3 2.7H12.5a3 3 0 0 1-3-2.7z" fill="none" stroke="#8a6c2c" strokeWidth="2" />
      <rect x="3" y="6" width="38" height="5" rx="2.5" fill="#b8954f" stroke="#8a6c2c" strokeWidth="1.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chore deck

function ChoresPanel({ c, day, save, onDone }: { c: Cleaning; day: string; save: (n: Cleaning) => void; onDone: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const [custom, setCustom] = useState("3");
  const [adding, setAdding] = useState("");
  const setChore = (id: string, patch: Partial<Chore>) => save({ ...c, chores: c.chores.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch)) });
  const snooze = (id: string, days: number) => {
    setSnoozing(null);
    setChore(id, { snoozedUntil: addDays(day, Math.max(1, Math.min(365, Math.round(days)))) });
  };
  const sorted = [...c.chores].sort((a, b) => choreDueOn(a, day).localeCompare(choreDueOn(b, day)));
  const due = sorted.filter((ch) => choreIsDue(ch, day));
  const later = sorted.filter((ch) => !choreIsDue(ch, day));

  function add() {
    const name = adding.trim();
    if (!name) return;
    save({ ...c, chores: [...c.chores, { id: freshKey("c"), name: name.slice(0, 48), icon: "✨", everyDays: 7, lastDone: null, snoozedUntil: null }] });
    setAdding("");
  }

  const card = (ch: Chore, isDue: boolean) => {
    const dueOn = choreDueOn(ch, day);
    const snoozed = ch.snoozedUntil && ch.snoozedUntil > day;
    return (
      <li key={ch.id} className="relative flex flex-col gap-1.5 rounded-xl px-2.5 py-1.5" style={{ background: isDue ? "rgba(255,250,238,.85)" : "rgba(255,250,238,.4)", boxShadow: isDue ? "0 1px 0 rgba(139,112,64,.35), inset 0 0 0 1.5px #c9ab66" : "inset 0 0 0 1px rgba(139,112,64,.25)" }}>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setEditing(editing === ch.id ? null : ch.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title="Edit this chore">
            <span aria-hidden className="text-[17px]">{ch.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--t-ink)", opacity: isDue ? 1 : 0.8 }}>
                {ch.name}
              </span>
              <span className="block text-[12px] leading-tight" style={{ color: "var(--t-ink-soft)" }}>
                {ch.weekday != null ? `every ${WEEKDAYS[ch.weekday]}` : `every ${ch.everyDays === 1 ? "day" : ch.everyDays === 7 ? "week" : `${ch.everyDays} days`}`} ·{" "}
                {snoozed ? `💤 until ${dayLabel(ch.snoozedUntil!, day)}` : isDue ? (dueOn < day ? `due ${ago(dueOn, day)}` : "due today") : `next ${dayLabel(dueOn, day)}`}
              </span>
            </span>
          </button>
          {isDue && (
            <>
              <button type="button" onClick={() => setSnoozing(snoozing === ch.id ? null : ch.id)} aria-expanded={snoozing === ch.id} className="flex h-8 items-center rounded-full px-2.5 text-[13px]" style={{ color: "var(--t-ink)", boxShadow: "inset 0 0 0 1px rgba(139,112,64,.4)" }}>
                💤 Snooze
              </button>
              <button type="button" onClick={() => onDone(ch.id)} className="flex h-8 items-center rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                ✓ Done
              </button>
            </>
          )}
        </div>
        {snoozing === ch.id && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Snooze ${ch.name}`}>
            <button type="button" onClick={() => snooze(ch.id, 1)} className="h-8 rounded-full px-3 text-[13.5px]" style={{ boxShadow: "inset 0 0 0 1px rgba(139,112,64,.4)", color: "var(--t-ink)" }}>
              A day
            </button>
            <button type="button" onClick={() => snooze(ch.id, 7)} className="h-8 rounded-full px-3 text-[13.5px]" style={{ boxShadow: "inset 0 0 0 1px rgba(139,112,64,.4)", color: "var(--t-ink)" }}>
              A week
            </button>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (Number(custom) >= 1) snooze(ch.id, Number(custom));
              }}
              className="flex items-center gap-1 text-[13.5px]"
              style={{ color: "var(--t-ink)" }}
            >
              <input type="number" min={1} max={365} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Days to snooze" className="h-8 w-14 rounded-lg px-1.5 text-center text-[14px]" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(139,112,64,.4)" }} />
              days
              <button type="submit" className="h-8 rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "rgba(217,180,95,.45)", boxShadow: "inset 0 0 0 1px #a88a3f" }}>
                Snooze
              </button>
            </form>
          </div>
        )}
        {editing === ch.id && (
          <div className="flex flex-col gap-1.5">
            <input
              defaultValue={ch.name}
              aria-label="Name"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== ch.name && setChore(ch.id, { name: e.target.value.trim().slice(0, 48) })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-8 rounded-lg px-2 text-[14px]"
              style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(139,112,64,.4)", color: "var(--t-ink)" }}
            />
            <IconRow icons={CHORE_ICONS} value={ch.icon} onPick={(icon) => setChore(ch.id, { icon })} />
            {/* Repeats every N days, or on one day of the week (trash night). */}
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Repeats on">
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" role="radio" aria-checked={ch.weekday === i} onClick={() => setChore(ch.id, { weekday: ch.weekday === i ? null : i })} title={`Every ${w}`} className="flex h-8 w-9 items-center justify-center rounded-full text-[12.5px] font-semibold" style={chipOn(ch.weekday === i)}>
                  {w.slice(0, 2)}
                </button>
              ))}
            </div>
            {ch.weekday == null && (
              <label className="flex items-center gap-1.5 text-[13.5px]" style={{ color: "var(--t-ink)" }}>
                Or every
                <input type="number" min={1} max={366} inputMode="numeric" defaultValue={ch.everyDays} onBlur={(e) => Number(e.target.value) >= 1 && setChore(ch.id, { everyDays: Math.round(Number(e.target.value)) })} className="h-8 w-16 rounded-lg px-1.5 text-center" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(139,112,64,.4)" }} />
                days
              </label>
            )}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="flex gap-1.5">
                <button type="button" onClick={() => setEditing(null)} className="h-8 rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
                  Close
                </button>
                {!isDue && (
                  <button type="button" onClick={() => onDone(ch.id)} className="h-8 rounded-full px-3 text-[13px]" style={{ boxShadow: "inset 0 0 0 1px rgba(139,112,64,.4)", color: "var(--t-ink)" }}>
                    ✓ Did it today
                  </button>
                )}
                {snoozed && (
                  <button type="button" onClick={() => setChore(ch.id, { snoozedUntil: null })} className="h-8 px-1 text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                    Wake it up
                  </button>
                )}
              </span>
              <button type="button" onClick={() => (setEditing(null), save({ ...c, chores: c.chores.filter((x) => x.id !== ch.id) }))} className="h-8 px-1 text-[13px] underline" style={{ color: "var(--t-warn)" }}>
                Remove
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: "rgba(139,112,64,.3)" }}>
      {due.length === 0 && (
        <p className="m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          No chores due today 🌿
        </p>
      )}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{due.map((ch) => card(ch, true))}</ul>
      {later.length > 0 && (
        // Coming up shows straight away: what's next is worth seeing.
        <div>
          <p className="m-0 pb-0.5 text-[12px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
            Coming up
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">{later.map((ch) => card(ch, false))}</ul>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-1.5"
      >
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="+ Add a chore (mop, windows…)" aria-label="Add a chore" className="h-8 min-w-0 flex-1 rounded-lg px-2 text-[13.5px]" style={{ background: "rgba(255,255,255,.6)", border: "1px dashed rgba(139,112,64,.5)", color: "var(--t-ink)" }} />
        {adding.trim() && (
          <button type="submit" className="h-8 rounded-full px-3 text-[13.5px] font-semibold" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
            Add
          </button>
        )}
      </form>
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
