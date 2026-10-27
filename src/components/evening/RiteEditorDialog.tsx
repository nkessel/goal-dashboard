"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { createRiteAction, removeRiteAction, setRiteStepsAction, updateRiteAction } from "@/app/actions";
import type { RiteView } from "./EveningRites";
import { Moon } from "./BeginEveningButton";
import { useEscape } from "@/lib/use-escape";
import { usePortalTarget } from "@/components/ui/EmbedHost";
import { IconPicker } from "@/components/tasks/IconPicker";
import { CoinIcon } from "@/components/ui/Icons";
import { coinsForXp } from "@/lib/coins";
import { RiteGlyph, glyphFor } from "./RiteGlyph";

const XP_PRESETS = [1, 3, 5, 10, 15];
const MINUTE_PRESETS = [5, 10, 15, 30, 60];

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
  onClose,
}: {
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
  const [icon, setIcon] = useState<{ url: string; source: "library" | "ai" } | null>(rite?.icon_key && rite.icon_source ? { url: rite.icon_key, source: rite.icon_source } : null);
  const [coinValue, setCoinValue] = useState<number | null>(rite?.coin_value ?? null);
  const [minutes, setMinutes] = useState<number | null>(rite?.estimate_minutes ?? null);
  // Sub-habits: a checklist ticked off each day.
  const [subs, setSubs] = useState<{ id: string; title: string }[]>(rite?.steps ?? []);
  const [subText, setSubText] = useState("");
  const [subsOpen, setSubsOpen] = useState((rite?.steps?.length ?? 0) > 0 || !!startWithSub);
  const focusSub = !!startWithSub;
  const [repeatsOpen, setRepeatsOpen] = useState(true);
  const [dueOpen, setDueOpen] = useState(!!rite?.due_time);
  const subsChanged = JSON.stringify(subs) !== JSON.stringify(rite?.steps ?? []);
  function addSub() {
    const t = subText.replace(/\s+/g, " ").trim();
    if (!t) return;
    setSubs((l) => [...l, { id: Math.random().toString(36).slice(2, 10), title: t }]);
    setSubText("");
  }
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
        if (isHabit && days.length === 0) throw new Error("Pick at least one day.");
        const picture = { iconKey: icon?.url ?? null, iconSource: icon?.source ?? null };
        const schedule = isHabit ? { days: days.length === 7 ? null : days, dueTime: dueTime || null, ...picture, coinValue, estimateMinutes: minutes } : picture;
        const pending = subText.trim() ? [...subs, { id: Math.random().toString(36).slice(2, 10), title: subText.trim() }] : subs;
        if (rite) {
          await updateRiteAction(rite.id, { title, description, isCore: isHabit ? true : isCore, xpValue: xp, ...schedule });
          if (isHabit && (subsChanged || pending !== subs)) await setRiteStepsAction(rite.id, pending);
        } else {
          const id = await createRiteAction({ title, description, isCore: isHabit ? true : isCore, xpValue: xp, slot, ...schedule });
          if (isHabit && pending.length) await setRiteStepsAction(id, pending);
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
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${closing ? "overlay-fade-out" : "overlay-fade-in"}`}
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
        className={`parchment parchment-framed ${isHabit ? "" : "moonlit"} flex w-full max-w-md flex-col gap-3 rounded-2xl p-5 shadow-2xl ${closing ? "sheet-minimize-out" : "sheet-slide-up-in"}`}
      >
        <div data-embed-hide className="relative z-[1] flex items-center justify-between">
          <h3 className="font-display flex items-center gap-2 text-lg">
            {isHabit ? <HabitGlyph /> : <Moon size={22} />}
            {isHabit ? (rite ? "Edit habit" : "New habit") : rite ? "Edit rite" : isCore ? "New evening rite" : "New mini-quest"}
          </h3>
          <button type="button" onClick={close} aria-label="Close" className="h-8 w-8 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>

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
              <span className="text-[11px]" style={{ color: "var(--t-ink-soft)" }}>
                Avatar
              </span>
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
        {!icon && (
          <p className="relative z-[1] -mt-1.5 m-0 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
            {isHabit ? "It shows as a checkbox. Tap the avatar to give it a portrait instead." : "Its icon follows its name. Tap it to give it a portrait instead."}
          </p>
        )}

        {isHabit && (
          <div data-mi="repeats" className="relative z-[1] flex flex-col gap-2">
            <button type="button" onClick={() => setRepeatsOpen((o) => !o)} aria-expanded={repeatsOpen} className="flex items-center gap-1.5 self-start text-[14.5px] font-semibold">
              <Caret open={repeatsOpen} />
              Repeats
              {!repeatsOpen && <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>{days.length === 7 ? "every day" : days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") || "no days"}</span>}
            </button>
            {repeatsOpen && (
            <div className="reveal flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDays(days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6])}
                className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
                style={days.length === 7 ? { background: "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)", color: "#2a1c10", border: "1px solid #5a4520" } : { border: "1px solid #b39a6a", color: "var(--t-ink)" }}
              >
                Every day
              </button>
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

        {isHabit && (
          <div data-mi="takes" className="relative z-[1] flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[14.5px] font-semibold">Takes</span>
            {MINUTE_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minutes === m}
                onClick={() => setMinutes(minutes === m ? null : m)}
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
            <input
              type="number"
              onFocus={(e) => e.currentTarget.select()}
              inputMode="numeric"
              min={1}
              max={600}
              value={minutes !== null && !MINUTE_PRESETS.includes(minutes) ? minutes : ""}
              placeholder="other"
              onChange={(e) => {
                const n = Math.round(Number(e.target.value) || 0);
                setMinutes(n > 0 ? Math.min(600, n) : null);
              }}
              aria-label="Minutes it takes (any amount)"
              className="h-8 w-[60px] rounded-full border px-1.5 text-center text-[16px] font-semibold tabular-nums"
              style={{
                borderColor: minutes !== null && !MINUTE_PRESETS.includes(minutes) ? "#5a4520" : "#b39a6a",
                background: minutes !== null && !MINUTE_PRESETS.includes(minutes) ? "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)" : undefined,
              }}
            />
            <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              {minutes ? "focus mode's timer" : "optional"}
            </span>
          </div>
        )}

        {isHabit && (
          <div data-mi="coins" className="relative z-[1] flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
              <CoinIcon size={17} /> Coins
            </span>
            <span className="flex h-8 items-center rounded-full border" style={{ borderColor: coinValue === null ? "#b39a6a" : "#5a4520" }}>
              <button
                type="button"
                onClick={() => setCoinValue(Math.max(0, (coinValue ?? coinsForXp(xp)) - 1))}
                aria-label="Fewer coins"
                className="flex h-8 w-8 items-center justify-center text-[17px] leading-none"
                style={{ color: "var(--t-ink-soft)" }}
              >
                −
              </button>
              <span className="min-w-6 text-center text-[15px] font-bold tabular-nums" style={{ color: coinValue === null ? "var(--t-ink-soft)" : "#8a6116" }} aria-live="polite">
                {coinValue ?? coinsForXp(xp)}
              </span>
              <button
                type="button"
                onClick={() => setCoinValue(Math.min(1000, (coinValue ?? coinsForXp(xp)) + 1))}
                aria-label="More coins"
                className="flex h-8 w-8 items-center justify-center text-[17px] leading-none"
                style={{ color: "var(--t-ink-soft)" }}
              >
                +
              </button>
            </span>
            {coinValue === null ? (
              <span className="text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
                automatic (1 per 30 XP)
              </span>
            ) : (
              <button type="button" onClick={() => setCoinValue(null)} className="text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                back to automatic
              </button>
            )}
          </div>
        )}

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
            className="h-8 w-[60px] rounded-full border px-1.5 text-center text-[16px] font-semibold tabular-nums"
            style={{ borderColor: XP_PRESETS.includes(xp) ? "#b39a6a" : "#5a4520", background: XP_PRESETS.includes(xp) ? undefined : "radial-gradient(circle at 32% 28%, #f6dc8e, #d9b45f 55%, #a88a3f)" }}
          />
        </div>

        {isHabit && (
          <div data-mi="due" className="relative z-[1] flex flex-col gap-2">
            <button type="button" onClick={() => setDueOpen((o) => !o)} aria-expanded={dueOpen} className="flex items-center gap-1.5 self-start text-[14.5px] font-semibold">
              <Caret open={dueOpen} />
              Due by
              {!dueOpen && <span className="text-[13px] font-normal" style={{ color: "var(--t-ink-soft)" }}>{dueTime || "any time"}</span>}
            </button>
            {dueOpen && (
            <label className="reveal flex items-center gap-2 pl-4 text-[14.5px] font-semibold">
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                aria-label="Due by (optional)"
                className="h-9 rounded-lg border px-2 text-[16px] font-normal"
                style={{ borderColor: "#b39a6a" }}
              />
              {dueTime ? (
                <button type="button" onClick={() => setDueTime("")} className="text-[13px] font-normal underline" style={{ color: "var(--t-ink-soft)" }}>
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

        {isHabit && (
          <div data-mi="subs" className="relative z-[1] flex flex-col gap-1.5">
            {subs.length > 0 && <span className="text-[14.5px] font-semibold">Sub-habits</span>}
            {!subsOpen && subs.length === 0 ? (
              <button type="button" onClick={() => setSubsOpen(true)} className="flex h-9 items-center gap-2 self-start rounded-full px-3 text-[14px] font-semibold" style={{ border: "1.5px dashed #b39a6a", color: "var(--t-ink)" }}>
                <span aria-hidden className="text-[16px] leading-none" style={{ color: "#8a6116" }}>+</span>
                Add a sub-habit
                <span className="text-[12px] font-normal" style={{ color: "var(--t-ink-soft)" }}>steps you tick off each day</span>
              </button>
            ) : (
              <div className="reveal flex flex-col gap-1 pl-3">
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {subs.map((st, i) => (
                    <li key={st.id} className="flex items-center gap-2">
                      <span aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full" style={{ border: "2px solid #a58c66", background: "rgba(255,250,238,.6)" }} />
                      <input
                        value={st.title}
                        onChange={(e) => setSubs((l) => l.map((x) => (x.id === st.id ? { ...x, title: e.target.value } : x)))}
                        aria-label={`Sub-habit ${i + 1}`}
                        className="h-8 min-w-0 flex-1 rounded-md border-0 bg-transparent px-1 text-[15px]"
                      />
                      <button type="button" disabled={i === 0} onClick={() => setSubs((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })} aria-label="Move up" className="flex h-7 w-7 items-center justify-center rounded-full text-[14px] hover:bg-black/5 disabled:opacity-25">
                        ↑
                      </button>
                      <button type="button" onClick={() => setSubs((l) => l.filter((x) => x.id !== st.id))} aria-label={`Remove ${st.title}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] hover:bg-black/5" style={{ color: "var(--t-ink-soft)" }}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed text-[12px]" style={{ borderColor: "#a58c66", color: "var(--t-ink-soft)" }}>
                    +
                  </span>
                  <input
                    value={subText}
                    onChange={(e) => setSubText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        addSub();
                      }
                    }}
                    onBlur={addSub}
                    autoFocus={subs.length === 0 || focusSub}
                    placeholder={subs.length ? "Another step" : "e.g. Food and water"}
                    aria-label="Add a sub-habit"
                    className="h-8 min-w-0 flex-1 rounded-md border border-dashed bg-transparent px-2 text-[15px]"
                    style={{ borderColor: "#b39a6a" }}
                  />
                </div>
                <p className="m-0 text-[12px]" style={{ color: "var(--t-ink-soft)" }}>
                  Ticking the last one completes the habit for the day.
                </p>
              </div>
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

        <div className="relative z-[1] flex items-center justify-between gap-2 pt-1" style={{ order: 99 }}>
          {rite ? (
            !confirmingDelete ? (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold hover:bg-black/5" style={{ color: "var(--t-warn)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 7h14M10 11v6M14 11v6M6.5 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7M9.5 7V4.5h5V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete
              </button>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <button type="button" onClick={remove} disabled={isSaving} className="rounded-full px-3 py-1.5 font-semibold" style={{ background: "var(--t-warn)", color: "#fff" }}>
                  Yes, delete
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} style={{ color: "var(--t-ink-soft)" }}>
                  Keep
                </button>
              </span>
            )
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" onClick={close} className="h-10 rounded-full border-[1.5px] px-4 text-[15px] font-semibold transition-colors hover:bg-[rgba(139,112,64,.16)]" style={{ borderColor: "#a58c66", color: "var(--t-ink)" }}>
              Cancel
            </button>
            <button
              type="button"
              data-submit
              onClick={save}
              disabled={isSaving || !title.trim()}
              className="hover-glow h-10 rounded-full px-5 text-[15px] disabled:opacity-50"
              style={{ background: "var(--t-gold)", color: "#2a1c10" }}
            >
              {isSaving ? "Saving…" : rite ? "Save" : isHabit ? "Add habit" : "Add rite"}
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
