"use client";

import { TimeToken } from "@/components/xp/NightFields";
import { useState, useTransition } from "react";
import { nextOccurrence, repeatLabel, type Repeat } from "@/lib/habit-repeat";
import { createPortal } from "react-dom";
import { createRiteAction, removeRiteAction, setRiteStepsAction, updateRiteAction } from "@/app/actions";
import type { RiteView } from "./EveningRites";
import { Moon } from "./BeginEveningButton";
import { useEscape } from "@/lib/use-escape";
import { usePortalTarget } from "@/components/ui/EmbedHost";
import { IconPicker } from "@/components/tasks/IconPicker";
import { CoinIcon, CloseIcon } from "@/components/ui/Icons";
import { SettingsGear } from "@/components/ui/SettingsGear";
import { coinsForXp } from "@/lib/coins";
import { RiteGlyph, glyphFor } from "./RiteGlyph";
import { SubHabitList, type SubHabit } from "./SubHabitList";

const XP_PRESETS = [1, 3, 5, 10, 15];
const MINUTE_PRESETS = [5, 10, 15, 30];

/**
 * Create or edit an evening rite (name, note, XP, whether it's non-negotiable)
 * or, with slot="day", a daily habit — the same thing on the day side, plus
 * an avatar (a plain checkbox unless a portrait is picked), coins, and how
 * long it usually takes (focus mode's timer).
 */
