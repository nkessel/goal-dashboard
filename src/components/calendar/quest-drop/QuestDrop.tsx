"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { applyAutoScheduleAction, schedulerContextAction, unscheduleTaskAction } from "@/app/actions";
import { SCHEDULER_DEFAULTS, clockOf, mealsOn, planSchedule, type Busy, type SchedulerSettings } from "@/lib/auto-schedule";
import { localDayKey } from "@/lib/auto-schedule";
import { habitBlocksOn } from "@/lib/timed-habits";
import { useEscape } from "@/lib/use-escape";
import { Fold, useClosing } from "@/components/ui/Fold";
import { CloseIcon, GearIcon } from "@/components/ui/Icons";
import {
  DROP_DEFAULTS,
  DROP_STEP,
  RAMPS,
  blockMinutes,
  cleanMusicLink,
  deferIn,
  dropOrder,
  landingAtBottom,
  landingFrom,
  stepMs,
  whenTag,
  type DropQuest,
  type DropSettings,
} from "@/lib/quest-drop";
import { Chiptune } from "./chiptune";
import { QuestDropIcon } from "./QuestDropIcon";

const KEY = "quest-drop";
const DAYS = 14;
type Shown = { start: number; end: number; title: string; kind: "event" | "meal" | "placed" };
type Phase = "loading" | "ready" | "play" | "later" | "done" | "empty";

