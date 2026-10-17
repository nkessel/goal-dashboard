"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { bossProgressAction, completeTaskAction, createBossQuestAction, linkQuestToBossAction, listBossQuestsAction, listQuestOptionsAction, setBossAction } from "@/app/actions";
import { celebrateProgress, celebrateQuest } from "@/components/celebration/QuestCelebrationHost";
import { QuestMonogram } from "@/components/tasks/QuestMonogram";
import { useEscape } from "@/lib/use-escape";

export type BossView = { id: string; level: number; title: string; target: number; progress: number };

/**
 * The level badge under the portrait doubles as the boss's door: hover it
 * to see the boss standing between you and the next level, tap it to open
 * the boss (or to name one when the level has none).
 */
export function BossBadge({
  boss,
  level,
  heldByBoss,
  enabled,
  children,
}: {
  boss: BossView | null;
  level: number;
  heldByBoss: boolean;
  /** False before bosses exist (the badge is then just a badge). */
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!enabled) return <>{children}</>;
  const tip = boss ? `Level ${boss.level} Boss: ${boss.title}${boss.target > 1 ? ` (${boss.progress}/${boss.target})` : ""}` : `Set a boss for level ${level}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${tip}. Open the boss.`}
        className="group relative block cursor-pointer"
      >
        {children}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-[260px] -translate-x-1/2 rounded-xl px-3 py-2 text-center text-[13.5px] leading-snug opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 [text-wrap:balance]"
          style={{ background: "rgba(20,24,16,.95)", border: "1px solid rgba(217,180,95,.55)", color: "#efe6cc" }}
        >
          {boss ? (
            <>
              <span className="font-semibold" style={{ color: "var(--t-gold)" }}>
                ⚔ Level {boss.level} Boss
              </span>
              <br />
              <span className="italic">{boss.title}</span>
              {boss.target > 1 && (
                <span className="ml-1 whitespace-nowrap tabular-nums" style={{ color: "var(--t-gold)" }}>
                  {boss.progress}/{boss.target}
                </span>
              )}
              {heldByBoss && (
                <>
                  <br />
                  <span className="text-[12px] opacity-75">Defeat it to reach level {level + 1}</span>
                </>
              )}
            </>
          ) : (
            <>Set a boss for level {level}</>
          )}
        </span>
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
          <h3 className="font-display m-0 flex items-center gap-2 text-[21px]">
            ⚔ Level {level} boss
            {/* A secret: the mountain view of today, with this boss at the summit. */}
            <Link
              href="/summit"
              onClick={onClose}
              aria-label="A hidden trail…"
              title="A hidden trail…"
              className="summit-secret flex h-7 w-7 items-center justify-center rounded-full opacity-35 transition-opacity hover:opacity-100"
            >
              <svg width="18" height="16" viewBox="0 0 24 20" fill="none" aria-hidden>
                <path d="M1 19L9 6l4 6 3-4 7 11z" fill="currentColor" opacity=".55" />
                <path d="M9 6l-2 3.2 2-.7 1.4 1.5L11 9z" fill="#fff" opacity=".9" />
                <circle cx="9" cy="3" r="1.2" fill="#d9b45f" />
              </svg>
            </Link>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 text-2xl leading-none" style={{ color: "var(--t-ink-soft)" }}>
            ×
          </button>
        </div>
        {!editing && boss ? (
          <>
            <p className="relative z-[1] m-0 text-[17px] italic leading-snug">{boss.title}</p>
            <BossSessions boss={boss} progress={progress} onStep={step} busy={isSaving} onDone={onClose} />
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

type BossQuest = Awaited<ReturnType<typeof listBossQuestsAction>>[number];
type Option = Awaited<ReturnType<typeof listQuestOptionsAction>>[number];

/**
 * One outline per session the boss needs (e.g. three training sessions).
 * Fill one with an existing quest or a new one — then finish it here or in
 * the usual quest lists, and it counts. A session can also just be marked
 * done without a quest.
 */
function BossSessions({ boss, progress, onStep, busy, onDone }: { boss: BossView; progress: number; onStep: (d: number) => void; busy: boolean; onDone: () => void }) {
  const router = useRouter();
  const [quests, setQuests] = useState<BossQuest[] | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [slotMode, setSlotMode] = useState<{ i: number; mode: "pick" | "new" } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => listBossQuestsAction(boss.id).then(setQuests).catch(() => setQuests([]));
  useEffect(() => {
    void listBossQuestsAction(boss.id).then(setQuests).catch(() => setQuests([]));
  }, [boss.id]);

  const done = (quests ?? []).filter((q) => q.status === "completed");
  const open = (quests ?? []).filter((q) => q.status !== "completed");
  const manual = Math.max(0, progress - done.length);
  type Slot = { kind: "quest-done"; q: BossQuest } | { kind: "manual" } | { kind: "quest-open"; q: BossQuest } | { kind: "empty" };
  const slots: Slot[] = [
    ...done.map((q) => ({ kind: "quest-done" as const, q })),
    ...Array.from({ length: manual }, () => ({ kind: "manual" as const })),
    ...open.map((q) => ({ kind: "quest-open" as const, q })),
  ];
  while (slots.length < boss.target) slots.push({ kind: "empty" });

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        await load();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that.");
      }
    });
  }

  function complete(q: BossQuest) {
    run(async () => {
      const fd = new FormData();
      fd.set("taskId", q.id);
      const res = await completeTaskAction(fd);
      celebrateQuest({ taskId: q.id, title: q.title, xp: q.xp_value, iconSrc: q.icon_source === "ai" || q.icon_source === "library" ? q.icon_key : null, totalXp: res?.totalXp ?? null, coinsEarned: res?.coinsEarned ?? 0 });
      if (progress + 1 >= boss.target) {
        celebrateProgress({ title: `Boss defeated: ${boss.title}`, xp: 0, fromPct: 100, toPct: 100, heading: "Boss defeated!", barCaption: `Level ${boss.level + 1} is open to you` });
        onDone();
      }
    });
  }

  const art = (q: { id: string; title: string; icon_key: string | null; icon_source: string | null }, size = 36) =>
    (q.icon_source === "ai" || q.icon_source === "library") && q.icon_key ? (
      // eslint-disable-next-line @next/next/no-img-element -- quest portrait
      <img src={q.icon_key} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: "1.5px solid #a58c66" }} />
    ) : (
      <span className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size, border: "1.5px solid #a58c66" }}>
        <QuestMonogram id={q.id} title={q.title} size={size} />
      </span>
    );
  const check = (on: boolean) => (
    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: on ? "radial-gradient(circle at 35% 30%, #a8d88a, #58a04a 60%, #3d7a32)" : "rgba(255,250,238,.7)", border: `2px solid ${on ? "#2f5a26" : "#a58c66"}` }}>
      {on && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );

  return (
    <div className="relative z-[1] flex flex-col gap-2">
      {quests === null ? (
        <p className="m-0 text-center text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>
          Gathering the sessions…
        </p>
      ) : (
        slots.map((sl, i) => {
          const box = "flex min-h-[52px] items-center gap-2.5 rounded-xl px-3 py-2";
          if (sl.kind === "quest-done")
            return (
              <div key={`d-${sl.q.id}`} className={box} style={{ background: "rgba(88,160,74,.12)", border: "1.5px solid rgba(63,106,44,.5)" }}>
                {check(true)}
                {art(sl.q)}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{sl.q.title}</span>
              </div>
            );
          if (sl.kind === "manual")
            return (
              <div key={`m-${i}`} className={box} style={{ background: "rgba(88,160,74,.12)", border: "1.5px solid rgba(63,106,44,.5)" }}>
                {check(true)}
                <span className="min-w-0 flex-1 text-[15px] font-semibold">Session {i + 1} done</span>
                <button type="button" disabled={busy} onClick={() => onStep(-1)} className="text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                  undo
                </button>
              </div>
            );
          if (sl.kind === "quest-open")
            return (
              <div key={`o-${sl.q.id}`} className={box} style={{ background: "rgba(255,250,238,.6)", border: "1.5px solid #b39a6a" }}>
                <button type="button" disabled={isPending} onClick={() => complete(sl.q)} aria-label={`Complete ${sl.q.title}`} className="rounded-full">
                  {check(false)}
                </button>
                {art(sl.q)}
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{sl.q.title}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => linkQuestToBossAction(sl.q.id, null))}
                  aria-label={`Take ${sl.q.title} off this boss`}
                  title="Take it off this boss (the quest stays)"
                  className="h-8 w-7 text-[18px] leading-none"
                  style={{ color: "var(--t-ink-soft)" }}
                >
                  ×
                </button>
              </div>
            );
          const choosing = slotMode?.i === i;
          return (
            <div key={`e-${i}`} className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ border: "2px dashed rgba(139,112,64,.5)" }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-auto text-[14.5px] font-semibold" style={{ color: "var(--t-ink-soft)" }}>
                  Session {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSlotMode(choosing && slotMode?.mode === "pick" ? null : { i, mode: "pick" });
                    if (!options) void listQuestOptionsAction().then(setOptions).catch(() => setOptions([]));
                  }}
                  className="h-8 rounded-full px-3 text-[13px] font-semibold"
                  style={{ border: "1.5px solid #b39a6a" }}
                >
                  Pick a quest
                </button>
                <button type="button" onClick={() => setSlotMode(choosing && slotMode?.mode === "new" ? null : { i, mode: "new" })} className="h-8 rounded-full px-3 text-[13px] font-semibold" style={{ border: "1.5px solid #b39a6a" }}>
                  New quest
                </button>
                <button type="button" disabled={busy} onClick={() => onStep(1)} title="Count it without a quest" className="h-8 rounded-full px-2.5 text-[13px] underline" style={{ color: "var(--t-ink-soft)" }}>
                  just mark done
                </button>
              </div>
              {choosing && slotMode?.mode === "new" && (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTitle.trim()) {
                        const t = newTitle;
                        setNewTitle("");
                        setSlotMode(null);
                        run(() => createBossQuestAction(boss.id, t));
                      }
                    }}
                    placeholder="e.g. Team Alvim class, Tuesday"
                    aria-label="New session quest"
                    className="h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-[16px]"
                    style={{ borderColor: "#b39a6a" }}
                  />
                  <button
                    type="button"
                    disabled={!newTitle.trim() || isPending}
                    onClick={() => {
                      const t = newTitle;
                      setNewTitle("");
                      setSlotMode(null);
                      run(() => createBossQuestAction(boss.id, t));
                    }}
                    className="h-9 rounded-full px-3.5 text-[13.5px] font-bold disabled:opacity-50"
                    style={{ background: "var(--t-gold)", color: "#2a1c10" }}
                  >
                    Add
                  </button>
                </div>
              )}
              {choosing && slotMode?.mode === "pick" && (
                <ul className="m-0 flex max-h-[200px] list-none flex-col overflow-y-auto overscroll-contain p-0">
                  {options === null && <li className="py-1 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>Loading…</li>}
                  {options?.length === 0 && <li className="py-1 text-[14px] italic" style={{ color: "var(--t-ink-soft)" }}>No open quests to pick.</li>}
                  {options?.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSlotMode(null);
                          setOptions((list) => list?.filter((x) => x.id !== o.id) ?? list);
                          run(() => linkQuestToBossAction(o.id, boss.id));
                        }}
                        className="flex min-h-10 w-full items-center gap-2 rounded-lg px-1.5 text-left text-[14.5px] hover:bg-black/5"
                      >
                        {art(o, 26)}
                        <span className="min-w-0 flex-1 truncate">{o.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
      {error && (
        <p className="m-0 text-sm" style={{ color: "var(--t-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
