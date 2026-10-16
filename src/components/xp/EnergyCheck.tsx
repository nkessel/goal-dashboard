"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { addCheckNoteAction, addToTopOfTodayAction, deleteCheckNoteAction, createQuestAction, listTakeoffQuestsAction, saveCheckInAction, setCheckMetricsAction } from "@/app/actions";
import { BoltIcon } from "@/components/ui/Icons";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { useEscape } from "@/lib/use-escape";
import { eveningDayKey } from "@/components/evening/evening-clock";

type Takeoff = Awaited<ReturnType<typeof listTakeoffQuestsAction>>[number];

const LOW = 5;
/** From 7pm the Power-ups button no longer offers itself. */
const QUIET_FROM_HOUR = 19;

const hiddenKey = () => `powerups-hidden:${eveningDayKey()}`;
const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 30_000);
  window.addEventListener("storage", cb);
  return () => {
    clearInterval(t);
    window.removeEventListener("storage", cb);
  };
};
/** Whether the Power-ups button may show itself right now (client only). */
function readMayOffer(): boolean {
  const h = new Date().getHours();
  // Quiet in the evening (7pm until the day turns over at 5:30am).
  if (h >= QUIET_FROM_HOUR || h < 5 || (h === 5 && new Date().getMinutes() < 30)) return false;
  try {
    return window.localStorage.getItem(hiddenKey()) !== "1";
  } catch {
    return true;
  }
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Ideas offered when adding something else to track. */
const METRIC_IDEAS = ["Mood", "Focus", "Calm", "Motivation", "Sleep", "Pain"];
const MAX_METRICS = 6;
const EXPANDED_KEY = "checkin-expanded";

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * Check-in under the boss line: energy 1–10 in tenths. The caret before
 * Energy opens the other things being tracked (mood, focus, anything): a
 * list of sliders, then a row of [Edit metrics] · Add new check-in metric ·
 * Submit check-in. Closed, Save stores energy alone. After saving, the caret
 * shows (or hides) what was saved. At 5 or below, a Power-ups button offers
 * light quests to drop straight onto the top of Today's Quests.
 */
export function EnergyCheck({
  today,
  todayAt = null,
  metrics: initialMetrics = [],
  metricsToday = {},
  full = false,
  notesToday = [],
}: {
  /** Today's write-in events and #tags. */
  notesToday?: { id: string; body: string }[];
  /** The Insights screen's full check-in: every metric shown, no link back to Insights. */
  full?: boolean;
  /** Today's latest check-in, if any. */
  today: number | null;
  /** When it was saved (ISO). */
  todayAt?: string | null;
  /** Other things tracked, in order. */
  metrics?: string[];
  /** Today's latest reading of each. */
  metricsToday?: Record<string, number>;
}) {
  const [value, setValue] = useState(today ?? 6);
  const [saved, setSaved] = useState<number | null>(today);
  const [savedAt, setSavedAt] = useState<string | null>(todayAt);
  const [metrics, setMetrics] = useState<string[]>(initialMetrics);
  const [vals, setVals] = useState<Record<string, number>>(metricsToday);
  const [savedVals, setSavedVals] = useState<Record<string, number>>(metricsToday);
  const [expanded, setExpanded] = useState(full);
  const [notes, setNotes] = useState(notesToday);
  const [noting, setNoting] = useState(false);
  const [noteText, setNoteText] = useState("");
  function addNote() {
    const text = noteText.trim();
    if (!text) return setNoting(false);
    const temp = { id: `temp-${Date.now()}`, body: text };
    setNotes((n) => [...n, temp]);
    setNoteText("");
    setNoting(false);
    addCheckNoteAction(text)
      .then((saved) => setNotes((n) => n.map((x) => (x.id === temp.id ? { id: saved.id, body: saved.body } : x))))
      .catch((e) => {
        setNotes((n) => n.filter((x) => x.id !== temp.id));
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      });
  }
  function dropNote(id: string) {
    setNotes((n) => n.filter((x) => x.id !== id));
    if (!id.startsWith("temp-")) void deleteCheckNoteAction(id).catch(() => {});
  }
  const [adding, setAdding] = useState(false);
  const [editingList, setEditingList] = useState(false);
  const [newMetric, setNewMetric] = useState("");
  const mayOffer = useSyncExternalStore(subscribeMinute, readMayOffer, () => false);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [editing, setEditing] = useState(saved === null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // Open or closed is remembered on this device.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
      if (window.localStorage.getItem(EXPANDED_KEY) === "1") setExpanded(true);
    } catch {
      /* storage unavailable */
    }
  }, []);
  function setOpen(v: boolean) {
    setExpanded(v);
    if (!v) {
      setAdding(false);
      setEditingList(false);
    }
    try {
      window.localStorage.setItem(EXPANDED_KEY, v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }

  function save() {
    setError(null);
    const all = expanded ? metrics.map((m) => ({ metric: m, level: vals[m] ?? 5 })) : [];
    startSaving(async () => {
      try {
        const res = await saveCheckInAction(value, all);
        setSaved(res.energy.level);
        setSavedAt(res.energy.created_at ?? new Date().toISOString());
        if (all.length) setSavedVals((o) => ({ ...o, ...Object.fromEntries(all.map((r) => [r.metric, r.level])) }));
        setEditing(false);
        setAdding(false);
        setEditingList(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function saveMetrics(next: string[], prev: string[]) {
    setMetrics(next);
    setError(null);
    startSaving(async () => {
      try {
        setMetrics(await setCheckMetricsAction(next));
      } catch (e) {
        setMetrics(prev);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function addMetric(label: string) {
    const l = label.replace(/\s+/g, " ").trim().slice(0, 24);
    if (!l || l.toLowerCase() === "energy" || metrics.some((m) => m.toLowerCase() === l.toLowerCase())) {
      setNewMetric("");
      setAdding(false);
      return;
    }
    saveMetrics([...metrics, l], metrics);
    setVals((v) => ({ ...v, [l]: v[l] ?? 5 }));
    setNewMetric("");
    setAdding(false);
  }
  const removeMetric = (m: string) => saveMetrics(metrics.filter((x) => x !== m), metrics);

  const shown = editing ? value : (saved ?? value);
  // Only after a saved check-in at 5 or below — and not once hidden for today, or in the evening.
  const low = !editing && saved !== null && saved <= LOW && mayOffer;

  function hideForToday() {
    try {
      window.localStorage.setItem(hiddenKey(), "1");
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new StorageEvent("storage"));
  }
  const hue = Math.round(((shown - 1) / 9) * 110); // red → green
  const ideas = METRIC_IDEAS.filter((i) => !metrics.some((m) => m.toLowerCase() === i.toLowerCase()));
  const savedExtras = metrics.filter((m) => savedVals[m] !== undefined);

  /** The caret before "Energy": opens the other metrics (or, once saved, what was saved). */
  const caret = (
    <button
      type="button"
      onClick={() => setOpen(!expanded)}
      aria-expanded={expanded}
      aria-controls="checkin-more"
      aria-label={expanded ? "Hide the other check-ins" : "Show the other check-ins"}
      title={expanded ? "Hide the other check-ins" : "Other check-ins"}
      className="-ml-1 flex h-8 w-6 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden className="transition-transform duration-200" style={{ transform: expanded ? "rotate(90deg)" : undefined }}>
        <path d="M9 5.5l6.5 6.5L9 18.5" stroke="var(--t-gold)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  const label = "w-[78px] shrink-0 truncate text-[14.5px] font-semibold";
  const noteChips = notes.length > 0 && (
    <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
      {notes.map((n) => (
        <li key={n.id} className="flex h-7 max-w-full items-center gap-1 rounded-full pl-2.5 pr-1 text-[13px]" style={{ background: "rgba(242,210,126,.14)", border: "1px solid rgba(217,180,95,.45)", color: "var(--t-cream)" }}>
          <span className="truncate">
            {n.body.split(/(#[\p{L}\p{N}_-]+)/u).map((part, i) =>
              part.startsWith("#") ? (
                <b key={i} style={{ color: "#f2d27e" }}>
                  {part}
                </b>
              ) : (
                part
              )
            )}
          </span>
          <button type="button" onClick={() => dropNote(n.id)} aria-label={`Remove “${n.body}”`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] leading-none hover:bg-white/10" style={{ color: "rgba(239,230,204,.7)" }}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
  const noteInput = noting ? (
    <div className="flex w-full items-center gap-1.5">
      <input
        autoFocus
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addNote();
          if (e.key === "Escape") setNoting(false);
        }}
        maxLength={200}
        placeholder="What happened? e.g. Slept badly #sleep"
        aria-label="Event or #tag"
        className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[15px]"
        style={{ background: "rgba(255,250,238,.92)", borderColor: "#b39a6a", color: "#2a1c10" }}
      />
      <button type="button" onClick={addNote} disabled={!noteText.trim()} className="h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
        Add
      </button>
      <button type="button" onClick={() => setNoting(false)} aria-label="Cancel" className="flex h-9 w-8 shrink-0 items-center justify-center text-[18px] leading-none" style={{ color: "rgba(239,230,204,.75)" }}>
        ×
      </button>
    </div>
  ) : null;
  const noteButton = (
    <button
      type="button"
      onClick={() => setNoting(true)}
      className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold"
      style={{ border: "1px dashed rgba(217,180,95,.6)", color: "var(--t-cream)" }}
      title="Write in something that happened, or a #tag"
    >
      <span aria-hidden style={{ color: "var(--t-gold)" }}>
        🏷
      </span>
      Event or #tag
    </button>
  );
  const slider = (v: number, onChange: (n: number) => void, aria: string, color: string) => (
    <input
      type="range"
      min={1}
      max={10}
      step={0.1}
      value={v}
      onChange={(e) => onChange(Math.round(Number(e.target.value) * 10) / 10)}
      aria-label={aria}
      className="energy-range min-w-0 flex-1"
      style={{ "--energy-pct": `${((v - 1) / 9) * 100}%`, "--energy-color": color } as React.CSSProperties}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-[420px] items-start gap-2 px-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <>
            <div className="flex items-center gap-2">
              {caret}
              <span className={label} style={{ color: "var(--t-cream)" }}>
                Energy
              </span>
              {slider(value, setValue, "Energy level, 1 to 10", `hsl(${hue} 60% 48%)`)}
              <span className="w-9 shrink-0 text-right font-display text-[18px] tabular-nums" style={{ color: `hsl(${hue} 70% 68%)` }}>
                {fmt(value)}
              </span>
              {/* Same width open or closed, so the slider never jumps. */}
              <button
                type="button"
                onClick={save}
                disabled={isSaving || expanded}
                aria-hidden={expanded}
                tabIndex={expanded ? -1 : 0}
                className="hover-glow h-8 w-[58px] shrink-0 rounded-full text-[13px] font-bold disabled:opacity-60"
                style={{ background: "var(--t-gold)", color: "#2a1c10", visibility: expanded ? "hidden" : "visible" }}
              >
                {isSaving ? "…" : "Save"}
              </button>
            </div>

            {expanded && (
              <div id="checkin-more" className="flex flex-col gap-1.5 pb-0.5">
                {metrics.map((m) => {
                  const v = vals[m] ?? 5;
                  return (
                    <div key={m} className="flex items-center gap-2">
                      <span aria-hidden className="w-5 shrink-0" />
                      <span className={label} style={{ color: "var(--t-cream)" }} title={m}>
                        {m}
                      </span>
                      {slider(v, (n) => setVals((o) => ({ ...o, [m]: n })), `${m}, 1 to 10`, "#c9a24a")}
                      <span className="w-9 shrink-0 text-right font-display text-[18px] tabular-nums" style={{ color: "#f2d58a" }}>
                        {fmt(v)}
                      </span>
                      {editingList ? (
                        <button
                          type="button"
                          onClick={() => removeMetric(m)}
                          aria-label={`Stop tracking ${m}`}
                          title={`Stop tracking ${m} (past check-ins are kept)`}
                          className="h-8 w-[58px] shrink-0 rounded-full text-[12.5px] font-semibold"
                          style={{ border: "1px solid rgba(243,179,159,.6)", color: "#f3b39f" }}
                        >
                          Remove
                        </button>
                      ) : (
                        <span aria-hidden className="w-[58px] shrink-0" />
                      )}
                    </div>
                  );
                })}

                {adding && (
                  <div className="flex flex-col gap-1.5 rounded-xl p-2" style={{ background: "rgba(0,0,0,.22)", border: "1px solid rgba(217,180,95,.3)" }}>
                    <div className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={newMetric}
                        onChange={(e) => setNewMetric(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addMetric(newMetric);
                          if (e.key === "Escape") setAdding(false);
                        }}
                        maxLength={24}
                        placeholder="What else? (e.g. Mood)"
                        aria-label="New check-in metric"
                        className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[16px]"
                        style={{ background: "rgba(255,250,238,.92)", borderColor: "#b39a6a", color: "#2a1c10" }}
                      />
                      <button
                        type="button"
                        onClick={() => addMetric(newMetric)}
                        disabled={!newMetric.trim()}
                        className="h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50"
                        style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                      >
                        Add
                      </button>
                      <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="flex h-9 w-8 shrink-0 items-center justify-center text-[18px] leading-none" style={{ color: "rgba(239,230,204,.75)" }}>
                        ×
                      </button>
                    </div>
                    {ideas.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ideas.map((i) => (
                          <button key={i} type="button" onClick={() => addMetric(i)} className="h-8 rounded-full px-3 text-[13.5px] font-semibold" style={{ border: "1px solid rgba(217,180,95,.55)", color: "var(--t-cream)" }}>
                            + {i}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {noteChips}
                {noteInput}
                {/* [Edit metrics] · Add new check-in metric · Event or #tag · Submit check-in */}
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 pt-0.5">
                  {!noting && noteButton}
                  {metrics.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditingList((v) => !v)}
                      aria-pressed={editingList}
                      className="h-8 rounded-full px-2.5 text-[13.5px] underline-offset-2 hover:underline"
                      style={{ color: "rgba(239,230,204,.75)" }}
                    >
                      {editingList ? "Done editing" : "Edit metrics"}
                    </button>
                  )}
                  {metrics.length < MAX_METRICS && !adding && (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold"
                      style={{ border: "1px dashed rgba(217,180,95,.6)", color: "var(--t-cream)" }}
                    >
                      <span aria-hidden className="text-[16px] leading-none" style={{ color: "var(--t-gold)" }}>
                        +
                      </span>
                      Add new check-in metric
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={save}
                    disabled={isSaving}
                    className="hover-glow h-8 rounded-full px-4 text-[13.5px] font-bold disabled:opacity-60"
                    style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                  >
                    {isSaving ? "…" : "Submit check-in"}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            {/* What you checked in with, as small seals of value. */}
            <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
              <li className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px]" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(217,180,95,.45)", color: "var(--t-cream)" }}>
                Energy
                <b className="font-display text-[17px] tabular-nums" style={{ color: `hsl(${hue} 70% 68%)` }}>
                  {fmt(saved!)}
                </b>
              </li>
              {savedExtras.map((m) => (
                <li key={m} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px]" style={{ background: "rgba(0,0,0,.28)", border: "1px solid rgba(217,180,95,.45)", color: "var(--t-cream)" }}>
                  {m}
                  <b className="font-display text-[17px] tabular-nums" style={{ color: "#f2d58a" }}>
                    {fmt(savedVals[m])}
                  </b>
                </li>
              ))}
            </ul>
            {noteChips}
            {noteInput}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "var(--t-cream)" }}>
              {mounted && savedAt && <span style={{ opacity: 0.75 }}>✓ Checked in at {clock(savedAt)}</span>}
              <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
                Check in again
              </button>
              {!noting && (
                <button type="button" onClick={() => setNoting(true)} className="underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
                  + Event or #tag
                </button>
              )}
              {!full && (
                <Link href="/insights" className="underline underline-offset-2" style={{ color: "var(--t-gold)" }}>
                  Insights →
                </Link>
              )}
            </div>
          </div>
        )}
        {error && (
          <span className="text-[12.5px] font-semibold" style={{ color: "#f3b39f" }}>
            {error}
          </span>
        )}
      </div>
      {low && (
        <span
          className="flex h-9 shrink-0 items-stretch overflow-hidden rounded-full"
          style={{ background: "radial-gradient(circle at 32% 28%, #fff1b8, #f2c96a 45%, #d9a83a)", border: "1.5px solid #fff3c4", boxShadow: "0 0 12px rgba(255,214,102,.55), 0 2px 6px rgba(0,0,0,.4)" }}
        >
          <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1 pl-3 pr-2 text-[13.5px] font-bold" style={{ color: "#2a1c10" }} title="Light quests to get going">
            <BoltIcon size={16} /> Power-ups
          </button>
          <button
            type="button"
            onClick={hideForToday}
            aria-label="Hide Power-ups for today"
            title="Hide for today"
            className="flex w-7 items-center justify-center text-[16px] leading-none"
            style={{ color: "rgba(42,28,16,.7)", borderLeft: "1px solid rgba(90,60,20,.3)" }}
          >
            ×
          </button>
        </span>
      )}
      {picking && <TakeoffSheet onClose={() => setPicking(false)} />}
    </div>
  );
}

/** Power-ups and light quests, each with "Add to today" (to the top of Today's Quests). */
function TakeoffSheet({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  const [rows, setRows] = useState<Takeoff[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [naming, setNaming] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMinutes, setNewMinutes] = useState(5);
  const [loadKey, setLoadKey] = useState(0);
  useEffect(() => {
    listTakeoffQuestsAction()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : "Couldn't load them.");
      });
  }, [loadKey]);

  function create() {
    const title = newTitle.trim();
    if (!title) return;
    setError(null);
    startTransition(async () => {
      try {
        await createQuestAction({ title, importance: 0, urgency: 0, xpValue: 10, estimateMinutes: newMinutes, effort: 1 });
        setNewTitle("");
        setNaming(false);
        setLoadKey((k) => k + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add it.");
      }
    });
  }

  function add(id: string) {
    setError(null);
    setAdded((s) => new Set(s).add(id));
    startTransition(async () => {
      try {
        await addToTopOfTodayAction(id);
      } catch (e) {
        setAdded((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        setError(e instanceof Error ? e.message : "Couldn't add it.");
      }
    });
  }

  return createPortal(
    <div className="overlay-fade-in fixed inset-0 z-[52] flex items-end justify-center sm:items-center sm:p-4" style={{ background: "var(--t-overlay)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Power-ups"
        onClick={(e) => e.stopPropagation()}
        className="create-sheet-in parchment parchment-framed flex max-h-[80svh] w-full max-w-md flex-col gap-2 rounded-t-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-3xl"
        style={{ color: "var(--t-ink)" }}
      >
        <div className="relative z-[1] flex items-center gap-2">
          <BoltIcon size={22} />
          <h3 className="font-display m-0 flex-1 text-[20px]">Power-ups to get going</h3>
          <button
            type="button"
            onClick={() => setNaming((v) => !v)}
            aria-label="New power-up"
            aria-expanded={naming}
            title="New power-up"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none"
            style={{ border: "1.5px solid #a88a3f", color: "#8a6116", transform: naming ? "rotate(45deg)" : undefined, transition: "transform 150ms" }}
          >
            +
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        {naming && (
          <div className="relative z-[1] flex flex-col gap-2 rounded-xl p-2.5" style={{ background: "rgba(120,90,40,.1)", border: "1px solid rgba(139,112,64,.35)" }}>
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="A quick win (e.g. Clear the kitchen counter)"
              aria-label="New power-up"
              className="h-10 rounded-lg border px-3 text-[16px]"
              style={{ borderColor: "#b39a6a" }}
            />
            <div className="flex items-center gap-1.5">
              {[2, 5, 10, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewMinutes(m)}
                  className="h-8 rounded-full px-2.5 text-[13px] font-semibold tabular-nums"
                  style={newMinutes === m ? { background: "rgba(217,180,95,.6)", border: "1px solid #5a4520" } : { border: "1px solid #b39a6a" }}
                >
                  {m}m
                </button>
              ))}
              <button
                type="button"
                onClick={create}
                disabled={!newTitle.trim()}
                className="ml-auto h-9 rounded-full px-4 text-[14px] font-bold disabled:opacity-50"
                style={{ background: "var(--t-gold)", color: "#2a1c10" }}
              >
                Add
              </button>
            </div>
          </div>
        )}
        <p className="relative z-[1] m-0 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          Low energy is fine. Pick one small win; it goes to the top of Today&apos;s Quests.
        </p>
        <ul className="relative z-[1] m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0">
          {rows === null && <li className="py-3 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>Loading…</li>}
          {rows?.length === 0 && !error && <li className="py-3 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>No light quests yet. Quick ones, easy ones, and ones rated for an energy boost show up here.</li>}
          {rows?.map((t) => {
            const art = (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null;
            const isAdded = added.has(t.id) || t.is_manual_priority;
            return (
              <li key={t.id} className="flex min-h-14 items-center gap-3 border-t py-2 first:border-t-0" style={{ borderColor: "rgba(139,112,64,.3)" }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ border: "2px solid #8a6c2c", background: "#f3e6c8" }}>
                  {art ? (
                    // eslint-disable-next-line @next/next/no-img-element -- quest portrait
                    <img src={art} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <QuestMonogram id={t.id} title={t.title} size={40} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15.5px] font-semibold leading-snug">
                    {t.title}
                  </span>
                  <span className="block text-[12.5px]" style={{ color: "var(--t-ink-soft)" }}>
                    {[t.energy_gain > 0 ? `Gives energy ${"⚡".repeat(t.energy_gain)}` : null, t.estimate_minutes != null ? `${t.estimate_minutes}m` : null, `+${t.xp_value} XP`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => add(t.id)}
                  className="h-9 shrink-0 rounded-full px-3 text-[13px] font-bold disabled:opacity-70"
                  style={isAdded ? { color: "var(--t-ink-soft)" } : { background: "var(--t-gold)", color: "#2a1c10" }}
                >
                  {isAdded ? "Added ✓" : "Add to today"}
                </button>
              </li>
            );
          })}
        </ul>
        {error && (
          <p className="relative z-[1] m-0 text-[13.5px] font-semibold" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
