"use client";

import { useState, useTransition } from "react";
import type { Task } from "@/lib/data/types";
import { completeTaskAction, createQuestAction, reopenTaskAction, toggleManualPriorityAction } from "@/app/actions";
import { EditTaskModal } from "@/components/tasks/EditTaskModal";
import { BoltIcon } from "@/components/ui/Icons";

const QUICK_MINUTES = [2, 5, 10, 15];

/**
 * Quick wins: little time, little energy, instant momentum. One tap completes
 * one (with a small spark, not the full ceremony) so you can chain a few.
 */
export function PowerUpsList({ open, done, theme }: { open: Task[]; done: Task[]; theme: "calm" | "adventure" }) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [spark, setSpark] = useState<{ id: string; xp: number; coins: number } | null>(null);
  const [finished, setFinished] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [xp, setXp] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdventure = theme === "adventure";

  function complete(t: Task) {
    setError(null);
    setFinished((s) => new Set(s).add(t.id));
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", t.id);
        const res = await completeTaskAction(fd);
        setSpark({ id: t.id, xp: t.xp_value, coins: res?.coinsEarned ?? 0 });
        setTimeout(() => setSpark((s) => (s?.id === t.id ? null : s)), 2200);
      } catch (e) {
        setFinished((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        });
        setError(e instanceof Error ? e.message : "Couldn't complete that.");
      }
    });
  }

  function add() {
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createQuestAction({ title, importance: 0, urgency: 0, xpValue: xp, estimateMinutes: minutes, isPowerUp: true });
        setTitle("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that.");
      }
    });
  }

  const row = (t: Task, isDone: boolean) => (
    <li
      key={t.id}
      className={`parchment relative flex items-center gap-3 rounded-2xl px-3 py-2.5 ${isDone ? "opacity-70" : ""}`}
      style={{ borderRadius: 16 }}
    >
      <button
        type="button"
        disabled={isDone || isPending}
        onClick={() => complete(t)}
        aria-label={isDone ? `${t.title} done` : `Complete ${t.title}`}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isDone ? "radial-gradient(circle at 35% 30%, #f6dc8e, #d9b45f 55%, #a88a3f)" : "radial-gradient(circle at 35% 30%, #fffbe8, #f1e2bb)",
          border: `2px solid ${isDone ? "#5a4520" : "#b39a6a"}`,
          boxShadow: isDone ? "0 0 12px rgba(242,210,126,.6)" : "inset 0 1px 3px rgba(0,0,0,.12)",
        }}
      >
        {isDone ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="qc-card-check">
            <path d="M4.5 12.8 L9.6 17.9 L19.6 6.6" stroke="#2a1c10" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <BoltIcon size={26} />
        )}
        {spark?.id === t.id && (
          <span className="power-spark pointer-events-none absolute -top-7 left-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13.5px] font-bold" style={{ background: "rgba(42,28,16,.9)", color: "#f8e3a0", border: "1px solid #d9b45f" }}>
            +{spark.xp} XP{spark.coins ? ` · +${spark.coins}🪙` : ""} ⚡
          </span>
        )}
      </button>
      <button type="button" onClick={() => setEditing(t)} title="Edit" className="min-w-0 flex-1 text-left">
        <span className="block break-words text-[17px] font-semibold leading-tight" style={{ color: "var(--t-ink)", textDecoration: isDone ? "line-through" : undefined }}>
          {t.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13.5px]" style={{ color: "var(--t-ink-soft)" }}>
          {t.estimate_minutes != null && (
            <span className="flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- clock glyph */}
              <img src="/design/ui-clock.png" alt="" width={13} height={13} />
              {t.estimate_minutes}m
            </span>
          )}
          {t.description && <span className="truncate">{t.description}</span>}
        </span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[17px] font-bold leading-none" style={{ color: "var(--t-xp)" }}>
          +{t.xp_value} XP
        </span>
        {!isDone && (
          <button
            type="button"
            onClick={() => startTransition(() => toggleManualPriorityAction(t.id, !t.is_manual_priority))}
            className="text-[12.5px] underline"
            style={{ color: "var(--t-ink-soft)" }}
          >
            {t.is_manual_priority ? "In today's battle" : "⚔ Add to battle"}
          </button>
        )}
        {isDone && (
          <button type="button" onClick={() => startTransition(() => reopenTaskAction(t.id))} className="text-[12.5px] underline" style={{ color: "var(--t-ink-soft)" }}>
            Undo
          </button>
        )}
      </span>
    </li>
  );

  const openNow = open.filter((t) => !finished.has(t.id));
  const doneNow = [...open.filter((t) => finished.has(t.id)), ...done];

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg px-3 py-2 text-center text-[14.5px] font-semibold" style={{ background: "var(--t-warn-bg)", color: "var(--t-warn)" }}>
          {error}
        </p>
      )}

      {openNow.length > 0 ? (
        <ul className="flex flex-col gap-2.5">{openNow.map((t) => row(t, false))}</ul>
      ) : (
        <p className="parchment rounded-2xl p-5 text-center text-[16px] italic" style={{ color: "var(--t-ink-soft)" }}>
          {done.length || finished.size ? "All charged up. Add another spark below." : "No power-ups yet — add a two-minute win below."}
        </p>
      )}

      {/* Quick add */}
      {adding ? (
        <div className="parchment parchment-framed flex flex-col gap-2.5 rounded-2xl p-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="A quick win (e.g. Water the plants)"
            aria-label="Power-up"
            className="relative z-[1] h-11 rounded-lg border px-3 font-semibold"
          />
          <div className="relative z-[1] flex flex-wrap items-center gap-2">
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className="h-8 rounded-full px-3 text-[13.5px] font-semibold"
                style={minutes === m ? { background: "var(--t-gold)", color: "#2a1c10" } : { border: "1px solid #b39a6a", color: "var(--t-ink)" }}
              >
                {m} min
              </button>
            ))}
            <label className="ml-auto flex h-8 items-center gap-1 rounded-full border px-2.5 text-[13.5px]" style={{ borderColor: "#b39a6a" }}>
              <span className="font-bold" style={{ color: "var(--t-xp)" }}>
                XP
              </span>
              <input
                type="number"
                min={0}
                value={xp}
                onChange={(e) => setXp(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                aria-label="XP"
                className="price-input w-9 bg-transparent text-center font-bold tabular-nums outline-none"
              />
            </label>
          </div>
          <div className="relative z-[1] flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="h-10 px-3 text-[15px]" style={{ color: "var(--t-ink-soft)" }}>
              Done
            </button>
            <button type="button" disabled={isPending || !title.trim()} onClick={add} className="h-10 rounded-full px-5 text-[15px] disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
              Add power-up
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="hover-glow flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-[17px]"
          style={{ borderColor: "rgba(217,180,95,.5)", background: isAdventure ? "rgba(10,14,9,.25)" : undefined, color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}
        >
          <BoltIcon size={20} /> Add a power-up
        </button>
      )}

      {doneNow.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display m-0 text-center text-[19px]" style={{ color: isAdventure ? "var(--t-cream)" : "var(--t-ink)" }}>
            Done today
          </h2>
          <ul className="flex flex-col gap-2.5">{doneNow.map((t) => row(t, true))}</ul>
        </section>
      )}

      {editing && <EditTaskModal task={editing} theme={theme} onClose={() => setEditing(null)} />}
    </div>
  );
}
