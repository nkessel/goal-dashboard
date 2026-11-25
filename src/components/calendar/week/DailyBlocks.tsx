"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { saveDayHold } from "@/lib/day-holds";
import { DailyEventEditor, useDailySettings } from "../DailyEvents";
import type { DailyLayer, EssentialsLook, HabitLook } from "../CalendarLayers";
import { SCHEDULER_DEFAULTS, dailyEvents, holdAt, localDayKey, mealsOn, type DayHold, type SchedulerSettings } from "@/lib/auto-schedule";
import { habitBlocksOn } from "@/lib/timed-habits";
import { formatLocal } from "@/lib/calendar-dates";
import { fromFeedback } from "@/lib/from-feedback";

/**
 * A day's essentials (meal time, wind-down, the after-dinner tidy) where there's
 * room for them, quieter than quests; and habits with a set time (Gym at 7),
 * which look like quests unless you choose otherwise.
 */
/** Asks the day's holds whether one sits at this point and opens its menu (a tap needs a second one soon after). */
export function holdMenuAt(day: Date, x: number, y: number, kind: "tap" | "menu", t: number): boolean {
  const ev = new CustomEvent("hold-menu", { cancelable: true, detail: { dayKey: localDayKey(day), x, y, kind, t } });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

// Each non-negotiable's own look, when it differs from the calendar's setting ("quest" card or dashed "hold").
const LOOKS_KEY = "hold-looks";

let looksCache: { raw: string | null; val: Record<string, "quest" | "hold"> } = { raw: null, val: {} };

function readLooks(): Record<string, "quest" | "hold"> {
  try {
    const raw = window.localStorage.getItem(LOOKS_KEY);
    if (raw !== looksCache.raw) looksCache = { raw, val: raw ? JSON.parse(raw) : {} };
    return looksCache.val;
  } catch {
    return {};
  }
}

const noLooks: Record<string, "quest" | "hold"> = {};

function subscribeLooks(cb: () => void) {
  window.addEventListener("hold-looks", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("hold-looks", cb);
    window.removeEventListener("storage", cb);
  };
}

function setLook(key: string, look: "quest" | "hold" | null) {
  const next = { ...readLooks() };
  if (look) next[key] = look;
  else delete next[key];
  try {
    window.localStorage.setItem(LOOKS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("hold-looks"));
}

type HoldTarget = { key: string; label: string; at: number; minutes: number; kept: boolean; crowded: boolean; meal: boolean };

/**
 * The day's non-negotiables: meals and the like float inside their ranges around everything else, and a
 * timed habit (Gym 7–10) takes the first free stretch of its window. When there's no room left in the range,
 * it shows in a muted red (owner, Nov 4). Right-click or double-tap one for its menu: keep it where it is
 * (the red goes), move it or change its length, or leave it out today.
 */
export function DailyBlocks({ day, daily, essentials, habitLook, busy, topOf, isAdventure }: { day: Date; daily: DailyLayer; essentials: EssentialsLook; habitLook: HabitLook; busy: { start: number; end: number }[]; topOf: (d: Date) => number; isAdventure: boolean }) {
  const router = useRouter();
  const dayKey = localDayKey(day);
  const looks = useSyncExternalStore(subscribeLooks, readLooks, () => noLooks);
  // Changes made here show at once, before the page catches up.
  const [mine, setMine] = useState<Record<string, DayHold | null>>({});
  const [menu, setMenu] = useState<HoldTarget | null>(null);
  const [edit, setEdit] = useState(false);
  const [every, setEvery] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // The every-day editor is tall: bring the whole menu into view when it opens.
  useEffect(() => {
    if (every) menuRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [every]);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (fromFeedback(e) || (menuRef.current && menuRef.current.contains(e.target as Node))) return;
      setMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  const current = useDailySettings(daily.settings);
  const base = { ...SCHEDULER_DEFAULTS, ...(current ?? {}) } as SchedulerSettings;
  const dayHolds: Record<string, DayHold> = { ...(base.essentialDays?.[dayKey] ?? {}) };
  for (const [k, v] of Object.entries(mine)) {
    if (v) dayHolds[k] = v;
    else delete dayHolds[k];
  }
  const settings = { ...base, essentialDays: { ...(base.essentialDays ?? {}), [dayKey]: dayHolds } };
  const placed = habitBlocksOn(daily.habits, day, busy, dayHolds);
  const habits = habitLook === "hidden" ? [] : placed;
  const taken = [...busy, ...placed];
  const holds =
    essentials === "hidden"
      ? []
      : mealsOn(day, settings).map((m) => {
          const at = m.kept ? m.from : holdAt(m.from, m.to, m.minutes, taken, m.ideal);
          // Crowded out: it shows where it would best go, in red, until it's kept, moved or left out.
          const shown = at ?? m.ideal ?? m.from;
          taken.push({ start: shown, end: shown + m.minutes * 60_000 });
          return { ...m, at: shown, crowded: at === null };
        });

  const pick = (t: HoldTarget) => {
    setEdit(false);
    setEvery(false);
    setMenu(t);
  };
  // The holds let clicks through (a quest can be dragged or added over them); the grid asks them instead.
  const targets: Record<string, HoldTarget> = {};
  const handlers = (t: HoldTarget) => {
    targets[t.key] = t;
    return { "data-hold-day": dayKey, "data-hold-key": t.key };
  };
  const onHoldMenu = useEffectEvent((e: Event) => {
    const d = (e as CustomEvent<{ dayKey: string; x: number; y: number; kind: "tap" | "menu"; t: number }>).detail;
    if (d.dayKey !== dayKey) return;
    const el = [...document.querySelectorAll<HTMLElement>(`[data-hold-day="${dayKey}"]`)].find((n) => {
      const r = n.getBoundingClientRect();
      return d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom;
    });
    const t = el ? targets[el.dataset.holdKey ?? ""] : undefined;
    if (!t) return;
    // A crowded (muted red) one opens at a single tap or click (owner, Nov 4).
    if (d.kind === "tap" && !t.crowded) {
      const last = lastTap.current;
      if (!(last && last.key === t.key && d.t - last.at < 360)) {
        lastTap.current = { key: t.key, at: d.t };
        return;
      }
      lastTap.current = null;
    }
    e.preventDefault();
    pick(t);
  });
  useEffect(() => {
    const on = (e: Event) => onHoldMenu(e);
    window.addEventListener("hold-menu", on);
    return () => window.removeEventListener("hold-menu", on);
  }, []);
  const save = (key: string, hold: DayHold | null) => {
    setMine((m) => ({ ...m, [key]: hold }));
    saveDayHold(daily.settings, dayKey, key, hold)
      .then(() => router.refresh())
      .catch(() => setMine((m) => {
        const n = { ...m };
        delete n[key];
        return n;
      }));
  };
  const minsOf = (ms: number) => {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  };
  const keepAt = (t: HoldTarget, at: number, minutes = t.minutes) => {
    save(t.key, { at: minsOf(at), minutes });
    setMenu({ ...t, at, minutes, kept: true, crowded: false });
  };
  const red: React.CSSProperties = { background: "rgba(178,84,66,.13)", border: "1.5px dashed rgba(160,70,52,.6)", borderRadius: 6, color: "#8a3f2c" };

  // The grid is parchment in every theme: a soft brown ink reads on it.
  const ink = isAdventure ? "#6b5631" : "var(--t-ink-soft)";
  const clock = (ms: number) => formatLocal(ms, { hour: "numeric", minute: "2-digit" });
  const chip = "h-8 rounded-full px-2.5 text-[12.5px] font-semibold";
  return (
    <>
      {holds.map((h) => {
        const top = topOf(new Date(h.at));
        const height = Math.max(16, topOf(new Date(h.at + h.minutes * 60_000)) - top - 2);
        const look: React.CSSProperties = h.crowded
          ? red
          : essentials === "soft"
            ? { background: "rgba(168,138,63,.16)", borderRadius: 6 }
            : essentials === "line"
              ? { borderLeft: "3px solid rgba(139,112,64,.55)" }
              : { border: `1.5px ${h.kept ? "solid" : "dashed"} rgba(139,112,64,.6)`, borderRadius: 6 };
        const t: HoldTarget = { key: h.key, label: h.name, at: h.at, minutes: h.minutes, kept: !!h.kept, crowded: h.crowded, meal: true };
        const asQuest = (looks[h.key] ?? (essentials === "quest" ? "quest" : "hold")) === "quest";
        if (asQuest) {
          // Like a quest: a storybook card with its emoji.
          return (
            <div
              key={h.key}
              {...handlers(t)}
              title={`${h.name}${h.crowded ? ": no free time left for it here" : ""} · right-click or double-tap`}
              className="quest-card absolute inset-x-0.5 flex items-center gap-1.5 overflow-hidden"
              style={{ top: top + 1, height, zIndex: menu?.key === h.key ? 3 : 0, padding: height >= 26 ? "3px 6px 3px 4px" : "1px 6px", borderRadius: 14, ...(h.crowded ? { background: "linear-gradient(rgba(178,84,66,.2), rgba(178,84,66,.2)), linear-gradient(180deg,#f6e8c4,#e8d29c)", border: "1.5px dashed rgba(160,70,52,.7)" } : {}) }}
            >
              <span aria-hidden className="shrink-0" style={{ fontSize: Math.min(20, Math.max(12, height - 10)), lineHeight: 1 }}>
                {h.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate" style={{ color: h.crowded ? "#8a3f2c" : "#3a2a14", fontSize: 12.5, lineHeight: 1.15 }}>
                  {h.name}
                </span>
                {height >= 34 && (
                  <span className="block truncate" style={{ color: h.crowded ? "#8a3f2c" : "var(--t-ink-soft)", fontSize: 10.5, lineHeight: 1.2 }}>
                    {clock(h.at)}
                  </span>
                )}
              </span>
            </div>
          );
        }
        return (
          <div
            key={h.key}
            {...handlers(t)}
            title={h.crowded ? `${h.name}: no free time left for it here (right-click or double-tap)` : `${h.name}: ${h.kept ? "kept here" : "kept free (floats as things are planned)"} · right-click or double-tap`}
            className="absolute inset-x-0.5 overflow-hidden px-1.5 py-0.5 text-[11px] italic leading-tight"
            style={{ top: top + 1, height, color: ink, opacity: 0.9, zIndex: menu?.key === h.key ? 3 : 0, ...look }}
          >
            {/* As many lines as the block holds, the last ending in "…", so no word is cut by its edge (owner, Nov 14). */}
            <span className="block" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: Math.max(1, Math.floor((height - 4) / 13.75)), overflow: "hidden", overflowWrap: "anywhere" }}>
              <span aria-hidden>{h.icon}</span> {h.name}
            </span>
          </div>
        );
      })}
      {habits.map((b) => {
        const top = topOf(new Date(b.start));
        const height = Math.max(18, topOf(new Date(b.end)) - top - 2);
        const time = formatLocal(b.start, { hour: "numeric", minute: "2-digit" });
        const quest = (looks[`h:${b.habit.id}`] ?? (habitLook === "quest" ? "quest" : "hold")) === "quest";
        const t: HoldTarget = { key: `h:${b.habit.id}`, label: b.habit.title, at: b.start, minutes: Math.round((b.end - b.start) / 60_000), kept: !!b.kept, crowded: !!b.crowded, meal: false };
        const crowdedLook: React.CSSProperties = b.crowded ? { background: "linear-gradient(rgba(178,84,66,.2), rgba(178,84,66,.2)), linear-gradient(180deg,#f6e8c4,#e8d29c)", border: "1.5px dashed rgba(160,70,52,.7)" } : {};
        if (quest && isAdventure) {
          // Like a quest: a storybook card with the habit's portrait beside its name (owner's mockup, Nov 3).
          // Tall enough: the portrait stands above the name (so a narrow week column still shows both); else beside it.
          const tall = height >= 50;
          const art = tall ? Math.min(height - 24, 34) : height >= 26 ? Math.min(height - 8, 30) : 0;
          return (
            <div key={b.habit.id} {...handlers(t)} className={`quest-card absolute inset-x-0.5 flex overflow-hidden ${tall ? "flex-col items-center justify-center gap-0.5 text-center" : "items-center gap-1.5"}`} title={`${b.habit.title}: a daily habit, ${time}${b.crowded ? " (no free time left in its window)" : ""} · right-click or double-tap`} style={{ top: top + 1, height, zIndex: menu?.key === t.key ? 3 : 1, padding: tall ? "3px 3px" : height >= 26 ? "3px 6px 3px 4px" : "1px 6px", borderRadius: 14, ...crowdedLook }}>
              {art >= 16 ? (
                <span className="quest-art flex shrink-0 items-center justify-center overflow-hidden" style={{ width: art, height: art, borderRadius: art > 30 ? 8 : 5 }}>
                  {b.habit.icon_key ? (
                    // eslint-disable-next-line @next/next/no-img-element -- habit portrait
                    <img src={b.habit.icon_key} alt="" className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <span style={{ fontSize: art * 0.62, lineHeight: 1 }}>🌱</span>
                  )}
                </span>
              ) : null}
              <span className={tall ? "w-full min-w-0" : "min-w-0 flex-1"}>
                <span className="font-display block truncate" style={{ color: b.crowded ? "#8a3f2c" : "#3a2a14", fontSize: 12.5, lineHeight: 1.15 }}>
                  {b.habit.title}
                </span>
                {height >= (tall ? 76 : 34) && (
                  <span className="block truncate" style={{ color: b.crowded ? "#8a3f2c" : "var(--t-ink-soft)", fontSize: 10.5, lineHeight: 1.2 }}>
                    {time}
                  </span>
                )}
              </span>
            </div>
          );
        }
        return (
          <div
            key={b.habit.id}
            {...handlers(t)}
            className="absolute inset-x-0.5 flex items-start gap-1 overflow-hidden px-1.5 py-0.5 text-[11.5px] leading-tight"
            style={{
              top: top + 1,
              height,
              zIndex: menu?.key === t.key ? 3 : 1,
              borderRadius: 6,
              color: quest ? "#2a1c10" : ink,
              ...(quest
                ? { background: "linear-gradient(180deg,#f6e8c4,#e8d29c)", border: "1px solid #a88a3f", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }
                : { border: `1.5px ${b.kept ? "solid" : "dashed"} rgba(139,112,64,.6)`, fontStyle: "italic" }),
              ...(b.crowded ? red : {}),
            }}
          >
            <span aria-hidden>🌱</span>
            <span className="min-w-0">
              <b className="block truncate">{b.habit.title}</b>
              {height >= 30 && <span className="opacity-70">{time}</span>}
            </span>
          </div>
        );
      })}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menu.label}
          className="card-pop-in parchment pointer-events-auto absolute left-0.5 z-[30] flex w-[min(230px,calc(100vw-24px))] flex-col gap-1 p-2 text-[13px]"
          style={{ top: topOf(new Date(menu.at + menu.minutes * 60_000)) + 2, borderRadius: 12, border: "1px solid #b39a6a", boxShadow: "0 10px 24px rgba(0,0,0,.3)", color: "#2a1c10" }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="relative z-[1] px-1 font-display text-[14.5px] leading-snug">
            {menu.label}
            <span className="block font-sans text-[12px] tabular-nums" style={{ color: menu.crowded ? "#8a3f2c" : "#6b5631" }}>
              {clock(menu.at)} · {menu.minutes}m{menu.kept ? " · kept here" : ""}
            </span>
          </span>
          {!every && (
            <>
          {!menu.kept && (
            <button type="button" role="menuitem" onClick={() => (keepAt(menu, menu.at), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left font-semibold hover:bg-black/[.05]">
              ✓ Keep it here
            </button>
          )}
          <button type="button" role="menuitem" aria-expanded={edit} onClick={() => setEdit((v) => !v)} className="relative z-[1] h-9 rounded-lg px-2 text-left font-semibold hover:bg-black/[.05]" style={{ background: edit ? "rgba(217,180,95,.2)" : undefined }}>
            ✎ Edit time and length
          </button>
          {edit && (
            <div className="reveal relative z-[1] flex flex-col gap-1 rounded-lg px-1.5 py-1.5" style={{ background: "rgba(120,90,40,.08)" }}>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => keepAt(menu, menu.at - 15 * 60_000)} className={chip} style={{ border: "1px solid #b39a6a" }} aria-label="15 minutes earlier">
                  −15
                </button>
                <span className="min-w-[64px] flex-1 text-center font-bold tabular-nums">{clock(menu.at)}</span>
                <button type="button" onClick={() => keepAt(menu, menu.at + 15 * 60_000)} className={chip} style={{ border: "1px solid #b39a6a" }} aria-label="15 minutes later">
                  +15
                </button>
              </span>
              <span className="flex flex-wrap gap-1">
                {[15, 30, 45, 60, 90].map((m) => (
                  <button key={m} type="button" onClick={() => keepAt(menu, menu.at, m)} aria-pressed={m === menu.minutes} className={chip} style={m === menu.minutes ? { background: "var(--t-gold, #e2bb5c)", border: "1px solid #8a6116" } : { border: "1px solid #b39a6a" }}>
                    {m < 60 ? `${m}m` : m === 90 ? "1½h" : "1h"}
                  </button>
                ))}
              </span>
            </div>
          )}
            </>
          )}
          {menu.meal && (() => {
            const ev = dailyEvents(base).find((x) => x.key === menu.key);
            if (!ev) return null;
            return (
              <>
                <button type="button" role="menuitem" aria-expanded={every} onClick={() => setEvery((v) => !v)} className="relative z-[1] h-9 rounded-lg px-2 text-left font-semibold hover:bg-black/[.05]" style={{ background: every ? "rgba(217,180,95,.2)" : undefined }}>
                  ✎ Rename or change every day
                </button>
                {every && <DailyEventEditor key={`${ev.key}:${ev.name}:${ev.icon}`} base={current} ev={ev} onDone={() => setMenu(null)} />}
              </>
            );
          })()}
          {!every && (
            <>
          {menu.kept && (
            <button type="button" role="menuitem" onClick={() => (save(menu.key, null), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left hover:bg-black/[.05]">
              ↺ Let it float again
            </button>
          )}
          {(() => {
            const isQuest = (looks[menu.key] ?? ((menu.meal ? essentials : habitLook) === "quest" ? "quest" : "hold")) === "quest";
            return (
              <>
                <button type="button" role="menuitem" onClick={() => (setLook(menu.key, isQuest ? "hold" : "quest"), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left hover:bg-black/[.05]">
                  {isQuest ? "◌ Show this one as a hold" : "▣ Show this one as a quest card"}
                </button>
              </>
            );
          })()}
          <button type="button" role="menuitem" onClick={() => (save(menu.key, { off: true }), setMenu(null))} className="relative z-[1] h-9 rounded-lg px-2 text-left hover:bg-black/[.05]" style={{ color: "#8a3f2c" }}>
            Skip for today
          </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
