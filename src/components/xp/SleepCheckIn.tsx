"use client";

import { useEffect, useState } from "react";
import { setWheelOfTimeAction, wheelOfTimeAction } from "@/app/actions";
import { saveOrQueue } from "@/lib/offline";
import { EMPTY_NIGHT, NightFields, MoonIcon, SunIcon, TimeToken, clock12, type NightDraft } from "./NightFields";
import { Fold } from "@/components/ui/Fold";
import { DateField } from "@/components/ui/DateField";
import { eveningDayKey } from "@/components/evening/evening-clock";
import { CloseIcon } from "@/components/ui/Icons";
import { SLEEP_FACES as FACES, SleepFeel, sleepTone } from "./SleepFeel";

const GILT = { background: "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)", border: "1.5px solid #4a3913", color: "#2a1c10" } as const;
const SOFT = "#6b5631";

/**
 * Sleep, its own part of the welcome screen: a gilded button that slides open
 * last night's sleep and wake times, the Wheel of Time (factors of sleep, its
 * lists editable right here), a sleep-quality row of five faces, and other
 * nights. Saved by the screen's own button (registered like the top priority).
 */
export function SleepCheckIn({ register, label, icon, onFilled }: { register: (save: () => Promise<boolean>) => void; /** The button's own words and emoji (welcome button editor). */ label?: string; icon?: string; /** Something was entered and saved (for the welcome screen's XP). */ onFilled?: () => void }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<{ effort: string[]; hindrances: string[] } | null>(null);
  const [night, setNight] = useState<NightDraft>(EMPTY_NIGHT);
  const [base, setBase] = useState(JSON.stringify(EMPTY_NIGHT));
  const [logged, setLogged] = useState(false);
  const [quality, setQuality] = useState<number | null>(null);
  const [others, setOthers] = useState<{ id: number; day: string; bed: string; wake: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(() => eveningDayKey());

  useEffect(() => {
    let live = true;
    wheelOfTimeAction()
      .then((w) => {
        if (!live) return;
        setLists({ effort: w.effort, hindrances: w.hindrances });
        setLogged(w.loggedToday);
        const b = { ...EMPTY_NIGHT, effort: w.pressed.effort, hindrances: w.pressed.hindrances };
        setBase(JSON.stringify(b));
        setNight(b);
      })
      .catch(() => live && setLists({ effort: [], hindrances: [] }));
    return () => {
      live = false;
    };
  }, []);

  const touched = JSON.stringify(night) !== base;
  // The quality already saved (so the screen's own button doesn't save it twice).
  const [savedQuality, setSavedQuality] = useState<number | null>(null);
  const qualityNew = quality !== null && quality !== savedQuality;
  const filled = others.filter((n) => n.day && (n.bed || n.wake));
  // A line about the night, under the faces (owner, Nov 11); kept as a "😴 Sleep note" event so Insights shows it.
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const noteNew = note.trim() !== "" && note.trim() !== savedNote;
  const dirty = touched || qualityNew || noteNew || filled.length > 0;
  async function save() {
    if (!dirty) return true;
    setError(null);
    try {
      // Offline, each part waits on the device and is sent when you're back online.
      for (const n of filled) await saveOrQueue("saveNightDay", { day: n.day, bed: n.bed || null, wake: n.wake || null, effort: [], hindrances: [], keep: true }, `night:${n.day}`);
      if (touched) await saveOrQueue("saveNight", night, `night:${night.today ? "today" : "last"}`);
      if (qualityNew) await saveOrQueue("saveCheckIn", { energy: null, metrics: [{ metric: "Sleep quality", level: quality * 2 }], at: new Date().toISOString() });
      if (noteNew) {
        await saveOrQueue("logEvent", { title: "😴 Sleep note", details: note.trim().slice(0, 400), tone: sleepTone(quality), at: new Date().toISOString() });
        setSavedNote(note.trim());
      }
      if (filled.length || touched || qualityNew || noteNew) onFilled?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your sleep.");
      return false;
    }
  }
  // Saved by the welcome screen's own button, with everything else on it.
  // (Braces matter: an effect's return value is its cleanup, and returning the saver made React
  // call it on every render, saving "Sleep quality" hundreds of times.)
  useEffect(() => {
    register(save);
  });
  // Its own Save, bottom right (owner's note): saves now, folds the part, and its button says ✓.
  const [saving, setSaving] = useState(false);
  async function saveNow() {
    if (saving) return;
    setSaving(true);
    const ok = await save();
    setSaving(false);
    if (!ok) return;
    if (touched) {
      setBase(JSON.stringify(night));
      if (night.bed || night.wake) setLogged(true);
    }
    if (qualityNew) setSavedQuality(quality);
    if (filled.length) setOthers([]);
    setOpen(false);
    setStamp((n) => n + 1);
    setSaved(true);
    setTimeout(() => setSaved(false), 2600);
  }
  const [saved, setSaved] = useState(false);
  const [stamp, setStamp] = useState(0);

  function saveLists(next: { effort: string[]; hindrances: string[] }) {
    const before = lists;
    setLists(next);
    setWheelOfTimeAction(next)
      .then((r) => setLists({ effort: r.effort, hindrances: r.hindrances }))
      .catch((e) => {
        setLists(before);
        setError(e instanceof Error ? e.message : "Couldn't save the lists.");
      });
  }
  // Folded, the button says what's in it: "10:45 → 6:00 · Good" (owner's note).
  const hm = (t: string) => clock12(t).replace(/ (am|pm)$/, "");
  const times = night.bed && night.wake ? `${hm(night.bed)} → ${hm(night.wake)}` : night.bed ? `🌙 ${hm(night.bed)}` : night.wake ? `☀ ${hm(night.wake)}` : "";
  const summary = [times, quality ? FACES[quality - 1].label : ""].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full flex-col items-center">
      <button key={stamp} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`font-display flex h-10 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-5 text-[16px] ${stamp ? "sleep-stamp" : ""}`} style={GILT}>
        {icon ? <span aria-hidden>{icon}</span> : <MoonIcon />}
        {label || "Sleep check-in"}{logged && !dirty ? " ✓" : ""}
        {summary && !open && <span className="truncate font-sans text-[12.5px] font-semibold tabular-nums opacity-80">· {summary}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
          <path d="M5.5 9l6.5 6.5L18.5 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Saved, said plainly (owner, Nov 2: "so the user knows it's not lost"). */}
      <Fold open={saved}>
        <span className="confirm-pop mt-1 block text-[12.5px] font-semibold" style={{ color: "#3f6a2c" }}>
          ✓ Sleep saved
        </span>
      </Fold>
      <div className="drawer-body w-full" data-open={open ? "true" : "false"}>
        <div className="drawer-inner" inert={!open}>
          <div className="mt-2 flex w-full flex-col gap-2 text-left" style={{ ["--t-cream" as string]: "var(--t-ink)", ["--ec-soft" as string]: "var(--t-ink-soft)", ["--ec-gold" as string]: "#8a6116" }}>
            {lists ? (
              // How was your sleep? Five faces, then + Sleep notes (owner, Nov 24), inside the sleep card (owner, Nov 26).
              <NightFields value={night} onChange={setNight} effort={lists.effort} hindrances={lists.hindrances} onLists={saveLists} day={today} heading={false}>
                <SleepFeel quality={quality} onQuality={setQuality} note={note} onNote={setNote} />
              </NightFields>
            ) : (
              <>
                <p className="m-0 text-center text-[13px] italic" style={{ color: SOFT }}>
                  Opening…
                </p>
                <SleepFeel quality={quality} onQuality={setQuality} note={note} onNote={setNote} />
              </>
            )}
            {/* Its own Save, once there's something to save. */}
            {dirty && (
              <div className="flex justify-center">
                <button type="button" onClick={saveNow} disabled={saving} className="fade-in flex h-8 items-center gap-1 rounded-full px-4 text-[13px] font-bold disabled:opacity-70" style={GILT}>
                  {saving ? "Saving…" : "Save sleep check-in ✓"}
                </button>
              </div>
            )}
            {/* Other nights: a row only once you add one (no empty fields waiting). */}
            {others.map((n, i) => (
              <div key={n.id} className="reveal flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl px-2 py-1.5" style={{ background: "rgba(255,250,238,.55)", border: "1px solid rgba(139,112,64,.3)" }}>
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: "var(--t-ink)" }}>
                  Morning of
                  <DateField value={n.day} onChange={(v) => v && setOthers((o) => o.map((x, j) => (j === i ? { ...x, day: v } : x)))} max={today} ariaLabel="The morning after the night" className="night-time font-display" />
                </span>
                <TimeToken value={n.bed} onChange={(v) => setOthers((o) => o.map((x, j) => (j === i ? { ...x, bed: v } : x)))} label="Sleep time" icon={<MoonIcon />} kind="bed" compact placeholder="bedtime" />
                <TimeToken value={n.wake} onChange={(v) => setOthers((o) => o.map((x, j) => (j === i ? { ...x, wake: v } : x)))} label="Wake time" icon={<SunIcon />} kind="wake" compact placeholder="wake" />
                <button type="button" onClick={() => setOthers((o) => o.filter((x) => x.id !== n.id))} aria-label="Remove this night" className="ml-auto flex h-8 w-8 items-center justify-center text-[18px] leading-none" style={{ color: SOFT }}>
                  <CloseIcon size={11} />
                </button>
              </div>
            ))}
            {error && (
              <p className="m-0 text-[12.5px]" style={{ color: "#a33" }}>
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
