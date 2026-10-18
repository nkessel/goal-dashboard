"use client";

import { useRef, useState, useTransition } from "react";
import { saveSecretMissionsAction } from "@/app/actions";
import { cleanMissions, type Mission } from "@/lib/missions";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Secret missions: private long quests, sealed like dispatches. Each opens to
 * its steps — tick them off, add more, rename or strike them — and when every
 * step is done the mission is marked accomplished. Only you can see them.
 */
export function SecretMissions({ initial }: { initial: unknown }) {
  const [missions, setMissions] = useState<Mission[]>(() => cleanMissions(initial));
  const [open, setOpen] = useState<string | null>(() => cleanMissions(initial)[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const lastSaved = useRef(missions);

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
  const update = (id: string, fn: (m: Mission) => Mission) =>
    commit(
      missions.map((m) => {
        if (m.id !== id) return m;
        const n = fn(m);
        const all = n.steps.length > 0 && n.steps.every((s) => s.done);
        return { ...n, doneAt: all ? (n.doneAt ?? new Date().toISOString()) : null };
      })
    );

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
        Private long quests, sealed for your eyes only. Nobody in your party can see them.
      </p>
      {missions.map((m) => (
        <MissionCard
          key={m.id}
          mission={m}
          open={open === m.id}
          onToggle={() => setOpen(open === m.id ? null : m.id)}
          onChange={(fn) => update(m.id, fn)}
          onDelete={() => commit(missions.filter((x) => x.id !== m.id))}
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
    </div>
  );
}

function MissionCard({ mission: m, open, onToggle, onChange, onDelete }: { mission: Mission; open: boolean; onToggle: () => void; onChange: (fn: (m: Mission) => Mission) => void; onDelete: () => void }) {
  const [step, setStep] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(m.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = m.steps.filter((s) => s.done).length;
  const accomplished = !!m.doneAt;

  function addStep() {
    const t = step.trim();
    if (!t) return;
    onChange((x) => ({ ...x, steps: [...x.steps, { id: newId(), title: t, done: false }] }));
    setStep("");
  }

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ background: "linear-gradient(180deg,#efe2c2,#e4d1a6)", border: "1.5px solid #8b7040", boxShadow: "0 3px 10px rgba(60,40,10,.18)" }}>
      {/* the seal */}
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
        {m.steps.length > 0 && (
          <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "#6b5631" }}>
            {done}/{m.steps.length}
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>
          <path d="M9 5.5l6.5 6.5L9 18.5" stroke="#6b5631" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="reveal flex flex-col gap-2 px-3.5 pb-3.5">
          {m.steps.length > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(70,50,20,.15)" }}>
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / m.steps.length) * 100}%`, background: "linear-gradient(90deg,#d9b45f,#f2d27e)" }} />
            </div>
          )}
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {m.steps.map((s) => (
              <li key={s.id} className="group flex min-h-10 items-center gap-2.5 rounded-lg px-1.5 hover:bg-black/[.04]">
                <input type="checkbox" checked={s.done} onChange={() => onChange((x) => ({ ...x, steps: x.steps.map((y) => (y.id === s.id ? { ...y, done: !y.done } : y)) }))} aria-label={`Done: ${s.title}`} />
                <span className="min-w-0 flex-1 text-[15px] leading-snug" style={{ color: "#2a1c10", textDecoration: s.done ? "line-through" : undefined, opacity: s.done ? 0.6 : 1 }}>
                  {s.title}
                </span>
                <button type="button" onClick={() => onChange((x) => ({ ...x, steps: x.steps.filter((y) => y.id !== s.id) }))} aria-label={`Remove “${s.title}”`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[17px] opacity-40 hover:bg-black/[.06] group-hover:opacity-100" style={{ color: "#6b5631" }}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <input
              value={step}
              onChange={(e) => setStep(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
              maxLength={200}
              placeholder={m.steps.length ? "Next step…" : "First step…"}
              aria-label="Add a step"
              className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[15px]"
              style={{ borderColor: "#b39a6a", background: "rgba(255,255,255,.55)", color: "#2a1c10" }}
            />
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
                Burn this mission?
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
