"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { bossProgressAction, setBossAction } from "@/app/actions";
import { celebrateProgress } from "@/components/celebration/QuestCelebrationHost";
import { useEscape } from "@/lib/use-escape";

export type BossView = { id: string; level: number; title: string; target: number; progress: number };

/**
 * Under the level meter, in italics: the boss you must defeat before you can
 * reach the next level. Tap it to log progress (e.g. one training session),
 * or to name a boss when the level has none.
 */
export function BossLine({ boss, level, heldByBoss }: { boss: BossView | null; level: number; heldByBoss: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={boss && heldByBoss ? `Defeat it to reach level ${level + 1}` : undefined}
        className="hover-glow mx-auto mt-0.5 block max-w-[min(100%,360px)] truncate whitespace-nowrap rounded-lg px-2 py-1 text-center text-[13.5px] italic leading-snug"
        style={{ color: "var(--t-cream)", opacity: boss ? 0.95 : 0.55 }}
      >
        {boss ? (
          <>
            <span style={{ color: "var(--t-gold)" }}>Final Boss:</span> {boss.title}
            {boss.target > 1 && (
              <span className="ml-1 not-italic tabular-nums" style={{ color: "var(--t-gold)" }}>
                {boss.progress}/{boss.target}
              </span>
            )}
          </>
        ) : (
          <>Set a final boss for level {level}</>
        )}
      </button>
      {open && <BossDialog boss={boss} level={boss?.level ?? level} onClose={() => setOpen(false)} />}
    </>
  );
}

function BossDialog({ boss, level, onClose }: { boss: BossView | null; level: number; onClose: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!boss);
  const [title, setTitle] = useState(boss?.title ?? "");
  const [target, setTarget] = useState(String(boss?.target ?? 1));
  const [progress, setProgress] = useState(boss?.progress ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  useEscape(onClose);

  function step(delta: number) {
    if (!boss) return;
    setError(null);
    setProgress((p) => Math.max(0, Math.min(boss.target, p + delta)));
    startSaving(async () => {
      try {
        const res = await bossProgressAction(boss.id, delta);
        setProgress(res.progress);
        if (res.defeated && delta > 0) {
          celebrateProgress({ title: `Boss defeated: ${boss.title}`, xp: 0, fromPct: 100, toPct: 100, heading: "Boss defeated!", barCaption: res.leveledUp ? `You reached level ${res.level}!` : `Level ${boss.level + 1} is open to you` });
          onClose();
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        await setBossAction(level, title, Number(target) || 1);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="overlay-fade-in absolute inset-0" style={{ background: "var(--t-overlay)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Level ${level} boss`}
        onClick={(e) => e.stopPropagation()}
        className="card-pop-in parchment parchment-framed relative flex w-full max-w-sm flex-col gap-3 rounded-2xl p-5 shadow-2xl"
        style={{ background: "var(--t-panel)", color: "var(--t-ink)" }}
      >
        <div className="relative z-[1] flex items-center justify-between">
          <h3 className="font-display m-0 text-[21px]">⚔ Level {level} boss</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        {!editing && boss ? (
          <>
            <p className="relative z-[1] m-0 text-[17px] italic leading-snug">{boss.title}</p>
            <div className="relative z-[1] flex items-center justify-center gap-4">
              <button type="button" onClick={() => step(-1)} disabled={isSaving || progress <= 0} aria-label="One less" className="flex h-11 w-11 items-center justify-center rounded-full border text-[22px] disabled:opacity-40" style={{ borderColor: "#a88a3f" }}>
                −
              </button>
              <span className="font-display text-[30px] tabular-nums">
                {progress}
                <span className="text-[18px]" style={{ color: "var(--t-ink-soft)" }}>
                  {" "}
                  / {boss.target}
                </span>
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                disabled={isSaving || progress >= boss.target}
                aria-label="One more"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[22px] disabled:opacity-40"
                style={{ background: "var(--t-gold)", color: "#2a1c10" }}
              >
                +
              </button>
            </div>
            <p className="relative z-[1] m-0 text-center text-[13px]" style={{ color: "var(--t-ink-soft)" }}>
              Until it&apos;s defeated you stay at level {level}, however much XP you earn.
            </p>
            <button type="button" onClick={() => setEditing(true)} className="relative z-[1] self-center text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
              Change this boss
            </button>
          </>
        ) : (
          <>
            <label className="relative z-[1] flex flex-col gap-1 text-[13.5px] font-semibold">
              What must you defeat before level {level + 1}?
              <textarea
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                placeholder="e.g. Get 3 training sessions in"
                className="resize-none rounded-lg border px-3 py-2 text-[16px] font-normal"
              />
            </label>
            <label className="relative z-[1] flex items-center gap-2 text-[13.5px] font-semibold">
              How many times?
              <input type="number" inputMode="numeric" min={1} max={99} value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 w-20 rounded-lg border px-2 text-center text-[16px]" />
            </label>
            <button type="button" onClick={save} disabled={isSaving || !title.trim()} className="relative z-[1] h-11 rounded-full text-[15px] font-semibold disabled:opacity-50" style={{ background: "var(--t-gold)", color: "#2a1c10" }}>
              {isSaving ? "Saving…" : "Save boss"}
            </button>
          </>
        )}
        {error && (
          <p className="relative z-[1] m-0 text-sm" style={{ color: "var(--t-warn)" }}>
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