export function RiteEditorDialog({
  rite,
  defaultCore = true,
  slot = rite?.slot === "day" ? "day" : "evening",
  startWithSub = false,
  extraSubs,
  onClose,
}: {
  /** More of this habit's parts shown with its sub-habits (the cleaning habit's spaces and chores). */
  extraSubs?: React.ReactNode;
  /** Opened from "Add a sub-habit": straight to a new sub-habit. */
  startWithSub?: boolean;
  rite?: RiteView;
  defaultCore?: boolean;
  slot?: "evening" | "day";
  onClose: () => void;
}) {
  const isHabit = slot === "day";
  useEscape(() => close());
  const [title, setTitle] = useState(rite?.title ?? "");
  const [description, setDescription] = useState(rite?.description ?? "");
  const [xp, setXp] = useState(rite?.xp_value ?? 5);
  const [isCore, setIsCore] = useState(rite?.is_core ?? defaultCore);
  const [days, setDays] = useState<number[]>(rite?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [dueTime, setDueTime] = useState(rite?.due_time ?? "");
  // A window instead of a deadline: it floats from dueTime until windowTo on the calendar (Gym 7–10).
  const [windowTo, setWindowTo] = useState(rite?.window_to ?? "");
  const [icon, setIcon] = useState<{ url: string; source: "library" | "ai" } | null>(rite?.icon_key && rite.icon_source ? { url: rite.icon_key, source: rite.icon_source } : null);
  const [coinValue, setCoinValue] = useState<number | null>(rite?.coin_value ?? null);
  const [minutes, setMinutes] = useState<number | null>(rite?.estimate_minutes ?? null);
  // Sub-habits: a checklist ticked off each day.
  const [subs, setSubs] = useState<SubHabit[]>(rite?.steps ?? []);
  const focusSub = !!startWithSub;
  const [repeatsOpen, setRepeatsOpen] = useState(true);
  // Or on an interval: every N days, weeks, months or years, from a start date.
  const [repeat, setRepeat] = useState<Repeat | null>(rite?.repeat ?? null);
  const todayKey = () => {
    const d = new Date(Date.now() - 330 * 60_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [customOpen, setCustomOpen] = useState(!!rite?.repeat && !(rite.repeat.every === 1 && (rite.repeat.unit === "week" || rite.repeat.unit === "month")));
  const [dueOpen, setDueOpen] = useState(!!rite?.due_time);
  // A habit's details are pills like the quest editor's (owner, Nov 3); one opens at a time, in place.
  const [pill, setPill] = useState<"repeats" | "takes" | "reward" | "due" | null>(null);
  const subsChanged = JSON.stringify(subs) !== JSON.stringify(rite?.steps ?? []);
  // Has anything changed? Then the footer's Close becomes Save (owner: "Close turns into Save").
  const dirty =
    !rite ||
    subsChanged ||
    title !== rite.title ||
    description !== (rite.description ?? "") ||
    xp !== rite.xp_value ||
    isCore !== rite.is_core ||
    JSON.stringify(days) !== JSON.stringify(rite.days ?? [0, 1, 2, 3, 4, 5, 6]) ||
    dueTime !== (rite.due_time ?? "") ||
    windowTo !== (rite.window_to ?? "") ||
    (icon?.url ?? null) !== (rite.icon_source ? rite.icon_key : null) ||
    coinValue !== (rite.coin_value ?? null) ||
    minutes !== (rite.estimate_minutes ?? null) ||
    JSON.stringify(repeat) !== JSON.stringify(rite.repeat ?? null);
  // "Certain days" shows the weekday picker; "Daily" is every day with nothing to pick.
  const [certainDays, setCertainDays] = useState(!rite?.repeat && (rite?.days?.length ?? 7) < 7);
  const [minutesOther, setMinutesOther] = useState(minutes !== null && !MINUTE_PRESETS.includes(minutes));
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(onClose, 180);
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        if (isHabit && !repeat && days.length === 0) throw new Error("Pick at least one day.");
        if (rite && !dirty) return close();
        const picture = { iconKey: icon?.url ?? null, iconSource: icon?.source ?? null };
        const schedule = isHabit ? { days: repeat ? null : days.length === 7 ? null : days, repeat, dueTime: dueTime || null, windowTo: dueTime && windowTo ? windowTo : null, ...picture, coinValue, estimateMinutes: minutes } : picture;
        const pending = subs;
        if (rite) {
          await updateRiteAction(rite.id, { title, description, isCore: isHabit ? true : isCore, xpValue: xp, ...schedule });
          if (subsChanged) await setRiteStepsAction(rite.id, pending);
        } else {
          const id = await createRiteAction({ title, description, isCore: isHabit ? true : isCore, xpValue: xp, slot, ...schedule });
          if (pending.length) await setRiteStepsAction(id, pending);
        }
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function remove() {
    if (!rite) return;
    startSaving(async () => {
      try {
        await removeRiteAction(rite.id);
        close();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't remove.");
      }
    });
  }

  const field = "rounded-lg border px-2.5";

  const portalTarget = usePortalTarget();
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
      style={{ background: "rgba(6,8,22,.65)" }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rite ? "Edit rite" : "New rite"}
        onClick={(e) => e.stopPropagation()}
        // Its parts take the order and hiding chosen in Settings › Layout.
        data-menu={isHabit ? "habit-editor" : undefined}
        className={`parchment parchment-framed ${isHabit ? "" : "moonlit"} flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl p-5 shadow-2xl ${closing ? "sheet-minimize-out" : "sheet-slide-up-in"}`}
      >
        <div data-embed-hide className="relative z-[1] flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg">
            {isHabit ? <HabitGlyph /> : <Moon size={22} />}
            {isHabit ? (rite ? "Edit habit" : "New habit") : rite ? "Edit rite" : isCore ? "New evening rite" : "New mini-quest"}
          </h3>
          <span className="flex items-center gap-1">
            {/* What this editor shows, and in what order: Settings › Layout. */}
            <SettingsGear to="menus" label="Layout settings" tone="plain" size={32} />
            {rite && (
              <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More" aria-expanded={menuOpen} className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] font-bold leading-none hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                ⋯
              </button>
            )}
            <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
              <CloseIcon size={14} />
            </button>
          </span>
        </div>

        {rite && menuOpen && (
          <div className="reveal qe-fact-panel relative z-[1] flex items-center gap-2 rounded-xl px-3 py-2 text-[14px]">
            {!confirmingDelete ? (
              <>
                <span className="font-semibold">{isHabit ? "This habit" : "This rite"}</span>
                <button type="button" onClick={() => setConfirmingDelete(true)} className="ml-auto h-8 rounded-full px-2.5 text-[13px] font-semibold hover:bg-black/5" style={{ color: "var(--t-warn)" }}>
                  Delete {isHabit ? "habit" : "rite"}
                </button>
              </>
            ) : (
              <>
                <span>Delete it for good?</span>
                <button type="button" onClick={remove} disabled={isSaving} className="ml-auto rounded-full px-3 py-1.5 font-semibold" style={{ background: "var(--t-warn)", color: "#fff" }}>
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                  Keep
                </button>
              </>
            )}
          </div>
        )}

        <div className="relative z-[1] flex items-start gap-3">
          {rite?.kind !== "wins" && (
            <div className="flex shrink-0 flex-col items-center gap-1">
              <IconPicker
                currentIcon={icon?.url ?? null}
                currentSource={icon?.source ?? "library"}
                taskTitle={title}
                taskDescription={description}
                theme="adventure"
                size={64}
                emptyContent={isHabit ? <CheckboxAvatar /> : <GlyphAvatar title={title} kind={rite?.kind ?? null} />}
                showEditHint
                clearLabel={isHabit ? "Use the checkbox" : "Use the simple icon"}
                onDraftChange={(url, source) => setIcon(url ? { url, source } : null)}
              />
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              autoFocus={!rite}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={isHabit ? "What's the habit? (e.g. Tell Tiffany what she's doing right)" : "What's the rite? (e.g. Lay out tomorrow's clothes)"}
              aria-label={isHabit ? "Habit" : "Rite"}
              className={`${field} h-11 font-semibold`}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A note to yourself (optional)"
              aria-label="Note"
              className={`${field} resize-none py-1.5`}
            />
          </div>
        </div>

        {/* Evening rites get subtasks too (owner, Nov 6: "check if Tiffany has any morning meetings…"). The special rites keep their own content. */}
        {(isHabit || !rite?.kind) && (
          <div data-mi="subs" className="relative z-[1] flex flex-col gap-1">
            <span className="text-[14.5px] font-semibold">{isHabit ? "Sub-habits" : "Subtasks"}</span>
            {extraSubs}
            <SubHabitList list={subs} onChange={setSubs} autoFocus={focusSub} noun={isHabit ? "sub-habit" : "subtask"} />
          </div>
        )}

        {isHabit && (
          <div data-mi="pills" className="relative z-[1] flex flex-wrap items-center gap-1.5" role="group" aria-label="Habit details">
            {(
              [
                ["repeats", <span key="r" className="text-[14px] leading-none">↻</span>, repeat ? repeatLabel(repeat) : days.length === 7 ? "Daily" : days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") || "No days"],
                // eslint-disable-next-line @next/next/no-img-element -- card glyph
                ["takes", <img key="t" src="/design/ui-clock.png" alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0" />, minutes ? (minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes} min`) : "Time"],
                ["reward", <span key="x" className="text-[13px] leading-none" style={{ color: "var(--t-xp, #6a4b0e)" }}>✦</span>, `${xp} XP${(coinValue ?? coinsForXp(xp)) ? ` · ${coinValue ?? coinsForXp(xp)} 🪙` : ""}`],
                // eslint-disable-next-line @next/next/no-img-element -- card glyph
                ["due", <img key="d" src="/design/ui-calendar.png" alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0" />, dueTime ? (windowTo ? spanWords(dueTime, windowTo) : `by ${shortClock(dueTime)}`) : "When"],
              ] as const
            ).map(([k, icon, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPill((p) => (p === k ? null : k))}
                aria-expanded={pill === k}
                className="qe-fact flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold"
                data-open={pill === k ? "true" : undefined}
              >
                <span aria-hidden className="flex items-center">{icon}</span>
                <span className="max-w-[160px] truncate">{label}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-60 transition-transform" style={{ transform: pill === k ? "rotate(180deg)" : undefined }}>
                  <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}

        {isHabit && (
          <div data-mi="repeats" className={`relative z-[1] flex flex-col gap-2 ${pill === "repeats" ? "reveal qe-fact-panel rounded-xl p-3" : "hidden"}`}>
            <button type="button" onClick={() => setRepeatsOpen((o) => !o)} aria-expanded={repeatsOpen} className="hidden items-center gap-1.5 self-start text-[14.5px] font-semibold">
              <Caret open={repeatsOpen} />
              Repeats
              {!repeatsOpen && <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>{repeat ? repeatLabel(repeat).toLowerCase() : days.length === 7 ? "daily" : days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") || "no days"}</span>}
            </button>
            {(repeatsOpen || isHabit) && (
            <div className="reveal flex flex-col gap-2">
            {/* Every week, month or year (or any number of them), from a start date. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["daily", "Daily"],
                  ["days", "Certain days"],
                  ["week", "Every week"],
                  ["month", "Every month"],
                  ["custom", "Custom…"],
                ] as const
              ).map(([k, label]) => {
                const on = k === "daily" ? !repeat && !certainDays : k === "days" ? !repeat && certainDays : k === "custom" ? !!repeat && customOpen : !!repeat && !customOpen && repeat.every === 1 && repeat.unit === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (k === "daily") return (setRepeat(null), setCustomOpen(false), setCertainDays(false), setDays([0, 1, 2, 3, 4, 5, 6]));
                      if (k === "days") return (setRepeat(null), setCustomOpen(false), setCertainDays(true));
                      if (k === "custom") return (setCustomOpen(true), setRepeat((r) => r ?? { every: 2, unit: "week", from: todayKey() }));
                      setCustomOpen(false);
                      setRepeat((r) => ({ every: 1, unit: k, from: r?.from ?? todayKey() }));
                    }}
                    className="h-8 rounded-full px-3 text-[13px] font-semibold"
                    style={on ? { background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #5a4520" } : { border: "1px solid #b39a6a", color: "var(--t-ink)" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {repeat && (
              <div className="reveal flex flex-wrap items-center gap-1.5 text-[14px]">
                {customOpen && (
                  <>
                    <span>Every</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={999}
                      value={repeat.every}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setRepeat({ ...repeat, every: Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))) })}
                      aria-label="How many"
                      className="h-8 w-[58px] rounded-full border px-1.5 text-center text-[16px] font-semibold tabular-nums"
                      style={{ borderColor: "#b39a6a" }}
                    />
{(["day", "week", "month", "year"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        aria-pressed={repeat.unit === u}
                        onClick={() => setRepeat({ ...repeat, unit: u })}
                        className="h-8 rounded-full px-2.5 text-[13px] font-semibold"
                        style={repeat.unit === u ? { background: "rgba(217,180,95,.55)", border: "1px solid #5a4520", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "var(--t-ink-soft)" }}
                      >
                        {repeat.every === 1 ? u : `${u}s`}
                      </button>
                    ))}
                  </>
                )}
                <span>starting</span>
                <input type="date" value={repeat.from} onChange={(e) => e.target.value && setRepeat({ ...repeat, from: e.target.value })} aria-label="Starting" className="h-8 rounded-lg border px-2 text-[15px]" style={{ borderColor: "#b39a6a" }} />
                <span className="w-full text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                  It comes up on {repeat.from <= todayKey() ? "each" : "its first"} day and stays up until you do it or skip it. Next: {new Date(`${nextOccurrence(repeat, todayKey())}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: repeat.unit === "year" ? "numeric" : undefined })}.
                </span>
              </div>
            )}
            {!repeat && certainDays && (
            <div className="reveal flex flex-wrap items-center gap-1.5">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                    onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())}
                    className="h-8 w-8 rounded-full text-[13.5px] font-bold"
                    style={on ? { background: "rgba(217,180,95,.55)", border: "1px solid #5a4520", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "var(--t-ink-soft)" }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            )}
            </div>
            )}
          </div>
        )}

        {isHabit && (
          <div data-mi="takes" className={`relative z-[1] flex-wrap items-center gap-1.5 ${pill === "takes" ? "reveal qe-fact-panel flex rounded-xl p-3" : "hidden"}`}>
            <span className="mr-0.5 text-[14.5px] font-semibold">Takes</span>
            {MINUTE_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m}
                onClick={() => (setMinutes(minutes === m ? null : m), setMinutesOther(false))}
                className="h-8 min-w-10 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums"
                style={
                  minutes === m
                    ? { background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #5a4520" }
                    : { border: "1px solid #b39a6a", color: "var(--t-ink)" }
                }
              >
                {m}m
              </button>
            ))}
            {!minutesOther ? (
              <button
                type="button"
                onClick={() => setMinutesOther(true)}
                className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
                style={{ border: "1px solid #b39a6a", color: "var(--t-ink)" }}
              >
                Other
              </button>
            ) : (
              <span className="reveal flex h-8 items-center gap-1 rounded-full border pl-1 pr-2.5" style={{ borderColor: "#5a4520", background: minutes !== null && !MINUTE_PRESETS.includes(minutes) ? "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)" : undefined }}>
                <input
                  type="number"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  inputMode="numeric"
                  min={1}
                  max={600}
                  value={minutes ?? ""}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value) || 0);
                    setMinutes(n > 0 ? Math.min(600, n) : null);
                  }}
                  aria-label="Minutes it takes (any amount)"
                  className="h-7 w-[52px] appearance-none rounded-full border-0 bg-transparent px-1 text-center text-[16px] font-semibold tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[13px] font-semibold">min</span>
              </span>
            )}
            <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              {minutes ? "focus mode's timer" : "optional"}
            </span>
          </div>
        )}

        {isHabit && pill === "reward" && (
          <div data-mi="xp" className="reveal qe-fact-panel relative z-[1] flex flex-col gap-2 rounded-xl p-3">
            {/* The quest editor's own XP row: −5 and +5 either side of the bar, the amount to its right. */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setXp(Math.max(0, xp - 5))} aria-label="5 XP less" title="−5 XP" className="xp-nudge flex h-9 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold tabular-nums">
                −5
              </button>
              <input type="range" min={0} max={100} step={5} value={Math.min(100, xp)} onChange={(e) => setXp(Number(e.target.value))} aria-label="XP reward" className="h-8 min-w-0 flex-1" style={{ accentColor: "var(--t-xp)" }} />
              <button type="button" onClick={() => setXp(Math.min(500, xp + 5))} aria-label="5 XP more" title="+5 XP" className="xp-nudge flex h-9 shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold tabular-nums">
                +5
              </button>
              <span className="flex h-9 shrink-0 items-center gap-0.5">
                <span className="xp-type flex h-full items-center pr-px">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    value={xp}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setXp(Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))))}
                    aria-label="XP amount"
                    className="bare-input h-full w-11 bg-transparent px-1 text-right text-[18px] font-bold tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ color: "var(--t-xp)" }}
                  />
                </span>
                <span className="text-[12px] font-bold" style={{ color: "var(--t-xp)" }}>XP</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg border px-1" style={{ borderColor: "#b39a6a" }} title="Coins earned each time">
                <button type="button" onClick={() => setCoinValue(Math.max(0, (coinValue ?? coinsForXp(xp)) - 1))} aria-label="Fewer coins" className="flex h-7 w-6 items-center justify-center text-[17px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
                  −
                </button>
                <CoinIcon size={16} />
                <span className="min-w-5 text-center text-[15px] font-bold tabular-nums" aria-live="polite">{coinValue ?? coinsForXp(xp)}</span>
                <button type="button" onClick={() => setCoinValue(Math.min(1000, (coinValue ?? coinsForXp(xp)) + 1))} aria-label="More coins" className="flex h-7 w-6 items-center justify-center text-[17px] leading-none" style={{ color: "var(--t-ink-soft)" }}>
                  +
                </button>
              </span>
              <span className="ml-auto text-[11.5px]" style={{ color: "var(--t-ink-soft)" }}>
                {coinValue === null ? "coins follow XP (1 per 30)" : (
                  <button type="button" onClick={() => setCoinValue(null)} className="underline">
                    custom coins · reset to auto
                  </button>
                )}
              </span>
            </div>
          </div>
        )}

        {!isHabit && (
        <div data-mi="xp" className="relative z-[1] flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[14.5px] font-semibold">XP</span>
          {XP_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setXp(v)}
              className="h-8 min-w-9 rounded-full px-2.5 text-[13.5px] font-semibold tabular-nums"
              style={
                xp === v
                  ? { background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #5a4520" }
                  : { border: "1px solid #b39a6a", color: "var(--t-ink)" }
              }
            >
              {v}
            </button>
          ))}
          <input
            type="number"
                  onFocus={(e) => e.currentTarget.select()}
            inputMode="numeric"
            min={0}
            max={500}
            value={XP_PRESETS.includes(xp) ? "" : xp}
            placeholder="other"
            onChange={(e) => setXp(Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))))}
            aria-label="XP (any amount)"
            className="other-pill h-8 w-[78px] appearance-none rounded-full border bg-[rgba(255,250,238,.7)] px-2 text-center text-[15px] font-semibold tabular-nums placeholder:font-normal placeholder:italic placeholder:text-[13.5px] placeholder:text-[var(--t-ink-soft)] [appearance:textfield] focus:outline-none focus:ring-2 focus:ring-[rgba(138,97,22,.35)] [&::-webkit-inner-spin-button]:appearance-none"
            style={{ borderColor: XP_PRESETS.includes(xp) ? "#b39a6a" : "#5a4520", background: XP_PRESETS.includes(xp) ? undefined : "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)" }}
          />
        </div>
        )}

        {isHabit && (
          <div data-mi="due" className={`relative z-[1] flex-col gap-2 ${pill === "due" ? "reveal qe-fact-panel flex rounded-xl p-3" : "hidden"}`}>
            <button type="button" onClick={() => setDueOpen((o) => !o)} aria-expanded={dueOpen} className="hidden items-center gap-1.5 self-start text-[14.5px] font-semibold">
              <Caret open={dueOpen} />
              {windowTo ? "Time" : "Due by"}
              {!dueOpen && <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>{dueTime ? (windowTo ? `${dueTime}–${windowTo}` : dueTime) : "any time"}</span>}
            </button>
            {(dueOpen || isHabit) && (
            <label className="reveal flex items-center gap-2 text-[14.5px] font-semibold">
              <TimeToken value={dueTime} onChange={setDueTime} label={windowTo ? "From" : "Due by (optional)"} kind="any" compact />
              {dueTime && (windowTo ? (
                <>
                  <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>to</span>
                  <TimeToken value={windowTo} onChange={setWindowTo} label="Until" kind="any" compact />
                </>
              ) : (
                <button type="button" onClick={() => setWindowTo(nextHour(dueTime, 3))} title="Any time in a window: the calendar finds it a free hour inside" className="text-[13px] font-normal underline" style={{ color: "var(--t-ink-soft)" }}>
                  + window
                </button>
              ))}
              {dueTime ? (
                <button type="button" onClick={() => (setDueTime(""), setWindowTo(""))} className="text-[13px] font-normal underline" style={{ color: "var(--t-ink-soft)" }}>
                  clear
                </button>
              ) : (
                <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>
                  optional
                </span>
              )}
            </label>
            )}
          </div>
        )}


        {!isHabit && (
        <label className="relative z-[1] flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5" style={{ background: "rgba(255,250,238,.5)", border: "1px solid #b39a6a" }}>
          <input
            type="checkbox"
            checked={isCore}
            onChange={(e) => setIsCore(e.target.checked)}
            className="mt-1 h-4 w-4"
            style={{ accentColor: "var(--t-gold-deep)" }}
          />
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold">Non-negotiable</span>
            <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              Shown at the top of the evening side every night. Unchecked, it lives in Additional Mini-Quests.
            </span>
          </span>
        </label>
        )}

        {error && (
          <p className="relative z-[1] text-sm" style={{ color: "var(--t-warn)", order: 98 }}>
            {error}
          </p>
        )}

        <div className="sticky -bottom-5 z-[2] -mx-5 -mb-5 flex items-center justify-between gap-2 px-5 pb-5 pt-2" style={{ order: 99, background: "linear-gradient(180deg, rgba(240,226,192,0), rgba(240,226,192,.96) 30%)" }}>
          <span />
          <span className="flex gap-2">

            <button
              type="button"
              data-submit
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow h-10 rounded-full px-5 text-[15px] transition-colors disabled:opacity-50"
              style={rite && !dirty ? { border: "1.5px solid #a58c66", color: "var(--t-ink)" } : { background: "var(--t-gold)", color: "#2a1c10" }}
            >
              {isSaving ? "Saving…" : rite ? (dirty ? "Save" : "Close") : isHabit ? "Add habit" : "Add rite"}
            </button>
          </span>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

/** The empty avatar: the habit's plain checkbox. */
function CheckboxAvatar() {
  return (
    <span className="flex h-full w-full items-center justify-center rounded-full" style={{ background: "rgba(255,250,238,.6)", border: "2px dashed #a58c66" }}>
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="#a58c66" strokeWidth="2" />
        <path d="M7.5 12.4l3 3 6-6.4" stroke="#a58c66" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** The empty avatar for an evening rite: the glyph its name suggests. */
function GlyphAvatar({ title, kind }: { title: string; kind: string | null }) {
  const g = glyphFor({ title, kind });
  return (
    <span className="flex h-full w-full items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,.7), rgba(214,220,240,.35))", border: "2px solid #8e8aa8" }}>
      {g === "moon" ? <Moon size={30} /> : <RiteGlyph kind={g} size={32} />}
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined, color: "var(--t-ink-soft)" }}>
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The habits mark: a circling arrow with a check. */
function HabitGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5a8.5 8.5 0 1 1-8.1 6" stroke="#a88a3f" strokeWidth="2" strokeLinecap="round" />
      <path d="M3.2 4.8l.8 4.9 4.8-1.1" stroke="#a88a3f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 12.4l2.4 2.4 4.6-5" stroke="#4f7d38" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "07:00" plus some hours ("10:00"), kept within the day. */
function nextHour(t: string, hours: number) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return "";
  const h = Math.min(23, Number(m[1]) + hours);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** "7 AM", "7:30 PM". */
function shortClock(t: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return m[2] === "00" ? `${h12} ${ap}` : `${h12}:${m[2]} ${ap}`;
}
/** "7–10 AM", or "11 AM–1 PM" across noon. */
function spanWords(from: string, to: string) {
  const a = shortClock(from);
  const b = shortClock(to);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}