function readSettings(): DropSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DROP_DEFAULTS, ...(JSON.parse(raw) as Partial<DropSettings>) } : DROP_DEFAULTS;
  } catch {
    return DROP_DEFAULTS;
  }
}
function readLocal<T>(key: string, pick: (v: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? pick(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
const dayAt = (base: Date, d: number) => {
  const x = new Date(base);
  x.setDate(x.getDate() + d);
  return x;
};
const minuteOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
const hm = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?([AaPp])\.?\s?[Mm]\.?$/, (_, p: string) => p.toLowerCase() + "m");
const dayWord = (d: Date, today: Date) => {
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
};

/**
 * Quest Drop (owner, Nov 18): the scheduling list as a falling-blocks game. One quest comes down
 * at a time over the days; ← → pick the day, ↓ moves it on through the day, Place (or Space) puts it
 * where the gold outline shows, ↑ sends it to later in the line. It speeds up as you go.
 * Every placement is written like Auto-schedule's (the same rules, the same write), with Undo.
 */
export function QuestDrop({ quests, theme, onClose: closeNow }: { quests: DropQuest[]; theme: "calm" | "adventure"; onClose: () => void }) {
  const router = useRouter();
  const isAdventure = theme === "adventure";
  const [today] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [now, setNow] = useState(() => new Date());
  // Only drawn in the browser (loaded with ssr: false), so your saved settings are read straight away.
  const [settings, setSettings] = useState<DropSettings>(readSettings);
  const [sched, setSched] = useState<SchedulerSettings | null>(null);
  const [busy, setBusy] = useState<Busy[]>([]);
  const [shown, setShown] = useState<Shown[]>([]);
  const [queue, setQueue] = useState<DropQuest[]>(() => dropOrder(quests));
  const [phase, setPhase] = useState<Phase>("loading");
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState<{ day: number; y: number }>({ day: 0, y: 0 });
  const [view, setView] = useState(0);
  const [cols, setCols] = useState(3);
  const [boardH, setBoardH] = useState(420);
  const [level, setLevel] = useState(() => readSettings().startSpeed);
  const [placed, setPlaced] = useState<{ q: DropQuest; start: Date; end: Date }[]>([]);
  const [note, setNote] = useState<{ text: string; undo?: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [custom, setCustom] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const music = useRef<Chiptune | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const { closing, close } = useClosing(() => {
    music.current?.stop();
    if (placed.length) router.refresh();
    closeNow();
  });

  const cur = queue[0] ?? null;
  const later = phase === "later";
  const playing = phase === "play" && !paused && !showSettings;

  // Settings (yours, on this device) and your calendar: events, quests placed, habits with a time, meals kept free.
  useEffect(() => {
    const to = dayAt(today, DAYS + 1);
    const hidden = readLocal("calendar-layers", (v) => (v as { hidden?: string[] }).hidden ?? []) ?? [];
    let live = true;
    schedulerContextAction(today.toISOString(), to.toISOString(), hidden)
      .then((ctx) => {
        if (!live) return;
        const s: SchedulerSettings = { ...SCHEDULER_DEFAULTS, ...(readLocal("auto-schedule", (v) => v as Partial<SchedulerSettings>) ?? {}), ...((ctx.settings as Partial<SchedulerSettings> | null) ?? {}) };
        const fyi = new Set(s.fyi ?? (ctx.calendars ?? []).filter((c) => !c.writable && !c.primary).map((c) => c.id));
        const b: Busy[] = [];
        const sh: Shown[] = [];
        for (const x of ctx.busy) {
          if (x.cal && fyi.has(x.cal)) continue;
          b.push({ start: x.start, end: x.end });
          sh.push({ start: x.start, end: x.end, title: (x as { title?: string }).title ?? "Busy", kind: "event" });
        }
        for (let d = 0; d <= DAYS; d++) {
          const day = dayAt(today, d);
          for (const h of habitBlocksOn(ctx.habits ?? [], day, ctx.busy, s.essentialDays?.[localDayKey(day)])) {
            b.push({ start: h.start, end: h.end });
            sh.push({ start: h.start, end: h.end, title: h.habit.title, kind: "event" });
          }
          for (const m of mealsOn(day, s)) sh.push({ start: m.from, end: m.to, title: m.name, kind: "meal" });
        }
        setSched(s);
        setBusy(b);
        setShown(sh);
        setPhase(queue.length ? "ready" : "empty");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't read your calendar."));
    return () => {
      live = false;
    };
    // Read once, when the game opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // How many days fit across, and how tall the day is.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setCols(w >= 900 ? 7 : w >= 620 ? 5 : 3);
      setBoardH(Math.max(240, el.clientHeight - 30));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  const dayStart = sched?.dayStart ?? SCHEDULER_DEFAULTS.dayStart;
  const dayEnd = sched?.dayEnd ?? SCHEDULER_DEFAULTS.dayEnd;
  const pxPerMin = boardH / Math.max(60, dayEnd - dayStart);
  const allBusy = useMemo(() => [...busy, ...placed.map((p) => ({ start: p.start.getTime(), end: p.end.getTime() }))], [busy, placed]);
  const ghost = useMemo(() => (cur && sched ? landingFrom(cur, dayAt(today, pos.day), pos.y, allBusy, sched, now) : null), [cur, sched, today, pos, allBusy, now]);
  const mins = cur ? blockMinutes(cur) : 30;

  function save(next: DropSettings) {
    setSettings(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    if (music.current) {
      if (next.sound === "off") {
        music.current.stop();
        music.current = null;
      }
      else music.current.setMusic(next.sound === "tune" && !cleanMusicLink(next.musicLink));
    }
  }

  /** The next quest starts above the day Auto-schedule would pick for it. */
  function spawn(q: DropQuest | undefined, busyNow: Busy[]) {
    if (!q || !sched) return;
    const plan = planSchedule([{ id: q.id, title: q.title, minutes: blockMinutes(q), effort: null, dueAt: q.dueAt, planBy: q.planBy }], busyNow, sched, new Date());
    const p = plan.placed[0];
    const day = p ? Math.max(0, Math.min(DAYS, Math.round((new Date(p.start).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000))) : 0;
    setPos({ day, y: dayStart });
    setView((v) => (day < v ? day : day > v + cols - 1 ? day - cols + 1 : v));
  }

  function start() {
    if (settings.sound !== "off") {
      music.current ??= new Chiptune();
      music.current.start(settings.sound === "tune" && !cleanMusicLink(settings.musicLink));
    }
    // Your own music: opened from this tap, so the phone hands it to your music app.
    const link = cleanMusicLink(settings.musicLink);
    if (link) window.open(link, "_blank", "noopener");
    setPhase("play");
    setNow(new Date());
    spawn(queue[0], allBusy);
  }

  function move(dx: number) {
    if (phase !== "play" || !cur) return;
    const day = Math.max(0, Math.min(DAYS, pos.day + dx));
    if (day === pos.day) {
      music.current?.sfx("nope");
      setShake((n) => n + 1);
      return;
    }
    music.current?.sfx("move");
    setPos({ ...pos, day });
    setView((v) => (day < v ? day : day > v + cols - 1 ? day - cols + 1 : v));
  }

  function down() {
    if (phase !== "play" || !cur) return;
    if (pos.y + DROP_STEP + mins > dayEnd) return land(true);
    setPos({ ...pos, y: pos.y + DROP_STEP });
  }

  /** It lands: where the outline is, or (reaching the bottom) in the day's last free stretch. */
  function land(bottom = false) {
    if (!cur || !sched || phase !== "play") return;
    const day = dayAt(today, pos.day);
    const spot = bottom ? (landingAtBottom(cur, day, allBusy, sched, now) ?? ghost) : ghost;
    if (!spot) {
      music.current?.sfx("nope");
      setShake((n) => n + 1);
      setNote({ text: `No room left on ${dayWord(day, today)}. Try another day.` });
      setPos({ ...pos, y: dayStart });
      return;
    }
    const q = cur;
    const nextPlaced = [...placed, { q, start: spot.start, end: spot.end }];
    setPlaced(nextPlaced);
    music.current?.sfx("land");
    setNote({ text: `${q.title}: ${dayWord(spot.start, today)}, ${hm(spot.start)}`, undo: true });
    setLevel((l) => Math.min(12, l + settings.ramp));
    const rest = queue.slice(1);
    setQueue(rest);
    setNow(new Date());
    applyAutoScheduleAction([{ taskId: q.id, startISO: spot.start.toISOString(), endISO: spot.end.toISOString() }])
      .then((res) => {
        if (res.failed.length) throw new Error("not saved");
      })
      .catch(() => {
        setError(`"${q.title}" didn't save to your calendar. It's back in line.`);
        setPlaced((ps) => ps.filter((p) => p.q.id !== q.id));
        setQueue((qs) => [...qs, q]);
      });
    if (!rest.length) {
      music.current?.sfx("clear");
      setPhase("done");
      return;
    }
    spawn(rest[0], [...allBusy, { start: spot.start.getTime(), end: spot.end.getTime() }]);
  }

  function undo() {
    const last = placed[placed.length - 1];
    if (!last) return;
    setPlaced(placed.slice(0, -1));
    setQueue([last.q, ...queue]);
    setNote(null);
    void unscheduleTaskAction(last.q.id).catch(() => setError(`Couldn't take "${last.q.title}" off the calendar.`));
    if (phase === "done") setPhase("play");
    setPos({ day: Math.round((new Date(last.start).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000), y: dayStart });
  }

  /** ↑: this quest comes back later in the line. */
  function sendBack(n: number | "skip") {
    if (!cur) return;
    music.current?.sfx("later");
    const rest = n === "skip" ? queue.slice(1) : deferIn(queue, n);
    setQueue(rest);
    setNote({ text: n === "skip" ? `${cur.title}: left on your list for now` : `${cur.title} comes back ${Number.isFinite(n) ? `in ${n} quest${n === 1 ? "" : "s"}` : "at the end"}` });
    if (!rest.length) {
      setPhase("done");
      return;
    }
    setPhase("play");
    spawn(rest[0], allBusy);
  }

  // Gravity. The latest handlers ride in a ref so the timer isn't reset by every move.
  const latest = useRef({ down, move, land, sendBack });
  useEffect(() => {
    latest.current = { down, move, land, sendBack };
  });
  useEffect(() => {
    if (!playing || !cur) return;
    const t = setInterval(() => latest.current.down(), stepMs(level));
    return () => clearInterval(t);
  }, [playing, level, cur]);

  useEffect(() => {
    if (music.current) music.current.bpm = 120 + Math.round(level * 5);
  }, [level]);
  useEffect(() => {
    if (paused || showSettings) music.current?.pause();
    else music.current?.resume();
  }, [paused, showSettings]);
  useEffect(() => () => music.current?.stop(), []);

  useEscape(() => {
    if (later) setPhase("play");
    else if (showSettings) setShowSettings(false);
    else close();
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      const k = e.key;
      if (phase === "ready" && (k === " " || k === "Enter")) {
        e.preventDefault();
        return start();
      }
      if (phase === "later") {
        const pick: Record<string, number> = { "1": 3, "2": 7, "3": Infinity };
        if (k in pick) sendBack(pick[k]);
        if (k === "ArrowUp" || k === "ArrowDown") {
          e.preventDefault();
          setPhase("play");
        }
        return;
      }
      if (phase !== "play") return;
      if (k === "p" || k === "P") return setPaused((v) => !v);
      if (paused) return;
      const act: Record<string, () => void> = { ArrowLeft: () => move(-1), ArrowRight: () => move(1), ArrowDown: down, ArrowUp: () => setPhase("later"), " ": () => land(), Enter: () => land() };
      if (act[k]) {
        e.preventDefault();
        act[k]();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Swipes on the board (phones): sideways for the day, down to place, up for later.
  function onPointerDown(e: React.PointerEvent) {
    touch.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent) {
    const t = touch.current;
    touch.current = null;
    if (!t || phase !== "play" || paused) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
    else if (dy > 0) land();
    else setPhase("later");
  }

  const ink = "var(--t-ink)";
  const soft = "var(--t-ink-soft)";
  const gold = isAdventure ? "var(--t-gold)" : "var(--t-accent)";
  const line = isAdventure ? "rgba(139,112,64,.22)" : "var(--t-card-border)";
  const days = Array.from({ length: cols }, (_, i) => view + i).filter((d) => d <= DAYS);
  const top = (m: number) => (m - dayStart) * pxPerMin;
  const tag = cur ? whenTag(cur) : null;
  const next = queue.slice(1, 3);
  const musicLink = cleanMusicLink(settings.musicLink);
  const pill = "qe-fact flex h-8 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-[13px] font-semibold";
  const lit = (on: boolean) => (on ? "true" : undefined);

  return createPortal(
    <div className={`${closing ? "overlay-fade-out pointer-events-none" : "overlay-fade-in"} fixed inset-0 z-[62] flex items-stretch justify-center sm:items-center sm:p-4`} style={{ background: "var(--t-overlay)" }} onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quest Drop"
        data-quest-drop
        onClick={(e) => e.stopPropagation()}
        className={`card-pop-in relative flex h-[100svh] w-full max-w-5xl flex-col overflow-hidden sm:h-[94svh] sm:rounded-2xl ${isAdventure ? "parchment parchment-framed" : ""}`}
        style={isAdventure ? undefined : { background: "var(--t-card)", border: "1px solid var(--t-card-border)" }}
      >
        {/* Header: name, sound, settings, × at top right. */}
        <div className="relative z-[1] flex items-center gap-1.5 px-3 pb-1.5 pt-[max(.6rem,env(safe-area-inset-top))]">
          <span className="flex h-8 w-8 items-center justify-center" style={{ color: gold }}>
            <QuestDropIcon size={22} />
          </span>
          <h3 className={`m-0 min-w-0 flex-1 truncate ${isAdventure ? "font-display text-[20px]" : "text-[17px] font-bold"}`} style={{ color: ink }}>
            Quest Drop
          </h3>
          {settings.sound !== "off" && !musicLink && (
            <button type="button" onClick={() => save({ ...settings, sound: settings.sound === "tune" ? "sounds" : "tune" })} aria-label={settings.sound === "tune" ? "Mute the tune" : "Play the tune"} aria-pressed={settings.sound === "tune"} title={settings.sound === "tune" ? "Mute the tune" : "Play the tune"} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft }}>
              <SpeakerIcon on={settings.sound === "tune"} />
            </button>
          )}
          <button type="button" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings} aria-label="Game settings" title="Game settings" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft, background: showSettings ? "rgba(217,180,95,.22)" : undefined }}>
            <GearIcon size={17} />
          </button>
          <button type="button" onClick={close} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/[.06]" style={{ color: soft }}>
            <CloseIcon size={14} />
          </button>
        </div>

        <Fold open={showSettings} className="relative z-[1]">
          <div className="qe-fact-panel mx-3 mb-2 flex flex-col gap-2 rounded-xl px-3 py-2.5 text-[13px]" style={{ color: ink }} data-quest-drop-settings>
            <Row label="Starting speed">
              <div className="grid min-w-0 flex-1 grid-cols-10 gap-1 sm:max-w-[22rem]">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" data-open={lit(settings.startSpeed === n)} onClick={() => {
                      save({ ...settings, startSpeed: n });
                      if (phase !== "play") setLevel(n);
                    }} className={`${pill} !w-full !px-0`} aria-label={`Speed ${n}`}>
                    {n}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Speeds up">
              <div className="flex flex-wrap gap-1">
                {RAMPS.map((r) => (
                  <button key={r.v} type="button" data-open={lit(settings.ramp === r.v)} onClick={() => save({ ...settings, ramp: r.v })} className={pill}>
                    {r.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Sound">
              <div className="flex flex-wrap gap-1">
                {([["tune", "Quest Drop tune"], ["sounds", "Sounds only"], ["off", "Off"]] as const).map(([v, label]) => (
                  <button key={v} type="button" data-open={lit(settings.sound === v)} onClick={() => save({ ...settings, sound: v })} className={pill}>
                    {label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="My music">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <input
                  type="url"
                  inputMode="url"
                  value={settings.musicLink}
                  onChange={(e) => save({ ...settings, musicLink: e.target.value })}
                  placeholder="Paste a song or playlist link"
                  aria-label="My music: a song or playlist link"
                  className="bare-input h-8 w-full min-w-0 border-b bg-transparent text-[16px] outline-none sm:text-[13.5px]"
                  style={{ borderColor: "rgba(139,112,64,.45)", color: ink }}
                />
                <span className="text-[12px]" style={{ color: soft }}>
                  {musicLink ? "Opens in your music app when a game starts; the game's tune stays quiet." : "Spotify, YouTube, Apple Music… it opens when a game starts."}
                </span>
              </div>
            </Row>
          </div>
        </Fold>

        {/* What's falling, what's next, how fast. */}
        <div className="relative z-[1] flex items-center gap-2 px-3 pb-1.5 text-[12.5px]" style={{ color: soft }}>
          <span className="shrink-0">Next</span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
            {next.length ? next.map((q) => (
              <span key={q.id} className="qe-fact flex h-7 min-w-0 max-w-[45%] items-center gap-1 rounded-full px-2 text-[12px]">
                <Portrait q={q} size={16} />
                <span className="truncate">{q.title}</span>
              </span>
            )) : <span className="italic">{cur ? "the last one" : ""}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5" aria-label="Falling speed">
            <button type="button" onClick={() => setLevel((l) => Math.max(1, l - 1))} aria-label="Slower" title="Slower" className="flex h-8 w-7 items-center justify-center rounded-full text-[16px] hover:bg-black/[.06]" style={{ color: ink }}>
              −
            </button>
            <span className="min-w-[3.6rem] text-center tabular-nums" style={{ color: ink }}>
              Speed {Math.floor(level)}
            </span>
            <button type="button" onClick={() => setLevel((l) => Math.min(12, l + 1))} aria-label="Faster" title="Faster" className="flex h-8 w-7 items-center justify-center rounded-full text-[16px] hover:bg-black/[.06]" style={{ color: ink }}>
              +
            </button>
          </div>
        </div>

        {/* ↑ Later: when this quest comes back. */}
        <Fold open={later} className="relative z-[1]">
          <div className="qe-fact-panel mx-3 mb-2 rounded-xl px-3 py-2 text-[13px]" style={{ color: ink }} data-quest-drop-later>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{cur ? `Bring "${cur.title}" back` : "Bring it back"}</span>
              <button type="button" onClick={() => setPhase("play")} className="h-8 shrink-0 px-2 text-[12.5px] underline underline-offset-2" style={{ color: soft }}>
                Keep it
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => sendBack(3)} className={pill}>In 3 quests</button>
              <button type="button" onClick={() => sendBack(7)} className={pill}>In 7 quests</button>
              <button type="button" onClick={() => sendBack(Infinity)} className={pill}>At the end</button>
              <span className="qe-fact flex h-8 items-center gap-1 rounded-full pl-3 pr-1">
                In
                <input type="number" min={1} max={99} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Comes back in this many quests" className="bare-input w-9 bg-transparent text-center text-[16px] outline-none sm:text-[13px]" />
                <button type="button" onClick={() => sendBack(Math.max(1, Number(custom) || 1))} className="h-6 rounded-full px-2 text-[12.5px] font-semibold" style={{ background: "rgba(217,180,95,.35)", color: ink }}>
                  Go
                </button>
              </span>
              <button type="button" onClick={() => sendBack("skip")} className="h-8 px-2 text-[12.5px] underline underline-offset-2" style={{ color: soft }}>
                Not this time
              </button>
            </div>
          </div>
        </Fold>

        {/* The board: days across, hours down. */}
        <div
          ref={boardRef}
          className="relative z-[1] mx-3 min-h-0 flex-1 select-none overflow-hidden rounded-xl"
          style={{ touchAction: "none", background: isAdventure ? "rgba(255,250,238,.45)" : "var(--t-bg)", border: `1px solid ${line}` }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          data-quest-drop-board
        >
          <div className="flex h-[30px] pl-9" style={{ borderBottom: `1px solid ${line}` }}>
            {days.map((d) => (
              <div key={d} className={`flex-1 truncate text-center text-[12.5px] leading-[30px] ${d === pos.day && phase === "play" ? "font-bold" : ""}`} style={{ color: d === pos.day && phase === "play" ? gold : soft }}>
                {dayWord(dayAt(today, d), today)}
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: boardH }}>
            {/* Hours, every two. */}
            {Array.from({ length: Math.floor((dayEnd - dayStart) / 120) + 1 }, (_, i) => dayStart + i * 120).filter((m) => m < dayEnd).map((m) => (
              <div key={m} className="pointer-events-none absolute left-0 right-0 flex items-start" style={{ top: top(m) }}>
                <span className="w-9 -translate-y-[1px] pr-1 text-right text-[10px] leading-none" style={{ color: soft }}>{clockOf(m).replace(" ", "").toLowerCase()}</span>
                <span className="h-px flex-1" style={{ background: line }} />
              </div>
            ))}
            <div className="absolute inset-y-0 left-9 right-0 flex">
              {days.map((d) => {
                const day = dayAt(today, d);
                const s0 = day.getTime();
                const s1 = s0 + 86_400_000;
                const inDay = (x: { start: number; end: number }) => x.start < s1 && x.end > s0;
                const clip = (a: number, b: number) => {
                  const ma = Math.max(dayStart, minuteOf(a));
                  const mb = Math.min(dayEnd, b >= s1 ? 24 * 60 : minuteOf(b));
                  return mb > ma ? { t: top(ma), h: (mb - ma) * pxPerMin } : null;
                };
                const isCol = d === pos.day && phase === "play";
                const pastH = d === 0 ? Math.max(0, Math.min(boardH, top(minuteOf(now.getTime())))) : 0;
                return (
                  <div key={d} className="relative flex-1 transition-colors duration-150" style={{ borderLeft: `1px solid ${line}`, background: isCol ? "rgba(217,180,95,.12)" : undefined }}>
                    {pastH > 0 && <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: pastH, background: "repeating-linear-gradient(135deg, rgba(120,90,40,.07) 0 6px, transparent 6px 12px)" }} />}
                    {shown.filter(inDay).sort((a, b) => (a.kind === "meal" ? 0 : 1) - (b.kind === "meal" ? 0 : 1)).map((x, i) => {
                      const c = clip(x.start, x.end);
                      if (!c) return null;
                      const meal = x.kind === "meal";
                      return (
                        <div key={i} className="pointer-events-none absolute inset-x-[2px] overflow-hidden rounded-md px-1 text-[10.5px] leading-tight" style={{ top: c.t, height: Math.max(4, c.h - 1), border: meal ? "1px dashed rgba(139,112,64,.4)" : "1px solid rgba(90,70,40,.25)", background: meal ? "transparent" : isAdventure ? "#e4d8bb" : "var(--t-accent-soft)", color: soft, zIndex: meal ? 0 : 1 }}>
                          {c.h >= 14 && <span className="block truncate">{x.title}</span>}
                        </div>
                      );
                    })}
                    {placed.filter((p) => inDay({ start: p.start.getTime(), end: p.end.getTime() })).map((p) => {
                      const c = clip(p.start.getTime(), p.end.getTime());
                      if (!c) return null;
                      return (
                        <div key={p.q.id} className="card-pop-in pointer-events-none absolute inset-x-[2px] flex items-start gap-1 overflow-hidden rounded-md px-1 text-[11px] font-semibold leading-tight" style={{ top: c.t, height: Math.max(12, c.h - 1), background: "linear-gradient(180deg,#f6dc8e,#d9b45f)", border: "1px solid #8a6116", color: "#2a1c10" }}>
                          <span className="truncate">{p.q.title}</span>
                        </div>
                      );
                    })}
                    {isCol && ghost && cur && (
                      <div className="pointer-events-none absolute inset-x-[2px] rounded-md" data-quest-drop-ghost style={{ top: top(minuteOf(ghost.start.getTime())), height: Math.max(14, mins * pxPerMin - 1), border: `2px dashed ${gold}`, background: "rgba(217,180,95,.12)", transition: "top .12s ease-out" }} />
                    )}
                    {isCol && cur && (
                      <div
                        key={`${cur.id}-${shake}`}
                        className={`pointer-events-none absolute inset-x-[1px] z-[2] flex flex-col overflow-hidden rounded-lg px-1.5 py-0.5 ${shake ? "quest-drop-shake" : ""}`}
                        data-quest-drop-falling
                        style={{ top: top(pos.y), height: Math.max(36, mins * pxPerMin), background: isAdventure ? "linear-gradient(180deg,#fffaf0,#f3e3bd)" : "var(--t-card)", border: `2px solid ${gold}`, boxShadow: "0 6px 16px rgba(40,25,5,.28)", color: ink, transition: `top ${Math.min(220, stepMs(level))}ms linear` }}
                      >
                        <span className="text-[10.5px] font-semibold leading-tight" style={{ color: soft }}>
                          {ghost ? `${hm(ghost.start)} · ${mins}m` : "No room below"}
                        </span>
                        <span className="flex min-w-0 items-center gap-1 text-[12px] font-bold leading-tight">
                          <Portrait q={cur} size={15} />
                          <span className="truncate">{cur.title}</span>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Start, empty, done and loading cards sit over the board. */}
            {phase !== "play" && phase !== "later" && (
              <div className="absolute inset-0 z-[3] flex items-center justify-center p-4" style={{ background: "rgba(255,250,238,.55)" }}>
                <div className="reveal w-full max-w-sm rounded-2xl px-4 py-4 text-center" style={{ background: isAdventure ? "#fbf3df" : "var(--t-card)", border: "1px solid rgba(139,112,64,.45)", boxShadow: "0 10px 30px rgba(40,25,5,.25)", color: ink }} data-quest-drop-card={phase}>
                  {phase === "loading" && <p className="m-0 text-[14px]" style={{ color: soft }}>{error ?? "Reading your calendar…"}</p>}
                  {phase === "empty" && (
                    <>
                      <p className={`m-0 ${isAdventure ? "font-display text-[19px]" : "text-[16px] font-bold"}`}>Nothing waiting to be scheduled</p>
                      <p className="mb-3 mt-1 text-[13.5px]" style={{ color: soft }}>Quests you add to the scheduling list come down here, one at a time.</p>
                      <button type="button" onClick={close} className="h-10 rounded-full px-5 text-[14px] font-bold" style={goldBtn(isAdventure)}>Back to the calendar</button>
                    </>
                  )}
                  {phase === "ready" && (
                    <>
                      <p className={`m-0 ${isAdventure ? "font-display text-[20px]" : "text-[17px] font-bold"}`}>{queue.length} quest{queue.length === 1 ? "" : "s"} to place</p>
                      <p className="mb-3 mt-1 text-[13.5px] leading-snug" style={{ color: soft }}>
                        One at a time, most urgent first. Steer it to a day, let it fall to the time you want, then place it where the gold outline shows. It speeds up as you go.
                      </p>
                      <p className="mb-3 hidden text-[12.5px] sm:block" style={{ color: soft }}>← → day · ↓ later in the day · Space place · ↑ bring it back later · P pause</p>
                      <p className="mb-3 text-[12.5px] sm:hidden" style={{ color: soft }}>Swipe sideways for the day, down to place, up for later.</p>
                      <button type="button" onClick={start} className="h-11 rounded-full px-6 text-[15px] font-bold" style={goldBtn(isAdventure)} data-quest-drop-start>
                        {musicLink ? "Start and play my music ↗" : "Start"}
                      </button>
                    </>
                  )}
                  {phase === "done" && (
                    <>
                      <p className={`m-0 ${isAdventure ? "font-display text-[21px]" : "text-[17px] font-bold"}`}>{placed.length ? "Every quest has its time" : "All sorted"}</p>
                      <p className="mb-3 mt-1 text-[13.5px]" style={{ color: soft }}>
                        {placed.length ? `${placed.length} quest${placed.length === 1 ? "" : "s"} placed on your calendar.` : "The rest stay on your list for another day."}
                      </p>
                      <div className="flex justify-center gap-2">
                        {placed.length > 0 && <button type="button" onClick={undo} className={pill}>Undo the last</button>}
                        <button type="button" onClick={close} className="h-10 rounded-full px-5 text-[14px] font-bold" style={goldBtn(isAdventure)}>See the calendar</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {paused && phase === "play" && (
              <button type="button" onClick={() => setPaused(false)} className="absolute inset-0 z-[3] flex items-center justify-center text-[16px] font-bold" style={{ background: "rgba(255,250,238,.6)", color: ink }}>
                Paused · tap to go on
              </button>
            )}
          </div>
        </div>

        {/* What just happened (with Undo), and any trouble. */}
        <div className="relative z-[1] flex min-h-[30px] items-center gap-2 py-0 pl-4 pr-16 pt-1 text-[12.5px]" style={{ color: soft }} aria-live="polite">
          {error ? (
            <span className="min-w-0 flex-1 truncate" style={{ color: "#a33" }}>{error}</span>
          ) : note ? (
            <span key={note.text} className="reveal min-w-0 flex-1 truncate">{note.text}</span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{tag && cur ? `${cur.title}: ${tag.words}${tag.fixed ? "" : " (flexible)"}` : ""}</span>
          )}
          {note?.undo && placed.length > 0 && (
            <button type="button" onClick={undo} className="h-7 shrink-0 px-1 font-semibold underline underline-offset-2" style={{ color: ink }}>Undo</button>
          )}
          {phase === "play" && (
            <button type="button" onClick={() => setPaused((v) => !v)} className="h-7 shrink-0 px-1 underline underline-offset-2" style={{ color: soft }}>{paused ? "Go on" : "Pause"}</button>
          )}
        </div>

        {/* Thumb pad: ◀ ▼ ▶, Later, Place. */}
        <div className="relative z-[1] grid grid-cols-5 gap-1.5 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-1.5" data-quest-drop-pad>
          <PadButton label="Earlier day" onClick={() => move(-1)} disabled={phase !== "play" || paused}><Arrow dir="left" /></PadButton>
          <PadButton label="Later in the day" onClick={down} disabled={phase !== "play" || paused}><Arrow dir="down" /></PadButton>
          <PadButton label="Next day" onClick={() => move(1)} disabled={phase !== "play" || paused}><Arrow dir="right" /></PadButton>
          <PadButton label="Bring it back later" onClick={() => setPhase(later ? "play" : "later")} disabled={(phase !== "play" && phase !== "later") || paused}>
            <span className="flex flex-col items-center leading-none"><Arrow dir="up" /><span className="mt-0.5 text-[10.5px] font-semibold">Later</span></span>
          </PadButton>
          <button type="button" onClick={() => land()} disabled={phase !== "play" || paused || !ghost} className="h-12 rounded-xl text-[14.5px] font-bold disabled:opacity-45" style={goldBtn(isAdventure)} aria-label="Place it">
            Place
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function goldBtn(isAdventure: boolean): React.CSSProperties {
  return isAdventure ? { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } : { background: "var(--t-accent)", color: "#fff" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-28 shrink-0 text-[12.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>{label}</span>
      {children}
    </div>
  );
}

function PadButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="qe-fact flex h-12 items-center justify-center rounded-xl disabled:opacity-45" style={{ touchAction: "manipulation" }}>
      {children}
    </button>
  );
}

function Arrow({ dir }: { dir: "left" | "right" | "down" | "up" }) {
  const rot = { left: 90, right: -90, down: 0, up: 180 }[dir];
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      {on ? <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function Portrait({ q, size }: { q: DropQuest; size: number }) {
  if (!q.icon) return null;
  if (q.iconIsImage) {
    // eslint-disable-next-line @next/next/no-img-element -- a small portrait, already a hosted image
    return <img src={q.icon} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return <span className="shrink-0 leading-none" style={{ fontSize: size - 2 }} aria-hidden>{q.icon}</span>;
}
