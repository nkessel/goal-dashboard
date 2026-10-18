"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addMissionStepAction, completeTaskAction, deleteTaskAction, releaseMissionStepsAction, reopenTaskAction, saveSecretMissionsAction, sendMissionStepToTodayAction } from "@/app/actions";
import { celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { TaskRow } from "@/components/tasks/TaskRow";
import type { TaskWithCategory } from "@/lib/data/tasks";
import { cleanMissions, type Mission } from "@/lib/missions";
import { useEscape } from "@/lib/use-escape";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const XP_STEPS = [10, 20, 50, 100];

/**
 * Secret missions: private long quests, sealed like dispatches. Each step is
 * a real quest — it earns XP, opens in the full quest card (edit, schedule,
 * break it down…), and can be sent to Today's Quests. Until then, steps stay
 * hidden everywhere but here. Only you can see them.
 */
export function SecretMissions({ initial, steps }: { initial: unknown; steps: TaskWithCategory[] }) {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>(() => cleanMissions(initial));
  const [open, setOpen] = useState<string | null>(() => cleanMissions(initial)[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<TaskWithCategory | null>(null);
  const [, start] = useTransition();
  const lastSaved = useRef(missions);
  useEscape(() => setCard(null), !!card);

  function commit(next: Mission[]) {
    setMissions(next);
    setError(null);
    start(async () => {
      try {
        lastSaved.current = await saveSecretMissionsAction(next);
      } catch (e) {
        setMissions(lastSaved.current);
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function addMission() {
    const t = title.trim();
    if (!t) return setAdding(false);
    const m: Mission = { id: newId(), title: t, notes: "", steps: [], createdAt: new Date().toISOString(), doneAt: null };
    commit([m, ...missions]);
    setOpen(m.id);
    setTitle("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
        Private long quests, sealed for your eyes only. Each step is a quest that earns XP — send one to Today when you&apos;re ready.
      </p>
      {missions.map((m) => (
        <MissionCard
          key={m.id}
          mission={m}
          steps={steps.filter((t) => t.mission_id === m.id)}
          open={open === m.id}
          onToggle={() => setOpen(open === m.id ? null : m.id)}
          onChange={(fn) => commit(missions.map((x) => (x.id === m.id ? fn(x) : x)))}
          onDelete={() => {
            commit(missions.filter((x) => x.id !== m.id));
            void releaseMissionStepsAction(m.id).then(() => router.refresh());
          }}
          onOpenCard={setCard}
          onError={setError}
          refresh={() => router.refresh()}
        />
      ))}
      {adding ? (
        <div className="reveal flex items-center gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMission();
              if (e.key === "Escape") setAdding(false);
            }}
            maxLength={140}
            placeholder="The mission…"
            aria-label="New secret mission"
            className="h-10 min-w-0 flex-1 rounded-lg border px-3 text-[16px]"
            style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.6)", color: "var(--t-ink)" }}
          />
          <button type="button" onClick={addMission} disabled={!title.trim()} className="h-10 rounded-full px-4 text-[14px] font-bold disabled:opacity-50" style={{ background: "linear-gradient(180deg,#f2d58a,#d9b45f)", border: "1.5px solid #8a6116", color: "#2a1c10" }}>
            Seal it
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex h-10 items-center justify-center gap-1.5 self-start rounded-full px-4 text-[14px] font-semibold" style={{ border: "1.5px dashed rgba(139,112,64,.6)", color: "var(--t-ink)" }}>
          <span aria-hidden>🗝</span> New secret mission
        </button>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] font-semibold" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {/* A step's full quest card: edit, schedule, break it down, everything. */}
      {card &&
        createPortal(
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" onClick={() => setCard(null)}>
            <div className="overlay-fade-in absolute inset-0" style={{ background: "rgba(8,6,20,.55)" }} />
            <div className="card-pop-in relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setCard(null)} aria-label="Close" className="absolute -top-11 right-0 flex h-9 w-9 items-center justify-center rounded-full text-[22px] leading-none" style={{ background: "rgba(20,14,30,.7)", color: "#f6ecd2", border: "1px solid rgba(242,210,126,.5)" }}>
                ×
              </button>
              <ul className="m-0 list-none p-0">
                <TaskRow task={card} theme="adventure" categoryLabel={null} onEditorClose={() => router.refresh()} />
              </ul>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function MissionCard({
  mission: m,
  steps,
  open,
  onToggle,
  onChange,
  onDelete,
  onOpenCard,
  onError,
  refresh,
}: {
  mission: Mission;
  steps: TaskWithCategory[];
  open: boolean;
  onToggle: () => void;
  onChange: (fn: (m: Mission) => Mission) => void;
  onDelete: () => void;
  onOpenCard: (t: TaskWithCategory) => void;
  onError: (e: string | null) => void;
  refresh: () => void;
}) {
  const [step, setStep] = useState("");
  const [xp, setXp] = useState(20);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(m.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStep, setConfirmStep] = useState<string | null>(null);
  // Changes shown at once while the server catches up.
  const [doneNow, setDoneNow] = useState<Record<string, boolean>>({});
  const [todayNow, setTodayNow] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<{ title: string; xp: number }[]>([]);
  const [, start] = useTransition();

  const isDone = (t: TaskWithCategory) => doneNow[t.id] ?? t.status === "completed";
  const onToday = (t: TaskWithCategory) => todayNow[t.id] ?? (t.is_manual_priority || t.in_additional === true);
  const done = steps.filter(isDone).length;
  const total = steps.length + pending.length;
  const accomplished = steps.length > 0 && pending.length === 0 && done === steps.length;
  const xpLeft = steps.filter((t) => !isDone(t)).reduce((n, t) => n + t.xp_value, 0);

  function run(fn: () => Promise<unknown>, undo?: () => void) {
    onError(null);
    start(async () => {
      try {
        await fn();
        refresh();
      } catch (e) {
        undo?.();
        onError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }
  function toggleDone(t: TaskWithCategory) {
    const next = !isDone(t);
    setDoneNow((d) => ({ ...d, [t.id]: next }));
    run(
      async () => {
        if (next) {
          const fd = new FormData();
          fd.set("taskId", t.id);
          const res = await completeTaskAction(fd);
          celebrateQuest({ taskId: t.id, title: t.title, xp: t.xp_value, iconSrc: (t.icon_source === "ai" || t.icon_source === "library") && t.icon_key ? t.icon_key : null, totalXp: res?.totalXp ?? null, coinsEarned: res?.coinsEarned ?? 0 });
        } else await reopenTaskAction(t.id);
      },
      () => setDoneNow((d) => ({ ...d, [t.id]: !next }))
    );
  }
  function addStep() {
    const t = step.trim();
    if (!t) return;
    const p = { title: t, xp };
    setPending((ps) => [...ps, p]);
    setStep("");
    run(
      async () => {
        await addMissionStepAction(m.id, t, xp);
        setPending((ps) => ps.filter((x) => x !== p));
      },
      () => setPending((ps) => ps.filter((x) => x !== p))
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ background: "linear-gradient(180deg,#efe2c2,#e4d1a6)", border: "1.5px solid #8b7040", boxShadow: "0 3px 10px rgba(60,40,10,.18)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-[17px]"
          style={{ background: accomplished ? "radial-gradient(circle at 35% 30%,#f6dc8e,#c99a2e 60%,#8a6116)" : "radial-gradient(circle at 35% 30%,#c4434f,#8e2b25 60%,#5e1a16)", color: accomplished ? "#2a1c10" : "#f6ead0", boxShadow: "inset 0 -2px 4px rgba(0,0,0,.35), 0 2px 4px rgba(0,0,0,.3)" }}
        >
          {accomplished ? "✓" : "✦"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[.2em]" style={{ color: accomplished ? "#7a5a1e" : "#8e2b25" }}>
            {accomplished ? "Mission accomplished" : "Secret mission"}
          </span>
          <span className="block font-display text-[17px] leading-snug" style={{ color: "#2a1c10" }}>
            {m.title}
          </span>
        </span>
        {total > 0 && (
          <span className="shrink-0 text-right text-[12.5px] tabular-nums leading-tight" style={{ color: "#6b5631" }}>
            {done}/{total}
            {xpLeft > 0 && <span className="block text-[11px]">{xpLeft} XP to earn</span>}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <path d="M9 5.5l6.5 6.5L9 18.5" stroke="#6b5631" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="reveal flex flex-col gap-2 px-3.5 pb-3.5">
          {total > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.15)" }}>
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / total) * 100}%`, background: "linear-gradient(90deg,#d9b45f,#f2d27e)" }} />
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {steps.map((t) => {
              const d = isDone(t);
              const today = onToday(t);
              return (
                <li key={t.id} className="group flex min-h-11 items-center gap-2 rounded-lg px-1.5 hover:bg-black/[.04]">
                  <input type="checkbox" checked={d} onChange={() => toggleDone(t)} aria-label={`Done: ${t.title}`} />
                  <button type="button" onClick={() => onOpenCard(t)} title="Open the quest card" className="min-w-0 flex-1 text-left text-[15px] leading-snug underline-offset-2 hover:underline" style={{ color: "#2a1c10", textDecoration: d ? "line-through" : undefined, opacity: d ? 0.6 : 1 }}>
                    {t.title}
                  </button>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums" style={{ background: "rgba(217,180,95,.35)", color: "#5a3e12" }}>
                    +{t.xp_value} XP
                  </span>
                  {!d &&
                    (today ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTodayNow((x) => ({ ...x, [t.id]: false }));
                          run(() => sendMissionStepToTodayAction(t.id, false), () => setTodayNow((x) => ({ ...x, [t.id]: true })));
                        }}
                        title="On Today's Quests — tap to take it off"
                        className="h-8 shrink-0 rounded-full px-2.5 text-[12px] font-semibold"
                        style={{ background: "#2a1c10", color: "#f2d27e" }}
                      >
                        ☀ On Today
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setTodayNow((x) => ({ ...x, [t.id]: true }));
                          run(() => sendMissionStepToTodayAction(t.id, true), () => setTodayNow((x) => ({ ...x, [t.id]: false })));
                        }}
                        title="Send to Today's Quests"
                        className="h-8 shrink-0 rounded-full px-2.5 text-[12px] font-semibold"
                        style={{ border: "1px solid #a58c66", color: "#2a1c10" }}
                      >
                        → Today
                      </button>
                    ))}
                  {confirmStep === t.id ? (
                    <span className="flex shrink-0 items-center gap-1 text-[12px]">
                      <button type="button" onClick={() => run(() => deleteTaskAction(t.id))} className="font-semibold underline" style={{ color: "var(--t-warn)" }}>
                        Remove
                      </button>
                      <button type="button" onClick={() => setConfirmStep(null)} className="underline" style={{ color: "#6b5631" }}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmStep(t.id)} aria-label={`Remove “${t.title}”`} className="flex h-8 w-7 shrink-0 items-center justify-center rounded-full text-[17px] opacity-40 hover:bg-black/[.06] group-hover:opacity-100" style={{ color: "#6b5631" }}>
                      ×
                    </button>
                  )}
                </li>
              );
            })}
            {pending.map((p, i) => (
              <li key={`p${i}`} className="flex min-h-11 items-center gap-2 px-1.5 opacity-60">
                <input type="checkbox" disabled aria-label="Saving" />
                <span className="flex-1 text-[15px]" style={{ color: "#2a1c10" }}>
                  {p.title}
                </span>
                <span className="text-[11.5px]">saving…</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={step}
              onChange={(e) => setStep(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
              maxLength={200}
              placeholder={total ? "Next step…" : "First step…"}
              aria-label="Add a step"
              className="h-9 min-w-[160px] flex-1 rounded-lg border px-2.5 text-[15px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "#2a1c10" }}
            />
            <select value={xp} onChange={(e) => setXp(Number(e.target.value))} aria-label="XP for this step" className="h-9 rounded-lg border px-1.5 text-[14px]" style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "#2a1c10" }}>
              {XP_STEPS.map((n) => (
                <option key={n} value={n}>
                  +{n} XP
                </option>
              ))}
            </select>
            <button type="button" onClick={addStep} disabled={!step.trim()} className="h-9 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50" style={{ background: "#2a1c10", color: "#f2d27e" }}>
              Add
            </button>
          </div>
          <textarea
            defaultValue={m.notes}
            onBlur={(e) => e.target.value !== m.notes && onChange((x) => ({ ...x, notes: e.target.value }))}
            rows={2}
            maxLength={2000}
            placeholder="Notes, leads, sources…"
            aria-label="Mission notes"
            className="resize-y rounded-lg border px-2.5 py-1.5 text-[14px] leading-relaxed"
            style={{ borderColor: "rgba(139,112,64,.4)", background: "rgba(255,255,255,.4)", color: "#2a1c10" }}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: "#6b5631" }}>
            {renaming ? (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) {
                      onChange((x) => ({ ...x, title: name.trim() }));
                      setRenaming(false);
                    }
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  maxLength={140}
                  aria-label="Mission name"
                  className="h-8 rounded-md border px-2 text-[14px]"
                  style={{ borderColor: "#b39a6a", color: "#2a1c10" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (name.trim()) onChange((x) => ({ ...x, title: name.trim() }));
                    setRenaming(false);
                  }}
                  className="underline"
                >
                  Save
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setRenaming(true)} className="underline underline-offset-2">
                Rename
              </button>
            )}
            {confirmDelete ? (
              <span className="flex items-center gap-2">
                Burn this mission? (Its steps stay as quests.)
                <button type="button" onClick={onDelete} className="font-semibold underline" style={{ color: "var(--t-warn)" }}>
                  Yes, burn it
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="underline">
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="underline underline-offset-2">
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
